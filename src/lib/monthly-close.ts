// Shared scoring aggregation for MonthlyClose — server-only. Never import from client components.
//
// Both the create (POST) and recalculate (PATCH) paths of /api/monthly-close need
// the same per-member TPS/AS/total computation. Centralising it here keeps the two
// routes in sync and means the timezone-safe attendance window lives in one place.

import { prisma } from "@/lib/prisma";
import {
  calculateTPS,
  calculateAS,
  calculateTotalScore,
  countPresentDaysInMonth,
} from "@/lib/calculations";

export interface MemberScore {
  userId: string;
  tpsScore: number;
  asScore: number;
  totalScore: number;
  presentDays: number;
}

// Computes TPS/AS/total scores for a set of members in a target month.
// Reads tasks and attendance in two batched queries (no per-member round trips),
// then aggregates in memory.
export async function computeMemberScores({
  workspaceId,
  memberIds,
  year,
  month, // 0-indexed (0 = January)
  scheduledDays,
  overridesByUser = {},
}: {
  workspaceId: string;
  memberIds: string[];
  year: number;
  month: number;
  scheduledDays: number;
  // Maps user_id -> { [taskId]: overrideMultiplier }; applied non-destructively before TPS.
  overridesByUser?: Record<string, Record<string, number>>;
}): Promise<MemberScore[]> {
  if (memberIds.length === 0) return [];

  // Fetch every member's tasks in a single query rather than one query per member
  const allTasks = await prisma.taskLedger.findMany({
    where: { workspace_id: workspaceId, assignee_id: { in: memberIds } },
  });

  // Attendance is stored at local midnight, so on a non-UTC server the first/last
  // calendar day of the month can fall just outside a tight range. Widen the window
  // by a day on each side; calculateAS and countPresentDaysInMonth re-filter exactly
  // by slicing the ISO date prefix, so the padding never inflates the result.
  const windowStart = new Date(year, month, 1);
  windowStart.setDate(windowStart.getDate() - 1);
  const windowEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
  windowEnd.setDate(windowEnd.getDate() + 1);

  // Fetch every member's attendance in a single query
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

    // Cast to the lib TaskLedger/DailyAttendance shape (Prisma returns Date fields; calculations slice ISO strings)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tpsResult = calculateTPS(memberTasks as any, year, month);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asScore = calculateAS(memberAttendance as any, year, month, scheduledDays);
    const totalScore = calculateTotalScore(tpsResult.score, asScore);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const presentDays = countPresentDaysInMonth(memberAttendance as any, year, month);

    return { userId, tpsScore: tpsResult.score, asScore, totalScore, presentDays };
  });
}
