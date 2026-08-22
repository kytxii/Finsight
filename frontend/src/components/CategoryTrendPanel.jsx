import { useMemo, useState } from "react";
import { CATEGORY_CONFIG, fmt } from "../utils/finance";
import { HOME_SURFACE, HOME_DIVIDER, HOME_TEXT, HOME_MUTED, CATEGORY_ACCENT } from "./categoryVisuals";

// Second column next to the (now half-width) Transactions table (#127) -
// combines the two things asked for into one list instead of two separate
// panels: each category's current-period total (the "breakdown") plus a
// compact sparkline of its last SPARK_MONTHS totals (the "trend"), since a
// bare total and a bare trend line answer the same question - "where's the
// money going, and is it moving" - better together than apart.
const SPARK_MONTHS = 6;

function monthKeyOf(dateStr) {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

// Small inline area+line sparkline - same "give it the same care as type"
// treatment as the trend chart above (faint fill, emphasized endpoint), just
// scaled down to a single row's height instead of a full chart.
function Sparkline({ values, color }) {
  const w = 72, h = 28;
  const max = Math.max(...values, 0.01);
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values.map((v, i) => [i * step, h - (v / max) * (h - 3) - 1.5]);
  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ flexShrink: 0 }}>
      <path d={areaPath} fill={color} opacity="0.14" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.25" fill={color} />
    </svg>
  );
}

// Proportion-of-total donut, sitting above the list in the same card (#130).
// Deliberately leans on the list right below it as its legend/secondary
// encoding rather than adding its own - CATEGORY_ACCENT is the app's one
// categorical palette (every dot/pill everywhere already draws from it), and
// running it through this skill's CVD validator flags the Income/Expenses
// green-red pair as too close for deuteranopia (a real gap, pre-existing
// everywhere else this palette's used) - not something to silently reinvent
// a second palette to paper over just for this one chart. The 2px gaps
// between segments plus the always-visible labeled list directly beneath
// give non-color-dependent identification, matching what the skill calls
// for when a categorical pair can't clear the CVD floor on its own.
function Donut({ rows, total, hoveredCat, onHoverCat }) {
  const size = 168, thickness = 24;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = 2.5; // px gap between adjacent segments
  // The hovered segment's stroke grows by 4px (2px each side) - with no
  // margin beyond the ring's own radius, that growth ran past the SVG's own
  // edge and got clipped flat there instead of rendering as a round curve.
  // `pad` gives it room without changing the ring's own visual size.
  const pad = 6;
  const box = size + pad * 2;
  const cx = box / 2, cy = box / 2;

  const segments = rows.reduce((acc, r) => {
    const cumulative = acc.length > 0 ? acc[acc.length - 1].cumulative : 0;
    const frac = total > 0 ? r.total / total : 0;
    const dash = Math.max(frac * circumference - gap, 0);
    const offset = -cumulative * circumference;
    acc.push({ ...r, dash, offset, frac, cumulative: cumulative + frac });
    return acc;
  }, []);

  const hovered = segments.find((s) => s.category === hoveredCat);
  const centerLabel = hovered ? (CATEGORY_CONFIG[hovered.category]?.label ?? hovered.category) : "Total";
  const centerValue = hovered ? fmt(hovered.total) : fmt(total);
  const centerSub = hovered ? `${Math.round(hovered.frac * 100)}%` : null;

  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} style={{ flexShrink: 0, overflow: "visible" }}>
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thickness} />
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        {segments.map((s) => {
          const color = CATEGORY_ACCENT[s.category] ?? HOME_MUTED;
          const isHovered = s.category === hoveredCat;
          return (
            <circle
              key={s.category}
              cx={cx} cy={cy} r={radius}
              fill="none"
              stroke={color}
              strokeWidth={isHovered ? thickness + 4 : thickness}
              strokeDasharray={`${s.dash} ${circumference}`}
              strokeDashoffset={s.offset}
              strokeLinecap="butt"
              style={{ transition: "stroke-width 150ms ease", cursor: "pointer" }}
              onMouseEnter={() => onHoverCat(s.category)}
              onMouseLeave={() => onHoverCat(null)}
            >
              <title>{`${CATEGORY_CONFIG[s.category]?.label ?? s.category} · ${fmt(s.total)} (${Math.round(s.frac * 100)}%)`}</title>
            </circle>
          );
        })}
      </g>
      <text x={cx} y={cy - (centerSub ? 9 : 3)} textAnchor="middle" style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", fill: HOME_MUTED }}>
        {centerLabel}
      </text>
      <text x={cx} y={cy + 19} textAnchor="middle" style={{ fontSize: 21, fontWeight: 800, fill: HOME_TEXT, fontVariantNumeric: "tabular-nums" }}>
        {centerValue}
      </text>
      {centerSub && (
        <text x={cx} y={cy + 37} textAnchor="middle" style={{ fontSize: 12, fontWeight: 600, fill: HOME_MUTED }}>
          {centerSub}
        </text>
      )}
    </svg>
  );
}

export default function CategoryTrendPanel({ transactions, dateRange }) {
  const [hoveredCat, setHoveredCat] = useState(null);
  const bg = HOME_SURFACE;
  const border = HOME_DIVIDER;
  const text = HOME_TEXT;
  const muted = HOME_MUTED;

  const rows = useMemo(() => {
    if (!dateRange.from) return [];

    // SPARK_MONTHS keys ending at the currently-viewed month, oldest first -
    // matches how the trend chart's own window is anchored to dateRange
    // rather than "today", so switching months via the header updates this too.
    const anchor = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), 1);
    const monthKeys = Array.from({ length: SPARK_MONTHS }, (_, i) => {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - (SPARK_MONTHS - 1 - i), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });

    const byCategory = {};
    for (const t of transactions) {
      const idx = monthKeys.indexOf(monthKeyOf(t.transaction_date));
      if (idx === -1) continue;
      const bucket = (byCategory[t.category] ??= new Array(SPARK_MONTHS).fill(0));
      bucket[idx] += parseFloat(t.amount);
    }

    return Object.entries(byCategory)
      .map(([category, values]) => ({ category, values, total: values[values.length - 1] }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [transactions, dateRange]);

  return (
    <div className="rounded-2xl" style={{ backgroundColor: bg, color: text }}>
      <div className="px-6 py-4 border-b" style={{ borderColor: border }}>
        <h3 className="text-xl font-semibold">Categories</h3>
      </div>

      {rows.length === 0 ? (
        <p className="px-6 py-14 text-center text-base" style={{ color: muted }}>No activity this period</p>
      ) : (
        <div>
          <div className="flex items-center justify-center" style={{ padding: "24px 16px", borderBottom: `1px solid ${border}` }}>
            <Donut rows={rows} total={rows.reduce((s, r) => s + r.total, 0)} hoveredCat={hoveredCat} onHoverCat={setHoveredCat} />
          </div>
          {/* Same px-6 py-4 / text-lg weight as a transaction row (#127
              follow-up) - at the default 10-rows-per-page view this panel's
              natural height (however many categories have activity) lands
              close to the table's without any measured height-syncing; it's
              simply not trying to track the table anymore once you switch to
              20/50 there. */}
          {rows.map((r, i) => {
            const color = CATEGORY_ACCENT[r.category] ?? muted;
            const label = CATEGORY_CONFIG[r.category]?.label ?? r.category;
            return (
              <div
                key={r.category}
                className="flex items-center gap-4 px-6 py-4 transition-colors"
                style={{
                  borderTop: i === 0 ? "none" : `1px solid ${border}`,
                  backgroundColor: hoveredCat === r.category ? "rgba(255,255,255,0.04)" : "transparent",
                }}
                onMouseEnter={() => setHoveredCat(r.category)}
                onMouseLeave={() => setHoveredCat(null)}
              >
                <span style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: color, flexShrink: 0 }} />
                <span className="text-lg font-medium" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {label}
                </span>
                <Sparkline values={r.values} color={color} />
                <span className="text-lg font-bold" style={{ minWidth: 84, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {fmt(r.total)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
