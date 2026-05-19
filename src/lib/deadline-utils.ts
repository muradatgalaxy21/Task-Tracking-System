// Shared deadline display utility.
// Returns a human-readable label and Tailwind color classes based on time remaining.

export interface DeadlineInfo {
  hoursLeft: number;       // fractional hours remaining (negative = overdue)
  label: string;           // e.g. "3h 20m left", "2d 4h left", "45m overdue"
  colorClass: string;      // Tailwind text color
  bgClass: string;         // Tailwind background color
  borderClass: string;     // Tailwind border color
  isOverdue: boolean;
}

export function getDeadlineInfo(maxDeadline: string): DeadlineInfo {
  const diffMs = new Date(maxDeadline).getTime() - Date.now();
  const isOverdue = diffMs < 0;
  const absDiffMs = Math.abs(diffMs);

  // Decompose into days, hours, minutes
  const totalMinutes = Math.floor(absDiffMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const hoursLeft = diffMs / 3_600_000; // fractional, negative if overdue

  // Build human label
  let label: string;
  const suffix = isOverdue ? "overdue" : "left";
  if (days > 0) {
    label = hours > 0 ? `${days}d ${hours}h ${suffix}` : `${days}d ${suffix}`;
  } else if (hours > 0) {
    label = minutes > 0 ? `${hours}h ${minutes}m ${suffix}` : `${hours}h ${suffix}`;
  } else if (totalMinutes > 0) {
    label = `${totalMinutes}m ${suffix}`;
  } else {
    label = isOverdue ? "Overdue" : "Due now";
  }

  // Color tiers (overdue and <6h both red; color conveys urgency, not direction)
  let colorClass: string;
  let bgClass: string;
  let borderClass: string;

  if (isOverdue || hoursLeft < 6) {
    colorClass = "text-red-500";
    bgClass = "bg-red-50";
    borderClass = "border-red-200";
  } else if (hoursLeft < 12) {
    colorClass = "text-amber-500";
    bgClass = "bg-amber-50";
    borderClass = "border-amber-200";
  } else if (hoursLeft <= 24) {
    colorClass = "text-emerald-500";
    bgClass = "bg-emerald-50";
    borderClass = "border-emerald-200";
  } else {
    colorClass = "text-blue-500";
    bgClass = "bg-blue-50";
    borderClass = "border-blue-200";
  }

  return { hoursLeft, label, colorClass, bgClass, borderClass, isOverdue };
}
