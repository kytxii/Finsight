import { useState } from "react";
import { updateTipDeposit } from "../api/tipDeposits";
import { errorMessage } from "../utils/errors";
import CurrencyInput from "./CurrencyInput";
import CompactDateField from "./CompactDateField";
import { HOME_TEXT, HOME_MUTED, HOME_SURFACE, HOME_DIVIDER, HOME_EXPENSE, TIPS_DEPOSITED } from "./categoryVisuals";

// Deposit counterpart to MobileTransactionModal (#99) - same bottom-sheet
// shape and swipe-to-edit/delete convention as the transaction browser's
// existing rows, but scoped to a TipDeposit's actual fields (amount + date
// only - no name/category, deposits don't have either).

const fieldStyle = {
  width: "100%", borderRadius: 10, padding: "9px 11px", fontSize: 15,
  border: `1px solid ${HOME_DIVIDER}`, backgroundColor: "rgba(255,255,255,0.04)", color: HOME_TEXT,
  boxSizing: "border-box", outline: "none", colorScheme: "dark",
};
const labelStyle = { fontSize: 11, color: HOME_MUTED, marginBottom: 4, paddingLeft: 2 };

export default function MobileDepositModal({ deposit, onClose, onSaved, onDelete }) {
  const [form, setForm] = useState({
    amount: String(deposit.amount),
    deposit_date: deposit.deposit_date,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [error, setError] = useState("");

  const busy = saving || deleting;

  async function handleSave() {
    if (busy) return;
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateTipDeposit(deposit.id, { amount, deposit_date: form.deposit_date });
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
      await onDelete(deposit.id);
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

        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: HOME_TEXT }}>Deposit</p>

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
              value={form.deposit_date}
              onChange={(v) => setForm((f) => ({ ...f, deposit_date: v }))}
              style={fieldStyle}
            />
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: HOME_EXPENSE, margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} disabled={busy}
            style={{ flex: 1, minWidth: 0, padding: "10px 0", borderRadius: 12, border: "none", backgroundColor: "rgba(255,255,255,0.06)", color: HOME_MUTED, fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer" }}
          >Cancel</button>
          <button type="button" onClick={handleSave} disabled={busy}
            style={{
              flex: 2, minWidth: 0, padding: "10px 0", borderRadius: 12, border: "none",
              backgroundColor: TIPS_DEPOSITED, color: "#fff",
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
