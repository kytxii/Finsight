import { useRef, useState } from "react";

// Drag-to-dismiss for bottom sheets. Returns the live offset plus the touch
// handlers to spread onto whatever element should own the gesture.
//
// Attach the handlers to the grab notch rather than the sheet body when the
// sheet is also its own scroll container, otherwise the drag and the scroll
// fight each other. (#46)

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
    // Downward only - dragging up should not lift the sheet past its resting spot.
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
