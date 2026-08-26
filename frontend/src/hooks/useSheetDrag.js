import { useRef, useState } from "react";

export const SHEET_DISMISS_PX = 80;
export const SHEET_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

export function useSheetDrag(onDismiss) {
  const startY = useRef(0);
  const offsetRef = useRef(0);
  const [dragY, setDragY] = useState(0);

  function onTouchStart(e) {
    startY.current = e.touches[0].clientY;
    offsetRef.current = 0;
    setDragY(0);
  }

  function onTouchMove(e) {
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      offsetRef.current = delta;
      setDragY(delta);
    }
  }

  function onTouchEnd() {
    if (offsetRef.current > SHEET_DISMISS_PX) onDismiss();
    offsetRef.current = 0;
    setDragY(0);
  }

  return {
    dragY,
    dragging: dragY > 0,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
