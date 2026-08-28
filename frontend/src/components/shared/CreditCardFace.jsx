import CurrencyInput from "./CurrencyInput";
import { fmt } from "../../utils/finance";
import { CARD_GRADIENTS } from "../../utils/cardColors";

function shortDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function IconChip() {
  return (
    <svg width="50" height="38" viewBox="0 0 36 27" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="35" height="26" rx="5" fill="url(#cc-chip-grad)" stroke="rgba(255,255,255,0.25)" />
      <line x1="0.5" y1="9" x2="35.5" y2="9" stroke="rgba(0,0,0,0.28)" />
      <line x1="0.5" y1="18" x2="35.5" y2="18" stroke="rgba(0,0,0,0.28)" />
      <line x1="12" y1="0.5" x2="12" y2="26.5" stroke="rgba(0,0,0,0.28)" />
      <line x1="24" y1="0.5" x2="24" y2="26.5" stroke="rgba(0,0,0,0.28)" />
      <defs>
        <linearGradient id="cc-chip-grad" x1="0" y1="0" x2="36" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f1e2b0" />
          <stop offset="1" stopColor="#c2a668" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function IconWave() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round">
      <path d="M8.5 8a6 6 0 0 1 0 8" />
      <path d="M11.5 5a10 10 0 0 1 0 14" />
      <path d="M14.5 2a14 14 0 0 1 0 20" />
    </svg>
  );
}

// A physical-card-styled face. Interactive by default (used by the "New
// Credit Card Balance" panel - amount and due date are typed directly onto
// the card). Pass readOnly to render the same look as a plain display, for
// showing an existing balance (the Credit Cards list) instead of a form.
export default function CreditCardFace({
  amount, onAmountChange, dueDate, onDueDateChange, autoFocus, readOnly = false, maxWidth = 360, hovered = false, colorIndex = 0,
}) {
  return (
    <div
      style={{
        position: "relative", width: "100%", maxWidth, aspectRatio: "1.586", margin: maxWidth ? "0 auto" : 0,
        borderRadius: 18, padding: "20px 22px", boxSizing: "border-box", overflow: "hidden",
        background: CARD_GRADIENTS[colorIndex % CARD_GRADIENTS.length],
        boxShadow: hovered
          ? "0 26px 46px -16px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.1)"
          : "0 20px 40px -18px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.07)",
        transform: hovered ? "perspective(600px) rotateX(1.5deg) rotateY(-1.5deg)" : "perspective(600px) rotateX(0) rotateY(0)",
        transition: "transform 250ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 250ms ease",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
      }}
    >
      <div
        style={{
          position: "absolute", inset: 0,
          background: hovered
            ? "linear-gradient(120deg, rgba(255,255,255,0.10), transparent 50%)"
            : "linear-gradient(120deg, rgba(255,255,255,0.07), transparent 45%)",
          transition: "background 200ms ease",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "absolute", top: "50%", left: 44, transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 12 }}>
        <IconChip />
        <IconWave />
      </div>

      <div style={{ position: "absolute", top: "50%", right: 22, textAlign: "right", transform: "translateY(-50%)" }}>
        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Balance</p>
        {readOnly ? (
          <p style={{ margin: "2px 0 0", fontSize: 32, fontWeight: 700, color: "#fff", letterSpacing: "0.02em", fontVariantNumeric: "tabular-nums" }}>{fmt(amount)}</p>
        ) : (
          <CurrencyInput
            autoFocus={autoFocus}
            value={amount}
            onChange={onAmountChange}
            placeholder="0.00"
            style={{
              width: "100%", background: "transparent", border: "none", outline: "none", padding: 0, marginTop: 2,
              fontSize: 32, fontWeight: 700, color: "#fff", fontFamily: "inherit", letterSpacing: "0.02em", textAlign: "right",
            }}
          />
        )}
      </div>

      {/* The chip/wave row and balance are both absolutely positioned now (to
          center independently of each other), so this is the only normal-flow
          child left - marginTop: auto pins it to the bottom regardless, since
          justify-content: space-between collapses to flex-start with just one
          flex item. */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "auto" }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: "0.13em", color: "rgba(255,255,255,0.55)", fontStyle: "italic" }}>FinSight</p>
        <div>
          <p style={{ margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Due by</p>
          {readOnly ? (
            <p style={{ margin: "3px 0 0", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{dueDate ? shortDate(dueDate) : "—"}</p>
          ) : (
            <input
              type="date" value={dueDate} onChange={(e) => onDueDateChange(e.target.value)}
              style={{
                background: "transparent", border: "none", outline: "none", padding: 0, marginTop: 3,
                fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)", colorScheme: "dark", fontFamily: "inherit",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
