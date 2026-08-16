import { useEffect, useRef, useState } from "react";

export default function SwipeableRow({
  id,
  openId,
  setOpenId,
  onEdit,
  onDelete,
  border,
  surface,
  text,
  editBg,
  editColor,
  deleteBg,
  deleteColor,
  roundTop = false,
  roundBottom = false,
  radius = 18,
  children,
}) {
  // Solid per-action background is the default (matches the dark mobile UI's
  // iOS-Mail-style swipe actions). Callers that still pass only
  // border/surface/text (the old theme-toggle-aware desktop-style table)
  // fall back to the original shared gray backdrop with tinted icons.
  const fallbackBg = `color-mix(in srgb, ${surface} 80%, #888)`;
  const resolvedEditBg = editBg ?? fallbackBg;
  const resolvedEditColor = editColor ?? text;
  const resolvedDeleteBg = deleteBg ?? fallbackBg;
  const resolvedDeleteColor = deleteColor ?? "var(--category-expense)";
  // Reveal one lane per action, so a delete-only row (no onEdit) shows a single
  // narrower action instead of an empty half.
  const hasEdit = typeof onEdit === "function";
  const REVEAL_W = hasEdit ? 130 : 65;
  const contentRef = useRef(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startOffsetRef = useRef(0);
  const currentOffsetRef = useRef(0);
  const movedRef = useRef(false);
  const isOpen = openId === id;
  // Only mount the colored action buttons while dragging or open, so they never
  // bleed at the enclosing card's rounded corners when the row is at rest.
  const [dragging, setDragging] = useState(false);
  const showActions = isOpen || dragging;

  const setTransform = (x) => {
    currentOffsetRef.current = x;
    if (contentRef.current)
      contentRef.current.style.transform = `translateX(${x}px)`;
  };

  const animateTo = (x) => {
    if (!contentRef.current) return;
    contentRef.current.style.transition = "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)";
    setTransform(x);
    setTimeout(() => {
      if (contentRef.current) contentRef.current.style.transition = "none";
    }, 280);
  };

  const snapTo = (target) => {
    animateTo(target);
    setOpenId(
      target === -REVEAL_W ? id : (prev) => (prev === id ? null : prev),
    );
  };

  // Close when another row opens
  useEffect(() => {
    if (!isOpen && currentOffsetRef.current !== 0) animateTo(0);
  }, [isOpen]);

  // Non-passive touchmove so we can preventDefault during horizontal drag
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onMove = (e) => {
      const dx = e.touches[0].clientX - startXRef.current;
      const dy = e.touches[0].clientY - startYRef.current;
      if (!movedRef.current) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) return; // vertical scroll — let browser handle it
        movedRef.current = true;
        // Only mount the colored actions once a horizontal drag is confirmed
        // (#104) - flipping this in handleTouchStart instead made it show on
        // every touch, taps and vertical scrolls included, before direction
        // was ever decided.
        setDragging(true);
      }
      e.preventDefault();
      setTransform(
        Math.max(-REVEAL_W, Math.min(0, startOffsetRef.current + dx)),
      );
    };
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  }, [REVEAL_W]);

  const handleTouchStart = (e) => {
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    startOffsetRef.current = currentOffsetRef.current;
    movedRef.current = false;
    if (contentRef.current) contentRef.current.style.transition = "none";
  };

  const handleTouchEnd = () => {
    setDragging(false);
    if (!movedRef.current) return;
    snapTo(currentOffsetRef.current < -REVEAL_W / 2 ? -REVEAL_W : 0);
  };

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        // First/last row in a rounded card gets its own matching corner
        // radius (#104 follow-up) instead of relying solely on the ancestor
        // card's overflow:hidden to round it - nesting two overflow:hidden
        // boxes (this row's own, inside the card's) let a hairline of the
        // actions layer bleed through right at the curve on whichever row
        // touched it, even with the timing/compositing fixes above in place.
        // Clipping locally at the exact row that needs rounding removes the
        // ancestor from the equation entirely for that edge.
        borderRadius: `${roundTop ? radius : 0}px ${roundTop ? radius : 0}px ${roundBottom ? radius : 0}px ${roundBottom ? radius : 0}px`,
        borderTop: `1px solid ${border}`,
        zIndex: isOpen ? 10 : "auto",
      }}
    >
      {showActions && (
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: REVEAL_W,
          display: "flex",
        }}
      >
        {hasEdit && (
        <button
          onClick={() => {
            snapTo(0);
            onEdit();
          }}
          style={{
            flex: 1,
            background: resolvedEditBg,
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: resolvedEditColor,
            transition: "background-color 0.15s ease",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        )}
        <button
          onClick={() => {
            snapTo(0);
            onDelete();
          }}
          style={{
            flex: 1,
            background: resolvedDeleteBg,
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: resolvedDeleteColor,
            transition: "background-color 0.15s ease",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>
      )}
      <div
        ref={contentRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: "translateX(0)",
          position: "relative",
          zIndex: 1,
          // Only promote to a GPU compositing layer while actually
          // interacting (#104 follow-up) - left on permanently, a promoted
          // layer doesn't always perfectly respect an ancestor card's
          // rounded-corner clip (cardStyle's border-radius + overflow:hidden
          // in MobileActivity.jsx) at the curve itself, letting a hairline
          // of the actions layer bleed through specifically on the first/
          // last row where that curve exists - rows in the middle have no
          // curvature to clip against, so they never showed it.
          willChange: showActions ? "transform" : "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}
