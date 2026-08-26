import { useState } from "react";

export default function Skel({ w = "100%", h = 16, style: extra = {} }) {
  const [rand] = useState(() => Math.random());

  return (
    <div style={{
      width: w, height: h, borderRadius: 6, flexShrink: 0,
      backgroundColor: "rgba(255,255,255,0.08)",
      animation: "skel-pulse 1.3s ease-in-out infinite",
      animationDelay: `${(rand * -1.3).toFixed(2)}s`,
      ...extra,
    }} />
  );
}
