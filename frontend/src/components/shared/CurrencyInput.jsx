import { useEffect, useRef, forwardRef } from "react";


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

const CurrencyInput = forwardRef(function CurrencyInput({ value, onChange, prefix = "$", maxDigits = 10, onFocus, ...props }, forwardedRef) {
  const innerRef = useRef(null);
  const ref = forwardedRef ?? innerRef;
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
});

export default CurrencyInput;
