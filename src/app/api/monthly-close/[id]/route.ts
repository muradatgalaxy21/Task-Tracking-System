import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, hasMinimumRole } from "@/lib/rbac";
import {
  calculateTPS,
  calculateAS,
  calculateTotalScore,
  calculatePayouts,
} from "@/lib/calculations";

export const dynamic = "force-dynamic";

// GET /api/monthly-close/[id]
// Returns the full close record with member payouts. Admin+ only.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireRole("Admin");
  if (error) return error;

  const { id } = await params;

  try {
    const close = await prisma.monthlyClose.findUnique({
      where: { id },
      include: {
        payouts: true,
        workspace: { select: { id: true, name: true } },
      },
    });

    if (!close) {
      return NextResponse.json({ error: "Monthly close not found" }, { status: 404 });
    }

    // Global Admin/Owner bypasses membership check
    if (!hasMinimumRole(session.user.role, "Admin")) {
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          workspace_id_user_id: { workspace_id: close.workspace_id, user_id: session.user.id },
        },
      });
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Enrich payouts with user names
    const userIds = close.payouts.map((p) => p.user_id);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, full_name: true, email: true },
    });

    const enrichedPayouts = close.payouts.map((p) => {
      const user = users.find((u) => u.id === p.user_id);
      return {
        ...p,
        user_name: user?.full_name ?? user?.email ?? "Unknown",
      };
    });

    return NextResponse.json({ ...close, payouts: enrichedPayouts });
  } catch (err) {
    console.error("Failed to fetch monthly close:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PATCH /api/monthly-close/[id]
// Updates a Draft close. Owner only.
// Accepts: { totalRevenue, scheduledDays, multiplierOverrides, action: "recalculate" | "finalize" }
// - "recalculate": recompute scores + payouts from stored data with any overrides applied
// - "finalize": lock the close (status -> Finalized)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireRole("Owner");
  if (error) return error;

  const { id } = await params;

  try {
    const body = await req.json();
    const { totalRevenue, scheduledDays, multiplierOverrides, action } = body;

    const close = await prisma.monthlyClose.findUnique({
      where: { id },
      include: { payouts: true },
    });

    if (!close) {
      return NextResponse.json({ error: "Monthly close not found" }, { status: 404 });
    }

    if (close.status === "Finalized" && action !== undefined) {
      return NextResponse.json(
        { error: "This close has already been finalized and cannot be changed." },
        { status: 409 }
      );
    }

    // Global Owner bypasses membership check for PATCH operations
    if (!hasMinimumRole(session.user.role, "Owner")) {
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          workspace_id_user_id: { workspace_id: close.workspace_id, user_id: session.user.id },
        },
      });
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (action === "finalize") {
      // Lock the close
      const updated = await prisma.monthlyClose.update({
        where: { id },
        data: { status: "Finalized", finalized_at: new Date() },
      });
      return NextResponse.json(updated);
    }

    // "recalculate" or plain update — recompute payouts with new revenue/overrides
    const newRevenue = totalRevenue ?? close.total_revenue;
    const newScheduledDays = scheduledDays ?? close.scheduled_days;

    // Merge existing per-member overrides with any new ones from the request
    const globalOverrides: Record<string, number> = multiplierOverrides ?? {};

    // Fetch tasks and attendance for the closed month to recompute scores
    const { month, year, workspace_id } = close;
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const memberIds = close.payouts.map((p) => p.user_id);

    const allTasks = await prisma.taskLedger.findMany({
      where: { workspace_id, assignee_id: { in: memberIds } },
    });

    const allAttendance = await prisma.dailyAttendance.findMany({
      where: {
        user_id: { in: memberIds },
        date: { gte: startOfMonth, lte: endOfMonth },
      },
    });

    const users = await prisma.user.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, full_name: true, email: true },
    });

    // Recompute per member, applying multiplier overrides non-destructively
    const memberScores = close.payouts.map((p) => {
      // Merge stored per-payout overrides with the incoming global overrides
      let storedOverrides: Record<string, number> = {};
      try {
        storedOverrides = JSON.parse(p.multiplier_overrides || "{}");
      } catch {
        storedOverrides = {};
      }
      const mergedOverrides = { ...storedOverrides, ...globalOverrides };

      const memberTasks = allTasks
        .filter((t) => t.assignee_id === p.user_id)
        // Apply multiplier overrides: if a task has an override, use it
        .map((t) => ({
          ...t,
          multiplier_earned:
            mergedOverrides[t.task_id] != null
              ? mergedOverrides[t.task_id]
              : t.multiplier_earned,
        }));

      const memberAttendance = allAttendance.filter((a) => a.user_id === p.user_id);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tpsResult = calculateTPS(memberTasks as any, year, month);
      const asScore = calculateAS(
        memberAttendance as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        year,
        month,
        newScheduledDays
      );
      const totalScore = calculateTotalScore(tpsResult.score, asScore);
      const presentDays = memberAttendance.filter((a) => a.status === "Present").length;
      const user = users.find((u) => u.id === p.user_id);

      return {
        payoutId: p.id,
        userId: p.user_id,
        userName: user?.full_name ?? user?.email ?? "Unknown",
        tpsScore: tpsResult.score,
        asScore,
        totalScore,
        presentDays,
        mergedOverrides,
      };
    });

    const payoutResults = calculatePayouts(
      memberScores.map((ms) => ({
        memberId: ms.userId,
        memberName: ms.userName,
        totalScore: ms.totalScore,
      })),
      newRevenue
    );

    // Persist updated payout records and close metadata in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.monthlyClose.update({
        where: { id },
        data: { total_revenue: newRevenue, scheduled_days: newScheduledDays },
      });

      for (const ms of memberScores) {
        const payout = payoutResults.find((p) => p.memberId === ms.userId);
        await tx.memberMonthlyPayout.update({
          where: { id: ms.payoutId },
          data: {
            tps_score: ms.tpsScore,
            as_score: ms.asScore,
            total_score: ms.totalScore,
            base_payout: payout?.basePayout ?? 0,
            perf_payout: payout?.perfPayout ?? 0,
            final_payout: payout?.finalPayout ?? 0,
            present_days: ms.presentDays,
            scheduled_days: newScheduledDays,
            multiplier_overrides: JSON.stringify(ms.mergedOverrides),
          },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to update monthly close:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
