import { useEffect, useState } from "react";
import { HOME_DIVIDER, HOME_MUTED, HOME_TEXT, GAUGE_DARK_GREEN, GAUGE_GREEN, GAUGE_YELLOW, GAUGE_ORANGE, GAUGE_RED } from "./categoryVisuals";

const TIER_ORDER = ["dark_green", "green", "yellow", "orange", "red"];
const BAND_COLOR = { dark_green: GAUGE_DARK_GREEN, green: GAUGE_GREEN, yellow: GAUGE_YELLOW, orange: GAUGE_ORANGE, red: GAUGE_RED };
const BANDS = TIER_ORDER.map((status, i) => ({ color: BAND_COLOR[status], from: i / 5, to: (i + 1) / 5 }));

const TIER_BOUNDS = {
  dark_green: { from: 0, to: 0.10 },
  green: { from: 0.10, to: 0.15 },
  yellow: { from: 0.15, to: 0.20 },
  orange: { from: 0.20, to: 0.25 },
  red: { from: 0.25, to: 0.40 },
};

function polarPoint(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

// A fraction from 0 (left end) to 1 (right end), sweeping across the semicircle.
function angleForFraction(fraction) {
  return 180 - fraction * 180;
}

function arcPath(cx, cy, r, fromFraction, toFraction) {
  const start = polarPoint(cx, cy, r, angleForFraction(fromFraction));
  const end = polarPoint(cx, cy, r, angleForFraction(toFraction));
  const largeArc = toFraction - fromFraction > 0.5 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export default function InstallmentGauge({ ratio, status, size = 160 }) {
  const tierIndex = Math.max(0, TIER_ORDER.indexOf(status));
  const tierBound = TIER_BOUNDS[TIER_ORDER[tierIndex]];
  const withinTier = ratio == null
    ? 1
    : Math.max(0, Math.min(1, (Number(ratio) - tierBound.from) / (tierBound.to - tierBound.from)));
  const targetFraction = (tierIndex + withinTier) / 5;

  const [displayFraction, setDisplayFraction] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setDisplayFraction(targetFraction)));
    return () => cancelAnimationFrame(id);
  }, [targetFraction]);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 14;
  const needleRestTip = polarPoint(cx, cy, r - 6, 180);
  const needleRotationDeg = displayFraction * 180;

  const statusColor = BAND_COLOR[status] ?? HOME_MUTED;

  return (
    <div style={{ width: size, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`}>
        <style>{`
          .installment-gauge-needle { transition: transform 700ms cubic-bezier(0.32, 0.72, 0, 1); }
          @media (prefers-reduced-motion: reduce) {
            .installment-gauge-needle { transition-duration: 1ms; }
          }
        `}</style>
        {/* Dim base track */}
        <path d={arcPath(cx, cy, r, 0, 1)} stroke={HOME_DIVIDER} strokeWidth={10} fill="none" strokeLinecap="round" />
        {/* Colored bands */}
        {BANDS.map((band) => (
          <path
            key={band.color}
            d={arcPath(cx, cy, r, band.from, band.to)}
            stroke={band.color}
            strokeWidth={10}
            fill="none"
            strokeOpacity={0.9}
          />
        ))}
        <g
          className="installment-gauge-needle"
          style={{ transform: `rotate(${needleRotationDeg}deg)`, transformOrigin: `${cx}px ${cy}px` }}
        >
          <line x1={cx} y1={cy} x2={needleRestTip.x} y2={needleRestTip.y} stroke={HOME_TEXT} strokeWidth={2.5} strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r={5} fill={statusColor} />
      </svg>
    </div>
  );
}
