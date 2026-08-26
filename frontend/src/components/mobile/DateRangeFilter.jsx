import { useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { getNow } from "../../utils/time";

export const PRESETS = ["Current Month", "Last Month", "3m", "6m", "1y", "All"];

export function getPresetRange(label) {
  if (label === "All") return { from: null, to: null };

  const now = getNow();
  const from = new Date(now);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  if (label === "Current Month") {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
    to.setMonth(to.getMonth() + 1, 0);
    to.setHours(23, 59, 59, 999);
  } else if (label === "Last Month") {
    from.setMonth(from.getMonth() - 1, 1);
    from.setHours(0, 0, 0, 0);
    to.setDate(0);
    to.setHours(23, 59, 59, 999);
  } else if (label === "3m") {
    from.setMonth(from.getMonth() - 3);
  } else if (label === "6m") {
    from.setMonth(from.getMonth() - 6);
  } else if (label === "1y") {
    from.setFullYear(from.getFullYear() - 1);
  }

  return { from, to };
}

export default function DateRangeFilter({ activeColor, onChange, dropdown = false, blackActiveText = false }) {
  const dark = useTheme();
  const [activePreset, setActivePreset] = useState("Current Month");
  const [hovered, setHovered] = useState(null);
  const [fromVal, setFromVal] = useState("");
  const [toVal, setToVal] = useState("");

  const border = dark ? "var(--dark-border)" : "var(--light-border)";
  const text = dark ? "var(--dark-text)" : "var(--light-text)";
  const bg = dark ? "var(--dark-bg)" : "var(--light-bg)";
  const muted = `color-mix(in srgb, ${text} 90%, transparent)`;

  function handlePreset(label) {
    setActivePreset(label);
    setFromVal("");
    setToVal("");
    onChange(getPresetRange(label));
  }

  function handleCustom(from, to) {
    setActivePreset(null);
    onChange({
      from: from ? new Date(from + "T00:00:00") : null,
      to: to ? new Date(to + "T23:59:59") : null,
    });
  }

  const inputStyle = {
    backgroundColor: bg,
    border: `1px solid ${border}`,
    color: text,
    colorScheme: dark ? "dark" : "light",
  };

  return (
    <div
      className="px-6 py-3 flex items-center justify-center gap-10 flex-wrap "
      style={{ borderColor: border }}
    >
      {dropdown ? (
        <select
          value={activePreset ?? "custom"}
          onChange={(e) => handlePreset(e.target.value)}
          className="rounded-xl px-3 py-1.5 text-xs font-semibold border cursor-pointer"
          style={{
            color: activeColor,
            borderColor: activeColor,
            backgroundColor: dark
              ? `color-mix(in srgb, ${activeColor} 12%, transparent)`
              : "var(--light-surface)",
            boxShadow: `0 0 0 2px color-mix(in srgb, ${activeColor} 20%, transparent)`,
            colorScheme: dark ? "dark" : "light",
          }}
        >
          {PRESETS.map((label) => (
            <option key={label} value={label}>{label}</option>
          ))}
          {!activePreset && <option value="custom" disabled>Custom</option>}
        </select>
      ) : (
        <div className="flex gap-1.5 flex-wrap">
          {PRESETS.map((label) => {
            const active = activePreset === label;
            const isHovered = hovered === label;
            return (
              <button
                key={label}
                onClick={() => handlePreset(label)}
                onMouseEnter={() => setHovered(label)}
                onMouseLeave={() => setHovered(null)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-95"
                style={
                  active
                    ? {
                        color: blackActiveText ? "#000000" : activeColor,
                        borderColor: activeColor,
                        backgroundColor: dark
                          ? `color-mix(in srgb, ${activeColor} ${isHovered ? "20%" : "12%"}, transparent)`
                          : "var(--light-surface)",
                        boxShadow: `0 0 0 2px color-mix(in srgb, ${activeColor} 20%, transparent)`,
                      }
                    : {
                        borderColor: isHovered ? activeColor : (dark ? border : `color-mix(in srgb, ${text} 45%, transparent)`),
                        color: isHovered ? activeColor : text,
                        opacity: isHovered ? 1 : (dark ? 0.4 : 0.85),
                        backgroundColor: isHovered
                          ? `color-mix(in srgb, ${activeColor} 8%, transparent)`
                          : "transparent",
                      }
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs" style={{ color: muted }}>
        <span>from</span>
        <input
          type="date"
          value={fromVal}
          onChange={(e) => {
            setFromVal(e.target.value);
            handleCustom(e.target.value, toVal);
          }}
          className="rounded-xl px-3.5 py-1.5 text-xs font-semibold border"
          style={inputStyle}
        />
        <span>to</span>
        <input
          type="date"
          value={toVal}
          onChange={(e) => {
            setToVal(e.target.value);
            handleCustom(fromVal, e.target.value);
          }}
          className="rounded-xl px-3.5 py-1.5 text-xs font-semibold border"
          style={inputStyle}
        />
      </div>
    </div>
  );
}
