import { useEffect, useRef, useState } from "react";
import { getCreditCardPayment, allocateCreditCardPayment, removeChargeFromPayment, deleteCreditCardPayment } from "../../api/creditCard";
import { getTransactions } from "../../api/transactions";
import { CATEGORY_CONFIG, fmt } from "../../utils/finance";
import { getToday, getNow } from "../../utils/time";
import { HOME_SURFACE, HOME_DIVIDER, HOME_TEXT, HOME_MUTED, HOME_INCOME, HOME_EXPENSE, CATEGORY_ACCENT } from "./categoryVisuals";
import CurrencyInput from "./CurrencyInput";
import Skel from "./Skel";

// A credit card charge is money going out to something chargeable - income,
// reimbursements, tips, and savings moves aren't things you'd ever put on a
// card, so they're left out of this picker entirely.
const CC_EXCLUDED_CATEGORIES = new Set(["INCOME", "REIMBURSEMENT", "TIPS", "SAVINGS"]);
const CATEGORY_OPTIONS = Object.entries(CATEGORY_CONFIG)
  .filter(([key]) => !CC_EXCLUDED_CATEGORIES.has(key))
  .map(([key, { label }]) => ({ value: key, label }));
const EMPTY_NEW_CHARGE = { name: "", total_amount: "", category: "EXPENSE", charge_date: "" };

// Payments created from the "+" floating panel are always named this - keep
// them out of the "Existing transactions" picker below (#54).
const DEFAULT_PAYMENT_NAME = "Credit Card Payment";

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function shortDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function IconChevron({ dir = "left", size = 15 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

// A whole-page view of an existing credit card balance (#54): stats, what
// it covers, and charge management (new transaction / existing transactions)
// laid out as columns. Creating a new balance still happens through the "+"
// floating panel - this page is for balances that already exist.
export default function CreditCardBalancePage({ paymentId, mobile, onBack, onChanged, onEditStateChange }) {
  const border = HOME_DIVIDER, text = HOME_TEXT, muted = HOME_MUTED;

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [draft, setDraft] = useState({ ...EMPTY_NEW_CHARGE, charge_date: getToday() });
  const [formError, setFormError] = useState("");
  const [closingPayment, setClosingPayment] = useState(false);

  const [monthOffset, setMonthOffset] = useState(0);
  const [txnOptions, setTxnOptions] = useState(null);
  const [txnLoadFailed, setTxnLoadFailed] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  const lastPickRef = useRef(0);

  // Edit mode for the "CC Payments" list below (#146) - lets charges be
  // unallocated from this payment directly, instead of only ever deleting
  // the whole balance. Driven by the same floating edit button and
  // hold-to-delete ring the Credit Cards list view uses (Dashboard.jsx) -
  // reported up through onEditStateChange rather than rendered here.
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  function loadDetail() {
    setLoading(true);
    setLoadError(false);
    getCreditCardPayment(paymentId)
      .then((p) => setDetail(p.data))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }
  useEffect(loadDetail, [paymentId]);

  // Nothing left to edit once the list empties out - and don't carry edit
  // mode across to a different balance.
  useEffect(() => {
    if (!detail || detail.charges.length === 0) {
      setEditMode(false);
      setSelectedIds(new Set());
    }
    // Only the charge count should retrigger this, not every detail refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId, detail?.charges.length]);

  function toggleEdit() {
    setEditMode((e) => !e);
    setSelectedIds(new Set());
    setFormError("");
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // No arm-then-confirm step here - the header's hold-to-delete button
  // (Dashboard.jsx) is itself the confirmation, so this just executes.
  function handleBulkDelete() {
    const idsToRemove = [...selectedIds];
    const prevDetail = detail;
    setDetail((d) => ({ ...d, charges: d.charges.filter((c) => !selectedIds.has(c.id)) }));
    setSelectedIds(new Set());
    setEditMode(false);
    setFormError("");

    (async () => {
      const results = await Promise.allSettled(
        idsToRemove.map((id) => removeChargeFromPayment(paymentId, id)),
      );
      const lastOk = [...results].reverse().find((r) => r.status === "fulfilled");
      const failedCount = results.filter((r) => r.status === "rejected").length;
      if (lastOk) setDetail(lastOk.value.data);
      else if (failedCount === results.length) setDetail(prevDetail);
      if (failedCount > 0) {
        setFormError(`Couldn't remove ${failedCount} charge${failedCount !== 1 ? "s" : ""} — try again`);
      }
      onChanged?.();
    })();
  }

  // Fully paid off - the same delete used elsewhere, just offered here as a
  // deliberate "I'm done tracking this" action once there's nothing left to
  // pay. Real transactions this payment covered stay put either way; only
  // leaving it open (not closing) keeps the balance itself around to look at.
  async function handleClose() {
    if (closingPayment) return;
    setClosingPayment(true);
    setFormError("");
    try {
      await deleteCreditCardPayment(paymentId);
      onChanged?.();
      onBack();
    } catch (err) {
      setFormError(err.response?.data?.detail ?? "Couldn't close this balance");
      setClosingPayment(false);
    }
  }

  // Press-and-hold, filling horizontally, same idea as the hold-to-delete
  // ring elsewhere - releasing early cancels, holding the full duration
  // commits the close.
  const HOLD_CLOSE_MS = 1200;
  const [holdingClose, setHoldingClose] = useState(false);
  function startCloseHold() {
    if (closingPayment) return;
    setHoldingClose(true);
  }
  function cancelCloseHold() {
    setHoldingClose(false);
  }
  function onCloseFillTransitionEnd(e) {
    if (e.propertyName !== "width" || !holdingClose) return;
    setHoldingClose(false);
    handleClose();
  }

  useEffect(() => {
    onEditStateChange?.({
      editMode,
      hasRows: (detail?.charges.length ?? 0) > 0,
      toggleEdit,
      hasSelection: selectedIds.size > 0,
      selectionCount: selectedIds.size,
      deleteSelected: handleBulkDelete,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, detail, selectedIds]);

  useEffect(() => {
    getTransactions()
      .then((res) => setTxnOptions(res.data.filter((t) =>
        !t.credit_card_payment_id && !t.credit_card_charge_id
        // A "charge" is a real purchase, not a paycheck, reimbursement,
        // savings transfer, bill, or anything else non-discretionary - only
        // EXPENSE transactions are candidates (#54).
        && t.category === "EXPENSE"
        && t.name !== DEFAULT_PAYMENT_NAME
      )))
      .catch(() => setTxnLoadFailed(true));
  }, []);

  const left = detail ? parseFloat(detail.left) : 0;

  function resetChargeForm() {
    setDraft({ ...EMPTY_NEW_CHARGE, charge_date: getToday() });
    setFormError("");
  }

  // Moves onto the balance instantly (optimistic), then confirms with the
  // server in the background - same pattern as pickTransaction below. A
  // charge is always allocated in full against this payment (#147) - if the
  // server finds it's bigger than what's left, the optimistic add is rolled
  // back and the typed values are restored instead of accepting it partway.
  async function handleAllocate(e) {
    e.preventDefault();
    const totalAmount = parseFloat(draft.total_amount);
    if (draft.name.trim() === "" || !(totalAmount > 0) || !draft.charge_date) return;
    setFormError("");

    const submitted = draft;
    const name = draft.name.trim();
    const { category, charge_date } = draft;
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const prevDetail = detail;
    setDetail((d) => ({
      ...d,
      paid: (parseFloat(d.paid) + totalAmount).toFixed(2),
      left: (parseFloat(d.left) - totalAmount).toFixed(2),
      charges: [
        ...d.charges,
        {
          id: tempId, name, total_amount: totalAmount.toFixed(2), amount_paid: totalAmount.toFixed(2),
          category, charge_date, settled: true, settled_transaction_id: null,
        },
      ],
    }));
    resetChargeForm();

    try {
      const res = await allocateCreditCardPayment(paymentId, { name, total_amount: totalAmount, category, charge_date });
      setDetail(res.data);
      onChanged?.();
    } catch (err) {
      setDetail(prevDetail);
      setDraft(submitted);
      setFormError(err.response?.data?.detail ?? "Something went wrong");
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
    } catch (err) {
      // Roll back the optimistic move and put the transaction back in the picker.
      setDetail(prevDetail);
      setTxnOptions((prev) => (prev ? [t, ...prev] : prev));
      setFormError(err.response?.data?.detail ?? "Something went wrong");
    }
  }

  const underline = (extra) => ({
    backgroundColor: "transparent", color: text, border: "none",
    borderBottom: `1px solid ${border}`, borderRadius: 0, ...extra,
  });
  const focusAccent = (e) => { e.currentTarget.style.borderBottomColor = CATEGORY_ACCENT[draft.category] ?? text; };
  const blurAccent = (e) => { e.currentTarget.style.borderBottomColor = border; };

  const labelStyle = { fontSize: mobile ? 11 : 12, fontWeight: 600, color: muted, marginBottom: 6, display: "block" };
  const backBtnStyle = { display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: muted, cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "4px 0" };

  const monthDate = new Date(getNow().getFullYear(), getNow().getMonth() + monthOffset, 1);
  const monthLabel = monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const txnForMonth = (txnOptions ?? []).filter((t) => {
    const d = new Date(t.transaction_date + "T00:00:00");
    return d.getFullYear() === monthDate.getFullYear() && d.getMonth() === monthDate.getMonth() && t.amount <= left;
  }).sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: mobile ? 16 : 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <button type="button" onClick={onBack} style={backBtnStyle}><IconChevron /> Back</button>
          <Skel w={70} h={12} />
        </div>

        <div
          className={`grid ${mobile ? "grid-cols-2" : "grid-cols-3"} rounded-2xl overflow-hidden`}
          style={{ backgroundColor: HOME_SURFACE, border: `1px solid ${border}` }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{ padding: mobile ? "13px 15px" : "15px 18px", borderLeft: i === 0 ? "none" : `1px solid ${border}` }}
            >
              <Skel w={38} h={10} />
              <Skel w={64} h={mobile ? 19 : 23} style={{ marginTop: 6 }} />
            </div>
          ))}
        </div>

        <Skel h={8} style={{ borderRadius: 999 }} />

        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(3, 1fr)", gap: 18, height: mobile ? undefined : 460 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                padding: mobile ? 20 : 22, borderRadius: 14, border: `1px solid ${border}`,
                display: "flex", flexDirection: "column", gap: 10, minHeight: 0,
              }}
            >
              <Skel w={130} h={15} />
              <Skel h={44} style={{ borderRadius: 10, marginTop: 4 }} />
              <Skel h={44} style={{ borderRadius: 10 }} />
              <Skel h={44} style={{ borderRadius: 10 }} />
              {!mobile && <Skel h={44} style={{ borderRadius: 10 }} />}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (loadError || !detail) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <button type="button" onClick={onBack} style={backBtnStyle}><IconChevron /> Back</button>
        <p style={{ fontSize: 13, color: HOME_EXPENSE }}>Couldn't load this balance.</p>
      </div>
    );
  }

  const fullyAllocated = left <= 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: mobile ? 16 : 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <button type="button" onClick={onBack} style={backBtnStyle}><IconChevron /> Back</button>
        <p style={{ margin: 0, fontSize: 12.5, color: muted }}>{formatDate(detail.payment_date)}</p>
      </div>

      <div
        className={`grid ${mobile ? "grid-cols-2" : "grid-cols-3"} rounded-2xl overflow-hidden`}
        style={{ backgroundColor: HOME_SURFACE, border: `1px solid ${border}` }}
      >
        {[
          ["Total", detail.total_amount, text],
          ["Paid", detail.paid, HOME_INCOME],
          ["Left", detail.left, left > 0 ? HOME_EXPENSE : muted],
        ].map(([label, value, color], i) => {
          const dueLabel = label === "Total" && detail.due_date ? `Due ${shortDate(detail.due_date)}` : null;
          return (
            <div
              key={label}
              style={{
                padding: mobile ? "13px 15px" : "15px 18px",
                borderLeft: i === 0 || (mobile && i === 2) ? "none" : `1px solid ${border}`,
                borderTop: mobile && i >= 2 ? `1px solid ${border}` : "none",
                position: "relative",
              }}
            >
              <p style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>{label}</p>
              <p style={{ fontSize: mobile ? 19 : 23, fontWeight: 700, color, margin: "4px 0 0", fontVariantNumeric: "tabular-nums" }}>{fmt(value)}</p>
              {dueLabel && (
                <span
                  style={{
                    position: "absolute", bottom: mobile ? 10 : 12, right: mobile ? 12 : 16,
                    padding: "3px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 700,
                    color: muted, backgroundColor: `color-mix(in srgb, ${muted} 16%, transparent)`,
                  }}
                >
                  {dueLabel}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <style>{`@keyframes cc-progress-stripes { from { background-position: 0 0; } to { background-position: 20px 0; } }`}</style>
      <div style={{ height: 8, borderRadius: 999, backgroundColor: `color-mix(in srgb, ${text} 10%, transparent)`, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, (parseFloat(detail.paid) / Math.max(parseFloat(detail.total_amount), 0.01)) * 100)}%`,
            borderRadius: 999, backgroundColor: HOME_INCOME,
            backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0, rgba(255,255,255,0.22) 5px, transparent 5px, transparent 10px)",
            backgroundSize: "20px 20px",
            animation: "cc-progress-stripes 1s linear infinite",
            transition: "width 300ms ease",
          }}
        />
      </div>

      {fullyAllocated && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontSize: 12.5, color: HOME_INCOME, fontWeight: 600, margin: 0 }}>Fully allocated.</p>
          <button
            type="button"
            onMouseDown={startCloseHold} onMouseUp={cancelCloseHold} onMouseLeave={cancelCloseHold}
            onTouchStart={startCloseHold} onTouchEnd={cancelCloseHold}
            disabled={closingPayment}
            title="Hold to stop tracking this balance - the transactions it covers aren't affected"
            style={{
              position: "relative", width: "100%", padding: "12px 0", borderRadius: 11,
              border: `1px solid ${HOME_EXPENSE}`, backgroundColor: `color-mix(in srgb, ${HOME_EXPENSE} 10%, transparent)`,
              overflow: "hidden", cursor: closingPayment ? "default" : "pointer", userSelect: "none",
            }}
          >
            <div
              onTransitionEnd={onCloseFillTransitionEnd}
              style={{
                position: "absolute", inset: 0,
                backgroundColor: `color-mix(in srgb, ${HOME_EXPENSE} 30%, transparent)`,
                width: holdingClose || closingPayment ? "100%" : "0%",
                transition: holdingClose
                  ? `width ${HOLD_CLOSE_MS}ms linear`
                  : "width 150ms ease",
              }}
            />
            <span style={{ position: "relative", fontSize: 13, fontWeight: 700, color: HOME_EXPENSE }}>
              {closingPayment ? "Closing…" : "Hold to close"}
            </span>
          </button>
        </div>
      )}

      <div
        style={{
          display: "grid", gridTemplateColumns: mobile ? "1fr" : `repeat(${fullyAllocated ? 1 : 3}, 1fr)`, gap: 18,
          // Fixed on desktop so the two list columns have a real height to
          // flex-fill against (grid rows are otherwise auto-sized from
          // content, which collapses a flex:1 list to ~0) - without this,
          // a shorter list either scrolls wrong or leaves dead space below
          // it before the card's bottom edge.
          height: mobile || fullyAllocated ? undefined : 460,
        }}
      >
        {!fullyAllocated && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: mobile ? 20 : 22, borderRadius: 14, border: `1px solid ${border}`, minHeight: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: text }}>New transaction</p>
            <form onSubmit={handleAllocate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <p style={labelStyle}>Name</p>
                <input
                  type="text" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  onFocus={focusAccent} onBlur={blurAccent} placeholder="e.g. Gas"
                  className="w-full px-1 py-2 text-sm focus:outline-none transition-colors" style={underline()}
                />
              </div>
              <div>
                <p style={labelStyle}>Amount</p>
                <CurrencyInput
                  value={draft.total_amount} onChange={(v) => setDraft((d) => ({ ...d, total_amount: v }))}
                  onFocus={focusAccent} onBlur={blurAccent} placeholder="0.00"
                  className="w-full px-1 py-2 text-sm focus:outline-none transition-colors" style={underline()}
                />
              </div>
              <div>
                <p style={labelStyle}>Category</p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, backgroundColor: CATEGORY_ACCENT[draft.category] }} />
                  <select
                    value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                    onFocus={focusAccent} onBlur={blurAccent}
                    className="flex-1 min-w-0 px-1 py-2 text-sm focus:outline-none transition-colors cursor-pointer"
                    style={underline()}
                  >
                    {CATEGORY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value} style={{ backgroundColor: HOME_SURFACE, color: text }}>{opt.label}</option>)}
                  </select>
                </div>
                {/* Trying this as an alternative to the dropdown above - both shown for now (#54). */}
                <div style={{ display: "flex", borderRadius: 999, overflow: "hidden", border: `1px solid ${border}`, marginTop: 8 }}>
                  {CATEGORY_OPTIONS.map((opt, i) => {
                    const active = draft.category === opt.value;
                    return (
                      <button
                        key={opt.value} type="button" onClick={() => setDraft((d) => ({ ...d, category: opt.value }))}
                        style={{
                          flex: 1, padding: "7px 4px", border: "none",
                          borderLeft: i === 0 ? "none" : `1px solid ${border}`,
                          fontSize: 10.5, fontWeight: 700, cursor: "pointer", textAlign: "center",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          backgroundColor: active ? CATEGORY_ACCENT[opt.value] : "transparent",
                          color: active ? "#fff" : muted,
                          transition: "background-color 150ms ease, color 150ms ease",
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p style={labelStyle}>Date</p>
                <input
                  type="date" value={draft.charge_date} onChange={(e) => setDraft((d) => ({ ...d, charge_date: e.target.value }))}
                  onFocus={focusAccent} onBlur={blurAccent}
                  className="w-full px-1 py-2 text-sm focus:outline-none transition-colors"
                  style={{ ...underline(), WebkitAppearance: "none", appearance: "none", colorScheme: "dark" }}
                />
              </div>
              {parseFloat(draft.total_amount) > left && (
                <p style={{ fontSize: 11, color: HOME_EXPENSE, margin: 0 }}>
                  Only {fmt(left)} left on this payment - lower the amount or use a bigger payment.
                </p>
              )}
              <button
                type="submit" disabled={parseFloat(draft.total_amount) > left}
                className="transition-transform active:scale-[0.98]"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  padding: "12px 0", borderRadius: 11, border: "none",
                  backgroundColor: HOME_INCOME, color: "#04120a", fontSize: 13.5, fontWeight: 700,
                  cursor: "pointer", opacity: parseFloat(draft.total_amount) > left ? 0.5 : 1,
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14.5" height="14.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add transaction
              </button>
            </form>
          </div>
        )}

        {!fullyAllocated && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: mobile ? 20 : 22, borderRadius: 14, border: `1px solid ${border}`, minHeight: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: text }}>Existing transactions</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <button type="button" onClick={() => setMonthOffset((m) => m - 1)} aria-label="Previous month" style={{ background: "none", border: "none", color: muted, cursor: "pointer", padding: 4, display: "flex" }}>
                <IconChevron dir="left" />
              </button>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: text }}>{monthLabel}</span>
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
              <div
                className="no-scrollbar"
                style={
                  mobile
                    ? { display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }
                    : { display: "flex", flexDirection: "column", gap: 6, flex: 1, minHeight: 0, overflowY: "auto" }
                }
              >
                {txnForMonth.map((t) => (
                  <button
                    key={t.id} type="button" onClick={() => pickTransaction(t)} disabled={coolingDown}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                      padding: "10px 12px", borderRadius: 10, border: "none", textAlign: "left",
                      cursor: coolingDown ? "default" : "pointer",
                      backgroundColor: "rgba(255,255,255,0.05)", color: text, flexShrink: 0,
                      opacity: coolingDown ? 0.5 : 1,
                      transition: "background-color 150ms ease, opacity 150ms ease",
                    }}
                    onMouseEnter={(e) => { if (!coolingDown) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.09)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)"; }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, backgroundColor: CATEGORY_ACCENT[t.category] ?? muted }} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13.5, fontWeight: 600 }}>{t.name}</span>
                        <span style={{ display: "block", marginTop: 1, fontSize: 11.5, color: muted }}>{shortDate(t.transaction_date)}</span>
                      </span>
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {fmt(t.amount)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: mobile ? 20 : 22, borderRadius: 14, border: `1px solid ${border}`, minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: text }}>CC Payments</p>
            <span
              style={{
                padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                color: muted, backgroundColor: `color-mix(in srgb, ${muted} 16%, transparent)`,
              }}
            >
              {detail.charges.length}
            </span>
          </div>
          {detail.charges.length === 0 ? (
            <p style={{ fontSize: 12.5, color: muted, margin: 0 }}>Nothing allocated yet.</p>
          ) : (
            <div
              className="no-scrollbar"
              style={{
                display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", paddingRight: 2,
                padding: editMode ? 8 : 0,
                borderRadius: 12,
                border: `1px solid ${editMode ? HOME_INCOME : "transparent"}`,
                transition: "padding 200ms ease, border-color 200ms ease",
                ...(mobile ? { maxHeight: 260 } : { flex: 1, minHeight: 0 }),
              }}
            >
              {detail.charges.map((c) => {
                const catColor = CATEGORY_ACCENT[c.category] ?? muted;
                const checked = selectedIds.has(c.id);
                return (
                  <div
                    key={c.id}
                    onClick={editMode ? () => toggleSelect(c.id) : undefined}
                    className={editMode ? "transition-colors" : undefined}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                      padding: checked ? "9px 11px" : "10px 12px",
                      borderRadius: 10,
                      border: `${checked ? 2 : 1}px solid ${checked ? HOME_INCOME : "transparent"}`,
                      backgroundColor: "rgba(255,255,255,0.05)", flexShrink: 0,
                      cursor: editMode ? "pointer" : "default",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, backgroundColor: catColor }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</p>
                        <p style={{ margin: "1px 0 0", fontSize: 11.5, color: muted }}>{formatDate(c.charge_date)}</p>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: text, fontVariantNumeric: "tabular-nums" }}>{fmt(c.total_amount)}</p>
                      <p style={{ margin: "1px 0 0", fontSize: 11, color: HOME_INCOME, fontWeight: 600 }}>Paid</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {formError && <p style={{ fontSize: 11.5, color: HOME_EXPENSE, margin: 0 }}>{formError}</p>}
    </div>
  );
}
