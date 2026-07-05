// Shared scoring aggregation for MonthlyClose — server-only. Never import from client components.
//
// Both the create (POST) and recalculate (PATCH) paths of /api/monthly-close need
// the same per-member TPS/AS/total computation. Centralising it here keeps the two
// routes in sync and means the timezone-safe attendance window lives in one place.
//
// A close can span multiple calendar months (cumulative close). Each month is scored
// independently exactly as before, then a member's final TPS/AS is the arithmetic
// mean of their per-month scores — never a pooled recompute across the whole span.

import { prisma } from "@/lib/prisma";
import {
  calculateTPS,
  calculateAS,
  calculateTotalScore,
  countPresentDaysInMonth,
} from "@/lib/calculations";
import { type MonthPoint, getMonthKey, expandRangeToKeys, compareMonths } from "@/lib/close-range";

export interface MonthlyScoreBreakdown {
  year: number;
  month: number;
  tpsScore: number;
  asScore: number;
  totalScore: number;
  presentDays: number;
  scheduledDays: number;
}

export interface MemberScore {
  userId: string;
  tpsScore: number; // mean across all months in the span
  asScore: number; // mean across all months in the span
  totalScore: number;
  presentDays: number; // summed across the span, for display only
  scheduledDays: number; // summed across the span, for display only
  monthlyBreakdown: MonthlyScoreBreakdown[];
}

// Computes TPS/AS/total scores for a set of members across one or more calendar
// months. Reads tasks and attendance for the whole span in two batched queries
// (no per-member, no per-month round trips), then aggregates in memory.
export async function computeMemberScores({
  workspaceId,
  memberIds,
  months,
  scheduledDaysByMonth,
  overridesByUser = {},
}: {
  workspaceId: string;
  memberIds: string[];
  months: MonthPoint[]; // every calendar month included in this close, in order
  scheduledDaysByMonth: Record<string, number>; // monthKey ("YYYY-MM") -> active/working days for that month
  // Maps user_id -> { [taskId]: overrideMultiplier }; applied non-destructively before TPS.
  overridesByUser?: Record<string, Record<string, number>>;
}): Promise<MemberScore[]> {
  if (memberIds.length === 0 || months.length === 0) return [];

  const first = months[0];
  const last = months[months.length - 1];

  // Fetch every member's tasks in a single query rather than one query per member/month
  const allTasks = await prisma.taskLedger.findMany({
    where: { workspace_id: workspaceId, assignee_id: { in: memberIds } },
  });

  // Attendance is stored at local midnight, so on a non-UTC server the first/last
  // calendar day of the span can fall just outside a tight range. Widen the window
  // by a day on each side; calculateAS and countPresentDaysInMonth re-filter exactly
  // by slicing the ISO date prefix, so the padding never inflates the result.
  const windowStart = new Date(first.year, first.month, 1);
  windowStart.setDate(windowStart.getDate() - 1);
  const windowEnd = new Date(last.year, last.month + 1, 0, 23, 59, 59, 999);
  windowEnd.setDate(windowEnd.getDate() + 1);

  // Fetch every member's attendance for the whole span in a single query
  const allAttendance = await prisma.dailyAttendance.findMany({
    where: {
      user_id: { in: memberIds },
      date: { gte: windowStart, lte: windowEnd },
    },
  });

  return memberIds.map((userId) => {
    const overrides = overridesByUser[userId] ?? {};

    // Apply any per-task multiplier overrides before scoring this member's tasks
    const memberTasks = allTasks
      .filter((t) => t.assignee_id === userId)
      .map((t) => ({
        ...t,
        multiplier_earned:
          overrides[t.task_id] != null ? overrides[t.task_id] : t.multiplier_earned,
      }));

    const memberAttendance = allAttendance.filter((a) => a.user_id === userId);

    // Score each month in the span independently, then average — matches the
    // existing single-month formulas exactly, just repeated per month.
    const monthlyBreakdown: MonthlyScoreBreakdown[] = months.map(({ year, month }) => {
      const scheduledDays = scheduledDaysByMonth[getMonthKey({ year, month })] ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tpsResult = calculateTPS(memberTasks as any, year, month);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const asScore = calculateAS(memberAttendance as any, year, month, scheduledDays);
      const totalScore = calculateTotalScore(tpsResult.score, asScore);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const presentDays = countPresentDaysInMonth(memberAttendance as any, year, month);

      return { year, month, tpsScore: tpsResult.score, asScore, totalScore, presentDays, scheduledDays };
    });

    const monthCount = monthlyBreakdown.length;
    const tpsScore =
      Math.round((monthlyBreakdown.reduce((s, m) => s + m.tpsScore, 0) / monthCount) * 100) / 100;
    const asScore =
      Math.round((monthlyBreakdown.reduce((s, m) => s + m.asScore, 0) / monthCount) * 100) / 100;
    const totalScore = calculateTotalScore(tpsScore, asScore);
    const presentDays = monthlyBreakdown.reduce((s, m) => s + m.presentDays, 0);
    const scheduledDays = monthlyBreakdown.reduce((s, m) => s + m.scheduledDays, 0);

    return { userId, tpsScore, asScore, totalScore, presentDays, scheduledDays, monthlyBreakdown };
  });
}

export interface WorkspaceCloseContext {
  closedMonths: Set<string>; // every "YYYY-MM" already covered by an existing close (any status)
  lastFinalizedEnd: MonthPoint | null; // end month of the most recent Finalized close, if any
  earliestActivityMonth: MonthPoint | null; // earliest task/attendance activity, if no close exists yet
}

// Gathers the context needed to auto-detect a close's span and to validate/disable
// months in the manual picker. Shared by the next-range preview endpoint and the
// POST route so both agree on what "already closed" and "earliest activity" mean.
export async function getWorkspaceCloseContext(workspaceId: string): Promise<WorkspaceCloseContext> {
  const existingCloses = await prisma.monthlyClose.findMany({
    where: { workspace_id: workspaceId },
    select: { start_year: true, start_month: true, year: true, month: true, status: true },
  });

  const closedMonths = new Set<string>();
  let lastFinalizedEnd: MonthPoint | null = null;
  for (const c of existingCloses) {
    const start: MonthPoint = { year: c.start_year, month: c.start_month };
    const end: MonthPoint = { year: c.year, month: c.month };
    for (const key of expandRangeToKeys(start, end)) closedMonths.add(key);
    if (c.status === "Finalized" && (!lastFinalizedEnd || compareMonths(end, lastFinalizedEnd) > 0)) {
      lastFinalizedEnd = end;
    }
  }

  const members = await prisma.workspaceMember.findMany({
    where: { workspace_id: workspaceId },
    select: { user_id: true },
  });
  const memberIds = members.map((m) => m.user_id);

  const [earliestTask, earliestAttendance] = await Promise.all([
    prisma.taskLedger.findFirst({
      where: { workspace_id: workspaceId },
      orderBy: { created_at: "asc" },
      select: { created_at: true },
    }),
    memberIds.length > 0
      ? prisma.dailyAttendance.findFirst({
          where: { user_id: { in: memberIds } },
          orderBy: { date: "asc" },
          select: { date: true },
        })
      : Promise.resolve(null),
  ]);

  let earliestActivityMonth: MonthPoint | null = null;
  const candidates = [earliestTask?.created_at, earliestAttendance?.date].filter(
    (d): d is Date => d != null
  );
  if (candidates.length > 0) {
    const earliest = new Date(Math.min(...candidates.map((d) => d.getTime())));
    earliestActivityMonth = { year: earliest.getFullYear(), month: earliest.getMonth() };
  }

  return { closedMonths, lastFinalizedEnd, earliestActivityMonth };
}
