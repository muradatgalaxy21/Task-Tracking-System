import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, hasMinimumRole } from "@/lib/rbac";
import {
  calculateTPS,
  calculateAS,
  calculateTotalScore,
  calculatePayouts,
  countWeekdaysInMonth,
} from "@/lib/calculations";

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
// Creates a new Draft monthly close for a workspace. Owner only.
// Body: { workspaceId, month, year, totalRevenue, scheduledDays? }
// Calculates scores for all members and stores draft payouts.
export async function POST(req: Request) {
  const { session, error } = await requireRole("Owner");
  if (error) return error;

  try {
    const body = await req.json();
    const { workspaceId, month, year, totalRevenue, scheduledDays } = body;

    if (!workspaceId || month == null || !year) {
      return NextResponse.json({ error: "workspaceId, month and year are required" }, { status: 400 });
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

    // Prevent duplicate close for the same month/year/workspace
    const existing = await prisma.monthlyClose.findUnique({
      where: { workspace_id_month_year: { workspace_id: workspaceId, month, year } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A close already exists for this month. Use PATCH to update it." },
        { status: 409 }
      );
    }

    // Calculate weekdays in the month up to today as default scheduled_days
    const now = new Date();
    const periodEnd = new Date(year, month + 1, 0); // last day of the target month
    const effectivePeriodEnd = periodEnd < now ? periodEnd : now;
    const computedScheduledDays =
      scheduledDays ?? countWeekdaysInMonth(year, month, effectivePeriodEnd);

    // Fetch all workspace members
    const members = await prisma.workspaceMember.findMany({
      where: { workspace_id: workspaceId },
      include: { user: { select: { id: true, full_name: true, email: true } } },
    });

    // Fetch all tasks assigned to workspace members for the target month
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const allTasks = await prisma.taskLedger.findMany({
      where: {
        workspace_id: workspaceId,
        assignee_id: { in: members.map((m) => m.user_id) },
      },
    });

    // Fetch attendance records for all members in the target month
    const allAttendance = await prisma.dailyAttendance.findMany({
      where: {
        user_id: { in: members.map((m) => m.user_id) },
        date: { gte: startOfMonth, lte: endOfMonth },
      },
    });

    // Calculate score per member
    const memberScores = members.map((m) => {
      const memberTasks = allTasks.filter((t) => t.assignee_id === m.user_id);
      const memberAttendance = allAttendance.filter((a) => a.user_id === m.user_id);

      // Cast tasks to the type expected by calculateTPS (safe — same fields)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tpsResult = calculateTPS(memberTasks as any, year, month);
      const asScore = calculateAS(memberAttendance as any, year, month, computedScheduledDays);
      const totalScore = calculateTotalScore(tpsResult.score, asScore);

      const presentDays = memberAttendance.filter((a) => a.status === "Present").length;

      return {
        userId: m.user_id,
        userName: m.user.full_name ?? m.user.email ?? "Unknown",
        tpsScore: tpsResult.score,
        asScore,
        totalScore,
        presentDays,
      };
    });

    // Calculate payouts based on provided revenue (may be 0 for draft)
    const revenue = totalRevenue ?? 0;
    const payoutResults = calculatePayouts(
      memberScores.map((ms) => ({
        memberId: ms.userId,
        memberName: ms.userName,
        totalScore: ms.totalScore,
      })),
      revenue
    );

    const monthNames = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December",
    ];
    const label = `${monthNames[month]} ${year}`;

    // Create the MonthlyClose and all draft MemberMonthlyPayouts in one transaction
    const close = await prisma.$transaction(async (tx) => {
      const newClose = await tx.monthlyClose.create({
        data: {
          workspace_id: workspaceId,
          label,
          month,
          year,
          period_end: effectivePeriodEnd,
          total_revenue: revenue,
          scheduled_days: computedScheduledDays,
          status: "Draft",
          created_by: session.user.id,
        },
      });

      // Store draft payout record per member
      await tx.memberMonthlyPayout.createMany({
        data: memberScores.map((ms) => {
          const payout = payoutResults.find((p) => p.memberId === ms.userId);
          return {
            close_id: newClose.id,
            workspace_id: workspaceId,
            user_id: ms.userId,
            tps_score: ms.tpsScore,
            as_score: ms.asScore,
            total_score: ms.totalScore,
            base_payout: payout?.basePayout ?? 0,
            perf_payout: payout?.perfPayout ?? 0,
            final_payout: payout?.finalPayout ?? 0,
            present_days: ms.presentDays,
            scheduled_days: computedScheduledDays,
            multiplier_overrides: "{}",
          };
        }),
      });

      return newClose;
    });

    return NextResponse.json({ id: close.id, label: close.label }, { status: 201 });
  } catch (err) {
    console.error("Failed to create monthly close:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
