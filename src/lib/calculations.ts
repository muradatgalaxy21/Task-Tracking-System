// -------------------------------------------------------------------
// Calculation Engine (v2)
// Implements the updated scoring and payout formulas:
//   - Penalty Multiplier (per task, stored at completion)
//   - Task Performance Score (TPS) via weekly calendar-week averages
//   - Attendance Score (AS) via daily_attendance present-day count
//   - Payout Distribution (3-tier: Treasury / Base / Performance)
// -------------------------------------------------------------------

import type { TaskLedger, DailyAttendance } from "@/lib/types";

// ------------------------------------
// 1. MULTIPLIER LOGIC
// Compares task completion date against deadline.
// Updated penalty tiers (3+ days late = 0.0, replacing old 0.10).
// ------------------------------------

export interface MultiplierResult {
  multiplier: number;
  daysLate: number;
  label: string;
}

export function getMultiplier(
  completedAt: string | null,
  maxDeadline: string
): MultiplierResult {
  // If task is not completed yet, return 0 (no multiplier earned)
  if (!completedAt) {
    return { multiplier: 0, daysLate: 0, label: "Incomplete" };
  }

  const completed = new Date(completedAt);
  const deadline = new Date(maxDeadline);

  // Calculate positive difference in days (negative means on time)
  const diffMs = completed.getTime() - deadline.getTime();
  const daysLate = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  // Apply the updated tiered penalty structure
  if (daysLate === 0) {
    return { multiplier: 1.0, daysLate, label: "On Time" };
  } else if (daysLate === 1) {
    return { multiplier: 0.60, daysLate, label: "1 Day Late" };
  } else if (daysLate === 2) {
    return { multiplier: 0.40, daysLate, label: "2 Days Late" };
  } else {
    // 3 or more days late: zero multiplier (no credit earned)
    return { multiplier: 0.0, daysLate, label: `${daysLate} Days Late` };
  }
}

// ------------------------------------
// 2. WEEK GROUPING UTILITY
// Determines which calendar week of the month (1-4) a date falls into.
// Weeks run Monday to Sunday per user specification.
// Week 1 = the week containing the 1st of the month.
// ------------------------------------

function getCalendarWeekOfMonth(date: Date): 1 | 2 | 3 | 4 {
  // Find the Monday of the week containing the 1st of the month
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  // getDay(): 0=Sun, 1=Mon ... 6=Sat. Shift so Mon=0, Sun=6.
  const firstDayOffset = (firstOfMonth.getDay() + 6) % 7;

  // dayOfMonth is 0-indexed
  const dayOfMonth = date.getDate() - 1;
  // Add offset so week counting starts from the Monday before/on the 1st
  const adjustedDay = dayOfMonth + firstDayOffset;
  const weekNumber = Math.floor(adjustedDay / 7) + 1;

  // Cap at 4 to handle months with partial 5th weeks (overflow into W4)
  return Math.min(weekNumber, 4) as 1 | 2 | 3 | 4;
}

// ------------------------------------
// 3. TASK PERFORMANCE SCORE (TPS)
// Formula (weekly average method):
//   - Filter completed tasks for the target month.
//   - Group into 4 calendar-week buckets (Mon-Sun).
//   - Weekly Avg = Sum(multipliers in week) / Tasks in week
//   - TPS = ((W1 + W2 + W3 + W4) / 4) * 80
//   - Weeks with no tasks contribute 0 to the average.
// Max TPS = 80
// ------------------------------------

export interface WeeklyBreakdown {
  week: 1 | 2 | 3 | 4;
  tasks: { title: string; multiplier: number; completedAt: string }[];
  average: number;
}

export interface TPSResult {
  score: number;
  weeklyBreakdown: WeeklyBreakdown[];
  // Kept for backward-compatible display in member breakdown table
  details: {
    taskId: string;
    title: string;
    multiplier: number;
    daysLate: number;
    label: string;
    completedAt: string | null;
    weekOfMonth: number | null;
  }[];
}

export function calculateTPS(
  tasks: TaskLedger[],
  targetYear?: number,
  targetMonth?: number // 0-indexed (0 = January)
): TPSResult {
  // Default to current month if not specified
  const now = new Date();
  const year = targetYear ?? now.getFullYear();
  const month = targetMonth ?? now.getMonth();

  // Filter to only completed tasks within the target calendar month
  const completedThisMonth = tasks.filter((task) => {
    if (task.status !== "Completed" || !task.completed_at) return false;
    const completedDate = new Date(task.completed_at);
    return (
      completedDate.getFullYear() === year &&
      completedDate.getMonth() === month
    );
  });

  // Build detail rows for all tasks (including non-completed this month for UI)
  const details = tasks.map((task) => {
    const isCompleted = task.status === "Completed" && !!task.completed_at;
    // Use stored multiplier_earned if available; fall back to dynamic calculation
    const storedMultiplier = task.multiplier_earned;
    const { multiplier, daysLate, label } =
      storedMultiplier != null
        ? { multiplier: storedMultiplier, daysLate: 0, label: "Stored" }
        : getMultiplier(task.completed_at, task.max_deadline);

    const weekOfMonth =
      isCompleted && task.completed_at
        ? getCalendarWeekOfMonth(new Date(task.completed_at))
        : null;

    return {
      taskId: task.task_id,
      title: task.title,
      multiplier: isCompleted ? multiplier : 0,
      daysLate,
      label: isCompleted ? label : "Not Completed",
      completedAt: task.completed_at,
      weekOfMonth,
    };
  });

  // Group completed-this-month tasks into 4 week buckets
  const weekBuckets: Record<1 | 2 | 3 | 4, number[]> = {
    1: [],
    2: [],
    3: [],
    4: [],
  };

  for (const task of completedThisMonth) {
    const completedDate = new Date(task.completed_at!);
    const week = getCalendarWeekOfMonth(completedDate);
    // Use stored multiplier_earned if present
    const m =
      task.multiplier_earned != null
        ? task.multiplier_earned
        : getMultiplier(task.completed_at, task.max_deadline).multiplier;
    weekBuckets[week].push(m);
  }

  // Calculate weekly averages; weeks with no tasks contribute 0
  const weeklyAverages: [number, number, number, number] = [0, 0, 0, 0];
  const weeklyBreakdown: WeeklyBreakdown[] = [];

  for (let w = 1; w <= 4; w++) {
    const bucket = weekBuckets[w as 1 | 2 | 3 | 4];
    const avg =
      bucket.length > 0
        ? bucket.reduce((s, m) => s + m, 0) / bucket.length
        : 0;
    weeklyAverages[w - 1] = avg;

    weeklyBreakdown.push({
      week: w as 1 | 2 | 3 | 4,
      tasks: completedThisMonth
        .filter(
          (t) =>
            getCalendarWeekOfMonth(new Date(t.completed_at!)) === w
        )
        .map((t) => ({
          title: t.title,
          multiplier:
            t.multiplier_earned != null
              ? t.multiplier_earned
              : getMultiplier(t.completed_at, t.max_deadline).multiplier,
          completedAt: t.completed_at!,
        })),
      average: Math.round(avg * 1000) / 1000,
    });
  }

  // TPS = mean of 4 weekly averages * 80
  const meanAvg =
    (weeklyAverages[0] +
      weeklyAverages[1] +
      weeklyAverages[2] +
      weeklyAverages[3]) /
    4;
  const score = Math.round(meanAvg * 80 * 100) / 100;

  return { score, weeklyBreakdown, details };
}

// ------------------------------------
// 4. ATTENDANCE SCORE (AS)
// Formula: AS = (Present Days / Total Scheduled Days) * 20
// Total Scheduled Days = dynamically computed as working days (Mon-Fri)
// in the target month. Excludes Saturday and Sunday.
// Max AS = 20
// ------------------------------------

export function getWorkingDaysInMonth(year: number, month: number): number {
  // Fixed logic as per user request: 25 days for regular months, 24 for February
  const isFebruary = month === 1; // 0=Jan, 1=Feb
  return isFebruary ? 24 : 25;
}

export function calculateAS(
  attendanceRecords: DailyAttendance[],
  targetYear?: number,
  targetMonth?: number // 0-indexed
): number {
  const now = new Date();
  const year = targetYear ?? now.getFullYear();
  const month = targetMonth ?? now.getMonth();

  // Count only 'Present' records within the target month
  const presentDays = attendanceRecords.filter((record) => {
    if (record.status !== "Present") return false;
    const recordDate = new Date(record.date);
    return (
      recordDate.getFullYear() === year && recordDate.getMonth() === month
    );
  }).length;

  const totalScheduled = getWorkingDaysInMonth(year, month);

  // Guard against division by zero in months with no working days
  if (totalScheduled === 0) return 0;

  const score = (presentDays / totalScheduled) * 20;
  return Math.round(score * 100) / 100;
}

// ------------------------------------
// 5. TOTAL SCORE
// Total = TPS + AS (max 100)
// ------------------------------------

export function calculateTotalScore(tps: number, as_score: number): number {
  return Math.round((tps + as_score) * 100) / 100;
}

// ------------------------------------
// 6. PAYOUT DISTRIBUTION (3-Tier)
// Tier 1: Treasury = Total Revenue * 60% (retained)
// Tier 2: Distribution Pool = Total Revenue * 40%
//   - Base Pool = Distribution Pool * 60% (split equally per member)
//   - Performance Pool = Distribution Pool * 40% (score-proportional)
// Final Payout = Base Payout + Performance Payout per member
// ------------------------------------

export interface PayoutResult {
  memberId: string;
  memberName: string;
  totalScore: number;
  sharePercentage: number;
  basePayout: number;
  perfPayout: number;
  finalPayout: number;
}

export function calculatePayouts(
  memberScores: { memberId: string; memberName: string; totalScore: number }[],
  totalRevenue: number
): PayoutResult[] {
  // Tier 1: Treasury deduction
  const distributionPool = totalRevenue * 0.40;

  // Tier 2: Split the distribution pool
  const basePool = distributionPool * 0.60;
  const performancePool = distributionPool * 0.40;

  // Base payout is equal for every member (dynamic per member count)
  const memberCount = memberScores.length;
  const basePayout = memberCount > 0 ? basePool / memberCount : 0;

  // Sum all scores for proportional performance calculation
  const totalTeamScore = memberScores.reduce((s, m) => s + m.totalScore, 0);

  return memberScores.map((m) => {
    // Performance share is proportional to individual score vs team total
    const sharePercentage =
      totalTeamScore > 0 ? (m.totalScore / totalTeamScore) * 100 : 0;
    const perfPayout =
      totalTeamScore > 0
        ? (m.totalScore / totalTeamScore) * performancePool
        : 0;
    const finalPayout = basePayout + perfPayout;

    return {
      ...m,
      sharePercentage: Math.round(sharePercentage * 100) / 100,
      basePayout: Math.round(basePayout * 100) / 100,
      perfPayout: Math.round(perfPayout * 100) / 100,
      finalPayout: Math.round(finalPayout * 100) / 100,
    };
  });
}
