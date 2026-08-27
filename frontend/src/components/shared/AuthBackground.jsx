import { useMemo } from "react";
import { HOME_BG, HOME_SURFACE, ACCENT, ACCENT_DEEP } from "./categoryVisuals";

// Shared full-screen backdrop for Login/Register (#135). Three layers: the
// dark base, a grid-aligned field of small dots that slowly pulse in a
// single diagonal wave (each dot's delay is set from its position projected
// onto the wave's angle, so it reads as one straight front sweeping through,
// not independent twinkling), then the two-tier static teal radial glow on
// top. Dots are plain HTML circles (fixed px size, real border-radius)
// rather than SVG - stretching a viewBox to a non-square viewport squishes
// SVG circles into little rectangles at this size.

const WAVE_ANGLE_DEG = 45;
const WAVE_DURATION = 7; // seconds for the wave to cross the whole field

function makeDots() {
  const cols = 32, rows = 22;
  const angle = (WAVE_ANGLE_DEG * Math.PI) / 180;
  const c = Math.cos(angle), s = Math.sin(angle);
  const corners = [[0, 0], [100, 0], [0, 100], [100, 100]];
  const projs = corners.map(([x, y]) => x * c + y * s);
  const min = Math.min(...projs), max = Math.max(...projs);

  const dots = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const left = (i / cols) * 100;
      const top = (j / rows) * 100;
      const proj = left * c + top * s;
      const delay = ((proj - min) / (max - min)) * WAVE_DURATION;
      dots.push({ left, top, delay });
    }
  }
  return dots;
}

export default function AuthBackground() {
  const dots = useMemo(() => makeDots(), []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: HOME_BG,
        overflow: "hidden",
        zIndex: 0,
      }}
    >
      <style>{`
        @keyframes auth-bg-dot-pulse {
          0%, 100% { opacity: 0.12; }
          50%      { opacity: 0.45; }
        }
        @media (prefers-reduced-motion: reduce) {
          .auth-bg-dot { animation: none !important; opacity: 0.22 !important; }
        }
      `}</style>
      <div style={{ position: "absolute", inset: 0 }}>
        {dots.map((d, i) => (
          <span
            key={i}
            className="auth-bg-dot"
            style={{
              position: "absolute",
              left: `${d.left}%`,
              top: `${d.top}%`,
              width: 3,
              height: 3,
              borderRadius: "50%",
              backgroundColor: ACCENT,
              opacity: 0.12,
              animation: `auth-bg-dot-pulse ${WAVE_DURATION}s ease-in-out ${d.delay}s infinite backwards`,
            }}
          />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 50% 50%, ${ACCENT} 0%, ${ACCENT_DEEP} 35%, ${HOME_SURFACE} 60%, transparent 85%)`,
          opacity: 0.18,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 50% 50%, ${ACCENT_DEEP} 0%, ${HOME_SURFACE} 40%, ${HOME_BG} 70%, transparent 90%)`,
          opacity: 0.38,
        }}
      />
    </div>
  );
}
