import { useEffect, useRef, useState } from "react";
import {
  HOME_SURFACE, HOME_DIVIDER, HOME_TEXT, HOME_MUTED, HOME_INCOME, HOME_EXPENSE,
  GAUGE_DARK_GREEN, GAUGE_GREEN, GAUGE_YELLOW, GAUGE_ORANGE, GAUGE_RED,
} from "../shared/categoryVisuals";
import { fmt } from "../../utils/finance";
import CurrencyInput from "../shared/CurrencyInput";
import Skel from "../shared/Skel";
import InstallmentGauge from "../shared/InstallmentGauge";
import { computeTermOptions, computeMonthlyPayment, computeGaugeStatus } from "../../utils/installmentMath";
import { getInstallments, createInstallment, updateInstallment, deleteInstallment } from "../../api/installments";
import { getSpendableSurplus } from "../../api/paychecks";


const EMPTY_DRAFT = { name: "", total_amount: "", period_months: "", day_of_month: "" };
const STATUS_COLOR = { dark_green: GAUGE_DARK_GREEN, green: GAUGE_GREEN, yellow: GAUGE_YELLOW, orange: GAUGE_ORANGE, red: GAUGE_RED };

function ordinal(n) {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : (["th", "st", "nd", "rd"][v % 10] ?? "th");
  return `${n}${suffix}`;
}

function isDraftValid(d) {
  if (d.name.trim() === "" || !(parseFloat(d.total_amount) > 0)) return false;
  if (d.period_months !== "") {
    const m = parseInt(d.period_months, 10);
    if (!Number.isInteger(m) || m < 1 || m > 480) return false;
  }
  if (d.day_of_month !== "") {
    const day = parseInt(d.day_of_month, 10);
    if (!Number.isInteger(day) || day < 1 || day > 31) return false;
  }
  return true;
}

function remainingAmount(row) {
  if (row.monthly_payment == null) return null;
  return Math.max(0, parseFloat(row.total_amount) - parseFloat(row.monthly_payment) * (row.payments_made ?? 0));
}

function monthsLeft(row) {
  if (row.period_months == null) return null;
  return Math.max(0, row.period_months - (row.payments_made ?? 0));
}

function MiniStat({ label, value, color, muted, text }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 9.5, fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: color ?? text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </span>
    </div>
  );
}

export default function InstallmentsPanel({ desktop = false, addSignal, onSaved }) {
  const bg = HOME_SURFACE, border = HOME_DIVIDER, text = HOME_TEXT, muted = HOME_MUTED;
  const faint = `color-mix(in srgb, ${text} 5%, ${bg})`;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [availableCash, setAvailableCash] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [editingId, setEditingId] = useState(null); // null while adding, row id while editing
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [rowError, setRowError] = useState("");

  function load() {
    setLoading(true);
    setLoadFailed(false);
    getInstallments().then(r => setRows(r.data)).catch(() => setLoadFailed(true)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  // Fetched once, shared by each row's Impact stat and the form's gauge preview.
  useEffect(() => {
    let cancelled = false;
    getSpendableSurplus()
      .then(res => { if (!cancelled) setAvailableCash(parseFloat(res.data.free_to_allocate)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function rowImpact(row) {
    if (row.monthly_payment == null || availableCash == null) return null;
    return computeGaugeStatus(row.monthly_payment, availableCash);
  }

  const hints = computeTermOptions(draft.total_amount);
  const preview = draft.total_amount && draft.period_months ? computeMonthlyPayment(draft.total_amount, draft.period_months) : null;
  const gaugeInfo = preview != null && availableCash != null ? computeGaugeStatus(preview, availableCash) : null;

  function openAdd() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setFormError("");
    setShowAddCard(true);
  }

  const prevAddSignal = useRef(addSignal);
  useEffect(() => {
    if (addSignal !== prevAddSignal.current) {
      prevAddSignal.current = addSignal;
      openAdd();
    }
  }, [addSignal]);

  function openEdit(row) {
    setEditingId(row.id);
    setDraft({
      name: row.name,
      total_amount: String(row.total_amount),
      period_months: row.period_months != null ? String(row.period_months) : "",
      day_of_month: row.day_of_month != null ? String(row.day_of_month) : "",
    });
    setFormError("");
    setShowForm(true);
    setShowAddCard(false);
    setDeleteConfirmId(null);
  }

  function closeForm() {
    setShowForm(false);
    setShowAddCard(false);
    setFormError("");
  }

  function handleFormDelete() {
    if (deleteConfirmId !== editingId) {
      setDeleteConfirmId(editingId);
      setTimeout(() => setDeleteConfirmId(prev => prev === editingId ? null : prev), 3000);
      return;
    }
    const id = editingId;
    closeForm();
    handleDelete(id);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!isDraftValid(draft) || saving) return;
    setSaving(true);
    setFormError("");
    const payload = {
      name: draft.name.trim(),
      total_amount: parseFloat(draft.total_amount),
      period_months: draft.period_months === "" ? null : parseInt(draft.period_months, 10),
      day_of_month: draft.day_of_month === "" ? null : parseInt(draft.day_of_month, 10),
    };
    try {
      if (editingId == null) {
        const res = await createInstallment(payload);
        setRows(prev => [...prev, res.data]);
      } else {
        const res = await updateInstallment(editingId, payload);
        setRows(prev => prev.map(r => r.id === editingId ? res.data : r));
      }
      onSaved?.();
      closeForm();
    } catch (err) {
      setFormError(err.response?.data?.detail ?? "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(prev => prev === id ? null : prev), 3000);
      return;
    }
    setDeleteConfirmId(null);

    const previous = rows.find(r => r.id === id);
    // Drops it from the list immediately.
    setRows(prev => prev.filter(r => r.id !== id));

    try {
      await deleteInstallment(id);
      onSaved?.();
    } catch {
      if (previous) setRows(prev => [...prev, previous]);
      setRowError("Failed to delete — try again");
      setTimeout(() => setRowError(""), 3000);
    }
  }

  const fieldStyle = {
    width: "100%", borderRadius: 8, padding: "7px 9px", fontSize: 13,
    border: `1px solid ${border}`, backgroundColor: bg, color: text,
    boxSizing: "border-box", outline: "none",
  };
  const labelStyle = { fontSize: 10, color: muted, marginBottom: 3, paddingLeft: 2 };

  // Shared add/edit form, same JSX in the sidebar list or the desktop grid.
  const formNode = (
    <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 12, border: `1px solid ${border}`, backgroundColor: faint }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <p style={{ ...labelStyle, marginBottom: 0, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {editingId == null ? "New Installment" : "Edit Installment"}
        </p>
        {gaugeInfo && <InstallmentGauge ratio={gaugeInfo.ratio} status={gaugeInfo.status} size={64} />}
      </div>
      <div>
        <p style={labelStyle}>Name</p>
        <input autoFocus type="text" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="e.g. Car Loan" style={fieldStyle} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={labelStyle}>Total amount</p>
          <CurrencyInput value={draft.total_amount} onChange={v => setDraft(d => ({ ...d, total_amount: v }))} placeholder="0.00" style={fieldStyle} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={labelStyle}>Term (months)</p>
          <input type="number" min="1" max="480" value={draft.period_months} onChange={e => setDraft(d => ({ ...d, period_months: e.target.value }))} placeholder="optional" style={fieldStyle} />
        </div>
      </div>
      {hints.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {hints.map(h => {
            const active = parseInt(draft.period_months, 10) === h.period_months;
            return (
              <button
                key={h.period_months} type="button"
                onClick={() => setDraft(d => ({ ...d, period_months: String(h.period_months) }))}
                style={{ padding: "4px 8px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: active ? "#000" : muted, backgroundColor: active ? HOME_INCOME : "rgba(255,255,255,0.06)" }}
              >
                {h.period_months}mo · {fmt(h.monthly_payment)}
              </button>
            );
          })}
        </div>
      )}
      <div>
        <p style={labelStyle}>Due day (optional)</p>
        <input type="number" min="1" max="31" value={draft.day_of_month} onChange={e => setDraft(d => ({ ...d, day_of_month: e.target.value }))} placeholder="e.g. 15" style={fieldStyle} />
      </div>
      {preview != null && (
        <p style={{ fontSize: 11, color: muted, margin: 0 }}>= {fmt(preview)}/mo</p>
      )}
      {formError && <p style={{ fontSize: 11, color: HOME_EXPENSE, margin: 0 }}>{formError}</p>}
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" onClick={closeForm}
          style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1px solid ${border}`, background: "transparent", color: muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >Cancel</button>
        <button type="submit" disabled={!isDraftValid(draft) || saving}
          style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1px solid ${HOME_INCOME}`, backgroundColor: `color-mix(in srgb, ${HOME_INCOME} 15%, transparent)`, color: HOME_INCOME, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: isDraftValid(draft) ? 1 : 0.5 }}
        >{saving ? "Saving…" : editingId == null ? "Add" : "Save"}</button>
      </div>
      {editingId != null && (
        <button
          type="button"
          onClick={handleFormDelete}
          style={{
            marginTop: 2, paddingTop: 12, borderTop: `1px solid ${border}`, borderRadius: 0,
            background: "transparent", color: deleteConfirmId === editingId ? HOME_EXPENSE : muted,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          {deleteConfirmId === editingId ? "Tap again to confirm delete" : "Delete installment"}
        </button>
      )}
    </form>
  );

  const editDeleteButtons = (row) => (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
      <button onClick={() => openEdit(row)} aria-label="Edit installment" style={{ color: muted, background: "none", border: "none", cursor: "pointer", padding: 3, display: "inline-flex" }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
        </svg>
      </button>
      <button onClick={() => handleDelete(row.id)} aria-label="Delete installment" style={{ color: deleteConfirmId === row.id ? HOME_EXPENSE : muted, background: "none", border: "none", cursor: "pointer", padding: 3, display: "inline-flex" }}>
        {deleteConfirmId === row.id ? (
          <span style={{ fontSize: 11, fontWeight: 600 }}>Confirm?</span>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
          </svg>
        )}
      </button>
    </div>
  );

  if (desktop) {
    const termedRows = rows.filter(r => r.period_months != null);
    const totalMonthly = termedRows.reduce((s, r) => s + parseFloat(r.monthly_payment ?? 0), 0);
    const totalRemaining = termedRows.reduce((s, r) => s + (remainingAmount(r) ?? 0), 0);

    return (
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 24, color: text }}>
        {rowError && <p style={{ fontSize: 12, color: HOME_EXPENSE, margin: 0 }}>{rowError}</p>}

        {loading ? (
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-2xl px-5 py-4" style={{ backgroundColor: bg }}>
                <Skel w="60%" h={11} />
                <Skel w="50%" h={22} style={{ marginTop: 8 }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-2xl px-5 py-4" style={{ backgroundColor: bg }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: muted, margin: 0 }}>TOTAL MONTHLY</p>
              <p style={{ fontSize: 22, fontWeight: 700, color: text, margin: "4px 0 0", fontVariantNumeric: "tabular-nums" }}>{fmt(totalMonthly)}</p>
              <p style={{ fontSize: 11.5, color: muted, margin: "3px 0 0" }}>{rows.length} installment{rows.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="rounded-2xl px-5 py-4" style={{ backgroundColor: bg }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: muted, margin: 0 }}>TOTAL REMAINING</p>
              <p style={{ fontSize: 22, fontWeight: 700, color: text, margin: "4px 0 0", fontVariantNumeric: "tabular-nums" }}>{fmt(totalRemaining)}</p>
              <p style={{ fontSize: 11.5, color: muted, margin: "3px 0 0" }}>Across all terms</p>
            </div>
            <div className="rounded-2xl px-5 py-4" style={{ backgroundColor: bg }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: muted, margin: 0 }}>AVAILABLE CASH</p>
              <p style={{ fontSize: 22, fontWeight: 700, color: HOME_INCOME, margin: "4px 0 0", fontVariantNumeric: "tabular-nums" }}>{availableCash != null ? fmt(availableCash) : "—"}</p>
              <p style={{ fontSize: 11.5, color: muted, margin: "3px 0 0" }}>Used for each card's impact</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {[...Array(3)].map((_, i) => <Skel key={i} h={148} style={{ borderRadius: 16, opacity: 1 - i * 0.15 }} />)}
          </div>
        ) : loadFailed ? (
          <div style={{ textAlign: "center", padding: "28px 16px", border: `1px dashed ${border}`, borderRadius: 16 }}>
            <p style={{ fontSize: 13, color: muted, marginBottom: 10 }}>Couldn't load installments</p>
            <button
              onClick={load}
              style={{ fontSize: 13, fontWeight: 700, padding: "7px 16px", borderRadius: 10, border: "none", color: "#fff", backgroundColor: HOME_INCOME, cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        ) : rows.length === 0 && !showAddCard ? (
          <div style={{ textAlign: "center", padding: "28px 16px", border: `1px dashed ${border}`, borderRadius: 16 }}>
            <p style={{ fontSize: 13, color: muted, margin: 0 }}>No installments yet - use the + above to add one</p>
          </div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16, alignItems: "start" }}>
            <style>{`
              @keyframes ip-card-in {
                from { opacity: 0; transform: translateY(-6px); }
                to   { opacity: 1; transform: translateY(0); }
              }
            `}</style>
            {showAddCard && (
              <div style={{ animation: "ip-card-in 0.2s ease-out" }}>{formNode}</div>
            )}
            {rows.map(row => {
              const impact = rowImpact(row);
              const barColor = impact ? STATUS_COLOR[impact.status] : muted;
              const barPct = impact ? Math.min(100, Math.round((impact.ratio ?? 1) * 100)) : 0;
              return (
                <div
                  key={row.id}
                  className="rounded-2xl p-5"
                  onClick={() => openEdit(row)}
                  style={{ backgroundColor: bg, minHeight: 148, display: "flex", flexDirection: "column", gap: 14, cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: 15, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</p>
                      <p style={{ color: muted, margin: "3px 0 0", fontSize: 12 }}>
                        {row.day_of_month != null ? `Due ${ordinal(row.day_of_month)}` : "No due day set"}
                      </p>
                    </div>
                  </div>
                  {row.period_months != null ? (
                    <div>
                      <p style={{ fontSize: 24, fontWeight: 700, color: text, margin: 0, fontVariantNumeric: "tabular-nums" }}>
                        {fmt(row.monthly_payment)}<span style={{ fontSize: 13, fontWeight: 600, color: muted }}>/mo</span>
                      </p>
                      <div style={{ height: 5, borderRadius: 999, backgroundColor: `color-mix(in srgb, ${text} 10%, transparent)`, marginTop: 10, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${barPct}%`, borderRadius: 999, backgroundColor: barColor, transition: "width 400ms ease" }} />
                      </div>
                      <p style={{ fontSize: 12, color: muted, margin: "8px 0 0" }}>
                        {monthsLeft(row)} mo left · {fmt(remainingAmount(row))} of {fmt(row.total_amount)} remaining
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: 24, fontWeight: 700, color: text, margin: 0, fontVariantNumeric: "tabular-nums" }}>{fmt(row.total_amount)}</p>
                      <p style={{ fontSize: 12, color: muted, margin: "8px 0 0" }}>No term set</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {showForm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={e => { if (e.target === e.currentTarget) closeForm(); }}
          >
            <div className="w-full max-w-sm">{formNode}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "16px 20px 32px", display: "flex", flexDirection: "column", gap: 20, color: text }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ ...labelStyle, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 0 }}>Installments</p>
        {!showForm && !showAddCard && (
          <button onClick={openAdd} style={{ fontSize: 11, fontWeight: 600, color: muted, background: "none", border: "none", cursor: "pointer" }}>
            + Add
          </button>
        )}
      </div>

      {rowError && <p style={{ fontSize: 11, color: HOME_EXPENSE, margin: 0 }}>{rowError}</p>}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...Array(3)].map((_, i) => <Skel key={i} h={64} style={{ borderRadius: 10, opacity: 1 - i * 0.15 }} />)}
        </div>
      ) : loadFailed ? (
        <div style={{ textAlign: "center", padding: "20px 12px", border: `1px dashed ${border}`, borderRadius: 12 }}>
          <p style={{ fontSize: 13, color: muted, marginBottom: 10 }}>Couldn't load installments</p>
          <button
            onClick={load}
            style={{ fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 8, border: `1px solid ${HOME_INCOME}`, color: HOME_INCOME, backgroundColor: `color-mix(in srgb, ${HOME_INCOME} 12%, transparent)`, cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          {rows.length === 0 && !showForm && !showAddCard && (
            <div style={{ textAlign: "center", padding: "20px 12px", border: `1px dashed ${border}`, borderRadius: 12 }}>
              <p style={{ fontSize: 13, color: muted, marginBottom: 10 }}>No installments yet</p>
              <button
                onClick={openAdd}
                style={{ fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 8, border: `1px solid ${HOME_INCOME}`, color: HOME_INCOME, backgroundColor: `color-mix(in srgb, ${HOME_INCOME} 12%, transparent)`, cursor: "pointer" }}
              >
                Add an Installment
              </button>
            </div>
          )}

          {rows.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rows.map(row => {
                const impact = rowImpact(row);
                return (
                  <div key={row.id} style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${border}`, backgroundColor: faint }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 600, margin: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</p>
                        <p style={{ color: muted, margin: "2px 0 0", fontSize: 11 }}>
                          {row.day_of_month != null ? `Due ${ordinal(row.day_of_month)}` : "No due day set"}
                        </p>
                      </div>
                      {editDeleteButtons(row)}
                    </div>
                    {row.period_months != null ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${border}` }}>
                        <MiniStat label="Total" value={fmt(row.total_amount)} muted={muted} text={text} />
                        <MiniStat label="Payment" value={`${fmt(row.monthly_payment)}/mo`} muted={muted} text={text} />
                        <MiniStat
                          label="Impact"
                          value={impact ? `${Math.round(Math.min(impact.ratio ?? 1, 9.99) * 100)}%` : "—"}
                          color={impact ? STATUS_COLOR[impact.status] : undefined}
                          muted={muted} text={text}
                        />
                        <MiniStat label="Left" value={`${monthsLeft(row)} mo`} muted={muted} text={text} />
                        <MiniStat label="Amount left" value={fmt(remainingAmount(row))} muted={muted} text={text} />
                      </div>
                    ) : (
                      <p style={{ fontSize: 11, color: muted, margin: "8px 0 0" }}>Total {fmt(row.total_amount)} · No term set</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {(showForm || showAddCard) && formNode}
        </>
      )}
    </div>
  );
}
