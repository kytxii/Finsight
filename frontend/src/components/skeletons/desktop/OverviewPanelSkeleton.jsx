import StatCardSkeleton from "../shared/StatCardSkeleton";

// The unified overview panel's loading state (#123) - four stat columns
// sharing one card, divided by a border rather than a grid gap. Was
// previously defined inline in Dashboard.jsx (#142).
export default function OverviewPanelSkeleton({ surface, border }) {
  return (
    <div
      className="grid grid-cols-4 rounded-2xl overflow-hidden"
      style={{ backgroundColor: surface }}
    >
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          style={{
            padding: "16px 20px",
            borderLeft: i === 0 ? "none" : `1px solid ${border}`,
          }}
        >
          <StatCardSkeleton caption labelHeight={14} valueHeight={28} />
        </div>
      ))}
    </div>
  );
}
