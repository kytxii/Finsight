import { useState } from "react";
import { CATEGORY_CONFIG, lockedNameFor } from "../utils/finance";
import { updateTransaction } from "../api/transactions";
import { updateRecurringPayment } from "../api/recurringPayments";
import { useTheme } from "../hooks/useTheme";
import CurrencyInput from "./CurrencyInput";

const CATEGORY_OPTIONS = Object.entries(CATEGORY_CONFIG).map(([key, { label }]) => ({ value: key, label }));

export default function EditTransactionModal({ transaction, onClose, onSaved }) {
  const dark = useTheme();

  const bg     = dark ? "var(--dark-surface)" : "var(--light-surface)";
  const border = dark ? "var(--dark-border)"  : "var(--light-border)";
  const text   = dark ? "var(--dark-text)"    : "var(--light-text)";
  const input  = dark ? "var(--dark-bg)"      : "var(--light-bg)";

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

  const catColor = `var(--category-${form.category.toLowerCase()})`;
  const inputStyle = { backgroundColor: input, borderColor: border, color: text };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl border shadow-2xl"
        style={{ backgroundColor: bg, borderColor: catColor, color: text }}
      >
        <div className="px-4 sm:px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: border }}>
          <h2 className="text-base font-semibold">Edit Transaction</h2>
          <button onClick={onClose} className="transition-colors cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
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
              onClick={onClose}
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
      </div>
    </div>
  );
}
