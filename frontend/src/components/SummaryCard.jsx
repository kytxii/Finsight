import { useTheme } from "../hooks/useTheme";

export default function SummaryCard({ label, value, activeColor, deltaLabel, deltaUp, valueColor, subLabel, extraLabel, extraColor }) {
  const dark = useTheme();

  const bg     = dark ? "var(--dark-surface)" : "var(--light-surface)";
  const border = dark ? "var(--dark-border)"  : "var(--light-border)";
  const text   = dark ? "var(--dark-text)"    : "var(--light-text)";
  const muted  = `color-mix(in srgb, ${text} 50%, transparent)`;

  return (
    <div className="rounded-2xl px-5 py-5 border" style={{ backgroundColor: bg, color: text, borderTopColor: activeColor, borderTopWidth: "3px", borderRightColor: border, borderBottomColor: border, borderLeftColor: border }}>
      <p className="text-base font-medium mb-1">{label}</p>
      <p className="text-3xl font-bold tracking-tight" style={valueColor ? { color: valueColor } : undefined}>{value}</p>
      {deltaLabel != null && (
        <p className="text-xs font-semibold mt-1.5" style={{ color: deltaUp ? "var(--category-income)" : "var(--category-expense)" }}>
          {deltaLabel}
        </p>
      )}
      {subLabel != null && (
        <p className="text-xs mt-1" style={{ color: muted }}>
          {subLabel}
        </p>
      )}
      {extraLabel != null && (
        <p className="text-xs font-semibold mt-1" style={{ color: extraColor ?? muted }}>
          {extraLabel}
        </p>
      )}
    </div>
  );
}
