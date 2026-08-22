import { useState, useEffect } from "react";
import { CATEGORY_CONFIG, lockedNameFor } from "../utils/finance";
import { HOME_SURFACE, HOME_DIVIDER, HOME_TEXT, HOME_MUTED, HOME_EXPENSE, CATEGORY_ACCENT } from "./categoryVisuals";
import { createTransaction } from "../api/transactions";
import { getToday } from "../utils/time";
import CurrencyInput from "./CurrencyInput";

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
  const faint  = `color-mix(in srgb, ${text} 5%, ${bg})`;

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

  const COLS = [
    { field: "name",             label: "Name",     width: "22%" },
    { field: "amount",           label: "Amount",   width: "14%" },
    { field: "category",         label: "Category", width: "20%" },
    { field: "transaction_date", label: "Date",     width: "20%" },
    { field: "note",             label: "Note",     width: "19%" },
  ];

  const tdStyle = (last = false, first = false) => ({
    padding: "8px 10px",
    paddingLeft: first ? "16px" : "10px",
    borderRight: last ? undefined : `1px solid ${border}`,
    verticalAlign: "middle",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", color: text, borderTop: `1px solid ${border}` }}>
      <style>{`
        @keyframes bp-row-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bp-pill-pop {
          0%   { transform: scale(0.88); opacity: 0.6; }
          100% { transform: scale(1);    opacity: 1;   }
        }
        @keyframes bp-row-send {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(22px); }
        }
      `}</style>

      <div style={{ overflowX: "auto", overflowY: "auto", flex: 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", tableLayout: "fixed" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${border}`, backgroundColor: faint, position: "sticky", top: 0 }}>
              {COLS.map(({ label, width }, i) => (
                <th key={i} style={{
                  ...tdStyle(i === COLS.length - 1, i === 0),
                  fontWeight: 600, fontSize: "10px", color: muted,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  width, textAlign: "left", backgroundColor: faint,
                }}>{label}</th>
              ))}
              <th style={{ width: "36px", backgroundColor: faint }} />
            </tr>
          </thead>

          <tbody>
            {drafts.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "48px 16px", textAlign: "center", color: muted }}>
                  <div style={{ fontSize: "13px", fontWeight: 500 }}>No rows yet</div>
                  <div style={{ fontSize: "12px", marginTop: "4px" }}>Click + to add transactions</div>
                </td>
              </tr>
            )}

            {drafts.map((d, idx) => {
              const isLast    = idx === drafts.length - 1;
              const catColor  = CATEGORY_ACCENT[d.category];
              return (
                <tr key={d._lid} style={{ borderBottom: `1px solid ${border}`, backgroundColor: faint, animation: sendingLids.includes(d._lid) ? `bp-row-send 0.38s ease-in-out ${sendingLids.indexOf(d._lid) * 80}ms both` : "bp-row-in 0.2s ease-out" }}>
                  <td style={{ ...tdStyle(false, true), ...(lockedNameFor(d.category) ? { backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 4px, color-mix(in srgb, ${text} 6%, transparent) 4px, color-mix(in srgb, ${text} 6%, transparent) 6px)`, cursor: "not-allowed" } : {}) }}>
                    <input
                      autoFocus={isLast && !lockedNameFor(d.category)}
                      type="text"
                      value={lockedNameFor(d.category) ?? d.name}
                      placeholder="e.g. Netflix"
                      disabled={!!lockedNameFor(d.category)}
                      onChange={e => !lockedNameFor(d.category) && setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, name: e.target.value } : x))}
                      onKeyDown={e => e.key === "Escape" && setDrafts(prev => prev.filter((_, xi) => xi !== idx))}
                      style={{ width: "100%", background: "transparent", color: text, border: "none", outline: "none", fontSize: "13px", fontFamily: "inherit", opacity: lockedNameFor(d.category) ? 0.45 : 1, cursor: lockedNameFor(d.category) ? "not-allowed" : "text" }}
                    />
                  </td>
                  <td style={tdStyle(false)}>
                    <CurrencyInput
                      value={d.amount}
                      placeholder="0.00"
                      onChange={v => setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, amount: v } : x))}
                      onKeyDown={e => e.key === "Escape" && setDrafts(prev => prev.filter((_, xi) => xi !== idx))}
                      style={{ width: "100%", background: "transparent", color: text, border: "none", outline: "none", fontSize: "13px", fontFamily: "inherit" }}
                    />
                  </td>
                  <td style={tdStyle(false)}>
                    <select
                      value={d.category}
                      onChange={e => setDrafts(prev => prev.map((x, xi) => {
                        if (xi !== idx) return x;
                        const newCat = e.target.value;
                        const newName = lockedNameFor(newCat) ?? (lockedNameFor(x.category) ? "" : x.name);
                        return { ...x, category: newCat, name: newName };
                      }))}
                      style={{
                        padding: "2px 6px 2px 8px",
                        borderRadius: "999px",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: catColor,
                        backgroundColor: `color-mix(in srgb, ${catColor} 15%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${catColor} 35%, transparent)`,
                        outline: "none",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        colorScheme: "dark",
                        animation: "bp-pill-pop 0.25s ease-out",
                        maxWidth: "100%",
                      }}
                    >
                      {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                        <option key={key} value={key} style={{ backgroundColor: bg, color: text }}>{cfg.label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={tdStyle(false)}>
                    <input
                      type="date"
                      value={d.transaction_date}
                      onChange={e => setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, transaction_date: e.target.value } : x))}
                      onKeyDown={e => e.key === "Escape" && setDrafts(prev => prev.filter((_, xi) => xi !== idx))}
                      style={{ width: "100%", background: "transparent", color: text, border: "none", outline: "none", fontSize: "13px", fontFamily: "inherit", colorScheme: "dark" }}
                    />
                  </td>
                  <td style={tdStyle(true)}>
                    <input
                      type="text"
                      value={d.note}
                      placeholder="Optional"
                      onChange={e => setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, note: e.target.value } : x))}
                      onKeyDown={e => e.key === "Escape" && setDrafts(prev => prev.filter((_, xi) => xi !== idx))}
                      style={{ width: "100%", background: "transparent", color: text, border: "none", outline: "none", fontSize: "13px", fontFamily: "inherit" }}
                    />
                  </td>
                  <td style={{ padding: "8px 12px 8px 6px", width: "36px" }}>
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <button
                        onClick={() => setDrafts(prev => prev.filter((_, xi) => xi !== idx))}
                        style={{ color: muted, cursor: "pointer", background: "none", border: "none", padding: "2px", display: "inline-flex" }}
                        onMouseEnter={e => e.currentTarget.style.color = HOME_EXPENSE}
                        onMouseLeave={e => e.currentTarget.style.color = muted}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {showAddRow && (
              <tr
                onClick={() => setDrafts(prev => [...prev, newDraft()])}
                style={{ cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.querySelector("span").style.color = text}
                onMouseLeave={e => e.currentTarget.querySelector("span").style.color = muted}
              >
                <td colSpan={5} style={{ padding: "10px 16px", textAlign: "center", borderTop: drafts.length > 0 ? `1px solid ${border}` : undefined }}>
                  <span style={{ fontSize: "18px", color: muted, lineHeight: 1, transition: "color 0.15s" }}>+</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ padding: "8px 16px", borderTop: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        {onCancel && (
          <button
            onClick={onCancel}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${text} 8%, transparent)`; e.currentTarget.style.borderColor = `color-mix(in srgb, ${text} 30%, transparent)`; e.currentTarget.style.color = text; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.borderColor = `color-mix(in srgb, ${text} 15%, transparent)`; e.currentTarget.style.color = muted; }}
            style={{ padding: "4px 12px", borderRadius: 7, border: `1px solid color-mix(in srgb, ${text} 15%, transparent)`, background: "transparent", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: muted, transition: "background-color 150ms ease, border-color 150ms ease, color 150ms ease" }}
          >
            Cancel
          </button>
        )}
        <span style={{ fontSize: "11px", color: muted, marginLeft: "auto" }}>{drafts.length} / {MAX_ROWS} rows</span>
      </div>
    </div>
  );
}
