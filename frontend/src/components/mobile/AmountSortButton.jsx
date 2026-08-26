import { HOME_MUTED } from "../shared/categoryVisuals";

export default function AmountSortButton({ sort, onToggle, color = HOME_MUTED, label = "Amount", icon = null, hideArrow = false, minWidth, grow = false }) {
  return (
    <button
      onClick={onToggle}
      aria-label={`Sort by ${label.toLowerCase()}`}
      style={{
        display: "flex", alignItems: "center", gap: 5, justifyContent: "center",
        height: 34, minWidth, ...(grow ? { flexGrow: 1, flexBasis: 0 } : {}), padding: "0 14px", borderRadius: 10, border: "none",
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
