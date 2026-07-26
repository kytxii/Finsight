import { useEffect, useRef } from "react";

// Cents-first currency input. The user types digits and the decimal fills in
// from the right (50000 -> $500.00, 1000 -> $10.00). It renders a formatted,
// read-through display but hands the parent a plain decimal string via onChange
// (e.g. "500.00", or "" when empty), so nothing downstream changes.
//
// Fully controlled: the displayed digits are derived from `value` every render,
// so there's no internal state to keep in sync. Props: value (dollars, number or
// string), onChange(dollars: string), and any standard <input> props (style,
// className, placeholder, disabled, autoFocus, onBlur, onKeyDown, ...). maxDigits
// caps entry to fit Numeric(10,2).

function toDigits(value) {
  if (value === "" || value == null) return "";
  const cents = Math.round(parseFloat(value) * 100);
  return Number.isNaN(cents) ? "" : String(cents);
}

function display(digits, prefix) {
  if (digits === "") return "";
  const padded = digits.padStart(3, "0");
  const cents = padded.slice(-2);
  const dollars = String(parseInt(padded.slice(0, -2), 10)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${prefix}${dollars}.${cents}`;
}

export default function CurrencyInput({ value, onChange, prefix = "$", maxDigits = 10, onFocus, ...props }) {
  const ref = useRef(null);
  const digits = toDigits(value).slice(0, maxDigits);
  const text = display(digits, prefix);

  // Entry is append/backspace only, so keep the caret pinned to the end.
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement === el) {
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [text]);

  function handleChange(e) {
    const next = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, maxDigits);
    onChange(next === "" ? "" : (parseInt(next, 10) / 100).toFixed(2));
  }

  function handleFocus(e) {
    const el = e.target;
    requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
    onFocus?.(e);
  }

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      value={text}
      onChange={handleChange}
      onFocus={handleFocus}
      {...props}
    />
  );
}
