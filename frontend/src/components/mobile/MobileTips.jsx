import { useState, useEffect } from "react";
import SwipeableRow from "./SwipeableRow";
import CurrencyInput from "../shared/CurrencyInput";
import Toggle from "../shared/Toggle";
import Skel from "../shared/Skel";
import ListRowSkeleton from "../skeletons/shared/ListRowSkeleton";
import { fmt } from "../../utils/finance";
import { getToday } from "../../utils/time";
import { periodLabel } from "../../utils/mobileFormat";
import { updateTipDeposit, deleteTipDeposit, getCashOnHand, convertTipDepositToTransaction } from "../../api/tipDeposits";
import { HOME_TEXT, HOME_MUTED, HOME_SURFACE, HOME_DIVIDER, HOME_EXPENSE, HOME_INCOME, HOME_ACCENT, TILE_COLOR } from "../shared/categoryVisuals";
import { IconTipsTile } from "../shared/categoryIcons";

const TIPS = TILE_COLOR.TIPS;        // #26a69a
const TIPS_DEPOSITED = "#5ccfc0";    // lighter teal for the deposit state
const TIPS_PAGE = 4;
const DEPOSITS_PAGE = 5;

const shortDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const tile = (color, border, size = 40) => ({
  flex: "0 0 auto", width: size, height: size, borderRadius: "50%", background: color,
  border: border ? `1.5px solid ${border}` : "none",
  display: "flex", alignItems: "center", justifyContent: "center",
  boxShadow: color === "transparent" ? "none" : "inset 0 1px 0 rgba(255,255,255,0.16)",
});

function IconBack() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={HOME_TEXT} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

// Cash-in-hand icon, white strokes on a filled teal circle like the others.
function IconHandCash({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17" />
      <path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" />
      <path d="m2 16 6 6" />
      <circle cx="16" cy="9" r="2.9" />
      <circle cx="6" cy="5" r="3" />
    </svg>
  );
}

function IconBank({ color, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" />
      <path d="M12 3 3 8h18z" />
      <path d="M5 8v10M9.5 8v10M14.5 8v10M19 8v10" />
    </svg>
  );
}

export default function MobileTips({ transactions, deposits, loading, onBack, onEditTransaction, onDeleteTransaction, onRefresh }) {
  // Deposits themselves come in as a prop now - MobileDashboard fetches and
  // owns that list, same as `transactions` (#75). Cash on hand is a separate
  // server-computed aggregate (#157: scoped to the current month), so it
  // still gets its own small local fetch here, re-run whenever the inputs
  // it's derived from change.
  const [cashOnHand, setCashOnHand] = useState(0);
  const [cashLoading, setCashLoading] = useState(true);
  const [showAllTips, setShowAllTips] = useState(false);
  const [showAllDeposits, setShowAllDeposits] = useState(false);
  const [openId, setOpenId] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ amount: "", deposit_date: getToday() });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCashLoading(true);
    getCashOnHand()
      .then((r) => setCashOnHand(parseFloat(r.data.cash_on_hand)))
      .catch(() => setCashOnHand(0))
      .finally(() => setCashLoading(false));
  }, [transactions, deposits]);

  const thisMonth = getToday().slice(0, 7);

  const tips = transactions
    .filter((t) => t.category === "TIPS" && t.transaction_date.slice(0, 7) === thisMonth)
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));
  const monthDeposits = deposits.filter((d) => d.deposit_date.slice(0, 7) === thisMonth);

  const monthlyEarned = tips.reduce((s, t) => s + parseFloat(t.amount), 0);
  const monthDepositedTotal = monthDeposits.reduce((s, d) => s + parseFloat(d.amount), 0);

  const shownTips = showAllTips ? tips : tips.slice(0, TIPS_PAGE);
  const shownDeposits = showAllDeposits ? monthDeposits : monthDeposits.slice(0, DEPOSITS_PAGE);

  // Adding a deposit now happens through the main Add Transaction flow (#155)
  // - a Deposited toggle there creates one directly. This form only edits an
  // existing deposit, reached via the row's swipe-to-edit action below.
  function startEditDeposit(d) {
    setEditingId(d.id);
    setDraft({ amount: String(d.amount), deposit_date: d.deposit_date });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setDraft({ amount: "", deposit_date: getToday() });
  }

  async function saveDeposit(e) {
    e.preventDefault();
    const n = parseFloat(draft.amount);
    if (isNaN(n) || n <= 0) return;
    setSaving(true);
    try {
      await updateTipDeposit(editingId, { amount: n, deposit_date: draft.deposit_date });
      closeForm();
      onRefresh?.();
    } finally {
      setSaving(false);
    }
  }

  async function removeDeposit(id) {
    await deleteTipDeposit(id);
    onRefresh?.();
  }

  const [converting, setConverting] = useState(false);

  async function convertDepositToTip() {
    // #156: a quality-of-life correction for a misentered deposit, not a
    // persistent link - the deposit is gone once this returns.
    if (converting) return;
    setConverting(true);
    try {
      await convertTipDepositToTransaction(editingId);
      closeForm();
      onRefresh?.();
    } finally {
      setConverting(false);
    }
  }

  const cardStyle = { backgroundColor: HOME_SURFACE, borderRadius: 18, overflow: "hidden" };
  const fieldStyle = {
    width: "100%", borderRadius: 10, padding: "9px 11px", fontSize: 14,
    border: `1px solid ${HOME_DIVIDER}`, backgroundColor: "rgba(255,255,255,0.04)", color: HOME_TEXT,
    boxSizing: "border-box", outline: "none", colorScheme: "dark",
  };

  return (
    <>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 2px 18px" }}>
        <button onClick={onBack} aria-label="Back to home" style={{
          width: 36, height: 36, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
          background: HOME_SURFACE, border: "1px solid rgba(255,255,255,0.07)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <IconBack />
        </button>
        <div style={tile(TIPS)}><IconTipsTile /></div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.4px", color: HOME_TEXT }}>Tips</h1>
      </div>

      {/* Hero: tips earned this month, with cash on hand below */}
      <div style={{ ...cardStyle, padding: "16px 18px", marginBottom: 22 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: HOME_MUTED }}>
          {periodLabel()}
        </p>
        {loading ? (
          <Skel h={30} w="55%" style={{ marginTop: 8 }} />
        ) : (
          <p style={{ margin: "6px 0 0", fontSize: 30, fontWeight: 800, letterSpacing: "-0.6px", fontVariantNumeric: "tabular-nums", color: TIPS }}>{fmt(monthlyEarned)}</p>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={tile(TIPS, null, 30)}><IconHandCash size={17} /></div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {loading || cashLoading ? (
                <Skel h={17} w={54} />
              ) : (
                <span style={{ fontSize: 15, fontWeight: 700, color: HOME_TEXT, fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>{fmt(cashOnHand)}</span>
              )}
              <span style={{ fontSize: 11, fontWeight: 500, color: HOME_MUTED }}>cash on hand</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={tile("transparent", TIPS_DEPOSITED, 30)}><IconBank color={TIPS_DEPOSITED} size={15} /></div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {loading ? (
                <Skel h={17} w={54} />
              ) : (
                <span style={{ fontSize: 15, fontWeight: 700, color: TIPS_DEPOSITED, fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>{fmt(monthDepositedTotal)}</span>
              )}
              <span style={{ fontSize: 11, fontWeight: 500, color: HOME_MUTED }}>deposited</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tapping anywhere closes an open swipe row */}
      {openId !== null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 5 }} onTouchStart={() => setOpenId(null)} onClick={() => setOpenId(null)} />
      )}

      {/* Tips table */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 4px 12px" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px", color: HOME_TEXT }}>Tips</h2>
          {tips.length > TIPS_PAGE && (
            <span onClick={() => setShowAllTips((v) => !v)} style={{ color: HOME_ACCENT, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              {showAllTips ? "See less" : "See all"}
            </span>
          )}
        </div>
        <div style={cardStyle}>
          {loading ? (
            <ListRowSkeleton count={3} />
          ) : tips.length === 0 ? (
            <p style={{ fontSize: 13, color: HOME_MUTED, textAlign: "center", padding: "22px 0" }}>No tips recorded yet</p>
          ) : (
            shownTips.map((t, i) => (
              <SwipeableRow
                key={t.id}
                id={t.id}
                openId={openId}
                setOpenId={setOpenId}
                onEdit={() => onEditTransaction(t)}
                onDelete={() => onDeleteTransaction(t.id)}
                border={i === 0 ? "transparent" : HOME_DIVIDER}
                surface={HOME_SURFACE}
                text={HOME_TEXT}
                editBg={HOME_ACCENT}
                editColor="#fff"
                deleteBg={HOME_EXPENSE}
                deleteColor="#fff"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 14px", backgroundColor: HOME_SURFACE }}>
                  <div style={tile(TIPS)}><IconTipsTile /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 16.5, fontWeight: 600, letterSpacing: "-0.2px", color: HOME_INCOME, fontVariantNumeric: "tabular-nums" }}>+{fmt(t.amount)}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 500, color: HOME_MUTED }}>{shortDate(t.transaction_date)}</p>
                  </div>
                </div>
              </SwipeableRow>
            ))
          )}
        </div>
      </div>

      {/* Deposits table */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 4px 12px" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px", color: HOME_TEXT }}>Deposits</h2>
          {monthDeposits.length > DEPOSITS_PAGE && (
            <span onClick={() => setShowAllDeposits((v) => !v)} style={{ color: HOME_ACCENT, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              {showAllDeposits ? "See less" : "See all"}
            </span>
          )}
        </div>

        {showForm && (
          <form onSubmit={saveDeposit} style={{ ...cardStyle, padding: 14, marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <p style={{ fontSize: 11, color: HOME_MUTED, marginBottom: 4, paddingLeft: 2 }}>Amount deposited</p>
              <CurrencyInput value={draft.amount} onChange={(v) => setDraft((d) => ({ ...d, amount: v }))} placeholder="0.00" style={fieldStyle} autoFocus />
            </div>
            <div>
              <p style={{ fontSize: 11, color: HOME_MUTED, marginBottom: 4, paddingLeft: 2 }}>Date</p>
              <input type="date" value={draft.deposit_date} onChange={(e) => setDraft((d) => ({ ...d, deposit_date: e.target.value }))} style={fieldStyle} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={closeForm}
                style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: `1px solid ${HOME_DIVIDER}`, background: "transparent", color: HOME_MUTED, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >Cancel</button>
              <button type="submit" disabled={saving || draft.amount === ""}
                style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: `1px solid ${TIPS_DEPOSITED}`, backgroundColor: `color-mix(in srgb, ${TIPS_DEPOSITED} 15%, transparent)`, color: TIPS_DEPOSITED, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: saving || draft.amount === "" ? 0.6 : 1 }}
              >{saving ? "Saving…" : "Save"}</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={{ fontSize: 11, color: HOME_MUTED, paddingLeft: 2 }}>Type</p>
              <Toggle
                checked={true}
                onChange={(v) => { if (!v) convertDepositToTip(); }}
                disabled={saving || converting}
                activeColor={TIPS_DEPOSITED}
              />
              {converting && <p style={{ fontSize: 11.5, color: HOME_MUTED, margin: 0 }}>Converting…</p>}
            </div>
          </form>
        )}

        <div style={cardStyle}>
          {loading ? (
            <ListRowSkeleton count={2} />
          ) : monthDeposits.length === 0 ? (
            <p style={{ fontSize: 13, color: HOME_MUTED, textAlign: "center", padding: "22px 0" }}>No deposits yet</p>
          ) : (
            shownDeposits.map((d, i) => (
              <SwipeableRow
                key={d.id}
                id={d.id}
                openId={openId}
                setOpenId={setOpenId}
                onEdit={() => startEditDeposit(d)}
                onDelete={() => removeDeposit(d.id)}
                border={i === 0 ? "transparent" : HOME_DIVIDER}
                surface={HOME_SURFACE}
                text={HOME_TEXT}
                editBg={HOME_ACCENT}
                editColor="#fff"
                deleteBg={HOME_EXPENSE}
                deleteColor="#fff"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 14px", backgroundColor: HOME_SURFACE }}>
                  <div style={tile("transparent", TIPS_DEPOSITED)}><IconBank color={TIPS_DEPOSITED} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 16.5, fontWeight: 600, letterSpacing: "-0.2px", color: HOME_TEXT, fontVariantNumeric: "tabular-nums" }}>{fmt(d.amount)}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: TIPS_DEPOSITED }}>Deposited {shortDate(d.deposit_date)}</p>
                  </div>
                </div>
              </SwipeableRow>
            ))
          )}
        </div>
      </div>
    </>
  );
}
