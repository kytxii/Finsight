import { useEffect, useState } from "react";
import { SLIDE_DURATION, SLIDE_EASE } from "./MobilePageSlide";


export default function MobileScreen({ open, style, children }) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [closing, setClosing] = useState(false);
  // Once the entrance animation settles, drop the transform entirely rather
  // than relying on animation-fill-mode: forwards to hold it at
  // translateX(0) - any transform value on this wrapper (even a no-op one)
  // makes it the containing block for position:fixed descendants, breaking
  // things like the credit card "+" sheet out of true viewport-fixed
  // positioning for as long as this screen stays open.
  const [entered, setEntered] = useState(open);

  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) setClosing(true);
    else setEntered(false);
  }

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => setClosing(false), SLIDE_DURATION);
    return () => clearTimeout(timer);
  }, [closing]);

  useEffect(() => {
    if (!open || entered) return;
    const timer = setTimeout(() => setEntered(true), SLIDE_DURATION);
    return () => clearTimeout(timer);
  }, [open, entered]);

  if (!open && !closing) return null;

  const animating = closing || !entered;

  return (
    <div
      className="mscreen fixed inset-0 z-[55] flex flex-col"
      style={{
        ...style,
        transform: animating ? undefined : "none",
        animation: animating ? `${open ? "mscreen-in" : "mscreen-out"} ${SLIDE_DURATION}ms ${SLIDE_EASE} forwards` : undefined,
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
