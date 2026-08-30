import Skel from "../../shared/Skel";
import { HOME_SURFACE, HOME_DIVIDER } from "../../shared/categoryVisuals";

// Mirrors a real installment card: avatar + name/term + a status badge,
// then the 3x2 mini-stat grid below - specific enough (and different
// enough from the generic list-row shape) to warrant its own component
// rather than forcing it into ListRowSkeleton (#142).
export default function MobileInstallmentCardSkeleton({ opacity = 1 }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px 14px",
      backgroundColor: HOME_SURFACE, borderRadius: 18, opacity,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Skel h={44} w={44} style={{ borderRadius: "50%" }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
          <Skel h={17} w="50%" />
          <Skel h={13} w="35%" />
        </div>
        <Skel h={22} w={70} style={{ borderRadius: 999 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, paddingTop: 10, borderTop: `1px solid ${HOME_DIVIDER}` }}>
        {[...Array(6)].map((_, j) => (
          <div key={j} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <Skel h={10.5} w="60%" />
            <Skel h={13.5} w="80%" />
          </div>
        ))}
      </div>
    </div>
  );
}
