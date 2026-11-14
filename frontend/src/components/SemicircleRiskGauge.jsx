/**
 * Reusable 180-degree SVG semicircle risk gauge for Scam Shield, Health Check, and Dashboard.
 */
export default function SemicircleRiskGauge({
  percentage = 0,
  label = "Risk Score",
  verdictText = "Safe",
  tone = "safe", // "safe" | "warn" | "danger" | "teal"
  lowCut = 35,
  highCut = 65,
}) {
  const clamped = Math.max(0, Math.min(100, Number(percentage) || 0));
  const radius = 84;
  const cx = 110;
  const cy = 104;
  const halfCircumference = Math.PI * radius;
  const filledLength = (clamped / 100) * halfCircumference;

  const toneColors = {
    safe: {
      arc: "#22C55E",
      badge: "bg-green-100 text-verdict-safe-ink border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800/60",
    },
    warn: {
      arc: "#F59E0B",
      badge: "bg-amber-50 text-verdict-warn-ink border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60",
    },
    danger: {
      arc: "#EF4444",
      badge: "bg-red-50 text-verdict-danger-ink border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800/60",
    },
    teal: {
      arc: "#14B8A6",
      badge: "bg-teal-50 text-brand-teal-ink border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800/60",
    },
  };
  const palette = toneColors[tone] || toneColors.safe;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 220 124" className="w-full max-w-[230px] overflow-visible">
        {/* Background track */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="14"
          strokeLinecap="round"
          className="text-slate-200 dark:text-slate-700"
        />

        {/* Subtle threshold zone hints */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={palette.arc}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${filledLength} ${halfCircumference}`}
          style={{ transition: "stroke-dasharray 500ms ease" }}
        />

        {/* Centered numeric readout */}
        <text
          x={cx}
          y={cy - 22}
          textAnchor="middle"
          className="fill-brand-navy font-mono text-[26px] font-bold dark:fill-brand-offwhite"
        >
          {clamped.toFixed(1)}%
        </text>
        <text
          x={cx}
          y={cy - 3}
          textAnchor="middle"
          className="fill-slate-500 text-[10px] font-semibold uppercase tracking-wider dark:fill-slate-400"
        >
          {label}
        </text>
      </svg>

      <span
        className={`-mt-1 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${palette.badge}`}
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: palette.arc }}
        />
        {verdictText}
      </span>

      <div className="mt-2.5 flex w-full max-w-[230px] justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <span>Safe &lt;{lowCut}%</span>
        <span>Mid {lowCut}–{highCut}%</span>
        <span>High ≥{highCut}%</span>
      </div>
    </div>
  );
}
