import { useState } from "react";
import { fmt } from "../../utils/finance";
import { HOME_SURFACE, HOME_DIVIDER, HOME_TEXT, HOME_MUTED, HOME_EXPENSE, ACCENT, ACCENT_TEXT, TIPS_DEPOSITED } from "../shared/categoryVisuals";
import { updateTipDeposit, deleteTipDeposit, convertTipDepositToTransaction } from "../../api/tipDeposits";
import CurrencyInput from "../shared/CurrencyInput";
import Toggle from "../shared/Toggle";

function shortDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function RowActions({ muted, onEdit, deleteArmed, onDeleteClick }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }} onMouseDown={(e) => e.stopPropagation()}>
      {onEdit && (
        <button onClick={onEdit} aria-label="Edit" style={{ color: muted, background: "none", border: "none", cursor: "pointer", padding: 3, display: "inline-flex" }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
          </svg>
        </button>
      )}
      <button onClick={onDeleteClick} aria-label="Delete" style={{ color: deleteArmed ? HOME_EXPENSE : muted, background: "none", border: "none", cursor: "pointer", padding: 3, display: "inline-flex" }}>
        {deleteArmed ? (
          <span style={{ fontSize: 11, fontWeight: 600 }}>Confirm?</span>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
          </svg>
        )}
      </button>
    </div>
  );
}

// The Tips category page's main card (#155/#156): one shared header (search,
// rows-per-page, pagination) driving two table bodies side by side -
// Transactions (cash tips) and Deposited Tips. Search only filters
// Transactions - a deposit has no name/note to search on - but both share
// the same page/perPage state so paging moves them together.
export default function TipsTransactionsCard({
  tipsRows, tipsTotal, depositRows,
  page, perPage, onPageChange, onPerPageChange,
  query, onQueryChange,
  onEditTransaction, onDeleteTransaction, onSaved,
  activeColor,
}) {
  const bg = HOME_SURFACE, border = HOME_DIVIDER, text = HOME_TEXT, muted = HOME_MUTED;

  const [searchFocused, setSearchFocused] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [editingDepositId, setEditingDepositId] = useState(null);
  const [draft, setDraft] = useState({ amount: "", deposit_date: "" });
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [rowError, setRowError] = useState("");

  function requestDelete(id, action) {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId((prev) => (prev === id ? null : prev)), 3000);
      return;
    }
    setDeleteConfirmId(null);
    action();
  }

  function startEditDeposit(d) {
    setEditingDepositId(d.id);
    setDraft({ amount: String(d.amount), deposit_date: d.deposit_date });
  }

  function closeDepositForm() {
    setEditingDepositId(null);
    setDraft({ amount: "", deposit_date: "" });
  }

  async function saveDeposit(e) {
    e.preventDefault();
    const n = parseFloat(draft.amount);
    if (isNaN(n) || n <= 0) return;
    setSaving(true);
    try {
      await updateTipDeposit(editingDepositId, { amount: n, deposit_date: draft.deposit_date });
      closeDepositForm();
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  async function removeDeposit(id) {
    try {
      await deleteTipDeposit(id);
      onSaved?.();
    } catch {
      setRowError("Failed to delete — try again");
      setTimeout(() => setRowError(""), 3000);
    }
  }

  async function convertDepositToTip(id) {
    if (converting) return;
    setConverting(true);
    try {
      await convertTipDepositToTransaction(id);
      closeDepositForm();
      onSaved?.();
    } finally {
      setConverting(false);
    }
  }

  const fieldStyle = {
    width: "100%", borderRadius: 8, padding: "6px 8px", fontSize: 13,
    border: `1px solid ${border}`, backgroundColor: bg, color: text,
    boxSizing: "border-box", outline: "none",
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: bg }}>
      {/* Shared header - mirrors TransactionTable's, scoped to Tips */}
      <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap" style={{ borderColor: border }}>
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-xl font-semibold shrink-0">Tips</h3>
          <div
            className="flex items-center gap-2 rounded-lg"
            style={{
              padding: "5px 10px", minWidth: 0,
              backgroundColor: "rgba(255,255,255,0.05)",
              border: `1px solid ${searchFocused ? `color-mix(in srgb, ${activeColor ?? text} 55%, transparent)` : "transparent"}`,
              transition: "border-color 150ms ease",
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: muted, flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={(e) => { if (e.key === "Escape") { onQueryChange(""); e.currentTarget.blur(); } }}
              placeholder="Search tips"
              aria-label="Search tips transactions"
              style={{ width: 150, minWidth: 0, background: "none", border: "none", outline: "none", color: text, fontSize: 13, fontWeight: 500 }}
            />
          </div>
        </div>

        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex items-center gap-2 text-xs" style={{ color: muted }}>
            <span>Rows per page</span>
            <div className="flex items-center" style={{ gap: 2, padding: 3, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)" }}>
              {[10, 20, 50].map((n) => {
                const active = perPage === n;
                return (
                  <button
                    key={n}
                    onClick={() => onPerPageChange(n)}
                    className="rounded-full text-xs font-bold cursor-pointer transition-colors"
                    style={{
                      padding: "5px 12px",
                      color: active ? ACCENT_TEXT : muted,
                      backgroundColor: active ? ACCENT : "transparent",
                    }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs" style={{ color: muted }}>
            <span>{tipsTotal === 0 ? "0" : `${(page - 1) * perPage + 1}–${Math.min(page * perPage, tipsTotal)}`} of {tipsTotal}</span>
            <div className="flex items-center">
              {[
                { key: "prev", disabled: page === 1, onClick: () => onPageChange(page - 1), d: "M15 18l-6-6 6-6" },
                { key: "next", disabled: page * perPage >= tipsTotal, onClick: () => onPageChange(page + 1), d: "M9 18l6-6-6-6" },
              ].map(({ key, disabled, onClick, d }) => (
                <button
                  key={key}
                  onClick={onClick}
                  disabled={disabled}
                  className="rounded-lg cursor-pointer transition-colors disabled:cursor-default disabled:opacity-30"
                  style={{ padding: 6, color: muted }}
                  aria-label={key === "prev" ? "Previous page" : "Next page"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={d} />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {rowError && <p style={{ fontSize: 12, color: HOME_EXPENSE, margin: "10px 24px 0" }}>{rowError}</p>}

      {/* Two tables sharing the header above */}
      <div className="grid grid-cols-2" style={{ minHeight: 200 }}>
        {/* Transactions (cash tips) */}
        <div style={{ borderRight: `1px solid ${border}` }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: muted, margin: 0, padding: "12px 20px 8px" }}>Transactions</p>
          {tipsRows.length === 0 ? (
            <p style={{ fontSize: 13, color: muted, textAlign: "center", padding: "22px 0" }}>No tips in view</p>
          ) : (
            tipsRows.map((t) => (
              <div
                key={t.id}
                onClick={() => onEditTransaction(t)}
                className="cursor-pointer"
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderTop: `1px solid ${border}` }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: muted }}>{shortDate(t.transaction_date)}</p>
                </div>
                <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: text, fontVariantNumeric: "tabular-nums" }}>{fmt(t.amount)}</p>
                <RowActions
                  muted={muted}
                  deleteArmed={deleteConfirmId === t.id}
                  onDeleteClick={(e) => { e.stopPropagation(); requestDelete(t.id, () => onDeleteTransaction(t)); }}
                />
              </div>
            ))
          )}
        </div>

        {/* Deposited Tips */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: muted, margin: 0, padding: "12px 20px 8px" }}>Deposited Tips</p>
          {depositRows.length === 0 ? (
            <p style={{ fontSize: 13, color: muted, textAlign: "center", padding: "22px 0" }}>No deposits in view</p>
          ) : (
            depositRows.map((d) => (
              <div key={d.id}>
                <div
                  onClick={() => (editingDepositId === d.id ? closeDepositForm() : startEditDeposit(d))}
                  className="cursor-pointer"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderTop: `1px solid ${border}` }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: TIPS_DEPOSITED }}>Deposited {shortDate(d.deposit_date)}</p>
                  </div>
                  <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: text, fontVariantNumeric: "tabular-nums" }}>{fmt(d.amount)}</p>
                  <RowActions
                    muted={muted}
                    onEdit={(e) => { e.stopPropagation(); startEditDeposit(d); }}
                    deleteArmed={deleteConfirmId === d.id}
                    onDeleteClick={(e) => { e.stopPropagation(); requestDelete(d.id, () => removeDeposit(d.id)); }}
                  />
                </div>
                {editingDepositId === d.id && (
                  <form onSubmit={saveDeposit} onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 20px 14px", backgroundColor: `color-mix(in srgb, ${text} 4%, transparent)` }}>
                    <div className="flex gap-2">
                      <CurrencyInput value={draft.amount} onChange={(v) => setDraft((f) => ({ ...f, amount: v }))} placeholder="0.00" style={fieldStyle} autoFocus />
                      <input type="date" value={draft.deposit_date} onChange={(e) => setDraft((f) => ({ ...f, deposit_date: e.target.value }))} style={fieldStyle} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Toggle checked={true} onChange={(v) => { if (!v) convertDepositToTip(d.id); }} disabled={converting} activeColor={TIPS_DEPOSITED} />
                      <div className="flex gap-2">
                        <button type="button" onClick={closeDepositForm} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${border}`, background: "transparent", color: muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                        <button type="submit" disabled={saving || draft.amount === ""} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${TIPS_DEPOSITED}`, backgroundColor: `color-mix(in srgb, ${TIPS_DEPOSITED} 15%, transparent)`, color: TIPS_DEPOSITED, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: saving || draft.amount === "" ? 0.6 : 1 }}>
                          {saving ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
