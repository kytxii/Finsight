import { useState } from "react";
import { updateTransaction } from "../../api/transactions";
import { updateRecurringPayment } from "../../api/recurringPayments";
import { errorMessage } from "../../utils/errors";
import { lockedNameFor } from "../../utils/finance";
import CurrencyInput from "../shared/CurrencyInput";
import CategoryPicker from "./CategoryPicker";
import CompactDateField from "./CompactDateField";
import {
  HOME_TEXT, HOME_MUTED, HOME_SURFACE, HOME_DIVIDER, HOME_EXPENSE, HOME_INCOME,
  TILE_COLOR, CATEGORY_ICON,
} from "../shared/categoryVisuals";


const fieldStyle = {
  width: "100%", borderRadius: 10, padding: "9px 11px", fontSize: 15,
  border: `1px solid ${HOME_DIVIDER}`, backgroundColor: "rgba(255,255,255,0.04)", color: HOME_TEXT,
  boxSizing: "border-box", outline: "none", colorScheme: "dark",
};
const labelStyle = { fontSize: 11, color: HOME_MUTED, marginBottom: 4, paddingLeft: 2 };

function IconLocate({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconClear({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export default function MobileTransactionModal({ transaction, onClose, onSaved, onDelete, onLocate }) {
  const [form, setForm] = useState({
    name: transaction.name,
    amount: String(transaction.amount),
    category: transaction.category,
    transaction_date: transaction.transaction_date,
    note: transaction.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [error, setError] = useState("");

  const Icon = CATEGORY_ICON[form.category];
  const tileColor = TILE_COLOR[form.category] ?? HOME_MUTED;
  const busy = saving || deleting;

  function setCategory(category) {
    setForm((f) => ({ ...f, category, name: lockedNameFor(category) ?? f.name }));
  }

  async function handleSave() {
    if (busy) return;
    setSaving(true);
    setError("");
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
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTap() {
    if (busy) return;
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3000);
      return;
    }
    setDeleting(true);
    setError("");
    try {
      await onDelete(transaction.id);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 60, backgroundColor: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 61,
          backgroundColor: HOME_SURFACE, borderRadius: "20px 20px 0 0",
          padding: "10px 20px calc(env(safe-area-inset-bottom, 0px) + 20px)",
          display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        <div style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: HOME_DIVIDER, alignSelf: "center", margin: "2px 0 4px" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%", background: tileColor, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16)",
            }}>
              {Icon && <Icon />}
            </div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: HOME_TEXT }}>Transaction</p>
          </div>
          {onLocate && (
            <button
              type="button"
              onClick={() => onLocate(transaction)}
              aria-label="Locate in Activity"
              style={{ color: HOME_MUTED, background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}
            >
              <IconLocate />
            </button>
          )}
        </div>

        <div>
          <p style={labelStyle}>Name</p>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Netflix, Salary..."
              disabled={!!lockedNameFor(form.category)}
              style={lockedNameFor(form.category)
                ? { ...fieldStyle, opacity: 0.45, cursor: "not-allowed", backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.08) 5px, rgba(255,255,255,0.08) 10px)` }
                : { ...fieldStyle, padding: form.name ? "9px 34px 9px 11px" : fieldStyle.padding }}
            />
            {!lockedNameFor(form.category) && form.name && (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, name: "" }))}
                aria-label="Clear name"
                style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  color: HOME_MUTED, background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex",
                }}
              >
                <IconClear />
              </button>
            )}
          </div>
        </div>

        <div>
          <p style={labelStyle}>Category</p>
          <CategoryPicker value={form.category} onChange={setCategory} />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={labelStyle}>Amount</p>
            <CurrencyInput
              value={form.amount}
              onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
              placeholder="0.00"
              style={fieldStyle}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={labelStyle}>Date</p>
            <CompactDateField
              value={form.transaction_date}
              onChange={(v) => setForm((f) => ({ ...f, transaction_date: v }))}
              style={fieldStyle}
            />
          </div>
        </div>

        <div>
          <p style={labelStyle}>Note (optional)</p>
          <input
            type="text"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="e.g. Refund, from John..."
            maxLength={100}
            style={fieldStyle}
          />
        </div>

        {error && <p style={{ fontSize: 12, color: HOME_EXPENSE, margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} disabled={busy}
            style={{ flex: 1, minWidth: 0, padding: "10px 0", borderRadius: 12, border: "none", backgroundColor: "rgba(255,255,255,0.06)", color: HOME_MUTED, fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer" }}
          >Cancel</button>
          <button type="button" onClick={handleSave} disabled={busy}
            style={{
              flex: 2, minWidth: 0, padding: "10px 0", borderRadius: 12, border: "none",
              backgroundColor: HOME_INCOME, color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
            }}
          >{saving ? "Saving…" : "Save Changes"}</button>
        </div>

        <button type="button" onClick={handleDeleteTap} disabled={busy}
          style={{
            marginTop: 10, paddingTop: 14, paddingBottom: 0,
            borderTop: `1px solid ${HOME_DIVIDER}`, borderRadius: 0,
            background: "transparent", color: HOME_EXPENSE, fontSize: 13, fontWeight: 600,
            cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
          }}
        >{deleting ? "Deleting…" : deleteConfirm ? "Tap again to confirm delete" : "Delete"}</button>
      </div>
    </>
  );
}
