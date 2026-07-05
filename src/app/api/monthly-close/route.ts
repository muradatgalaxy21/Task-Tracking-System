import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, hasMinimumRole } from "@/lib/rbac";
import { calculatePayouts, countWeekdaysInMonth } from "@/lib/calculations";
import { computeMemberScores, getWorkspaceCloseContext } from "@/lib/monthly-close";
import {
  monthsBetween,
  compareMonths,
  determineAutoCloseEnd,
  determineAutoCloseStart,
  getMonthKey,
  type MonthPoint,
} from "@/lib/close-range";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function monthLabel(m: MonthPoint) {
  return `${MONTH_NAMES[m.month]} ${m.year}`;
}

export const dynamic = "force-dynamic";

// GET /api/monthly-close?workspaceId=X
// Returns list of all monthly closes for the workspace. Admin+ only.
export async function GET(req: Request) {
  const { session, error } = await requireRole("Admin");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  // Global Admin/Owner can access any workspace; otherwise verify membership
  const isGlobalAdmin = hasMinimumRole(session.user.role, "Admin");
  if (!isGlobalAdmin) {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: session.user.id } },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
    }
  }

  try {
    const closes = await prisma.monthlyClose.findMany({
      where: { workspace_id: workspaceId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      include: {
        payouts: {
          select: { id: true, user_id: true, final_payout: true, total_score: true },
        },
      },
    });
    return NextResponse.json(closes);
  } catch (err) {
    console.error("Failed to fetch monthly closes:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/monthly-close
// Creates a new Draft monthly close for a workspace. Owner only. The close can span
// multiple unclosed calendar months — a cumulative close.
// Body: { workspaceId, mode: "auto" | "manual", startMonth?, startYear?, endMonth?, endYear?, totalRevenue }
//   - mode "auto": span is detected automatically (from the month after the last
//     Finalized close, or the earliest activity month if none, through the current
//     month — included only when today is on/after the 28th).
//   - mode "manual": startMonth/startYear/endMonth/endYear are required. Any month
//     already covered by an existing close (Draft or Finalized) is rejected.
// Each month in the span is scored independently (TPS/AS as before); the close's
// final TPS/AS is the mean of the per-month scores. This is a Draft — nothing is
// locked until a separate PATCH { action: "finalize" } call.
export async function POST(req: Request) {
  const { session, error } = await requireRole("Owner");
  if (error) return error;

  try {
    const body = await req.json();
    const { workspaceId, mode, startMonth, startYear, endMonth, endYear, totalRevenue } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // Global Owner always has access; otherwise verify workspace membership
    const isGlobalOwner = hasMinimumRole(session.user.role, "Owner");
    if (!isGlobalOwner) {
      const membership = await prisma.workspaceMember.findUnique({
        where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: session.user.id } },
      });
      if (!membership) {
        return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
      }
    }

    const { closedMonths, lastFinalizedEnd, earliestActivityMonth } =
      await getWorkspaceCloseContext(workspaceId);

    let start: MonthPoint;
    let end: MonthPoint;

    if (mode === "manual") {
      if (startMonth == null || startYear == null || endMonth == null || endYear == null) {
        return NextResponse.json(
          { error: "startMonth, startYear, endMonth and endYear are required for a manual close" },
          { status: 400 }
        );
      }
      start = { year: startYear, month: startMonth };
      end = { year: endYear, month: endMonth };
      if (compareMonths(end, start) < 0) {
        return NextResponse.json({ error: "End month must be on or after the start month" }, { status: 400 });
      }
    } else {
      end = determineAutoCloseEnd();
      start = determineAutoCloseStart(lastFinalizedEnd, earliestActivityMonth, end);
      if (compareMonths(start, end) > 0) {
        return NextResponse.json(
          { error: "Everything up to the current close cutoff has already been closed." },
          { status: 409 }
        );
      }
    }

    const months = monthsBetween(start, end);

    // Reject any overlap with an existing close, regardless of mode or status
    const overlapping = months.map(getMonthKey).filter((key) => closedMonths.has(key));
    if (overlapping.length > 0) {
      return NextResponse.json(
        { error: `These months are already covered by an existing close: ${overlapping.join(", ")}` },
        { status: 409 }
      );
    }

    // Weekdays-in-month per month, capped at "now" only for the current calendar
    // month if it's included (a still-running month can't count its unworked days yet).
    const now = new Date();
    const scheduledDaysByMonth: Record<string, number> = {};
    let periodEnd = new Date(end.year, end.month + 1, 0); // last day of the end month
    for (const m of months) {
      const isCurrentMonth = m.year === now.getFullYear() && m.month === now.getMonth();
      const monthEnd = isCurrentMonth ? now : new Date(m.year, m.month + 1, 0);
      if (isCurrentMonth) periodEnd = now < periodEnd ? now : periodEnd;
      scheduledDaysByMonth[getMonthKey(m)] = countWeekdaysInMonth(m.year, m.month, monthEnd);
    }

    // Fetch all workspace members
    const members = await prisma.workspaceMember.findMany({
      where: { workspace_id: workspaceId },
      include: { user: { select: { id: true, full_name: true, email: true } } },
    });

    // Resolve display names for the payout breakdown, keyed by user_id
    const nameByUserId = new Map(
      members.map((m) => [m.user_id, m.user.full_name ?? m.user.email ?? "Unknown"])
    );

    // Compute TPS/AS/total per member via the shared aggregation (batched, timezone-safe);
    // each month scored independently then averaged across the span
    const memberScores = await computeMemberScores({
      workspaceId,
      memberIds: members.map((m) => m.user_id),
      months,
      scheduledDaysByMonth,
    });

    // Calculate payouts based on provided revenue (may be 0 for draft)
    const revenue = totalRevenue ?? 0;
    const payoutResults = calculatePayouts(
      memberScores.map((ms) => ({
        memberId: ms.userId,
        memberName: nameByUserId.get(ms.userId) ?? "Unknown",
        totalScore: ms.totalScore,
      })),
      revenue
    );

    // 5. Query all active penalties in the workspace for the target month range.
    const penalties = await prisma.penalty.findMany({
      where: {
        workspace_id: workspaceId,
        OR: months.map((m) => ({ month: m.month, year: m.year })),
      },
    });

    // 6. Calculate penalty deduction per member, capped at their performance payout.
    const deductions: Record<string, number> = {};
    for (const p of payoutResults) {
      const userPenalties = penalties.filter((pen) => pen.user_id === p.memberId);
      const totalPenaltyAmt = userPenalties.reduce((sum, pen) => sum + pen.amount, 0);
      deductions[p.memberId] = Math.min(p.perfPayout, totalPenaltyAmt);
    }

    const totalDeducted = Object.values(deductions).reduce((sum, d) => sum + d, 0);

    // 7. Find the member with the highest score to distribute the collected penalty pool.
    let highestScorerId: string | null = null;
    let maxScore = -1;
    for (const ms of memberScores) {
      if (ms.totalScore > maxScore) {
        maxScore = ms.totalScore;
        highestScorerId = ms.userId;
      }
    }

    const label = months.length === 1 ? monthLabel(start) : `${monthLabel(start)} - ${monthLabel(end)}`;
    const totalScheduledDays = Object.values(scheduledDaysByMonth).reduce((s, d) => s + d, 0);

    // 8. Create the MonthlyClose and member payouts inside a transaction.
    const close = await prisma.$transaction(async (tx) => {
      const newClose = await tx.monthlyClose.create({
        data: {
          workspace_id: workspaceId,
          label,
          start_month: start.month,
          start_year: start.year,
          month: end.month,
          year: end.year,
          period_end: periodEnd,
          total_revenue: revenue,
          scheduled_days: totalScheduledDays,
          status: "Draft",
          created_by: session.user.id,
        },
      });

      // Store draft payout record per member individually to ensure custom penalty logic holds
      const writes = memberScores.map((ms) => {
        const payout = payoutResults.find((p) => p.memberId === ms.userId);
        const isHighest = ms.userId === highestScorerId;
        const deduction = deductions[ms.userId] ?? 0;
        const bonus = isHighest ? totalDeducted : 0;
        const finalPayout = Math.max(0, (payout?.perfPayout ?? 0) - deduction + bonus);

        return tx.memberMonthlyPayout.create({
          data: {
            close_id: newClose.id,
            workspace_id: workspaceId,
            user_id: ms.userId,
            tps_score: ms.tpsScore,
            as_score: ms.asScore,
            total_score: ms.totalScore,
            base_payout: payout?.basePayout ?? 0,
            perf_payout: payout?.perfPayout ?? 0,
            final_payout: Math.round(finalPayout * 100) / 100,
            penalty_deduction: deduction,
            highest_score_bonus: bonus,
            present_days: ms.presentDays,
            scheduled_days: ms.scheduledDays,
            multiplier_overrides: "{}",
            monthly_breakdown: JSON.stringify(ms.monthlyBreakdown),
          },
        });
      });

      await Promise.all(writes);
      return newClose;
    });

    return NextResponse.json({ id: close.id, label: close.label }, { status: 201 });
  } catch (err) {
    console.error("Failed to create monthly close:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
