import Skel from "../../shared/Skel";

// A stack/grid of N flat rounded blocks, each a little more faded than the
// last - the placeholder for a plain card list (Installments' cards,
// Recurring's card grid) where the real content has no internal structure
// worth mimicking beyond "a card is about to appear here" (#142).
export default function FadingBlockSkeleton({ count = 3, height, borderRadius = 16, opacityStep = 0.15, style: extra = {} }) {
  return (
    <>
      {[...Array(count)].map((_, i) => (
        <Skel key={i} h={height} style={{ borderRadius, opacity: 1 - i * opacityStep, ...extra }} />
      ))}
    </>
  );
}
