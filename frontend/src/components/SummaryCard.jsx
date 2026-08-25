import { useState } from "react";
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

// Chevron footprint, and how far the change badge slides left to clear it.
const CHEVRON_SIZE = 14;
const CHEVRON_CLEARANCE = CHEVRON_SIZE + 4;

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
  const [hovered, setHovered] = useState(false);
  const tint = activeColor ?? valueColor ?? text;
  const showChevron = expandable || active;

  return (
    <div
      onClick={onClick}
      onMouseEnter={onClick ? () => setHovered(true) : undefined}
      onMouseLeave={onClick ? () => setHovered(false) : undefined}
      className={`rounded-2xl ${hero ? "px-6 py-6" : "px-5 py-5"} ${onClick ? "cursor-pointer" : ""}`}
      style={{
        // Hover and open state are both carried by the surface tint alone - no
        // transform, no ring. These are the two largest elements on the page,
        // so a scale moved a lot of pixels for a hint that only needed to say
        // "clickable", and a 2px outline around something this big read as a
        // hard edge rather than a highlight. Open is simply a stronger tint
        // than hover, the same way OverviewColumn distinguishes the two.
        backgroundColor: onClick && (hovered || active)
          ? `color-mix(in srgb, ${tint} ${active ? 12 : 6}%, ${bg})`
          : bg,
        color: text,
        transition: "background-color 150ms ease",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={hero ? "text-lg font-medium" : "text-base font-medium"} style={{ color: muted, margin: 0 }}>{label}</p>
        {/* The chevron is absolutely positioned and the badge slides out of its
            way, rather than the chevron mounting into the flex row and shoving
            the badge sideways in a single frame. CHEVRON_CLEARANCE is the icon
            plus a little breathing room, so the badge ends up clear of it
            instead of tucked underneath. */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", flexShrink: 0 }}>
          {changePct != null && (
            <span style={{
              display: "inline-flex",
              transform: showChevron ? `translateX(-${CHEVRON_CLEARANCE}px)` : "translateX(0)",
              transition: "transform 220ms cubic-bezier(0.32, 0.72, 0, 1)",
            }}>
              <ChangeBadge pct={changePct} goodWhenUp={changeGoodWhenUp} />
            </span>
          )}
          {(expandable || onClick) && (
            <svg
              xmlns="http://www.w3.org/2000/svg" width={CHEVRON_SIZE} height={CHEVRON_SIZE} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{
                position: "absolute", right: 0, top: "50%",
                color: muted, flexShrink: 0, pointerEvents: "none",
                opacity: showChevron ? 1 : 0,
                transform: `translateY(-50%) rotate(${(expanded || active) ? 180 : 0}deg)`,
                transition: "transform 220ms cubic-bezier(0.32, 0.72, 0, 1), opacity 180ms ease",
              }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          )}
        </div>
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
