import { HOME_TEXT } from "./categoryVisuals";

export function LogoMark({ size = 28 }) {
  return <img src="/logo.png" alt="" width={size} height={size} style={{ display: "block" }} />;
}

export function Wordmark({ size = 28, textSize = 24 }) {
  return (
    <span className="flex items-center gap-2.5 shrink-0">
      <LogoMark size={size} />
      <span
        className="font-bold"
        style={{ fontSize: textSize, letterSpacing: "-0.5px", color: HOME_TEXT }}
      >
        Finsight
      </span>
    </span>
  );
}
