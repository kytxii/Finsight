// A two-option segmented pill - "Cash" / "Deposit" - used both as a plain
// choice (the Add Transaction flow, Cash default) and, in edit contexts, to
// show which one a row currently is; picking the other side there fires the
// convert action rather than just setting local state.
export default function Toggle({ checked, onChange, disabled = false, activeColor = "#14b8a6", onLabel = "Deposit", offLabel = "Cash" }) {
  const optionStyle = (active) => ({
    flex: 1,
    padding: "5px 12px",
    borderRadius: 999,
    border: "none",
    fontSize: 12.5,
    fontWeight: 700,
    cursor: disabled || active ? "default" : "pointer",
    color: active ? "#fff" : "rgba(255,255,255,0.55)",
    backgroundColor: active ? activeColor : "transparent",
    transition: "background-color 160ms ease, color 160ms ease",
  });

  return (
    <div
      role="radiogroup"
      style={{
        display: "flex", padding: 2, borderRadius: 999, gap: 2,
        backgroundColor: "rgba(255,255,255,0.08)",
        opacity: disabled ? 0.5 : 1,
        width: "fit-content",
      }}
    >
      <button
        type="button"
        role="radio"
        aria-checked={!checked}
        disabled={disabled}
        onClick={() => !disabled && checked && onChange(false)}
        style={optionStyle(!checked)}
      >
        {offLabel}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && !checked && onChange(true)}
        style={optionStyle(checked)}
      >
        {onLabel}
      </button>
    </div>
  );
}
