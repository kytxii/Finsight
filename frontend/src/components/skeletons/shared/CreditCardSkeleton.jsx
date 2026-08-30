import Skel from "../../shared/Skel";
import { HOME_DIVIDER } from "../../shared/categoryVisuals";

// Mirrors the shape of a real balance card (CreditCardFace + pills + charge
// preview + progress bar) instead of a single generic block, so the list
// doesn't visibly "jump" in layout once the real cards swap in.
export default function CreditCardSkeleton({ mobile, opacity = 1 }) {
  const border = HOME_DIVIDER;
  return (
    <div
      style={{
        padding: mobile ? "12px 14px" : 18, borderRadius: mobile ? 12 : 14, border: `1px solid ${border}`,
        display: "flex", flexDirection: "column", gap: mobile ? 10 : 14, opacity,
      }}
    >
      <Skel style={{ width: "100%", aspectRatio: "1.586", borderRadius: 18, height: "auto" }} />
      <div style={{ display: "flex", gap: 6 }}>
        <Skel w={64} h={mobile ? 18 : 22} style={{ borderRadius: 999 }} />
        <Skel w={64} h={mobile ? 18 : 22} style={{ borderRadius: 999 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: mobile ? 4 : 6, borderTop: `1px solid ${border}` }}>
        <Skel h={11} w="65%" style={{ marginTop: mobile ? 6 : 8 }} />
        <Skel h={11} w="45%" />
      </div>
      <Skel h={mobile ? 4 : 5} style={{ borderRadius: 999 }} />
    </div>
  );
}
