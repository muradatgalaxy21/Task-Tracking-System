// -------------------------------------------------------------------
// Month-Range Helpers for Cumulative Monthly Close
// A close now covers a span of one or more calendar months rather than
// a single month. These helpers compute that span, both for the
// "auto" mode (detect everything unclosed since the last Finalized
// close) and for validating/expanding a manually chosen range.
// -------------------------------------------------------------------

export interface MonthPoint {
  year: number;
  month: number; // 0-indexed (0 = January)
}

// Formats a month/year pair as a stable sortable/comparable key, e.g. "2026-05"
export function getMonthKey({ year, month }: MonthPoint): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

// Adds `delta` months to a month/year pair, normalizing year rollover in either direction
export function addMonths({ year, month }: MonthPoint, delta: number): MonthPoint {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

// Compares two month points: negative if a < b, 0 if equal, positive if a > b
export function compareMonths(a: MonthPoint, b: MonthPoint): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

// Returns every month point from start through end, inclusive
export function monthsBetween(start: MonthPoint, end: MonthPoint): MonthPoint[] {
  const months: MonthPoint[] = [];
  let cursor = start;
  // Guard against an inverted/malformed range producing an unbounded loop
  while (compareMonths(cursor, end) <= 0) {
    months.push(cursor);
    if (months.length > 240) break; // 20-year safety cap
    cursor = addMonths(cursor, 1);
  }
  return months;
}

// Auto-detection cutoff: closing on day 28-31 includes the current (still-running)
// month in the span; closing on day 1-27 excludes it and stops at the previous month.
const CURRENT_MONTH_CUTOFF_DAY = 28;

export function determineAutoCloseEnd(now: Date = new Date()): MonthPoint {
  const current: MonthPoint = { year: now.getFullYear(), month: now.getMonth() };
  if (now.getDate() >= CURRENT_MONTH_CUTOFF_DAY) return current;
  return addMonths(current, -1);
}

// Determines where the auto-detected span should start: the month right after the
// last Finalized close's end month, or — if no close has ever been finalized —
// the earliest month with any task/attendance activity. Falls back to the
// computed end month itself if there is no prior close and no activity at all.
export function determineAutoCloseStart(
  lastFinalizedCloseEnd: MonthPoint | null,
  earliestActivityMonth: MonthPoint | null,
  autoEnd: MonthPoint
): MonthPoint {
  if (lastFinalizedCloseEnd) return addMonths(lastFinalizedCloseEnd, 1);
  if (earliestActivityMonth) return earliestActivityMonth;
  return autoEnd;
}

// Expands an existing close's start/end range into the set of month keys it covers —
// used to disable already-closed months in the manual picker and to reject overlap.
export function expandRangeToKeys(start: MonthPoint, end: MonthPoint): string[] {
  return monthsBetween(start, end).map(getMonthKey);
}
