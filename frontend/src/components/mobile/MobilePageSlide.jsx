import { useEffect, useRef, useState } from "react";


export const SLIDE_DURATION = 240;
export const SLIDE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"; // same curve as the sheet slide-up

const DURATION = SLIDE_DURATION;
const EASE = SLIDE_EASE;

export default function MobilePageSlide({ pageKey, order = 0, layerClassName = "", children }) {
  const [state, setState] = useState({ pageKey, order, exiting: null });

  const committed = useRef(children);

  if (state.pageKey !== pageKey) {
    setState({
      pageKey,
      order,
      // eslint-disable-next-line react-hooks/refs
      exiting: { key: state.pageKey, node: committed.current, forward: order >= state.order },
    });
  }

  useEffect(() => {
    committed.current = children;
  });

  const { exiting } = state;

  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(
      () => setState((s) => (s.exiting === exiting ? { ...s, exiting: null } : s)),
      DURATION,
    );
    return () => clearTimeout(timer);
  }, [exiting]);

  const dir = exiting?.forward ? "fwd" : "back";

  return (
    <div style={{ position: "relative", overflowX: "clip" }}>
      <style>{`
        @keyframes mps-in-fwd   { from { transform: translateX(100%); }  to { transform: translateX(0); } }
        @keyframes mps-in-back  { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        @keyframes mps-out-fwd  { from { transform: translateX(0); } to { transform: translateX(-100%); } }
        @keyframes mps-out-back { from { transform: translateX(0); } to { transform: translateX(100%); } }
        @keyframes mps-fade-in  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes mps-fade-out { from { opacity: 1; } to { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .mps-in  { animation-name: mps-fade-in !important;  animation-duration: 120ms !important; }
          .mps-out { animation-name: mps-fade-out !important; animation-duration: 120ms !important; }
        }
      `}</style>

      {exiting && exiting.key !== pageKey && (
        <div
          key={exiting.key}
          aria-hidden
          className={`mps-out ${layerClassName}`}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            animation: `mps-out-${dir} ${DURATION}ms ${EASE} forwards`,
          }}
        >
          {exiting.node}
        </div>
      )}

      <div
        key={pageKey}
        className={exiting ? `mps-in ${layerClassName}` : layerClassName}
        style={exiting ? { animation: `mps-in-${dir} ${DURATION}ms ${EASE}` } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
