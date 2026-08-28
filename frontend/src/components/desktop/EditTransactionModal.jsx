import { useState, useEffect } from "react";
import { CATEGORY_CONFIG, lockedNameFor } from "../../utils/finance";
import { updateTransaction } from "../../api/transactions";
import { updateRecurringPayment } from "../../api/recurringPayments";
import { createPaymentFromTransaction } from "../../api/creditCard";
import { HOME_SURFACE, HOME_DIVIDER, HOME_TEXT, HOME_MUTED, HOME_INCOME, HOME_EXPENSE, FIELD, CATEGORY_ACCENT } from "../shared/categoryVisuals";
import CurrencyInput from "../shared/CurrencyInput";

const CATEGORY_OPTIONS = Object.entries(CATEGORY_CONFIG).map(([key, { label }]) => ({ value: key, label }));

const EXIT_MS = 240;

export default function EditTransactionModal({ transaction, onClose, onSaved, onDelete, onLocate, onSplitAsPayment }) {
  const bg     = HOME_SURFACE;
  const border = HOME_DIVIDER;
  const text   = HOME_TEXT;
  const muted  = HOME_MUTED;
  const input  = FIELD;

  const [form, setForm] = useState({
    name: transaction.name,
    amount: String(transaction.amount),
    category: transaction.category,
    transaction_date: transaction.transaction_date,
    note: transaction.note ?? "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cancelHovered, setCancelHovered] = useState(false);
  const [submitHovered, setSubmitHovered] = useState(false);
  const [locateHovered, setLocateHovered] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState("");

  const [closing, setClosing] = useState(false);
  const requestClose = () => setClosing(true);

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(onClose, EXIT_MS);
    return () => clearTimeout(timer);
  }, [closing, onClose]);

  useEffect(() => {
    function onKeyDown(e) { if (e.key === "Escape") setClosing(true); }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "category") {
      setForm((f) => ({ ...f, category: value, name: lockedNameFor(value) ?? f.name }));
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await updateTransaction(transaction.id, { ...form, amount: parseFloat(form.amount) });
      if (transaction.recurring_payment_id) {
        const day = parseInt(form.transaction_date.split("-")[2], 10);
        await updateRecurringPayment(transaction.recurring_payment_id, {
          name: form.name,
          amount: parseFloat(form.amount),
          category: form.category,
          day_of_month: day,
        });
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  // Tap-again-to-confirm, no dialog - the button's own label swaps for 3s.
  async function handleDeleteClick() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3000);
      return;
    }
    setDeleteError("");
    setDeleting(true);
    try {
      await onDelete(transaction);
      onClose();
    } catch (err) {
      setDeleteError(err.response?.data?.detail ?? "Couldn't delete — try again");
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  async function handleSplitAsPayment() {
    if (splitting) return;
    setSplitting(true);
    setSplitError("");
    try {
      const res = await createPaymentFromTransaction(transaction.id);
      onSplitAsPayment(res.data);
    } catch (err) {
      setSplitError(err.response?.data?.detail ?? "Couldn't start a credit card payment");
      setSplitting(false);
    }
  }

  const catColor = CATEGORY_ACCENT[form.category];
  const inputStyle = { backgroundColor: input, borderColor: border, color: text };

  return (
    <>
      <style>{`@keyframes tx-panel-in {
        from { opacity: 0; transform: translateX(calc(100% + 24px)); }
        to   { opacity: 1; transform: translateX(0); }
      }`}</style>
      <div
        className="fixed z-40 flex flex-col rounded-2xl border shadow-2xl"
        style={{
          top: 88, right: 24, width: 380, maxWidth: "calc(100vw - 48px)",
          maxHeight: "calc(100dvh - 112px)",
          backgroundColor: bg, borderColor: border, color: text,
          transform: closing ? "translateX(calc(100% + 24px))" : "translateX(0)",
          opacity: closing ? 0 : 1,
          animation: closing ? undefined : `tx-panel-in ${EXIT_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
          transition: `transform ${EXIT_MS}ms cubic-bezier(0.32, 0.72, 0, 1), opacity ${EXIT_MS}ms ease`,
          overflowY: "auto", overscrollBehavior: "contain",
        }}
      >
        <div className="px-4 sm:px-6 py-3.5 flex items-center justify-between shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
          <h2 className="text-base font-semibold">Transaction</h2>
          <div className="flex items-center gap-1">
            {onLocate && (
              <button
                type="button"
                onClick={() => onLocate(transaction)}
                onMouseEnter={() => setLocateHovered(true)}
                onMouseLeave={() => setLocateHovered(false)}
                title="Locate in table"
                aria-label="Locate in table"
                className="p-1.5 rounded-lg cursor-pointer transition-colors"
                style={{ color: locateHovered ? text : muted }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </button>
            )}
            <button onClick={requestClose} aria-label="Close" className="p-1.5 rounded-lg cursor-pointer transition-colors" style={{ color: muted }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Name</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required={!lockedNameFor(form.category)}
              disabled={!!lockedNameFor(form.category)}
              placeholder="e.g. Netflix, Salary..."
              className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none border"
              style={lockedNameFor(form.category)
                ? { ...inputStyle, backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 5px, color-mix(in srgb, ${text} 10%, transparent) 5px, color-mix(in srgb, ${text} 10%, transparent) 10px)`, cursor: "not-allowed", opacity: 0.5 }
                : inputStyle}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1.5">Amount</label>
              <CurrencyInput
                value={form.amount}
                onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
                required
                placeholder="$0.00"
                className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none border"
                style={inputStyle}
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1.5">Category</label>
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
                className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none border"
                style={{ ...inputStyle, borderColor: catColor, color: catColor }}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="min-w-0">
            <label className="block text-sm font-medium mb-1.5">Date</label>
            <input
              type="date"
              name="transaction_date"
              value={form.transaction_date}
              onChange={handleChange}
              required
              className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none border"
              style={{ ...inputStyle, WebkitAppearance: "none", appearance: "none", minWidth: 0 }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Note <span className="font-normal opacity-60">(optional)</span></label>
            <input
              type="text"
              name="note"
              value={form.note}
              onChange={handleChange}
              placeholder="e.g. Refund, from John..."
              maxLength={100}
              className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none border"
              style={inputStyle}
            />
          </div>

          {error && (
            <div className="text-sm px-4 py-2.5 rounded-xl border text-red-500" style={{ borderColor: border }}>
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={requestClose}
              onMouseEnter={() => setCancelHovered(true)}
              onMouseLeave={() => setCancelHovered(false)}
              className="flex-1 py-2.5 rounded-xl border text-sm font-medium cursor-pointer transition-all"
              style={{
                borderColor: border,
                color: text,
                backgroundColor: cancelHovered ? `color-mix(in srgb, ${text} 8%, transparent)` : "transparent",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              onMouseEnter={() => setSubmitHovered(true)}
              onMouseLeave={() => setSubmitHovered(false)}
              className="flex-1 py-2.5 rounded-xl border text-sm font-medium disabled:opacity-50 transition-all cursor-pointer active:scale-95"
              style={{
                backgroundColor: `color-mix(in srgb, ${catColor} ${submitHovered ? "18%" : "12%"}, transparent)`,
                borderColor: catColor,
                color: catColor,
                boxShadow: `0 0 0 2px color-mix(in srgb, ${catColor} 20%, transparent)`,
              }}
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>

        {transaction.credit_card_charge_id && (
          <div className="px-4 sm:px-6 pb-1">
            <p style={{ fontSize: 11.5, color: muted, margin: 0 }}>
              Part of a credit card payment — categorized automatically from an allocation.
            </p>
          </div>
        )}

        {!transaction.credit_card_payment_id && !transaction.credit_card_charge_id && onSplitAsPayment && (
          <div className="px-4 sm:px-6 pb-1">
            <button
              type="button"
              onClick={handleSplitAsPayment}
              disabled={splitting}
              className="w-full text-center cursor-pointer"
              style={{
                background: "none", border: `1px dashed ${border}`, borderRadius: 10, padding: "8px 0",
                fontSize: 12.5, fontWeight: 600, color: HOME_INCOME, opacity: splitting ? 0.6 : 1,
              }}
            >
              {splitting ? "Starting…" : "Split as credit card payment"}
            </button>
            {splitError && <p style={{ fontSize: 11, color: HOME_EXPENSE, textAlign: "center", marginTop: 6 }}>{splitError}</p>}
          </div>
        )}

        <div className="px-4 sm:px-6 pb-4" style={{ borderTop: `1px solid ${border}`, paddingTop: 12 }}>
          <button
            type="button"
            onClick={handleDeleteClick}
            disabled={deleting}
            className="w-full text-center cursor-pointer"
            style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 600, color: HOME_EXPENSE, opacity: deleting ? 0.6 : 1 }}
          >
            {deleting ? "Deleting…" : deleteConfirm ? "Tap again to confirm delete" : "Delete transaction"}
          </button>
          {deleteError && (
            <p style={{ fontSize: 11, color: HOME_EXPENSE, textAlign: "center", marginTop: 6 }}>{deleteError}</p>
          )}
        </div>
      </div>
    </>
  );
}
