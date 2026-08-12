import { useEffect, useState } from "react";
import { HOME_DIVIDER, HOME_MUTED, HOME_TEXT, GAUGE_DARK_GREEN, GAUGE_GREEN, GAUGE_YELLOW, GAUGE_ORANGE, GAUGE_RED } from "./categoryVisuals";

// Speedometer-style semicircle: a static 5-color track (dark green/green/
// yellow/orange/red) with an animated needle sweeping to the installment's
// ratio - the "nice little animated icon that moves" from the issue, not a
// static bar.
//
// The track is 5 visually equal 36° segments - it's not trying to be a
// proportional map of the real thresholds (those are 10/5/5/5/uncapped wide,
// which would make orange/yellow/orange near-invisible slivers next to red).
// The needle still has to land in the segment matching its actual status
// though, so its position is computed relative to *that segment's* real
// ratio range (TIER_BOUNDS below), not the raw ratio against a fixed max -
// e.g. a 12% ratio (mid-way through the 10-15% green range) lands at the
// midpoint of the green segment, wherever that segment happens to be drawn.
const TIER_ORDER = ["dark_green", "green", "yellow", "orange", "red"];
const BAND_COLOR = { dark_green: GAUGE_DARK_GREEN, green: GAUGE_GREEN, yellow: GAUGE_YELLOW, orange: GAUGE_ORANGE, red: GAUGE_RED };
const BANDS = TIER_ORDER.map((status, i) => ({ color: BAND_COLOR[status], from: i / 5, to: (i + 1) / 5 }));

// Real ratio boundaries per tier, mirroring installment_service.py's
// compute_gauge_status exactly - used only to place the needle within its
// segment, not to size the segments themselves. red's upper bound is a visual
// cap (same role GAUGE_MAX_RATIO played before): ratios past it still pin to
// the end of the red segment rather than sweeping indefinitely.
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

// fraction in [0,1] of the way from the left end (angle 180) to the right end
// (angle 0), sweeping clockwise across the top of the semicircle.
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
  // null ratio (no headroom to divide by) still has a status ("red") - pin
  // the needle to the far end rather than leaving it undefined. An
  // unrecognized status (shouldn't happen, but the prop isn't validated)
  // falls back to the last tier rather than crashing on a missing lookup.
  const tierIndex = Math.max(0, TIER_ORDER.indexOf(status));
  const tierBound = TIER_BOUNDS[TIER_ORDER[tierIndex]];
  const withinTier = ratio == null
    ? 1
    : Math.max(0, Math.min(1, (Number(ratio) - tierBound.from) / (tierBound.to - tierBound.from)));
  const targetFraction = (tierIndex + withinTier) / 5;

  const [displayFraction, setDisplayFraction] = useState(0);
  useEffect(() => {
    // Two rAFs so the browser commits the 0% resting frame before the
    // transition target changes - otherwise the sweep-in doesn't animate.
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setDisplayFraction(targetFraction)));
    return () => cancelAnimationFrame(id);
  }, [targetFraction]);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 14;
  // Fixed base needle pointing left (fraction 0's rest position, angle 180); the
  // sweep to its target is done entirely via a CSS transform rotation below, so
  // the transition animates smoothly instead of snapping between SVG coordinates.
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
        {/* Needle, animated via CSS transform rotation (not re-plotted coordinates,
            which wouldn't transition) - sweeps clockwise from left (fraction 0)
            to right (fraction 1) as the target ratio comes in. */}
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
