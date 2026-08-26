import { useState, useEffect } from "react";
import { CATEGORY_CONFIG, lockedNameFor } from "../../utils/finance";
import { HOME_SURFACE, HOME_DIVIDER, HOME_TEXT, HOME_MUTED, HOME_EXPENSE, CATEGORY_ACCENT, CATEGORY_ICON } from "../shared/categoryVisuals";
import { createTransaction } from "../../api/transactions";
import { getToday } from "../../utils/time";
import CurrencyInput from "../shared/CurrencyInput";

const today = () => getToday();

let _lid = 0;
const newDraft = () => ({ _lid: ++_lid, name: "", amount: "", category: "EXPENSE", transaction_date: today(), note: "" });

function isDraftValid(d) {
  return (!!lockedNameFor(d.category) || d.name.trim() !== "") &&
    parseFloat(d.amount) > 0 &&
    !!d.transaction_date;
}

export default function BatchAddPanel({ active, onSaveStateChange, onSaved, onCancel }) {
  const bg     = HOME_SURFACE;
  const border = HOME_DIVIDER;
  const text   = HOME_TEXT;
  const muted  = HOME_MUTED;

  const [drafts, setDrafts]         = useState(() => [newDraft()]);
  const [isSaving, setIsSaving]     = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [sendingLids, setSendingLids] = useState([]);

  const isDirty = drafts.some(isDraftValid);

  const handleSave = async () => {
    if (isSaving || !isDirty) return;
    setIsSaving(true);
    const valid = drafts.filter(isDraftValid);
    setSendingLids(valid.map(d => d._lid));
    try {
      await Promise.all([
        Promise.all(valid.map(d => createTransaction({
          name: lockedNameFor(d.category) ?? d.name.trim(),
          amount: parseFloat(d.amount),
          category: d.category,
          transaction_date: d.transaction_date,
          note: d.note.trim() || null,
        }))),
        new Promise(r => setTimeout(r, 420 + (valid.length - 1) * 80)),
      ]);
      setSendingLids([]);
      setDrafts(prev => { const remaining = prev.filter(d => !isDraftValid(d)); return remaining.length > 0 ? remaining : [newDraft()]; });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
      onSaved?.();
    } catch { setSendingLids([]); }
    finally { setIsSaving(false); }
  };

  const validCount = drafts.filter(isDraftValid).length;

  useEffect(() => {
    if (!active) return;
    onSaveStateChange?.({ isDirty, isSaving, saveStatus, validCount, onSave: handleSave });
  }, [active, isDirty, isSaving, saveStatus, drafts]);

  const MAX_ROWS = 20;
  const showAddRow = drafts.length < MAX_ROWS && (drafts.length === 0 || isDraftValid(drafts[drafts.length - 1]));

  return (
    <div style={{ color: text, minHeight: 420, display: "flex", flexDirection: "column" }}>
      <style>{`
        @keyframes bp-row-in {
          from { opacity: 0; transform: translateY(-6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes bp-pill-pop {
          0%   { transform: scale(0.88); opacity: 0.6; }
          100% { transform: scale(1);    opacity: 1;   }
        }
        @keyframes bp-row-send {
          from { opacity: 1; transform: scale(1); }
          to   { opacity: 0; transform: scale(0.9); }
        }
      `}</style>

      {drafts.length === 0 && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: muted }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>No rows yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Add a row to get started</div>
        </div>
      )}

      {/* Two-column grid, not a wide table row per draft */}
      <div className="grid grid-cols-2 gap-4" style={{ alignContent: "start" }}>
        {drafts.map((d, idx) => {
          const isLast   = idx === drafts.length - 1;
          const catColor = CATEGORY_ACCENT[d.category];
          const Icon     = CATEGORY_ICON[d.category];
          const locked   = lockedNameFor(d.category);
          return (
            <div
              key={d._lid}
              className="rounded-2xl"
              style={{
                padding: 18,
                backgroundColor: `color-mix(in srgb, ${text} 4%, transparent)`,
                animation: sendingLids.includes(d._lid)
                  ? `bp-row-send 0.32s ease-in-out ${sendingLids.indexOf(d._lid) * 80}ms both`
                  : "bp-row-in 0.2s ease-out",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <span
                  style={{
                    width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    backgroundColor: catColor,
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
                  }}
                >
                  <Icon />
                </span>
                <button
                  onClick={() => setDrafts(prev => prev.filter((_, xi) => xi !== idx))}
                  aria-label="Remove row"
                  style={{ color: muted, cursor: "pointer", background: "none", border: "none", padding: 4, display: "inline-flex", flexShrink: 0 }}
                  onMouseEnter={e => e.currentTarget.style.color = HOME_EXPENSE}
                  onMouseLeave={e => e.currentTarget.style.color = muted}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <input
                autoFocus={isLast && !locked}
                type="text"
                value={locked ?? d.name}
                placeholder="e.g. Netflix"
                disabled={!!locked}
                onChange={e => !locked && setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, name: e.target.value } : x))}
                onKeyDown={e => e.key === "Escape" && setDrafts(prev => prev.filter((_, xi) => xi !== idx))}
                style={{ width: "100%", background: "transparent", color: text, border: "none", borderBottom: `1px solid ${border}`, outline: "none", fontSize: 16, fontWeight: 600, fontFamily: "inherit", padding: "0 0 6px", marginBottom: 12, opacity: locked ? 0.45 : 1, cursor: locked ? "not-allowed" : "text" }}
              />

              <div style={{ display: "flex", alignItems: "center", gap: 4, borderBottom: `1px solid ${border}`, paddingBottom: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 14, color: muted }}>$</span>
                <CurrencyInput
                  value={d.amount}
                  placeholder="0.00"
                  onChange={v => setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, amount: v } : x))}
                  onKeyDown={e => e.key === "Escape" && setDrafts(prev => prev.filter((_, xi) => xi !== idx))}
                  style={{ flex: 1, minWidth: 0, background: "transparent", color: text, border: "none", outline: "none", fontSize: 16, fontWeight: 600, fontFamily: "inherit" }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <select
                  value={d.category}
                  onChange={e => setDrafts(prev => prev.map((x, xi) => {
                    if (xi !== idx) return x;
                    const newCat = e.target.value;
                    const newName = lockedNameFor(newCat) ?? (lockedNameFor(x.category) ? "" : x.name);
                    return { ...x, category: newCat, name: newName };
                  }))}
                  style={{
                    flex: "0 0 auto", padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                    color: "#fff", backgroundColor: catColor, border: "none",
                    outline: "none", cursor: "pointer", fontFamily: "inherit", colorScheme: "dark",
                    animation: "bp-pill-pop 0.25s ease-out",
                  }}
                >
                  {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key} style={{ backgroundColor: bg, color: text }}>{cfg.label}</option>
                  ))}
                </select>

                <input
                  type="date"
                  value={d.transaction_date}
                  onChange={e => setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, transaction_date: e.target.value } : x))}
                  onKeyDown={e => e.key === "Escape" && setDrafts(prev => prev.filter((_, xi) => xi !== idx))}
                  style={{ flex: 1, minWidth: 0, background: "transparent", color: muted, border: "none", outline: "none", fontSize: 12, fontFamily: "inherit", colorScheme: "dark" }}
                />
              </div>

              <input
                type="text"
                value={d.note}
                placeholder="Optional note"
                onChange={e => setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, note: e.target.value } : x))}
                onKeyDown={e => e.key === "Escape" && setDrafts(prev => prev.filter((_, xi) => xi !== idx))}
                style={{ width: "100%", background: "transparent", color: muted, border: "none", borderBottom: `1px solid ${border}`, outline: "none", fontSize: 13, fontFamily: "inherit", padding: "0 0 6px" }}
              />
            </div>
          );
        })}

        {showAddRow && (
          <button
            onClick={() => setDrafts(prev => [...prev, newDraft()])}
            className="rounded-2xl cursor-pointer transition-colors"
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
              minHeight: 168, border: "none", backgroundColor: `color-mix(in srgb, ${text} 4%, transparent)`, color: muted, fontSize: 13, fontWeight: 600,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = text; e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${text} 7%, transparent)`; }}
            onMouseLeave={e => { e.currentTarget.style.color = muted; e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${text} 4%, transparent)`; }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5v14" />
            </svg>
            Add row
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
        {onCancel ? (
          <button
            onClick={onCancel}
            className="rounded-lg cursor-pointer transition-colors"
            style={{ padding: "4px 12px", border: "none", backgroundColor: "transparent", fontSize: 12, fontWeight: 600, color: muted }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${text} 8%, transparent)`; e.currentTarget.style.color = text; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = muted; }}
          >
            Cancel
          </button>
        ) : <span />}
        <span style={{ fontSize: 11, color: muted }}>{drafts.length} / {MAX_ROWS} rows</span>
      </div>
    </div>
  );
}
