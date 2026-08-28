import { useEffect, useRef, useState } from "react";
import { getCreditCardPayment, getPendingCharges, allocateCreditCardPayment } from "../../api/creditCard";
import { getTransactions } from "../../api/transactions";
import { CATEGORY_CONFIG, fmt } from "../../utils/finance";
import { getToday, getNow } from "../../utils/time";
import { HOME_SURFACE, HOME_DIVIDER, HOME_TEXT, HOME_MUTED, HOME_INCOME, HOME_EXPENSE, FIELD, CATEGORY_ACCENT } from "./categoryVisuals";
import CurrencyInput from "./CurrencyInput";
import Skel from "./Skel";

// A credit card charge is money going out to something chargeable - income,
// reimbursements, tips, and savings moves aren't things you'd ever put on a
// card, so they're left out of this picker entirely.
const CC_EXCLUDED_CATEGORIES = new Set(["INCOME", "REIMBURSEMENT", "TIPS", "SAVINGS"]);
const CATEGORY_OPTIONS = Object.entries(CATEGORY_CONFIG)
  .filter(([key]) => !CC_EXCLUDED_CATEGORIES.has(key))
  .map(([key, { label }]) => ({ value: key, label }));
const EXIT_MS = 240;
const EMPTY_NEW_CHARGE = { name: "", total_amount: "", category: "EXPENSE", charge_date: "" };

// Payments created from the "+" floating panel are always named this - keep
// them out of the "Existing transactions" picker below (#54).
const DEFAULT_PAYMENT_NAME = "Credit Card Payment";

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function IconChevron({ dir = "left", size = 15 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

// Shared allocation form + charge list, rendered inside whichever chrome
// (desktop side panel / mobile bottom sheet) the caller wraps it in.
function CreditCardPaymentBody({ paymentId, mobile, onChanged }) {
  const border = HOME_DIVIDER, text = HOME_TEXT, muted = HOME_MUTED, input = FIELD;
  const inputStyle = { backgroundColor: input, borderColor: border, color: text };
  const fieldClass = "w-full rounded-xl px-3.5 py-2.5 text-sm focus:outline-none border";

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState([]);

  const [mode, setMode] = useState("new"); // "new" | "transaction"
  const [draft, setDraft] = useState({ ...EMPTY_NEW_CHARGE, charge_date: getToday() });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Continue-a-pending-charge is a small secondary affordance, not a tab.
  const [selectedChargeId, setSelectedChargeId] = useState("");

  // "Existing transactions" mode: browse by month instead of a flat search.
  const [monthOffset, setMonthOffset] = useState(0);
  const [txnOptions, setTxnOptions] = useState(null); // null = not loaded yet
  const [txnLoadFailed, setTxnLoadFailed] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  const lastPickRef = useRef(0);

  function load() {
    setLoading(true);
    setLoadError(false);
    Promise.all([getCreditCardPayment(paymentId), getPendingCharges()])
      .then(([p, pc]) => {
        setDetail(p.data);
        setPending(pc.data);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }
  useEffect(load, [paymentId]);

  const left = detail ? parseFloat(detail.left) : 0;
  const otherPending = pending.filter((c) => !detail?.charges.some((existing) => existing.id === c.id));

  function resetForm() {
    setDraft({ ...EMPTY_NEW_CHARGE, charge_date: getToday() });
    setSelectedChargeId("");
    setFormError("");
  }

  function refreshAfterAllocate(res) {
    setDetail(res.data);
    resetForm();
    onChanged?.();
    getPendingCharges().then((pc) => setPending(pc.data));
  }

  async function handleAllocate(e) {
    e.preventDefault();
    if (saving) return;
    const totalAmount = parseFloat(draft.total_amount);
    if (draft.name.trim() === "" || !(totalAmount > 0) || !draft.charge_date) return;
    setFormError("");
    setSaving(true);
    try {
      // Applies as much as this payment can cover - if the charge is bigger
      // than what's left, the rest rolls over (see the note under the form)
      // instead of being rejected outright.
      refreshAfterAllocate(await allocateCreditCardPayment(paymentId, {
        name: draft.name.trim(),
        total_amount: totalAmount,
        category: draft.category,
        charge_date: draft.charge_date,
        amount_applied: Math.min(totalAmount, left),
      }));
    } catch (err) {
      setFormError(err.response?.data?.detail ?? "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

// One click: apply as much as this payment can cover toward a charge that's
// already partly paid from elsewhere - "how much" is never asked, it's just
// whatever fits.
  async function handleContinuePending(charge) {
    if (saving) return;
    const amount = Math.min(parseFloat(charge.remaining), left);
    if (!(amount > 0)) return;
    setFormError("");
    setSaving(true);
    setSelectedChargeId(charge.id);
    try {
      refreshAfterAllocate(await allocateCreditCardPayment(paymentId, { charge_id: charge.id, amount_applied: amount }));
    } catch (err) {
      setFormError(err.response?.data?.detail ?? "Something went wrong");
    } finally {
      setSaving(false);
      setSelectedChargeId("");
    }
  }

  function switchMode(key) {
    setMode(key);
    setFormError("");
    if (key === "transaction" && txnOptions === null) {
      setTxnLoadFailed(false);
      getTransactions()
        .then((res) => setTxnOptions(res.data.filter((t) =>
          !t.credit_card_payment_id && !t.credit_card_charge_id
          && t.category === "EXPENSE"
          && t.name !== DEFAULT_PAYMENT_NAME
        )))
        .catch(() => setTxnLoadFailed(true));
    }
  }

  // Picking a transaction moves it out of the picker and onto the balance
  // instantly (optimistic), then confirms with the server in the background.
  // A 1s cooldown between picks keeps rapid clicks from spamming the API
  // without making any single pick feel slow (#54).
  async function pickTransaction(t) {
    const now = Date.now();
    if (now - lastPickRef.current < 1000) return;
    lastPickRef.current = now;
    setCoolingDown(true);
    setTimeout(() => setCoolingDown(false), 1000);
    setFormError("");

    const amount = parseFloat(t.amount);
    const prevDetail = detail;
    setTxnOptions((prev) => (prev ? prev.filter((o) => o.id !== t.id) : prev));
    setDetail((d) => ({
      ...d,
      paid: (parseFloat(d.paid) + amount).toFixed(2),
      left: (parseFloat(d.left) - amount).toFixed(2),
      charges: [
        ...d.charges,
        {
          id: `pending-${t.id}`, name: t.name, total_amount: amount, amount_paid: amount,
          category: t.category, charge_date: t.transaction_date, settled: true, settled_transaction_id: t.id,
        },
      ],
    }));

    try {
      const res = await allocateCreditCardPayment(paymentId, { transaction_id: t.id });
      setDetail(res.data);
      onChanged?.();
      getPendingCharges().then((pc) => setPending(pc.data));
    } catch (err) {
      setDetail(prevDetail);
      setTxnOptions((prev) => (prev ? [t, ...prev] : prev));
      setFormError(err.response?.data?.detail ?? "Something went wrong");
    }
  }

  const labelStyle = { fontSize: mobile ? 11 : 12, fontWeight: 600, color: muted, marginBottom: 5, display: "block" };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Skel h={64} style={{ borderRadius: 12 }} />
        <Skel h={100} style={{ borderRadius: 12 }} />
      </div>
    );
  }
  if (loadError || !detail) {
    return <p style={{ fontSize: 13, color: HOME_EXPENSE }}>Couldn't load this payment.</p>;
  }

  const monthDate = new Date(getNow().getFullYear(), getNow().getMonth() + monthOffset, 1);
  const monthLabel = monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const txnForMonth = (txnOptions ?? []).filter((t) => {
    const d = new Date(t.transaction_date + "T00:00:00");
    return d.getFullYear() === monthDate.getFullYear() && d.getMonth() === monthDate.getMonth() && t.amount <= left;
  }).sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: mobile ? 12 : 14 }}>
      <div>
        <p style={{ margin: 0, fontSize: mobile ? 15 : 16, fontWeight: 700, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail.name}</p>
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: muted }}>{formatDate(detail.payment_date)}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          ["Total", detail.total_amount, text],
          ["Paid", detail.paid, HOME_INCOME],
          ["Left", detail.left, left > 0 ? HOME_EXPENSE : muted],
        ].map(([label, value, color]) => (
          <div key={label} style={{ borderRadius: 12, border: `1px solid ${border}`, padding: "10px 12px" }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.04em", margin: 0 }}>{label}</p>
            <p style={{ fontSize: mobile ? 16 : 18, fontWeight: 700, color, margin: "3px 0 0", fontVariantNumeric: "tabular-nums" }}>{fmt(value)}</p>
          </div>
        ))}
      </div>

      <div style={{ height: 6, borderRadius: 999, backgroundColor: `color-mix(in srgb, ${text} 10%, transparent)`, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, (parseFloat(detail.paid) / Math.max(parseFloat(detail.total_amount), 0.01)) * 100)}%`,
            borderRadius: 999, backgroundColor: HOME_INCOME, transition: "width 300ms ease",
          }}
        />
      </div>

      <div>
        <p style={{ ...labelStyle, marginBottom: 8 }}>What this covers ({detail.charges.length})</p>
        {detail.charges.length === 0 ? (
          <p style={{ fontSize: 12.5, color: muted, margin: 0 }}>Nothing allocated yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: mobile ? 160 : 200, overflowY: "auto", paddingRight: 2 }}>
            {detail.charges.map((c) => {
              const catColor = CATEGORY_ACCENT[c.category] ?? muted;
              return (
                <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 10px", borderRadius: 10, border: `1px solid ${border}`, flexShrink: 0 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: catColor }}>{CATEGORY_CONFIG[c.category]?.label ?? c.category} · {formatDate(c.charge_date)}</p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: text, fontVariantNumeric: "tabular-nums" }}>{fmt(c.amount_paid)} / {fmt(c.total_amount)}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 10.5, color: c.settled ? HOME_INCOME : muted, fontWeight: 600 }}>{c.settled ? "Paid" : "Partial"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {left <= 0 ? (
        <p style={{ fontSize: 12.5, color: HOME_INCOME, fontWeight: 600, margin: 0 }}>Fully allocated.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 12, border: `1px solid ${border}` }}>
          <div style={{ display: "flex", gap: 6 }}>
            {[["new", "New transaction"], ["transaction", "Existing transactions"]].map(([key, label]) => (
              <button
                key={key} type="button" onClick={() => switchMode(key)}
                style={{
                  flex: 1, padding: "6px 8px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 600,
                  color: mode === key ? "#000" : muted,
                  backgroundColor: mode === key ? HOME_INCOME : "rgba(255,255,255,0.06)",
                }}
              >{label}</button>
            ))}
          </div>

          {mode === "new" ? (
            <form onSubmit={handleAllocate} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <p style={labelStyle}>Name</p>
                <input type="text" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Gas" className={fieldClass} style={inputStyle} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <p style={labelStyle}>Amount</p>
                  <CurrencyInput value={draft.total_amount} onChange={(v) => setDraft((d) => ({ ...d, total_amount: v }))} placeholder="0.00" className={fieldClass} style={inputStyle} />
                </div>
                <div className="flex-1 min-w-0">
                  <p style={labelStyle}>Category</p>
                  <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} className={fieldClass} style={inputStyle}>
                    {CATEGORY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <p style={labelStyle}>Date</p>
                <input type="date" value={draft.charge_date} onChange={(e) => setDraft((d) => ({ ...d, charge_date: e.target.value }))} className={fieldClass} style={{ ...inputStyle, colorScheme: "dark" }} />
              </div>
              {parseFloat(draft.total_amount) > left && (
                <p style={{ fontSize: 11, color: muted, margin: 0 }}>
                  Only {fmt(left)} left on this payment - the remaining {fmt(parseFloat(draft.total_amount) - left)} will roll over until another payment covers it.
                </p>
              )}
              {formError && <p style={{ fontSize: 11.5, color: HOME_EXPENSE, margin: 0 }}>{formError}</p>}
              <button
                type="submit" disabled={saving}
                style={{
                  padding: "8px 0", borderRadius: 10, border: `1px solid ${HOME_INCOME}`,
                  backgroundColor: `color-mix(in srgb, ${HOME_INCOME} 14%, transparent)`,
                  color: HOME_INCOME, fontSize: 12.5, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1,
                }}
              >{saving ? "Adding…" : "Add"}</button>
            </form>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <button type="button" onClick={() => setMonthOffset((m) => m - 1)} aria-label="Previous month" style={{ background: "none", border: "none", color: muted, cursor: "pointer", padding: 4, display: "flex" }}>
                  <IconChevron dir="left" />
                </button>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: text }}>{monthLabel}</span>
                <button type="button" onClick={() => setMonthOffset((m) => m + 1)} aria-label="Next month" style={{ background: "none", border: "none", color: muted, cursor: "pointer", padding: 4, display: "flex" }}>
                  <IconChevron dir="right" />
                </button>
              </div>
              {txnOptions === null ? (
                <Skel h={100} style={{ borderRadius: 8 }} />
              ) : txnLoadFailed ? (
                <p style={{ fontSize: 12, color: muted, margin: 0 }}>Couldn't load transactions.</p>
              ) : txnForMonth.length === 0 ? (
                <p style={{ fontSize: 12, color: muted, margin: 0 }}>Nothing available in {monthLabel}.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                  {txnForMonth.map((t) => (
                    <button
                      key={t.id} type="button" onClick={() => pickTransaction(t)} disabled={coolingDown}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                        padding: "7px 9px", borderRadius: 8, border: "none", textAlign: "left",
                        cursor: coolingDown ? "default" : "pointer",
                        backgroundColor: "rgba(255,255,255,0.05)", color: text,
                        opacity: coolingDown ? 0.5 : 1,
                        transition: "background-color 150ms ease, opacity 150ms ease",
                      }}
                      onMouseEnter={(e) => { if (!coolingDown) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.09)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)"; }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, backgroundColor: CATEGORY_ACCENT[t.category] ?? muted }} />
                        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5, fontWeight: 600 }}>{t.name}</span>
                      </span>
                      <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {fmt(t.amount)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {formError && <p style={{ fontSize: 11.5, color: HOME_EXPENSE, margin: 0 }}>{formError}</p>}
            </div>
          )}

          {otherPending.length > 0 && (
            <div style={{ borderTop: `1px solid ${border}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={{ fontSize: 11, color: muted, margin: 0 }}>Rolled over from another payment - tap to apply here:</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {otherPending.map((c) => {
                  const applying = saving && selectedChargeId === c.id;
                  const applyAmount = Math.min(parseFloat(c.remaining), left);
                  return (
                    <button
                      key={c.id} type="button" onClick={() => handleContinuePending(c)} disabled={saving}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                        padding: "7px 9px", borderRadius: 8, border: "none", textAlign: "left", cursor: "pointer",
                        backgroundColor: "rgba(255,255,255,0.05)", color: text, opacity: saving && !applying ? 0.4 : 1,
                      }}
                    >
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5, fontWeight: 600 }}>{c.name}</span>
                      <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: HOME_INCOME }}>
                        {applying ? "Applying…" : `+${fmt(applyAmount)} rollover`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CreditCardPaymentPanel({ paymentId, desktop = false, onClose, onChanged }) {
  const bg = HOME_SURFACE, border = HOME_DIVIDER, text = HOME_TEXT, muted = HOME_MUTED;
  const [closing, setClosing] = useState(false);
  const requestClose = () => setClosing(true);

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(onClose, EXIT_MS);
    return () => clearTimeout(timer);
  }, [closing, onClose]);

  useEffect(() => {
    function onKeyDown(e) { if (e.key === "Escape") requestClose(); }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  if (desktop) {
    return (
      <>
        <style>{`@keyframes cc-panel-in {
          from { opacity: 0; transform: translateX(calc(100% + 24px)); }
          to   { opacity: 1; transform: translateX(0); }
        }`}</style>
        <div
          className="fixed z-40 flex flex-col rounded-2xl border shadow-2xl"
          style={{
            top: 88, right: 24, width: 400, maxWidth: "calc(100vw - 48px)",
            maxHeight: "min(680px, calc(100dvh - 112px))",
            backgroundColor: bg, borderColor: border, color: text,
            transform: closing ? "translateX(calc(100% + 24px))" : "translateX(0)",
            opacity: closing ? 0 : 1,
            animation: closing ? undefined : `cc-panel-in ${EXIT_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
            transition: `transform ${EXIT_MS}ms cubic-bezier(0.32, 0.72, 0, 1), opacity ${EXIT_MS}ms ease`,
            overflowY: "auto", overscrollBehavior: "contain",
          }}
        >
          <div className="px-4 sm:px-5 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
            <h2 className="text-sm font-semibold" style={{ color: muted }}>Credit Card Balance</h2>
            <button onClick={requestClose} aria-label="Close" className="p-1.5 rounded-lg cursor-pointer" style={{ color: muted }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="px-4 sm:px-5 py-4">
            <CreditCardPaymentBody paymentId={paymentId} onChanged={onChanged} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 60, backgroundColor: "rgba(0,0,0,0.5)" }} onClick={requestClose} />
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 61,
          backgroundColor: bg, borderRadius: "20px 20px 0 0",
          padding: "10px 18px calc(env(safe-area-inset-bottom, 0px) + 18px)",
          maxHeight: "78dvh", overflowY: "auto", overscrollBehavior: "contain",
          display: "flex", flexDirection: "column", gap: 12,
          transform: closing ? "translateY(100%)" : "translateY(0)",
          transition: `transform ${EXIT_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        }}
      >
        <div style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: border, alignSelf: "center", margin: "2px 0 4px" }} />
        <CreditCardPaymentBody paymentId={paymentId} mobile onChanged={onChanged} />
      </div>
    </>
  );
}
