import { HOME_SURFACE, HOME_TEXT } from "./categoryVisuals";

export default function ChartCard({ title, children, activeColor }) {
  const bg = HOME_SURFACE;
  const text = HOME_TEXT;

  return (
    <div className="rounded-2xl p-6" style={{ backgroundColor: bg, color: text }}>
      <h3 className="text-xl font-semibold mb-5 flex items-center gap-2">
        {activeColor && (
          <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: activeColor, flexShrink: 0 }} />
        )}
        {title}
      </h3>
      {children}
    </div>
  );
}
