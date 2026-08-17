// Small trend line for the category summary card (#108, swapped in from the
// share-ring option) - this category's transaction amounts over the selected
// period, oldest to newest, as a plain SVG polyline. No axes/labels - it's a
// shape, not a chart to read values off of.
// Internal coordinate space stays fixed and numeric regardless of rendered
// size - `width`/`height` set the actual on-screen box (can be "100%" to
// fill a flex parent), viewBox math always runs against VB_W/VB_H.
const VB_W = 100;
const VB_H = 30;

export default function CategorySparkline({ values, color, width = VB_W, height = VB_H, strokeWidth = 2 }) {
  if (!values || values.length < 2) {
    // Not enough points for a trend - a flat middle line reads as "nothing to
    // show" without leaving the card empty.
    return (
      <svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" style={{ flexShrink: 0 }}>
        <line x1={0} y1={VB_H / 2} x2={VB_W} y2={VB_H / 2} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" opacity={0.3} />
      </svg>
    );
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pad = strokeWidth;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * VB_W;
    const y = pad + (VB_H - pad * 2) * (1 - (v - min) / range);
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" style={{ flexShrink: 0 }}>
      <polyline
        points={points.join(" ")}
        fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}
