import { HOME_DIVIDER } from "./categoryVisuals";

// Small single-value percentage ring for the category summary card (#108) -
// this category's share of total spend (or total income, on an income-type
// category page) for the selected period. Plain SVG circle + strokeDasharray,
// no chart library - same "hand-rolled, animate-in" convention as
// InstallmentGauge, just a full ring instead of a 5-band speedometer since
// this is a single continuous 0-100% value, not a threshold-banded one.
export default function CategoryShareRing({ ratio, color, size = 40, strokeWidth = 5 }) {
  const clamped = Math.max(0, Math.min(1, ratio || 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={HOME_DIVIDER} strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 500ms ease" }}
      />
    </svg>
  );
}
