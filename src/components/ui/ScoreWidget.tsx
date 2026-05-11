"use client";

// -------------------------------------------------------------------
// Score Display Widget
// Shows a member's TPS, AS, and Total Score with animated ring chart.
// Restyled for warm light theme.
// -------------------------------------------------------------------

interface ScoreWidgetProps {
  label: string;
  score: number;
  maxScore: number;
  color: string;
  subtitle?: string;
}

export default function ScoreWidget({
  label,
  score,
  maxScore,
  color,
  subtitle,
}: ScoreWidgetProps) {
  // Calculate percentage for the ring chart (SVG circle)
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="glass-card p-5 flex items-center gap-5">
      {/* Animated ring chart */}
      <div className="relative w-20 h-20 shrink-0">
        <svg
          className="w-full h-full -rotate-90"
          viewBox="0 0 100 100"
        >
          {/* Background ring */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="rgba(55, 53, 47, 0.06)"
            strokeWidth="6"
          />
          {/* Progress ring */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 1s ease-out",
            }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-neutral-800">{score}</span>
          <span className="text-[9px] text-neutral-400">/{maxScore}</span>
        </div>
      </div>

      {/* Label and subtitle */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-800">{label}</h3>
        {subtitle && (
          <p className="text-xs text-neutral-400 mt-0.5">{subtitle}</p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <div
            className="h-1.5 rounded-full flex-1"
            style={{ background: "rgba(55, 53, 47, 0.06)", maxWidth: 120 }}
          >
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${Math.min(percentage, 100)}%`,
                background: color,
              }}
            />
          </div>
          <span className="text-[10px] text-neutral-400 font-medium">
            {Math.round(percentage)}%
          </span>
        </div>
      </div>
    </div>
  );
}
