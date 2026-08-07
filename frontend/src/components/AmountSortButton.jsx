import { HOME_MUTED } from "./categoryVisuals";

// Shared sort-field toggle: tap cycles through direction, off -> on -> other
// direction -> off (exact states are the caller's call, see `sort`/`onToggle`).
// Originally Amount-only, extracted from MobileCategory.jsx; now takes a
// `label` so Activity (#29) can reuse it for Name/Date too instead of writing
// a third copy of the same button. Filled, borderless style - solid `color`
// when active rather than a bordered/tinted outline. `icon` swaps in for the
// text label visually (label is kept for the aria-label regardless); `hideArrow`
// drops the direction chevron for a field like Name whose label text ("A–Z" /
// "Z–A") already conveys direction on its own.
export default function AmountSortButton({ sort, onToggle, color = HOME_MUTED, label = "Amount", icon = null, hideArrow = false, minWidth }) {
  return (
    <button
      onClick={onToggle}
      aria-label={`Sort by ${label.toLowerCase()}`}
      style={{
        display: "flex", alignItems: "center", gap: 5, justifyContent: "center",
        height: 34, minWidth, padding: "0 14px", borderRadius: 10, border: "none",
        color: sort ? "#fff" : HOME_MUTED,
        backgroundColor: sort ? color : "rgba(255,255,255,0.06)",
        fontSize: 13, fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {icon ?? label}
      {!hideArrow && (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {sort === "asc" ? (
            <path d="M12 19V5M5 12l7-7 7 7" />
          ) : sort === "desc" ? (
            <path d="M12 5v14M5 12l7 7 7-7" />
          ) : (
            <>
              <path d="M12 19V5M5 12l7-7 7 7" opacity="0.4" />
              <path d="M12 5v14M5 12l7 7 7-7" opacity="0.4" />
            </>
          )}
        </svg>
      )}
    </button>
  );
}
