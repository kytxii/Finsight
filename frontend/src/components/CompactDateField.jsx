function IconCalendar({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

// Renders a compact icon + short label ("Aug 10") instead of a native date
// input's own content - a native input's locale segments + calendar-icon
// affordance are wide enough to clip when squeezed into a half-width field
// (e.g. sitting next to an Amount field). The real date input is still here,
// just invisible and stretched over the whole box, so tapping anywhere opens
// the native OS picker as normal - what's visible is purely for display.
// Shared between MobileTransactionModal (#27) and the quick-add Entry sheet
// (#30), the two places this app asks for a date next to something else.
export default function CompactDateField({ value, onChange, required, className, style }) {
  const dateLabel = value
    ? new Date(value + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "Select date";
  return (
    <div className={className} style={{ ...style, position: "relative", display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
      <IconCalendar />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dateLabel}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, border: "none", padding: 0, cursor: "pointer" }}
      />
    </div>
  );
}
