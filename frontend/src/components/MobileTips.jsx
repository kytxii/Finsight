import { useState, useEffect } from "react";
import SwipeableRow from "./SwipeableRow";
import CurrencyInput from "./CurrencyInput";
import { fmt } from "../utils/finance";
import { getToday } from "../utils/time";
import { periodLabel } from "../utils/mobileFormat";
import { getTipDeposits, createTipDeposit, updateTipDeposit, deleteTipDeposit } from "../api/tipDeposits";
import { HOME_TEXT, HOME_MUTED, HOME_SURFACE, HOME_DIVIDER, HOME_EXPENSE, HOME_ACCENT, TILE_COLOR } from "./categoryVisuals";
import { IconTipsTile } from "./categoryIcons";

// Dedicated Tips surface: a Tips table (everything earned) over a Deposits table
// (lump-sum cash banked into checking). The two are separate logs - real
// deposits rarely match individual tips. Cash on hand = tips - deposits. (#23)
const TIPS = TILE_COLOR.TIPS;        // #26a69a
const TIPS_DEPOSITED = "#5ccfc0";    // lighter teal for the deposit state
const PAGE = 5;

const shortDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Circular icon tile matching the two tables' row icons (filled, or bordered
// when transparent). `size` lets the hero use a smaller version.
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

function IconPlus() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

// Cash in hand — Lucide "hand-coins" (ISC). White strokes since it sits on a
// filled teal circle, matching the other tile icons.
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

function Skel({ w = "100%", h = 16, style: extra = {} }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 6, flexShrink: 0,
      background: "linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.11) 50%, rgba(255,255,255,0.05) 75%)",
      backgroundSize: "200% 100%", animation: "skel-shimmer 1.4s ease-in-out infinite", ...extra,
    }} />
  );
}

export default function MobileTips({ transactions, loading, onBack, onEditTransaction, onDeleteTransaction, onRefresh }) {
  const [deposits, setDeposits] = useState([]);
  const [depositsLoading, setDepositsLoading] = useState(true);
  const [showAllTips, setShowAllTips] = useState(false);
  const [showAllDeposits, setShowAllDeposits] = useState(false);
  const [openId, setOpenId] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ amount: "", deposit_date: getToday() });
  const [saving, setSaving] = useState(false);

  function loadDeposits() {
    setDepositsLoading(true);
    getTipDeposits()
      .then((r) => setDeposits(r.data))
      .catch(() => {})
      .finally(() => setDepositsLoading(false));
  }
  useEffect(() => { loadDeposits(); }, []);

  const tips = transactions
    .filter((t) => t.category === "TIPS")
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));

  const tipsEarned = tips.reduce((s, t) => s + parseFloat(t.amount), 0);
  const depositedTotal = deposits.reduce((s, d) => s + parseFloat(d.amount), 0);
  const cashOnHand = tipsEarned - depositedTotal;

  // Headline = tips earned in the current month; cash on hand is all-time.
  const thisMonth = getToday().slice(0, 7);
  const monthlyEarned = tips
    .filter((t) => t.transaction_date.slice(0, 7) === thisMonth)
    .reduce((s, t) => s + parseFloat(t.amount), 0);

  const shownTips = showAllTips ? tips : tips.slice(0, PAGE);
  const shownDeposits = showAllDeposits ? deposits : deposits.slice(0, PAGE);

  function openAddForm() {
    setEditingId(null);
    setDraft({ amount: "", deposit_date: getToday() });
    setShowForm((v) => !v);
  }

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
      if (editingId) await updateTipDeposit(editingId, { amount: n, deposit_date: draft.deposit_date });
      else await createTipDeposit({ amount: n, deposit_date: draft.deposit_date });
      closeForm();
      loadDeposits();
      onRefresh?.();
    } finally {
      setSaving(false);
    }
  }

  async function removeDeposit(id) {
    setDeposits((prev) => prev.filter((d) => d.id !== id));
    try { await deleteTipDeposit(id); onRefresh?.(); }
    catch { loadDeposits(); }
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
        {loading || depositsLoading ? (
          <Skel h={30} w="55%" style={{ marginTop: 8 }} />
        ) : (
          <p style={{ margin: "6px 0 0", fontSize: 30, fontWeight: 800, letterSpacing: "-0.6px", fontVariantNumeric: "tabular-nums", color: TIPS }}>{fmt(monthlyEarned)}</p>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={tile(TIPS, null, 30)}><IconHandCash size={17} /></div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: HOME_TEXT, fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>{fmt(cashOnHand)}</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: HOME_MUTED }}>cash on hand</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={tile("transparent", TIPS_DEPOSITED, 30)}><IconBank color={TIPS_DEPOSITED} size={15} /></div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: TIPS_DEPOSITED, fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>{fmt(depositedTotal)}</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: HOME_MUTED }}>deposited</span>
            </div>
          </div>
        </div>
      </div>

      {/* Full-screen tap-catcher to close an open swipe row */}
      {openId !== null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 5 }} onTouchStart={() => setOpenId(null)} onClick={() => setOpenId(null)} />
      )}

      {/* ── Tips table ── */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 4px 12px" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px", color: HOME_TEXT }}>Tips</h2>
          {tips.length > PAGE && (
            <span onClick={() => setShowAllTips((v) => !v)} style={{ color: HOME_ACCENT, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              {showAllTips ? "See less" : "See all"}
            </span>
          )}
        </div>
        <div style={cardStyle}>
          {loading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 14px", borderTop: i > 0 ? `1px solid ${HOME_DIVIDER}` : "none" }}>
                <Skel h={40} w={40} style={{ borderRadius: "50%" }} />
                <div style={{ flex: 1 }}><Skel h={16} w="45%" /></div>
              </div>
            ))
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
                    <p style={{ margin: 0, fontSize: 16.5, fontWeight: 600, letterSpacing: "-0.2px", color: HOME_TEXT, fontVariantNumeric: "tabular-nums" }}>{fmt(t.amount)}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 500, color: HOME_MUTED }}>{shortDate(t.transaction_date)}</p>
                  </div>
                </div>
              </SwipeableRow>
            ))
          )}
        </div>
      </div>

      {/* ── Deposits table ── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 4px 12px" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px", color: HOME_TEXT }}>Deposits</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {deposits.length > PAGE && (
              <span onClick={() => setShowAllDeposits((v) => !v)} style={{ color: HOME_ACCENT, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                {showAllDeposits ? "See less" : "See all"}
              </span>
            )}
            <button onClick={showForm ? closeForm : openAddForm} aria-label={showForm ? "Close" : "Add deposit"} style={{
              width: 34, height: 34, borderRadius: "50%", background: HOME_SURFACE,
              border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center",
              color: "#e6e6ea", cursor: "pointer", flexShrink: 0,
              transform: showForm ? "rotate(45deg)" : "none", transition: "transform 0.18s ease",
            }}>
              <IconPlus />
            </button>
          </div>
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
              >{saving ? "Saving…" : editingId ? "Save" : "Add deposit"}</button>
            </div>
          </form>
        )}

        <div style={cardStyle}>
          {depositsLoading ? (
            <div style={{ padding: "20px 0" }} />
          ) : deposits.length === 0 ? (
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
