import { CATEGORY_CONFIG } from "../../utils/finance";
import { HOME_MUTED, TILE_COLOR } from "../shared/categoryVisuals";

export default function CategoryPicker({ value, onChange }) {
  const entries = Object.entries(CATEGORY_CONFIG);
  const rows = [entries.slice(0, 4), entries.slice(4)];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: "flex", gap: 8 }}>
          {row.map(([key, cfg]) => {
            const active = value === key;
            const color = TILE_COLOR[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => onChange(key)}
                style={{
                  flex: cfg.label.length + 4,
                  minWidth: 0,
                  padding: "7px 0", borderRadius: 10, fontSize: 12.5, fontWeight: 600, textAlign: "center",
                  border: "none",
                  color: active ? "#fff" : HOME_MUTED,
                  backgroundColor: active ? color : "rgba(255,255,255,0.06)",
                  cursor: "pointer",
                }}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
