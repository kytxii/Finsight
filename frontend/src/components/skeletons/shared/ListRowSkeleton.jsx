import Skel from "../../shared/Skel";
import { HOME_DIVIDER } from "../../shared/categoryVisuals";

// The "avatar circle + two text lines, optionally a trailing amount chip"
// row shape repeated (with minor variations) across every transaction-style
// list on mobile - Activity, Category, Tips, Recurring. One component here
// instead of four near-identical copies (#142).
export default function ListRowSkeleton({ count = 3, trailing = false, opacityFade = false, avatarSize = 40 }) {
  return (
    <>
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex", alignItems: "center", gap: 14, padding: "11px 14px", minHeight: 60,
            borderTop: i === 0 ? "none" : `1px solid ${HOME_DIVIDER}`,
            opacity: opacityFade ? 1 - i * 0.12 : 1,
          }}
        >
          <Skel h={avatarSize} w={avatarSize} style={{ borderRadius: "50%" }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <Skel h={16.5} w="50%" />
            <Skel h={13} w="30%" />
          </div>
          {trailing && <Skel h={16} w={60} />}
        </div>
      ))}
    </>
  );
}
