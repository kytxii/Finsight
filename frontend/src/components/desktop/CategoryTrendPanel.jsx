import { useMemo, useState } from "react";
import { CATEGORY_CONFIG, fmt } from "../../utils/finance";
import { HOME_SURFACE, HOME_DIVIDER, HOME_TEXT, HOME_MUTED, CATEGORY_ACCENT, PANEL_ROW_PAD_Y } from "../shared/categoryVisuals";

const SPARK_MONTHS = 6;

function monthKeyOf(dateStr) {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

// A small sparkline, styled like the full trend chart but scaled to one row.
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

function Donut({ rows, total, hoveredCat, onHoverCat }) {
  const size = 168, thickness = 24;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = 2.5; // px gap between adjacent segments
  const pad = 6;
  const box = size + pad * 2;
  const cx = box / 2, cy = box / 2;

  const MIN_SEGMENT_ARC = 16;
  const usableArc = Math.max(circumference - gap * rows.length, 0);
  const arcs = rows.map((r) => (total > 0 ? (r.total / total) * usableArc : 0));

  for (let pass = 0; pass < 4; pass++) {
    const short = [];
    const donors = [];
    arcs.forEach((a, i) => (a < MIN_SEGMENT_ARC ? short : donors).push(i));
    if (short.length === 0 || donors.length === 0) break;
    const needed = short.reduce((s, i) => s + (MIN_SEGMENT_ARC - arcs[i]), 0);
    const donorArc = donors.reduce((s, i) => s + arcs[i], 0);
    if (donorArc - needed < donors.length * MIN_SEGMENT_ARC) break;
    short.forEach((i) => { arcs[i] = MIN_SEGMENT_ARC; });
    donors.forEach((i) => { arcs[i] -= needed * (arcs[i] / donorArc); });
  }

  const segments = rows.reduce((acc, r, i) => {
    const cumulative = acc.length > 0 ? acc[acc.length - 1].cumulative : 0;
    const frac = total > 0 ? r.total / total : 0;
    const dash = Math.max(arcs[i], 0);
    const offset = -cumulative;
    acc.push({ ...r, dash, offset, frac, cumulative: cumulative + arcs[i] + gap });
    return acc;
  }, []);

  const hovered = segments.find((s) => s.category === hoveredCat);
  const centerLabel = hovered ? (CATEGORY_CONFIG[hovered.category]?.label ?? hovered.category) : "Total";
  const centerValue = hovered ? fmt(hovered.total) : fmt(total);

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
      {/* Sized against the hole, not the ring - a realistic total needs the clearance. */}
      <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", fill: HOME_MUTED }}>
        {centerLabel}
      </text>
      <text x={cx} y={cy + 15} textAnchor="middle" style={{ fontSize: 16, fontWeight: 800, fill: HOME_TEXT, fontVariantNumeric: "tabular-nums" }}>
        {centerValue}
      </text>
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
          <div className="flex items-center justify-center" style={{ padding: "16px", borderBottom: `1px solid ${border}` }}>
            <Donut rows={rows} total={rows.reduce((s, r) => s + r.total, 0)} hoveredCat={hoveredCat} onHoverCat={setHoveredCat} />
          </div>
          {rows.map((r, i) => {
            const color = CATEGORY_ACCENT[r.category] ?? muted;
            const label = CATEGORY_CONFIG[r.category]?.label ?? r.category;
            return (
              <div
                key={r.category}
                className="flex items-center gap-4 px-6 transition-colors"
                style={{
                  paddingTop: PANEL_ROW_PAD_Y, paddingBottom: PANEL_ROW_PAD_Y,
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
