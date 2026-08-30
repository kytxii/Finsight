import { useState, useEffect, useRef } from "react";
import SwipeableRow from "./SwipeableRow";
import CurrencyInput from "../shared/CurrencyInput";
import InstallmentGauge from "../shared/InstallmentGauge";
import MobileInstallmentCardSkeleton from "../skeletons/mobile/MobileInstallmentCardSkeleton";
import { fmt } from "../../utils/finance";
import { computeTermOptions, computeMonthlyPayment, computeGaugeStatus } from "../../utils/installmentMath";
import {
  getInstallments,
  createInstallment,
  updateInstallment,
  deleteInstallment,
} from "../../api/installments";
import { getSpendableSurplus } from "../../api/paychecks";
import { useSheetDrag, SHEET_EASE } from "../../hooks/useSheetDrag";
import {
  HOME_TEXT, HOME_MUTED, HOME_SURFACE, HOME_DIVIDER, HOME_EXPENSE, HOME_INCOME, HOME_ACCENT,
  GAUGE_DARK_GREEN, GAUGE_GREEN, GAUGE_YELLOW, GAUGE_ORANGE, GAUGE_RED, TILE_COLOR, ACCENT,
} from "../shared/categoryVisuals";

const EMPTY_DRAFT = { name: "", total_amount: "", period_months: "", day_of_month: "" };

const STATUS_COLOR = { dark_green: GAUGE_DARK_GREEN, green: GAUGE_GREEN, yellow: GAUGE_YELLOW, orange: GAUGE_ORANGE, red: GAUGE_RED };

const EXIT_MS = 260;

function isDraftValid(d) {
  const hasName = d.name.trim() !== "";
  const hasAmount = parseFloat(d.total_amount) > 0;
  if (!hasName || !hasAmount) return false;

  if (d.period_months !== "") {
    const months = parseInt(d.period_months, 10);
    if (!Number.isInteger(months) || months < 1 || months > 480) return false;
  }

  if (d.day_of_month !== "") {
    const day = parseInt(d.day_of_month, 10);
    if (!Number.isInteger(day) || day < 1 || day > 31) return false;
  }

  return true;
}

function ordinal(n) {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : (["th", "st", "nd", "rd"][v % 10] ?? "th");
  return `${n}${suffix}`;
}

function capitalizeWords(str) {
  return str.replace(/(^|\s)([a-z])/g, (_, prefix, letter) => prefix + letter.toUpperCase());
}

const fieldStyle = {
  width: "100%", borderRadius: 10, padding: "9px 11px", fontSize: 15,
  border: `1px solid ${HOME_DIVIDER}`, backgroundColor: "rgba(255,255,255,0.04)", color: HOME_TEXT,
  boxSizing: "border-box", outline: "none", colorScheme: "dark",
};
const labelStyle = { fontSize: 11, color: HOME_MUTED, marginBottom: 4, paddingLeft: 2 };

function IconInstallment() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}

function IconGauge() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21a9 9 0 1 1 9-9" />
      <path d="M12 12 16 8" />
    </svg>
  );
}

function dueSubtitle(row) {
  return row.day_of_month != null ? `Due ${ordinal(row.day_of_month)}` : "No due day set";
}

function remainingAmount(row) {
  if (row.monthly_payment == null) return null;
  return Math.max(0, parseFloat(row.total_amount) - parseFloat(row.monthly_payment) * (row.payments_made ?? 0));
}

function monthsLeft(row) {
  if (row.period_months == null) return null;
  return Math.max(0, row.period_months - (row.payments_made ?? 0));
}

function Stat({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: HOME_MUTED, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </span>
      <span style={{
        fontSize: 13.5, fontWeight: 700, color: color ?? HOME_TEXT, fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {value}
      </span>
    </div>
  );
}

function EditSheet({ draft, setDraft, mode, saving, error, onCancel, onSave, onDelete, deleteConfirm }) {
  const valid = isDraftValid(draft);
  const hints = computeTermOptions(draft.total_amount);
  const preview = draft.total_amount && draft.period_months
    ? computeMonthlyPayment(draft.total_amount, draft.period_months)
    : null;

  const [pickMode, setPickMode] = useState("term"); // "term" | "payment"

  const [savings, setSavings] = useState({ status: "loading", value: null });
  useEffect(() => {
    let cancelled = false;
    getSpendableSurplus()
      .then(res => { if (!cancelled) setSavings({ status: "ready", value: parseFloat(res.data.free_to_allocate) }); })
      .catch(() => { if (!cancelled) setSavings({ status: "unavailable", value: null }); });
    return () => { cancelled = true; };
  }, []);

  const totalAmountNum = parseFloat(draft.total_amount);
  const paymentFieldValue = draft.period_months
    ? String(computeMonthlyPayment(draft.total_amount, draft.period_months))
    : "";
  function handlePaymentFieldChange(v) {
    if (v === "" || !(totalAmountNum > 0) || !(parseFloat(v) > 0)) {
      setDraft(d => ({ ...d, period_months: "" }));
      return;
    }
    const months = Math.ceil(totalAmountNum / parseFloat(v));
    setDraft(d => ({ ...d, period_months: String(months) }));
  }

  function tileColor(monthlyPayment) {
    if (savings.status !== "ready") return HOME_TEXT;
    const { status } = computeGaugeStatus(monthlyPayment, savings.value);
    return STATUS_COLOR[status];
  }

  const gaugeInfo = (preview != null && savings.status === "ready")
    ? computeGaugeStatus(preview, savings.value)
    : null;

  const [closing, setClosing] = useState(false);
  const requestClose = () => setClosing(true);
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(onCancel, EXIT_MS);
    return () => clearTimeout(timer);
  }, [closing, onCancel]);
  const { dragY, dragging, handlers } = useSheetDrag(requestClose);

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 60, backgroundColor: "rgba(0,0,0,0.5)" }} onClick={requestClose} />
      <style>{`@keyframes installment-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 61,
        backgroundColor: HOME_SURFACE, borderRadius: "20px 20px 0 0",
        padding: "10px 20px calc(env(safe-area-inset-bottom, 0px) + 20px)",
        display: "flex", flexDirection: "column", gap: 12,
        transform: closing ? "translateY(100%)" : dragging ? `translateY(${dragY}px)` : undefined,
        animation: dragging || closing ? undefined : "installment-sheet-up 0.26s cubic-bezier(0.32, 0.72, 0, 1)",
        transition: dragging ? "none" : `transform ${EXIT_MS}ms ${SHEET_EASE}`,
      }}>
        <div {...handlers} style={{ touchAction: "none" }}>
          <div style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: HOME_DIVIDER, margin: "2px auto 4px", cursor: "grab" }} />
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: HOME_TEXT, paddingTop: gaugeInfo ? 12 : 0 }}>
              {mode === "add" ? "New Installment" : "Edit Installment"}
            </p>
            {gaugeInfo && (
              <div style={{ margin: "-8px -6px 0 0" }}>
                <InstallmentGauge ratio={gaugeInfo.ratio} status={gaugeInfo.status} size={84} />
              </div>
            )}
          </div>
        </div>

        <div>
          <p style={labelStyle}>Name</p>
          <input
            autoFocus={mode === "add"}
            type="text"
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: capitalizeWords(e.target.value) }))}
            placeholder="e.g. Car Loan"
            style={fieldStyle}
          />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={labelStyle}>Total amount</p>
            <CurrencyInput
              value={draft.total_amount}
              onChange={v => setDraft(d => ({ ...d, total_amount: v }))}
              placeholder="0.00"
              style={fieldStyle}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={labelStyle}>{pickMode === "term" ? "Term (optional)" : "Target payment"}</p>
            {pickMode === "term" ? (
              <input
                type="number" min="1" max="480"
                value={draft.period_months}
                onChange={e => setDraft(d => ({ ...d, period_months: e.target.value }))}
                placeholder="months"
                style={fieldStyle}
              />
            ) : (
              <CurrencyInput
                value={paymentFieldValue}
                onChange={handlePaymentFieldChange}
                placeholder="0.00"
                style={fieldStyle}
              />
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setPickMode("term")}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 10, border: "none", cursor: "pointer",
              fontSize: 13.5, fontWeight: 700,
              color: pickMode === "term" ? "#fff" : HOME_MUTED,
              backgroundColor: pickMode === "term" ? HOME_ACCENT : "rgba(255,255,255,0.06)",
            }}
          >By Term</button>
          <button type="button" onClick={() => setPickMode("payment")}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 10, border: "none", cursor: "pointer",
              fontSize: 13.5, fontWeight: 700,
              color: pickMode === "payment" ? "#fff" : HOME_MUTED,
              backgroundColor: pickMode === "payment" ? HOME_ACCENT : "rgba(255,255,255,0.06)",
            }}
          >By Payment</button>
        </div>

        <div>
          <p style={labelStyle}>Due day (optional)</p>
          <input
            type="number" min="1" max="31"
            value={draft.day_of_month}
            onChange={e => setDraft(d => ({ ...d, day_of_month: e.target.value }))}
            placeholder="e.g. 15"
            style={fieldStyle}
          />
        </div>

        {preview != null && (
          <p style={{ fontSize: 12, color: pickMode === "payment" ? tileColor(preview) : HOME_MUTED, margin: "-6px 0 0 2px" }}>
            {pickMode === "payment" ? `≈ ${draft.period_months} mo at ${fmt(preview)}/mo` : `= ${fmt(preview)}/mo`}
          </p>
        )}

        {gaugeInfo && (
          <p style={{ fontSize: 11.5, color: HOME_MUTED, margin: "-6px 0 0 2px" }}>
            <span style={{ fontWeight: 700, color: STATUS_COLOR[gaugeInfo.status] }}>
              {Math.round(Math.min(gaugeInfo.ratio, 9.99) * 100)}%
            </span>
            {` of ${fmt(savings.value)} available · ${fmt(savings.value - preview)} left`}
          </p>
        )}

        {hints.length > 0 && (
          <div>
            <p style={labelStyle}>{pickMode === "term" ? "Or pick a term" : "Or pick a payment"}</p>
            {pickMode === "payment" && savings.status === "unavailable" && (
              <p style={{ fontSize: 11, color: HOME_MUTED, margin: "0 0 6px 2px" }}>
                Set up a paycheck schedule to see affordability colors.
              </p>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {hints.map(h => {
                const active = parseInt(draft.period_months, 10) === h.period_months;
                const paymentColor = active ? "#fff" : tileColor(h.monthly_payment);
                return (
                  <button
                    key={h.period_months}
                    type="button"
                    onClick={() => setDraft(d => ({ ...d, period_months: String(h.period_months) }))}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                      padding: "10px 4px", borderRadius: 10, border: "none", cursor: "pointer",
                      backgroundColor: active ? HOME_ACCENT : "rgba(255,255,255,0.06)",
                    }}
                  >
                    {pickMode === "term" ? (
                      <>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: active ? "#fff" : HOME_TEXT }}>
                          {h.period_months} mo
                        </span>
                        <span style={{ fontSize: 11.5, fontWeight: 500, color: active ? "rgba(255,255,255,0.85)" : HOME_MUTED }}>
                          {fmt(h.monthly_payment)}/mo
                        </span>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: paymentColor }}>
                          {fmt(h.monthly_payment)}/mo
                        </span>
                        <span style={{ fontSize: 11.5, fontWeight: 500, color: active ? "rgba(255,255,255,0.85)" : HOME_MUTED }}>
                          {h.period_months} mo
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && <p style={{ fontSize: 12, color: HOME_EXPENSE, margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button type="button" onClick={requestClose}
            style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: "none", backgroundColor: "rgba(255,255,255,0.06)", color: HOME_MUTED, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >Cancel</button>
          <button type="button" onClick={onSave} disabled={!valid || saving}
            style={{
              flex: 2, padding: "10px 0", borderRadius: 12, border: "none",
              backgroundColor: HOME_INCOME, color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: valid && !saving ? 1 : 0.5,
            }}
          >{saving ? "Saving…" : mode === "add" ? "Add" : "Save"}</button>
        </div>

        {mode === "edit" && (
          <button type="button" onClick={onDelete}
            style={{
              marginTop: 16, paddingTop: 14, paddingBottom: 0,
              borderTop: `1px solid ${HOME_DIVIDER}`, borderRadius: 0,
              background: "transparent", color: HOME_EXPENSE, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >{deleteConfirm ? "Tap again to confirm delete" : "Delete"}</button>
        )}
      </div>
    </>
  );
}

function ComingSoonSheet({ onClose }) {
  const [closing, setClosing] = useState(false);
  const requestClose = () => setClosing(true);
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(onClose, EXIT_MS);
    return () => clearTimeout(timer);
  }, [closing, onClose]);
  const { dragY, dragging, handlers } = useSheetDrag(requestClose);

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 60, backgroundColor: "rgba(0,0,0,0.5)" }} onClick={requestClose} />
      <style>{`@keyframes installment-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 61,
        backgroundColor: HOME_SURFACE, borderRadius: "20px 20px 0 0",
        padding: "10px 20px calc(env(safe-area-inset-bottom, 0px) + 28px)",
        display: "flex", flexDirection: "column", gap: 10, alignItems: "center",
        transform: closing ? "translateY(100%)" : dragging ? `translateY(${dragY}px)` : undefined,
        animation: dragging || closing ? undefined : "installment-sheet-up 0.26s cubic-bezier(0.32, 0.72, 0, 1)",
        transition: dragging ? "none" : `transform ${EXIT_MS}ms ${SHEET_EASE}`,
      }}>
        <div {...handlers} style={{ touchAction: "none", alignSelf: "stretch" }}>
          <div style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: HOME_DIVIDER, margin: "2px auto 4px", cursor: "grab" }} />
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: HOME_TEXT }}>Gain Insight</p>
        </div>

        <p style={{ fontSize: 13, color: HOME_MUTED, textAlign: "center", padding: "16px 8px" }}>
          AI-powered insights for this installment are coming soon.
        </p>

        <button type="button" onClick={requestClose}
          style={{ marginTop: 8, width: "100%", padding: "10px 0", borderRadius: 12, border: "none", backgroundColor: "rgba(255,255,255,0.06)", color: HOME_MUTED, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >Close</button>
      </div>
    </>
  );
}

export default function MobileInstallments({ onSaved, openAddSignal }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [openId, setOpenId] = useState(null);
  const [listError, setListError] = useState("");

  const [sheet, setSheet] = useState(null); // null | { mode: "add" | "edit", id?, draft }
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [insightsId, setInsightsId] = useState(null);

  const prevSignal = useRef(openAddSignal);

  function loadInstallments() {
    setLoading(true);
    setLoadFailed(false);
    getInstallments()
      .then(r => setRows(r.data))
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }

  useEffect(loadInstallments, []);

  const [availableCash, setAvailableCash] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getSpendableSurplus()
      .then(res => { if (!cancelled) setAvailableCash(parseFloat(res.data.free_to_allocate)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function rowRate(row) {
    if (row.monthly_payment == null || availableCash == null) return null;
    return computeGaugeStatus(row.monthly_payment, availableCash);
  }

  // Bumped by the parent's "+" button to request the add sheet.
  useEffect(() => {
    if (openAddSignal !== prevSignal.current) {
      prevSignal.current = openAddSignal;
      openAdd();
    }
  }, [openAddSignal]);

  function openAdd() {
    setSheet({ mode: "add", draft: { ...EMPTY_DRAFT } });
    setSheetError("");
    setDeleteConfirm(false);
  }

  function openEdit(row) {
    setSheet({
      mode: "edit",
      id: row.id,
      draft: {
        name: row.name,
        total_amount: String(row.total_amount),
        period_months: row.period_months != null ? String(row.period_months) : "",
        day_of_month: row.day_of_month != null ? String(row.day_of_month) : "",
      },
    });
    setSheetError("");
    setDeleteConfirm(false);
  }

  function closeSheet() {
    setSheet(null);
    setSheetError("");
    setDeleteConfirm(false);
  }

  function setDraft(fn) {
    setSheet(s => s ? { ...s, draft: fn(s.draft) } : s);
  }

  async function handleSheetSave() {
    if (!sheet || !isDraftValid(sheet.draft) || saving) return;
    setSaving(true);
    setSheetError("");
    const d = sheet.draft;
    const payload = {
      name: d.name.trim(),
      total_amount: parseFloat(d.total_amount),
      period_months: d.period_months === "" ? null : parseInt(d.period_months, 10),
      day_of_month: d.day_of_month === "" ? null : parseInt(d.day_of_month, 10),
    };
    try {
      if (sheet.mode === "add") {
        const res = await createInstallment(payload);
        setRows(prev => [...prev, res.data]);
      } else {
        const res = await updateInstallment(sheet.id, payload);
        setRows(prev => prev.map(r => r.id === sheet.id ? res.data : r));
      }
      onSaved?.();
      closeSheet();
    } catch (err) {
      setSheetError(err.response?.data?.detail ?? "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  function handleSheetDelete() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3000);
      return;
    }
    const id = sheet.id;
    closeSheet();
    handleDelete(id);
  }

  async function handleDelete(id) {
    setDeletingIds(s => new Set(s).add(id));
    try {
      await deleteInstallment(id);
      setRows(prev => prev.filter(r => r.id !== id));
      onSaved?.();
    } catch {
      setListError("Failed to delete — try again");
      setTimeout(() => setListError(""), 3000);
    } finally {
      setDeletingIds(s => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "16px 16px 32px", color: HOME_TEXT }}>
      {openId !== null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 5 }} onTouchStart={() => setOpenId(null)} onClick={() => setOpenId(null)} />
      )}

      {listError && (
        <p style={{ fontSize: 12, color: HOME_EXPENSE, margin: "0 4px 10px" }}>{listError}</p>
      )}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[...Array(3)].map((_, i) => (
            <MobileInstallmentCardSkeleton key={i} opacity={1 - i * 0.15} />
          ))}
        </div>
      ) : loadFailed ? (
        <div style={{ textAlign: "center", padding: "28px 16px", borderRadius: 16, border: `1px dashed ${HOME_DIVIDER}` }}>
          <p style={{ fontSize: 13, color: HOME_MUTED, margin: "0 0 10px" }}>Couldn't load your installments</p>
          <button
            onClick={loadInstallments}
            style={{
              fontSize: 13, fontWeight: 700, padding: "7px 16px", borderRadius: 10,
              border: "none", color: "#fff", backgroundColor: HOME_ACCENT,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "28px 16px", borderRadius: 16, border: `1px dashed ${HOME_DIVIDER}` }}>
          <p style={{ fontSize: 13, color: HOME_MUTED, margin: "0 0 10px" }}>No installments yet</p>
          <button
            onClick={openAdd}
            style={{
              fontSize: 13, fontWeight: 700, padding: "7px 16px", borderRadius: 10,
              border: "none", color: "#fff", backgroundColor: HOME_INCOME,
              cursor: "pointer",
            }}
          >
            Add an Installment
          </button>
        </div>
      ) : (
        <div>
          <div style={{ backgroundColor: HOME_SURFACE, borderRadius: 18, overflow: "hidden" }}>
            {rows.map((row, i) => {
              const isDeleting = deletingIds.has(row.id);
              return (
                <div key={row.id} style={{ opacity: isDeleting ? 0.35 : 1, transition: "opacity 0.2s ease", pointerEvents: isDeleting ? "none" : "auto" }}>
                  <SwipeableRow
                    id={row.id}
                    openId={openId}
                    setOpenId={setOpenId}
                    onEdit={() => openEdit(row)}
                    onDelete={() => handleDelete(row.id)}
                    border={i === 0 ? "transparent" : HOME_DIVIDER}
                    surface={HOME_SURFACE}
                    text={HOME_TEXT}
                    editBg={HOME_ACCENT}
                    editColor="#fff"
                    deleteBg={HOME_EXPENSE}
                    deleteColor="#fff"
                  >
                    <div
                      onClick={() => openEdit(row)}
                      style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px 14px", backgroundColor: HOME_SURFACE, cursor: "pointer" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{
                          flex: "0 0 auto", width: 44, height: 44, borderRadius: "50%", background: TILE_COLOR.DEBT,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16)",
                        }}>
                          <IconInstallment />
                        </div>
                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                          <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.2px", color: HOME_TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {row.name}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 500, color: HOME_MUTED }}>
                            {dueSubtitle(row)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setInsightsId(row.id); }}
                          style={{
                            flex: "0 0 auto", display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700,
                            padding: "5px 10px", borderRadius: 999, border: "none", cursor: "pointer",
                            color: ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 15%, transparent)`,
                          }}
                        >
                          <IconGauge /> Insight
                        </button>
                      </div>

                      {row.period_months != null ? (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, paddingTop: 10, borderTop: `1px solid ${HOME_DIVIDER}` }}>
                          <Stat label="Total" value={fmt(row.total_amount)} />
                          <Stat label="Term" value={`${row.period_months} mo`} />
                          <Stat
                            label="Impact"
                            value={rowRate(row) ? `~${Math.round(Math.min(rowRate(row).ratio ?? 1, 9.99) * 100)}%` : "—"}
                            color={rowRate(row) ? STATUS_COLOR[rowRate(row).status] : undefined}
                          />
                          <Stat label="Months left" value={`${monthsLeft(row)} mo`} />
                          <Stat label="Amount left" value={fmt(remainingAmount(row))} />
                          <Stat label="Payment" value={`${fmt(row.monthly_payment)}/mo`} />
                        </div>
                      ) : (
                        <p style={{ fontSize: 12, color: HOME_MUTED, margin: 0, paddingTop: 10, borderTop: `1px solid ${HOME_DIVIDER}` }}>
                          Total {fmt(row.total_amount)} · No term set
                        </p>
                      )}
                    </div>
                  </SwipeableRow>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sheet && (
        <EditSheet
          mode={sheet.mode}
          draft={sheet.draft}
          setDraft={setDraft}
          saving={saving}
          error={sheetError}
          onCancel={closeSheet}
          onSave={handleSheetSave}
          onDelete={handleSheetDelete}
          deleteConfirm={deleteConfirm}
        />
      )}

      {insightsId && (
        <ComingSoonSheet onClose={() => setInsightsId(null)} />
      )}
    </div>
  );
}
