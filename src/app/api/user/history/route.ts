import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// GET /api/user/history?workspaceId=X
// Returns the current user's full history:
//   - All finalized monthly closes they appear in (with scores and payouts)
//   - All-time task summary: completed, overdue, discarded, pending
export async function GET(req: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const userId = session.user.id;

  try {
    // Fetch all finalized closes the user appears in for this workspace
    const payoutHistoryRaw = await prisma.memberMonthlyPayout.findMany({
      where: {
        workspace_id: workspaceId,
        user_id: userId,
        monthly_close: { status: "Finalized" },
      },
      include: {
        monthly_close: {
          select: { id: true, label: true, month: true, year: true, finalized_at: true },
        },
      },
    });

    // Sort newest close first (year desc, month desc) in JS to avoid nested relation orderBy issues
    const payoutHistory = payoutHistoryRaw.sort(
      (a, b) =>
        b.monthly_close.year - a.monthly_close.year ||
        b.monthly_close.month - a.monthly_close.month
    );

    // Fetch all tasks assigned to this user in this workspace (all time)
    const allTasks = await prisma.taskLedger.findMany({
      where: { workspace_id: workspaceId, assignee_id: userId },
      select: {
        task_id: true,
        title: true,
        status: true,
        max_deadline: true,
        completed_at: true,
        review_submitted_at: true,
        multiplier_earned: true,
        created_at: true,
      },
      orderBy: { created_at: "desc" },
    });

    const now = new Date();

    // Classify tasks for the report
    const completedTasks = allTasks.filter((t) => t.status === "Completed");
    const discardedTasks = allTasks.filter((t) => t.status === "Discarded");

    // Overdue: not completed/discarded AND past max_deadline
    const overdueTasks = allTasks.filter(
      (t) =>
        t.status !== "Completed" &&
        t.status !== "Discarded" &&
        new Date(t.max_deadline) < now
    );

    // Not done: active (Todo/In Progress/In Review) and not yet overdue
    const pendingTasks = allTasks.filter(
      (t) =>
        t.status !== "Completed" &&
        t.status !== "Discarded" &&
        new Date(t.max_deadline) >= now
    );

    // Cumulative totals from finalized closes
    const cumulativeEarnings = payoutHistory.reduce(
      (sum, p) => sum + p.final_payout,
      0
    );

    return NextResponse.json({
      payoutHistory: payoutHistory.map((p) => ({
        closeId: p.monthly_close.id,
        label: p.monthly_close.label,
        month: p.monthly_close.month,
        year: p.monthly_close.year,
        finalizedAt: p.monthly_close.finalized_at,
        tpsScore: p.tps_score,
        asScore: p.as_score,
        totalScore: p.total_score,
        basePayout: p.base_payout,
        perfPayout: p.perf_payout,
        finalPayout: p.final_payout,
        presentDays: p.present_days,
        scheduledDays: p.scheduled_days,
      })),
      cumulativeEarnings: Math.round(cumulativeEarnings * 100) / 100,
      taskReport: {
        completed: completedTasks.map((t) => ({
          id: t.task_id,
          title: t.title,
          completedAt: t.completed_at,
          multiplier: t.multiplier_earned,
          deadline: t.max_deadline,
        })),
        overdue: overdueTasks.map((t) => ({
          id: t.task_id,
          title: t.title,
          status: t.status,
          deadline: t.max_deadline,
          daysOverdue: Math.floor(
            (now.getTime() - new Date(t.max_deadline).getTime()) / (1000 * 60 * 60 * 24)
          ),
        })),
        discarded: discardedTasks.map((t) => ({
          id: t.task_id,
          title: t.title,
          deadline: t.max_deadline,
        })),
        pending: pendingTasks.map((t) => ({
          id: t.task_id,
          title: t.title,
          status: t.status,
          deadline: t.max_deadline,
        })),
      },
    });
  } catch (err) {
    console.error("Failed to fetch user history:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
