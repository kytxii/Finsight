import Skel from "../../shared/Skel";

// Label line + value line (+ optional caption line) - the inner content of
// a stat card, repeated across every panel's stat-grid loading state
// (Installments, Paychecks, the desktop overview). Each caller keeps its
// own outer grid/card/divider wrapper; this is just the content shape (#142).
export default function StatCardSkeleton({ caption = false, labelHeight = 11, valueHeight = 22, captionHeight = 12 }) {
  return (
    <>
      <Skel w="60%" h={labelHeight} />
      <Skel w="50%" h={valueHeight} style={{ marginTop: 8 }} />
      {caption && <Skel w="62%" h={captionHeight} style={{ marginTop: 7 }} />}
    </>
  );
}
