import { useEffect, useState } from "react";
import { SLIDE_DURATION, SLIDE_EASE } from "./MobilePageSlide";

// Full-screen pushed view for the mobile shell - recurring payments, paychecks.
// Slides in from the right and back out, matching the page transition.
//
// Children mount on open rather than staying mounted for the life of the app, so
// the panels keep fetching only when actually opened. Closing keeps them around
// for one animation so the exit is visible, then drops them.
//
// Uses a CSS animation rather than a transition: an animation plays from its own
// `from` state on mount, where a transition would need the element committed at
// the start position for a frame first. (#46)

export default function MobileScreen({ open, style, children }) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [closing, setClosing] = useState(false);

  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) setClosing(true);
  }

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => setClosing(false), SLIDE_DURATION);
    return () => clearTimeout(timer);
  }, [closing]);

  if (!open && !closing) return null;

  return (
    <div
      className="mscreen fixed inset-0 z-50 flex flex-col"
      style={{
        ...style,
        animation: `${open ? "mscreen-in" : "mscreen-out"} ${SLIDE_DURATION}ms ${SLIDE_EASE} forwards`,
      }}
    >
      <style>{`
        @keyframes mscreen-in  { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes mscreen-out { from { transform: translateX(0); } to { transform: translateX(100%); } }
        @media (prefers-reduced-motion: reduce) {
          .mscreen { animation-duration: 1ms !important; }
        }
      `}</style>
      {children}
    </div>
  );
}
