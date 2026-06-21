// -------------------------------------------------------------------
// Calculation Engine (v3)
// Implements the updated scoring and payout formulas:
//   - Penalty Multiplier (per task, stored at completion)
//   - Task Performance Score (TPS) via weekly calendar-week averages — max 65
//   - Attendance Score (AS) via daily_attendance present-day count — max 35
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
  hoursLate: number; // hours past deadline (0 = on time)
  label: string;
}

export function getMultiplier(
  completedAt: string | null,
  maxDeadline: string,
  reviewSubmittedAt?: string | null
): MultiplierResult {
  // If task is not completed yet, return 0 (no multiplier earned)
  if (!completedAt) {
    return { multiplier: 0, hoursLate: 0, label: "Incomplete" };
  }

  // Use review_submitted_at if available — member should not be penalised for admin delay
  // in approving a review. The moment the member submitted the task for review is the
  // fair reference point for on-time measurement.
  const referenceDate = reviewSubmittedAt ? reviewSubmittedAt : completedAt;
  const diffMs = new Date(referenceDate).getTime() - new Date(maxDeadline).getTime();

  // Hour-precision lateness — each started hour counts
  const hoursLate = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60)));

  if (hoursLate === 0) {
    return { multiplier: 1.0, hoursLate, label: "On Time" };
  } else if (hoursLate <= 24) {
    // Up to 24 hours late
    return { multiplier: 0.60, hoursLate, label: `${hoursLate}h Late` };
  } else if (hoursLate <= 48) {
    // 24–48 hours late
    return { multiplier: 0.40, hoursLate, label: `${hoursLate}h Late` };
  } else {
    // More than 48 hours late: zero credit
    const days = Math.floor(hoursLate / 24);
    const hrs = hoursLate % 24;
    const label = hrs > 0 ? `${days}d ${hrs}h Late` : `${days}d Late`;
    return { multiplier: 0.0, hoursLate, label };
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
// Formula (flat average method):
//   - Filter completed tasks for the target month.
//   - Flat Avg = Sum(all multipliers) / Total completed tasks
//   - TPS = Flat Avg * 65
//   - If no tasks completed: TPS = 0
//   - Weekly breakdown is computed for display only — not used in score.
// Max TPS = 65
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
    hoursLate: number;
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

  // "Not Done" tasks are counted in TPS with multiplier 0 — they close the task but penalise the score
  const isTerminalCounted = (task: TaskLedger) =>
    (task.status === "Completed" || task.status === "Not Done") && !!task.completed_at;

  // Filter to completed/not-done tasks within the target calendar month
  const completedThisMonth = tasks.filter((task) => {
    if (!isTerminalCounted(task)) return false;
    const completedDate = new Date(task.completed_at!);
    return (
      completedDate.getFullYear() === year &&
      completedDate.getMonth() === month
    );
  });

  // Build detail rows for all tasks (including non-completed this month for UI)
  const details = tasks.map((task) => {
    const isCounted = isTerminalCounted(task);
    // Use stored multiplier_earned if available; fall back to dynamic calculation
    const storedMultiplier = task.multiplier_earned;
    const { multiplier, hoursLate, label } =
      storedMultiplier != null
        ? { multiplier: storedMultiplier, hoursLate: 0, label: task.status === "Not Done" ? "Not Done" : "Stored" }
        : getMultiplier(task.completed_at, task.max_deadline, task.review_submitted_at);

    const weekOfMonth =
      isCounted && task.completed_at
        ? getCalendarWeekOfMonth(new Date(task.completed_at))
        : null;

    return {
      taskId: task.task_id,
      title: task.title,
      multiplier: isCounted ? multiplier : 0,
      hoursLate,
      label: isCounted ? label : "Not Completed",
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
        : getMultiplier(task.completed_at, task.max_deadline, task.review_submitted_at).multiplier;
    weekBuckets[week].push(m);
  }

  // Build weekly breakdown for display only (not used in score calculation)
  const weeklyBreakdown: WeeklyBreakdown[] = [];

  for (let w = 1; w <= 4; w++) {
    const bucket = weekBuckets[w as 1 | 2 | 3 | 4];
    const avg =
      bucket.length > 0
        ? bucket.reduce((s, m) => s + m, 0) / bucket.length
        : 0;

    weeklyBreakdown.push({
      week: w as 1 | 2 | 3 | 4,
      tasks: completedThisMonth
        .filter((t) => getCalendarWeekOfMonth(new Date(t.completed_at!)) === w)
        .map((t) => ({
          title: t.title,
          multiplier:
            t.multiplier_earned != null
              ? t.multiplier_earned
              : getMultiplier(t.completed_at, t.max_deadline, t.review_submitted_at).multiplier,
          completedAt: t.completed_at!,
        })),
      average: Math.round(avg * 1000) / 1000,
    });
  }

  // TPS = flat average of all completed tasks this month * 65 (clamped to a minimum of 0)
  const allMultipliers = completedThisMonth.map((t) =>
    t.multiplier_earned != null
      ? t.multiplier_earned
      : getMultiplier(t.completed_at, t.max_deadline, t.review_submitted_at).multiplier
  );
  const flatAvg =
    allMultipliers.length > 0
      ? allMultipliers.reduce((s, m) => s + m, 0) / allMultipliers.length
      : 0;
  const score = Math.max(0, Math.round(flatAvg * 65 * 100) / 100);

  return { score, weeklyBreakdown, details };
}

// ------------------------------------
// 4. ATTENDANCE SCORE (AS)
// Formula: AS = (Member's Present Days / Active Days in Month) * 35
// Active Days = unique dates where at least one workspace member was Present.
// No hard limit — days where nobody came are excluded from the denominator.
// Max AS = 35
// ------------------------------------

// Returns the count of unique dates in the target month where at least one
// member in allAttendance has status "Present" or "Late". Pass all workspace attendance records.
export function getActiveDaysInMonth(
  allAttendance: DailyAttendance[],
  year: number,
  month: number
): number {
  const activeDates = new Set<string>();
  for (const record of allAttendance) {
    if (record.status !== "Present" && record.status !== "Late") continue;
    // Slice ISO prefix directly — avoids timezone-shift bugs with new Date()
    const s = typeof record.date === "string" ? record.date : (record.date as unknown as Date).toISOString();
    const [yr, mo] = s.slice(0, 10).split("-").map(Number);
    if (yr === year && mo - 1 === month) {
      activeDates.add(s.slice(0, 10)); // unique per calendar day
    }
  }
  return activeDates.size;
}

// Counts a member's 'Present' and 'Late' days within the target month.
// 'Present' is counted as 1.0 day, and 'Late' is counted as 0.5 days.
// Slice the ISO prefix directly to avoid timezone-shift bugs with new Date() —
// this is the canonical present-day count used by both calculateAS and the
// MonthlyClose aggregation, so a widened DB query window is filtered precisely here.
export function countPresentDaysInMonth(
  attendanceRecords: DailyAttendance[],
  year: number,
  month: number // 0-indexed
): number {
  let count = 0;
  for (const record of attendanceRecords) {
    const s = typeof record.date === "string" ? record.date : (record.date as unknown as Date).toISOString();
    const [yr, mo] = s.slice(0, 10).split("-").map(Number);
    if (yr === year && mo - 1 === month) {
      if (record.status === "Present") {
        count += 1.0;
      } else if (record.status === "Late") {
        count += 0.5;
      }
    }
  }
  return count;
}

export function calculateAS(
  attendanceRecords: DailyAttendance[],
  targetYear?: number,
  targetMonth?: number, // 0-indexed
  scheduledDays?: number // active days in month; pass result of getActiveDaysInMonth
): number {
  const now = new Date();
  const year = targetYear ?? now.getFullYear();
  const month = targetMonth ?? now.getMonth();

  // Count only 'Present' records for this member within the target month
  const presentDays = countPresentDaysInMonth(attendanceRecords, year, month);

  // Guard against division by zero if no one has come in yet this month
  if (!scheduledDays || scheduledDays === 0) return 0;

  const score = (presentDays / scheduledDays) * 35;
  return Math.round(score * 100) / 100;
}

// Returns count of weekdays (Mon-Fri) in a month up to (and including) the given end date.
// Used when computing scheduled_days for a MonthlyClose.
export function countWeekdaysInMonth(year: number, month: number, endDate?: Date): number {
  const end = endDate ?? new Date(year, month + 1, 0); // default: last day of month
  let count = 0;
  const cursor = new Date(year, month, 1);
  while (cursor <= end && cursor.getMonth() === month) {
    const day = cursor.getDay(); // 0=Sun, 6=Sat
    if (day !== 0 && day !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
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
  // Tier 1: Treasury deduction (60% retained)
  const distributionPool = totalRevenue * 0.40;

  // Tier 2: Split the distribution pool - Now 100% Performance-based
  const basePool = 0;
  const performancePool = distributionPool;

  // Base payout is 0 (removed from layout, kept as 0 for database compatibility)
  const basePayout = 0;

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
    const finalPayout = perfPayout;

    return {
      ...m,
      sharePercentage: Math.round(sharePercentage * 100) / 100,
      basePayout: 0,
      perfPayout: Math.round(perfPayout * 100) / 100,
      finalPayout: Math.round(finalPayout * 100) / 100,
    };
  });
}
