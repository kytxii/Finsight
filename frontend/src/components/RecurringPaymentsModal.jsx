import { useState, useEffect, useRef } from "react";
import { CATEGORY_CONFIG, fmt } from "../utils/finance";
import { useTheme } from "../hooks/useTheme";
import CurrencyInput from "./CurrencyInput";
import {
  getRecurringPayments,
  createRecurringPayment,
  updateRecurringPayment,
  deleteRecurringPayment,
} from "../api/recurringPayments";

const EMPTY_DRAFT = { name: "", amount: "", day_of_month: "", category: "SUBSCRIPTION", is_estimate: false };

const SKELETON_WIDTHS = [
  ["68%", "58%", "60%", "55%"],
  ["52%", "70%", "60%", "65%"],
  ["78%", "52%", "60%", "55%"],
];

function ordinal(n) {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : (["th", "st", "nd", "rd"][v % 10] ?? "th");
  return `${n}${suffix}`;
}

function isDraftValid(d) {
  return d.name.trim() !== "" &&
    parseFloat(d.amount) > 0 &&
    (d.is_estimate || (parseInt(d.day_of_month, 10) >= 1 && parseInt(d.day_of_month, 10) <= 31));
}

let _lid = 0;
const newDraft = () => ({ _lid: ++_lid, ...EMPTY_DRAFT });

// inline=true  → renders as a flush panel inside the drawer (no modal chrome)
// inline=false → renders as a centred modal overlay
export default function RecurringPaymentsModal({ onClose, inline = false, onSaveStateChange, mobile = false, onDelete, onSaved }) {
  const dark = useTheme();
  const bg     = dark ? "var(--dark-surface)" : "var(--light-surface)";
  const border = dark ? "var(--dark-border)"  : "var(--light-border)";
  const text   = dark ? "var(--dark-text)"    : "var(--light-text)";
  const muted  = `color-mix(in srgb, ${text} 45%, transparent)`;
  const faint  = `color-mix(in srgb, ${text} 5%, ${bg})`;

  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [editCell, setEditCell]     = useState(null);
  const [editValue, setEditValue]   = useState("");
  const [drafts, setDrafts]         = useState([]);
  const [isSaving, setIsSaving]     = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [deleted, setDeleted]       = useState(new Set());
  const [deleteError, setDeleteError] = useState(false);
  const [hoverRow, setHoverRow]     = useState(null);
  const originalRowsRef             = useRef([]);
  const rowsRef                     = useRef([]);
  rowsRef.current = rows; // always current — no stale-closure risk in async handlers

  useEffect(() => {
    getRecurringPayments()
      .then(r => { setRows(r.data); originalRowsRef.current = r.data; })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Inline edit ───────────────────────────────────────────────────────────

  const startEdit = (id, field, value) => {
    setEditCell({ id, field });
    setEditValue(String(value));
  };

  const commitEdit = (id, field) => {
    setEditCell(null);
    const row = rowsRef.current.find(r => r.id === id);
    if (!row) return;

    let parsed = editValue.trim();
    if (field === "amount") {
      const n = parseFloat(parsed);
      if (isNaN(n) || n <= 0) return;
      parsed = n;
    } else if (field === "day_of_month") {
      if (parsed === "") {
        if (!row.is_estimate) return; // day_of_month required unless estimate
        parsed = null;
      } else {
        const n = parseInt(parsed, 10);
        if (isNaN(n) || n < 1 || n > 31) return;
        parsed = n;
      }
    } else {
      if (!parsed) return;
    }

    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: parsed } : r));
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (id) => {
    setDeleted(s => new Set(s).add(id));
    setTimeout(() => {
      setRows(prev => prev.filter(r => r.id !== id));
      setDeleted(s => { const n = new Set(s); n.delete(id); return n; });
    }, 700);
    try {
      await deleteRecurringPayment(id);
      onDelete?.();
    } catch {
      setDeleted(s => { const n = new Set(s); n.delete(id); return n; });
      setRows(prev => {
        if (prev.some(r => r.id === id)) return prev;
        const orig = originalRowsRef.current.find(r => r.id === id);
        return orig ? [...prev, orig] : prev;
      });
      setDeleteError(true);
      setTimeout(() => setDeleteError(false), 3000);
    }
  };

  // ── Toggle category ───────────────────────────────────────────────────────

  const toggleCategory = (id) => {
    setRows(prev => prev.map(r =>
      r.id === id ? { ...r, category: r.category === "SUBSCRIPTION" ? "BILL" : "SUBSCRIPTION" } : r
    ));
  };

  // ── Toggle estimate ──────────────────────────────────────────────────────

  const toggleEstimate = (id) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, is_estimate: !r.is_estimate } : r));
  };

  // ── Dirty check ───────────────────────────────────────────────────────────

  const anyDraftValid = drafts.some(isDraftValid);

  const isDirty = drafts.length > 0 || rows.some(row => {
    const orig = originalRowsRef.current.find(r => r.id === row.id);
    if (!orig) return false;
    if (row.name !== orig.name ||
      Math.abs(parseFloat(row.amount) - parseFloat(orig.amount)) > 0.001 ||
      row.day_of_month !== orig.day_of_month ||
      row.category !== orig.category ||
      row.is_estimate !== orig.is_estimate) return true;
    if (editCell?.id === row.id) {
      const f = editCell.field;
      if (f === "name") return editValue.trim() !== String(orig.name);
      if (f === "amount") { const n = parseFloat(editValue); return !isNaN(n) && Math.abs(n - parseFloat(orig.amount)) > 0.001; }
      if (f === "day_of_month") { const n = parseInt(editValue, 10); return !isNaN(n) && n !== orig.day_of_month; }
    }
    return false;
  });

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (isSaving || !isDirty) return;
    setIsSaving(true);
    try {
      // POST all valid drafts in parallel
      if (anyDraftValid) {
        const validDrafts = drafts.filter(isDraftValid);
        const results = await Promise.all(
          validDrafts.map(d => createRecurringPayment({
            name: d.name.trim(),
            amount: parseFloat(d.amount),
            day_of_month: d.day_of_month === "" ? null : parseInt(d.day_of_month, 10),
            category: d.category,
            is_estimate: d.is_estimate,
          }))
        );
        const newRows = results.map(r => r.data);
        setRows(prev => [...prev, ...newRows]);
        originalRowsRef.current = [...originalRowsRef.current, ...newRows];
        setDrafts(prev => prev.filter(d => !isDraftValid(d)));
      }

      // PATCH dirty rows — read from rowsRef so we always have the latest state
      const currentRows = rowsRef.current;
      const dirtyRows = currentRows.filter(row => {
        const orig = originalRowsRef.current.find(r => r.id === row.id);
        if (!orig) return false;
        return row.name !== orig.name ||
          Math.abs(parseFloat(row.amount) - parseFloat(orig.amount)) > 0.001 ||
          row.day_of_month !== orig.day_of_month ||
          row.category !== orig.category ||
          row.is_estimate !== orig.is_estimate;
      });

      await Promise.all(dirtyRows.map(row => {
        const orig = originalRowsRef.current.find(r => r.id === row.id);
        const changes = {};
        if (row.name !== orig.name) changes.name = row.name;
        if (Math.abs(parseFloat(row.amount) - parseFloat(orig.amount)) > 0.001) changes.amount = parseFloat(row.amount);
        if (row.day_of_month !== orig.day_of_month) changes.day_of_month = row.day_of_month;
        if (row.category !== orig.category) changes.category = row.category;
        if (row.is_estimate !== orig.is_estimate) changes.is_estimate = row.is_estimate;
        return updateRecurringPayment(row.id, changes);
      }));

      // Update originalRowsRef row-by-row so we don't clobber anything
      dirtyRows.forEach(row => {
        const idx = originalRowsRef.current.findIndex(r => r.id === row.id);
        if (idx !== -1) originalRowsRef.current[idx] = { ...row };
      });

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
      onSaved?.();
    } catch {}
    finally { setIsSaving(false); }
  };

  useEffect(() => {
    onSaveStateChange?.({ isDirty, isSaving, saveStatus, onSave: handleSave });
  }, [isDirty, isSaving, saveStatus, drafts]);

  // ── Cell renderers ────────────────────────────────────────────────────────

  const renderDisplay = (row, field) => {
    if (field === "amount") {
      return (
        <span style={{ fontVariantNumeric: "tabular-nums", color: row.is_estimate ? muted : undefined }}>
          {row.is_estimate ? "~" : ""}{fmt(row.amount)}
        </span>
      );
    }
    if (field === "day_of_month") {
      if (row.day_of_month == null) return <span style={{ color: muted }}>—</span>;
      return <span>every {ordinal(row.day_of_month)}</span>;
    }
    return <span style={{ fontWeight: 500 }}>{row[field]}</span>;
  };

  const estimateToggle = (active, onClick) => (
    <button
      onClick={onClick}
      title="Estimate (no fixed due date)"
      style={{
        flexShrink: 0,
        fontSize: "10px",
        fontWeight: 700,
        width: "16px",
        height: "16px",
        borderRadius: "4px",
        border: `1px solid ${active ? "var(--category-savings)" : "transparent"}`,
        color: active ? "var(--category-savings)" : muted,
        backgroundColor: active ? "color-mix(in srgb, var(--category-savings) 15%, transparent)" : "transparent",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      ~
    </button>
  );

  const renderCell = (row, field) => {
    const isEditing = editCell?.id === row.id && editCell?.field === field;

    if (field === "category") {
      const color = `var(--category-${row.category.toLowerCase()})`;
      return (
        <button
          key={row.category}
          onClick={() => toggleCategory(row.id)}
          style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: "999px",
            fontSize: mobile ? "13px" : "11px",
            fontWeight: 600,
            color,
            backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
            border: "none",
            cursor: "pointer",
            animation: "rp-pill-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
            transformOrigin: "center",
          }}
        >
          {CATEGORY_CONFIG[row.category]?.label ?? row.category}
        </button>
      );
    }

    let content;
    if (isEditing) {
      content = (
        field === "amount" ? (
        <CurrencyInput autoFocus
          value={editValue}
          onChange={v => setEditValue(v)}
          onBlur={() => commitEdit(row.id, field)}
          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditCell(null); }}
          style={{
            width: "100%", background: "transparent", color: text,
            border: "none", outline: "none", fontSize: mobile ? "15px" : "13px", fontFamily: "inherit",
          }}
        />
        ) : (
        <input autoFocus
          type={field === "day_of_month" ? "number" : "text"}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => commitEdit(row.id, field)}
          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditCell(null); }}
          min={field === "day_of_month" ? 1 : undefined}
          max={field === "day_of_month" ? 31 : undefined}
          style={{
            width: "100%", background: "transparent", color: text,
            border: "none", outline: "none", fontSize: mobile ? "15px" : "13px", fontFamily: "inherit",
          }}
        />
        )
      );
    } else {
      content = (
        <div onClick={() => startEdit(row.id, field, row[field] ?? "")}
          style={{ cursor: "text", minHeight: "20px" }}
        >
          {renderDisplay(row, field)}
        </div>
      );
    }

    if (field === "day_of_month") {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>{content}</div>
          {estimateToggle(row.is_estimate, () => toggleEstimate(row.id))}
        </div>
      );
    }

    return content;
  };

  // ── Column config ─────────────────────────────────────────────────────────

  const COLS = [
    { field: "name",         label: "Name",   width: "33%" },
    { field: "amount",       label: "Amount", width: "20%" },
    { field: "day_of_month", label: "Recurs", width: "22%" },
    { field: "category",     label: "Type",   width: "20%" },
  ];

  const tdStyle = (last = false, first = false) => ({
    padding: "8px 10px",
    paddingLeft: first ? "16px" : "10px",
    borderRight: last ? undefined : `1px solid ${border}`,
    verticalAlign: "middle",
  });

  // Show + when there are no drafts, or when the last draft is fully filled out
  const showAddRow = !loading && (drafts.length === 0 || isDraftValid(drafts[drafts.length - 1]));

  // ── Table content ─────────────────────────────────────────────────────────

  const tableContent = (
    <>
      <style>{`
        @keyframes rp-pulse {
          0%, 100% { opacity: 0.35; }
          50%       { opacity: 0.7;  }
        }
        @keyframes rp-bar-sweep {
          0%   { transform: scaleX(0); opacity: 0.9; }
          55%  { transform: scaleX(1); opacity: 0.9; }
          100% { transform: scaleX(1); opacity: 0;   }
        }
        @keyframes rp-row-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes rp-pill-pop {
          0%   { transform: scale(0.88); opacity: 0.6; }
          100% { transform: scale(1);    opacity: 1;   }
        }
      `}</style>

      <div style={{
        overflowX: "auto",
        overflowY: "auto",
        flex: 1,
        ...(inline ? {} : { minHeight: "380px", maxHeight: "60vh" }),
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: mobile ? "15px" : "13px", tableLayout: "fixed" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${border}`, backgroundColor: faint, position: "sticky", top: 0 }}>
              {COLS.map(({ label, width }, i) => (
                <th key={i} style={{
                  ...tdStyle(i === COLS.length - 1, i === 0),
                  fontWeight: 600,
                  fontSize: mobile ? "12px" : "10px",
                  color: muted,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  width,
                  textAlign: "left",
                  backgroundColor: faint,
                }}>
                  {label}
                </th>
              ))}
              <th style={{ width: "36px", backgroundColor: faint }} />
            </tr>
          </thead>

          <tbody>
            {/* Skeletons */}
            {loading && SKELETON_WIDTHS.map((widths, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                {widths.map((w, j) => (
                  <td key={j} style={tdStyle(j === widths.length - 1, j === 0)}>
                    <div style={{
                      height: "11px", width: w, borderRadius: "4px",
                      backgroundColor: `color-mix(in srgb, ${text} 8%, transparent)`,
                      animation: `rp-pulse 1.6s ease-in-out ${i * 0.15}s infinite`,
                    }} />
                  </td>
                ))}
                <td style={tdStyle(true)} />
              </tr>
            ))}

            {/* Empty state */}
            {!loading && rows.length === 0 && drafts.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "48px 16px", textAlign: "center", color: muted }}>
                  <div style={{ fontSize: "13px", fontWeight: 500 }}>No recurring payments yet</div>
                  <div style={{ fontSize: "12px", marginTop: "4px" }}>Click + to get started</div>
                </td>
              </tr>
            )}

            {/* Existing rows */}
            {!loading && rows.map(row => (
              <tr key={row.id}
                onMouseEnter={() => !deleted.has(row.id) && setHoverRow(row.id)}
                onMouseLeave={() => setHoverRow(null)}
                style={{
                  borderBottom: `1px solid ${border}`,
                  backgroundColor: hoverRow === row.id && !deleted.has(row.id) ? faint : undefined,
                  pointerEvents: deleted.has(row.id) ? "none" : undefined,
                }}
              >
                {deleted.has(row.id) ? (
                  <td colSpan={5} style={{ padding: 0, position: "relative", overflow: "hidden", height: "37px" }}>
                    <div style={{
                      position: "absolute",
                      inset: 0,
                      backgroundColor: `color-mix(in srgb, var(--category-expense) 18%, ${bg})`,
                      transformOrigin: "right center",
                      animation: "rp-bar-sweep 0.7s ease-out forwards",
                    }} />
                  </td>
                ) : (
                  <>
                    {COLS.map(({ field }, i) => (
                      <td key={field} style={{
                        ...tdStyle(i === COLS.length - 1, i === 0),
                        backgroundColor: editCell?.id === row.id && editCell?.field === field
                          ? `color-mix(in srgb, ${text} 5%, ${bg})` : undefined,
                      }}>
                        {renderCell(row, field)}
                      </td>
                    ))}
                    <td style={{ padding: "8px 6px", textAlign: "center", width: "52px" }}>
                      <button
                        onClick={() => handleDelete(row.id)}
                        style={{
                          color: muted,
                          opacity: hoverRow === row.id ? 1 : 0,
                          transition: "opacity 0.15s, color 0.15s",
                          cursor: "pointer", background: "none", border: "none",
                          padding: "1px", display: "inline-flex", alignItems: "center",
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = "var(--category-expense)"}
                        onMouseLeave={e => e.currentTarget.style.color = muted}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
                        </svg>
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}

            {/* Draft rows */}
            {drafts.map((d, idx) => {
              const isLast = idx === drafts.length - 1;
              const color  = `var(--category-${d.category.toLowerCase()})`;
              return (
                <tr key={d._lid} style={{ borderBottom: `1px solid ${border}`, backgroundColor: faint, animation: "rp-row-in 0.2s ease-out" }}>
                  {[
                    { field: "name",         type: "text",   placeholder: "e.g. Netflix" },
                    { field: "amount",       type: "number", placeholder: "0.00"         },
                    { field: "day_of_month", type: "number", placeholder: d.is_estimate ? "optional" : "1–31" },
                  ].map(({ field, type, placeholder }, i) => (
                    <td key={field} style={tdStyle(false, i === 0)}>
                      <div style={{ display: "flex", alignItems: "center", gap: field === "day_of_month" ? 6 : 0 }}>
                      {field === "amount" ? (
                      <CurrencyInput
                        value={d[field]}
                        placeholder={placeholder}
                        onChange={v => setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, [field]: v } : x))}
                        onKeyDown={e => { if (e.key === "Escape") setDrafts(prev => prev.filter((_, xi) => xi !== idx)); }}
                        style={{
                          width: "100%", background: "transparent", color: text,
                          border: "none", outline: "none", fontSize: mobile ? "15px" : "13px", fontFamily: "inherit",
                        }}
                      />
                      ) : (
                      <input
                        autoFocus={i === 0 && isLast}
                        type={type}
                        value={d[field]}
                        placeholder={placeholder}
                        onChange={e => setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, [field]: e.target.value } : x))}
                        onKeyDown={e => { if (e.key === "Escape") setDrafts(prev => prev.filter((_, xi) => xi !== idx)); }}
                        min={field === "day_of_month" ? 1 : undefined}
                        max={field === "day_of_month" ? 31 : undefined}
                        style={{
                          width: "100%", background: "transparent", color: text,
                          border: "none", outline: "none", fontSize: mobile ? "15px" : "13px", fontFamily: "inherit",
                        }}
                      />
                      )}
                      {field === "day_of_month" && estimateToggle(d.is_estimate, () => setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, is_estimate: !x.is_estimate } : x)))}
                      </div>
                    </td>
                  ))}
                  <td style={tdStyle(true)}>
                    <button
                      key={d.category}
                      onClick={() => setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, category: x.category === "SUBSCRIPTION" ? "BILL" : "SUBSCRIPTION" } : x))}
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "999px",
                        fontSize: mobile ? "13px" : "11px",
                        fontWeight: 600,
                        color,
                        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
                        border: "none",
                        cursor: "pointer",
                        animation: "rp-pill-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
                        transformOrigin: "center",
                      }}
                    >
                      {CATEGORY_CONFIG[d.category]?.label ?? d.category}
                    </button>
                  </td>
                  <td style={{ padding: "8px 12px 8px 6px", width: "52px" }}>
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                      <button
                        onClick={() => setDrafts(prev => prev.filter((_, xi) => xi !== idx))}
                        title="Cancel"
                        style={{ color: muted, cursor: "pointer", background: "none", border: "none", padding: "2px", display: "inline-flex" }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* Add row — always shown when no drafts, shown again once last draft is complete */}
            {showAddRow && (
              <tr
                onClick={() => setDrafts(prev => [...prev, newDraft()])}
                style={{ cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.querySelector("span").style.color = text}
                onMouseLeave={e => e.currentTarget.querySelector("span").style.color = muted}
              >
                <td colSpan={5} style={{ padding: "10px 16px", textAlign: "center", borderTop: `1px solid ${border}` }}>
                  <span style={{ fontSize: "18px", color: muted, lineHeight: 1, transition: "color 0.15s" }}>+</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{
        padding: "8px 16px",
        borderTop: `1px solid ${border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        flexShrink: 0,
      }}>
        {deleteError && (
          <span style={{ fontSize: mobile ? "13px" : "11px", color: "var(--category-expense)" }}>
            Failed to delete — try again
          </span>
        )}
        <span style={{ fontSize: mobile ? "13px" : "11px", color: muted }}>
          {rows.length} {rows.length === 1 ? "payment" : "payments"}
        </span>
      </div>
    </>
  );

  // ── Save button (modal mode only) ─────────────────────────────────────────

  const saveButton = (
    <button
      onClick={handleSave}
      disabled={!isDirty || isSaving}
      style={{
        fontSize: "12px",
        fontWeight: 600,
        padding: "4px 12px",
        borderRadius: "8px",
        border: `1px solid ${isDirty ? "var(--category-income)" : border}`,
        color: isDirty ? "var(--category-income)" : muted,
        backgroundColor: isDirty
          ? "color-mix(in srgb, var(--category-income) 12%, transparent)"
          : "transparent",
        cursor: isDirty && !isSaving ? "pointer" : "default",
        opacity: isSaving ? 0.6 : 1,
        transition: "all 0.2s ease",
      }}
    >
      {isSaving ? "Saving…" : "Save"}
    </button>
  );

  // ── Inline mode ───────────────────────────────────────────────────────────

  if (inline) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", color: text,
        borderTop: `1px solid ${border}`,
      }}>
        {tableContent}
      </div>
    );
  }

  // ── Modal mode ────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden"
        style={{ backgroundColor: bg, borderColor: border, color: text, display: "flex", flexDirection: "column" }}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: border }}>
          <div>
            <h2 className="text-base font-semibold">Recurring Payments</h2>
            <p className="text-xs mt-0.5" style={{ color: muted }}>Click any cell to edit · Enter to confirm · Esc to cancel</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {saveButton}
            <button onClick={onClose} className="cursor-pointer" style={{ color: muted }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {tableContent}
      </div>
    </div>
  );
}
