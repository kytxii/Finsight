import { useState } from "react";

// Shared loading-skeleton cell (#24) - was duplicated identically across
// MobileActivity/MobileCategory/MobileHome/MobilePaychecks/MobileRecurring/
// MobileTips. Every cell used to use the same `skel-shimmer` keyframe firing
// in perfect sync with no per-cell offset, so a whole loading screen pulsed
// as one block instead of feeling alive.
//
// Staggered pulse won out over several other candidates compared side by
// side (shimmer/sweep/reveal, then a round of pulse variants - see git
// history if any are worth revisiting). A per-instance random negative
// animation-delay (stable for the component's lifetime via useState's lazy
// initializer, not re-rolled on every re-render) keeps cells from firing in
// lockstep. `skel-pulse` keyframe is injected once by MobileDashboard.
export default function Skel({ w = "100%", h = 16, style: extra = {} }) {
  const [rand] = useState(() => Math.random());

  return (
    <div style={{
      width: w, height: h, borderRadius: 6, flexShrink: 0,
      backgroundColor: "rgba(255,255,255,0.08)",
      animation: "skel-pulse 1.3s ease-in-out infinite",
      animationDelay: `${(rand * -1.3).toFixed(2)}s`,
      ...extra,
    }} />
  );
}
