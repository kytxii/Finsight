import { HOME_SURFACE, HOME_TEXT, HOME_MUTED, HOME_INCOME, HOME_EXPENSE, HOME_DIVIDER } from "./categoryVisuals";

// `hero` is the bigger, top-of-dashboard treatment for the one or two
// headline figures (Income/Expenses on the ALL tab) - same card language,
// just scaled up so it reads as the primary thing on the page instead of
// competing evenly with the smaller stats below it.
//
// `detail` makes the card expandable in place: pass a breakdown node and the
// card toggles between its normal summary (value/delta/caption) and that
// detail content on click, instead of opening a separate modal. Deliberately
// NOT a height-changing expand - all four overview cards need to stay the
// same size as each other whether or not one is expanded, so the summary and
// detail views are stacked in the same fixed-height box and crossfade; a
// detail that's taller than the box (e.g. a long bill list) scrolls inside
// it instead of growing the card.
const DETAIL_HEIGHT = 240;

// Compact "▲12%" / "▼4%" indicator next to the label, comparing this period
// to the one before it - same shape as MobileHome's ChangeBadge. `goodWhenUp`
// decides the color independent of direction: Income rising is green,
// Expenses rising is red, even though both show an up arrow.
function ChangeBadge({ pct, goodWhenUp }) {
  if (pct == null) return null;
  const up = pct >= 0;
  const good = up === goodWhenUp;
  const color = good ? HOME_INCOME : HOME_EXPENSE;
  return (
    <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
      {up ? "▲" : "▼"}{Math.abs(pct).toFixed(0)}%
    </span>
  );
}

export default function SummaryCard({ label, value, activeColor, deltaLabel, deltaUp, valueColor, subLabel, extraLabel, extraColor, hero = false, onClick, expanded = false, detail, preview, changePct, changeGoodWhenUp, active = false }) {
  const bg    = HOME_SURFACE;
  const text  = HOME_TEXT;
  const muted = HOME_MUTED;
  const deltaColor = deltaUp ? HOME_INCOME : HOME_EXPENSE;
  const expandable = detail != null;

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl ${hero ? "px-6 py-6" : "px-5 py-5"} ${onClick ? "cursor-pointer transition-transform duration-150 hover:scale-[1.02] active:scale-[0.99]" : ""}`}
      style={{
        backgroundColor: bg, color: text,
        boxShadow: active ? `0 0 0 2px ${activeColor ?? valueColor ?? text}` : "none",
        transition: "box-shadow 150ms ease",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={hero ? "text-lg font-medium" : "text-base font-medium"} style={{ color: muted, margin: 0 }}>{label}</p>
        {changePct != null && <ChangeBadge pct={changePct} goodWhenUp={changeGoodWhenUp} />}
        {(expandable || active) && (
          <svg
            xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ color: muted, flexShrink: 0, transform: (expanded || active) ? "rotate(180deg)" : "none", transition: "transform 200ms ease" }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </div>

      {expandable ? (
        <div style={{ position: "relative", height: DETAIL_HEIGHT, marginTop: 4 }}>
          <div style={{ position: "absolute", inset: 0, opacity: expanded ? 0 : 1, transition: "opacity 180ms ease", pointerEvents: expanded ? "none" : "auto" }}>
            <p className="text-3xl font-bold tracking-tight" style={{ color: valueColor ?? activeColor ?? text }}>{value}</p>
            {deltaLabel != null && (
              <span
                className="inline-block text-xs font-semibold rounded-full px-2 py-0.5 mt-2"
                style={{ color: deltaColor, backgroundColor: `color-mix(in srgb, ${deltaColor} 16%, transparent)` }}
              >
                {deltaLabel}
              </span>
            )}
            {subLabel != null && (
              <p className="text-xs mt-1.5" style={{ color: muted }}>
                {subLabel}
              </p>
            )}
            {extraLabel != null && (
              <p className="text-xs font-semibold mt-1.5" style={{ color: extraColor ?? muted }}>
                {extraLabel}
              </p>
            )}
            {preview != null && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${HOME_DIVIDER}` }}>
                {preview}
              </div>
            )}
          </div>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", inset: 0, overflowY: "auto", overscrollBehavior: "contain", cursor: "default",
              opacity: expanded ? 1 : 0, transition: "opacity 180ms ease", pointerEvents: expanded ? "auto" : "none",
              borderTop: `1px solid ${HOME_DIVIDER}`, paddingTop: 2,
            }}
          >
            {detail}
          </div>
        </div>
      ) : (
        <>
          <p className={`${hero ? "text-4xl" : "text-3xl"} font-bold tracking-tight`} style={{ color: valueColor ?? activeColor ?? text, marginTop: hero ? 6 : 4 }}>{value}</p>
          {deltaLabel != null && (
            <span
              className={`inline-block text-xs font-semibold rounded-full px-2 py-0.5 ${hero ? "mt-3" : "mt-2"}`}
              style={{ color: deltaColor, backgroundColor: `color-mix(in srgb, ${deltaColor} 16%, transparent)` }}
            >
              {deltaLabel}
            </span>
          )}
          {subLabel != null && (
            <p className="text-xs mt-1.5" style={{ color: muted }}>
              {subLabel}
            </p>
          )}
          {extraLabel != null && (
            <p className="text-xs font-semibold mt-1.5" style={{ color: extraColor ?? muted }}>
              {extraLabel}
            </p>
          )}
        </>
      )}
    </div>
  );
}
