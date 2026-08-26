import { useMemo, useState } from "react";
import { CATEGORY_CONFIG, INCOME_TYPES, fmt } from "../../utils/finance";
import { HOME_SURFACE, HOME_DIVIDER, HOME_TEXT, HOME_MUTED, CATEGORY_ACCENT, PANEL_ROW_PAD_Y } from "../shared/categoryVisuals";

const HISTORY_MONTHS = 6;

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ShareRing({ pct, value, color }) {
  const size = 168, thickness = 24;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const pad = 6;
  const box = size + pad * 2;
  const cx = box / 2, cy = box / 2;
  const frac = pct == null || !isFinite(pct) ? 0 : Math.max(0, Math.min(1, pct));

  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} style={{ flexShrink: 0, overflow: "visible" }}>
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thickness} />
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeDasharray={`${frac * circumference} ${circumference}`}
          strokeLinecap="butt"
        />
      </g>
      <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", fill: HOME_MUTED }}>
        This period
      </text>
      <text x={cx} y={cy + 15} textAnchor="middle" style={{ fontSize: 16, fontWeight: 800, fill: HOME_TEXT, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </text>
    </svg>
  );
}

export default function CategoryDetailPanel({ category, transactions, dateRange }) {
  const [hoveredKey, setHoveredKey] = useState(null);
  const bg = HOME_SURFACE;
  const border = HOME_DIVIDER;
  const text = HOME_TEXT;
  const muted = HOME_MUTED;
  const color = CATEGORY_ACCENT[category] ?? muted;
  const label = CATEGORY_CONFIG[category]?.label ?? category;
  const isIncome = INCOME_TYPES.has(category);

  const { months, periodTotal, share } = useMemo(() => {
    const anchor = dateRange.from
      ? new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), 1)
      : (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); })();

    const keys = Array.from({ length: HISTORY_MONTHS }, (_, i) => {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - (HISTORY_MONTHS - 1 - i), 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: MONTH_ABBR[d.getMonth()],
        year: d.getFullYear(),
        total: 0,
      };
    });
    const byKey = Object.fromEntries(keys.map((m) => [m.key, m]));

    for (const t of transactions) {
      if (t.category !== category) continue;
      const bucket = byKey[t.transaction_date.slice(0, 7)];
      if (bucket) bucket.total += parseFloat(t.amount);
    }

    const inRange = (t) => {
      if (!dateRange.from && !dateRange.to) return true;
      const d = new Date(t.transaction_date + "T00:00:00");
      if (dateRange.from && d < dateRange.from) return false;
      if (dateRange.to && d > dateRange.to) return false;
      return true;
    };
    let sideTotal = 0, catTotal = 0;
    for (const t of transactions) {
      if (!inRange(t)) continue;
      if (INCOME_TYPES.has(t.category) !== isIncome) continue;
      const amt = parseFloat(t.amount);
      sideTotal += amt;
      if (t.category === category) catTotal += amt;
    }

    return {
      months: keys,
      periodTotal: catTotal,
      share: sideTotal > 0 ? catTotal / sideTotal : null,
    };
  }, [transactions, dateRange, category, isIncome]);

  const maxMonth = Math.max(...months.map((m) => m.total), 0);
  const hasHistory = maxMonth > 0;

  return (
    <div className="rounded-2xl" style={{ backgroundColor: bg, color: text }}>
      <div className="px-6 py-4 border-b flex items-center gap-3" style={{ borderColor: border }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: color, flexShrink: 0 }} />
        <h3 className="text-xl font-semibold">{label}</h3>
      </div>

      <div className="flex items-center justify-center" style={{ padding: "16px", borderBottom: `1px solid ${border}` }}>
        <ShareRing pct={share} value={fmt(periodTotal)} color={color} />
      </div>

      {!hasHistory ? (
        <p className="px-6 py-14 text-center text-base" style={{ color: muted }}>
          No {label.toLowerCase()} in the last {HISTORY_MONTHS} months
        </p>
      ) : (
        months.map((m, i) => {
          const isCurrent = i === months.length - 1;
          const hovered = hoveredKey === m.key;
          return (
            <div
              key={m.key}
              className="flex items-center gap-4 px-6 transition-colors"
              style={{
                paddingTop: PANEL_ROW_PAD_Y, paddingBottom: PANEL_ROW_PAD_Y,
                borderTop: i === 0 ? "none" : `1px solid ${border}`,
                backgroundColor: hovered ? "rgba(255,255,255,0.04)" : "transparent",
              }}
              onMouseEnter={() => setHoveredKey(m.key)}
              onMouseLeave={() => setHoveredKey(null)}
            >
              <span
                className="text-lg font-medium"
                style={{ width: 42, flexShrink: 0, color: isCurrent ? text : muted, fontWeight: isCurrent ? 700 : 500 }}
                title={`${m.label} ${m.year}`}
              >
                {m.label}
              </span>
              <div style={{ flex: 1, minWidth: 0, height: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div style={{
                  width: `${maxMonth > 0 ? (m.total / maxMonth) * 100 : 0}%`,
                  height: "100%", borderRadius: 999, backgroundColor: color,
                  opacity: isCurrent ? 1 : 0.45,
                  transition: "width 220ms ease, opacity 150ms ease",
                }} />
              </div>
              <span
                className="text-lg font-bold"
                style={{ minWidth: 84, textAlign: "right", fontVariantNumeric: "tabular-nums", color: m.total > 0 ? text : muted }}
              >
                {fmt(m.total)}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
