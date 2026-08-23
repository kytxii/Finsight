import { HOME_MUTED } from "./categoryVisuals";

// Small pill for a transaction's lightweight context note (#105) - separate
// from the name and the category pill. Muted/neutral rather than
// category-colored since a note isn't a spending classification, just a
// who/what/why annotation (e.g. "Refund", a Zelle sender's name).
export default function NotePill({ note, style }) {
  if (!note) return null;
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 999,
      fontSize: 11, fontWeight: 600, color: HOME_MUTED,
      backgroundColor: "rgba(255,255,255,0.06)", whiteSpace: "nowrap",
      ...style,
    }}>
      {note}
    </span>
  );
}
