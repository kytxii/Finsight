import { useState, useEffect, useMemo } from "react";
import SwipeableRow from "./SwipeableRow";
import AmountSortButton from "./AmountSortButton";
import Skel from "./Skel";
import CurrencyInput from "./CurrencyInput";
import { CATEGORY_CONFIG, INCOME_TYPES, fmt, nextAmountSort } from "../utils/finance";
import { periodLabel, relativeDate } from "../utils/mobileFormat";
import { getToday } from "../utils/time";
import { getPaychecks } from "../api/paychecks";
import { confirmRecurringPayment, skipRecurringPayment } from "../api/recurringPayments";
import {
  HOME_TEXT, HOME_MUTED, HOME_SURFACE, HOME_DIVIDER, HOME_INCOME, HOME_EXPENSE, HOME_ACCENT,
  TILE_COLOR, CATEGORY_ICON,
} from "./categoryVisuals";

function IconBack() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={HOME_TEXT} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function IconArrowUpRight() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={HOME_MUTED} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

function IconSkip() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

// Last day of the month `dateStr` (YYYY-MM-DD) falls in, as YYYY-MM-DD.
function monthEndOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return end.toLocaleDateString("en-CA");
}

// The Upcoming card is a visual inverse of the (filled, solid) Transactions
// card below it - outlined and transparent rather than a solid surface fill,
// reading as "not yet real" at a glance. Row structure, icon badges, and
// dotted dividers stay identical - only the fill inverts.
const UPCOMING_CARD_STYLE = {
  background: "transparent",
  border: `1px solid ${HOME_DIVIDER}`,
  borderRadius: 18,
  overflow: "hidden",
};

// Background tint by days-until-due, matching #60's spec: >7d normal, <=7d
// elevated, <=3d or overdue strongest. Mixed against transparent rather than
// HOME_SURFACE, since the card itself has no fill now.
function urgencyBackground(dueDate, today, tileColor) {
  const days = Math.round((new Date(dueDate + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
  if (days <= 3) return `color-mix(in srgb, ${HOME_EXPENSE} 16%, transparent)`;
  if (days <= 7) return `color-mix(in srgb, ${tileColor} 12%, transparent)`;
  return "transparent";
}

// One row of the Upcoming panel - same shape as a Transactions row (icon
// avatar, name, subtitle, trailing amount) so the two tables read as one
// system, just separated by a dotted divider instead of a solid one to mark
// these as not-yet-real. Only "pending" (due, awaiting confirm/skip) and
// "upcoming" (not yet due) items ever reach here - once a row resolves
// (posts a transaction, or gets skipped) it's removed from this list
// entirely rather than sticking around with a "Paid"/"Skipped" label, since
// a resolved item already shows in the real Transactions table below.
function UpcomingRow({ item, today, tileColor, icon, first, onConfirm, onSkip }) {
  const Icon = icon;
  const [confirming, setConfirming] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const background = item.status === "pending" ? urgencyBackground(item.due_date, today, tileColor) : "transparent";
  const displayAmount = item.status === "pending" ? (item.estimated_amount ?? item.amount) : item.amount;

  const startConfirm = () => {
    setValue(item.estimated_amount ?? item.amount ?? "");
    setConfirming(true);
    setError("");
  };

  const commitConfirm = async () => {
    const n = parseFloat(value);
    if (isNaN(n) || n <= 0) { setConfirming(false); return; }
    setBusy(true);
    try {
      await onConfirm(item.id, n);
      setConfirming(false);
    } catch {
      setError("Failed to confirm");
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = async () => {
    setBusy(true);
    setError("");
    try {
      await onSkip(item.id);
    } catch {
      setError("Failed to skip");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14, padding: "11px 14px",
      backgroundColor: background,
      borderTop: first ? "none" : `1px dotted ${HOME_DIVIDER}`,
    }}>
      <div style={{
        flex: "0 0 auto", width: 40, height: 40, borderRadius: "50%", background: tileColor,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16)",
      }}>
        <Icon />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.2px", color: HOME_TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.name}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 500, color: HOME_MUTED }}>
          {relativeDate(item.due_date)}
        </p>
        {error && <p style={{ margin: "2px 0 0", fontSize: 11, color: HOME_EXPENSE }}>{error}</p>}
      </div>

      {confirming ? (
        <CurrencyInput autoFocus
          value={value}
          onChange={setValue}
          onBlur={commitConfirm}
          onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setConfirming(false); }}
          style={{ width: 80, textAlign: "right", background: "transparent", color: HOME_TEXT, border: "none", outline: "none", fontSize: 15, fontFamily: "inherit" }}
        />
      ) : (
        <span style={{
          flex: "0 0 auto", marginLeft: 10, fontSize: 16, fontWeight: 600, letterSpacing: "-0.2px", fontVariantNumeric: "tabular-nums",
          color: HOME_TEXT,
        }}>
          {item.status === "pending" ? "~" : ""}{fmt(displayAmount ?? 0)}
        </span>
      )}

      {item.status === "pending" && !confirming && (
        <>
          <button onClick={startConfirm} disabled={busy}
            style={{
              fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, marginLeft: 8,
              border: `1px dashed color-mix(in srgb, ${tileColor} 60%, transparent)`,
              color: tileColor, backgroundColor: `color-mix(in srgb, ${tileColor} 10%, transparent)`,
              cursor: "pointer", flexShrink: 0,
            }}
          >
            Confirm
          </button>
          <button onClick={handleSkip} disabled={busy} aria-label="Skip this bill"
            style={{ color: HOME_MUTED, background: "none", border: "none", cursor: "pointer", padding: 3, display: "inline-flex", flexShrink: 0 }}
          >
            <IconSkip />
          </button>
        </>
      )}
    </div>
  );
}

export default function MobileCategory({
  category, transactions, loading, upcomingItems = [], onBack, onEditTransaction, onDeleteTransaction, onOpenPaychecks, onRefresh,
}) {
  const [openId, setOpenId] = useState(null);
  const [amountSort, setAmountSort] = useState(null); // null | "asc" | "desc"
  const [dismissedIds, setDismissedIds] = useState(new Set()); // resolved this render, hidden ahead of the next upcomingItems refresh
  const [paycheckUpcoming, setPaycheckUpcoming] = useState([]);
  const Icon = CATEGORY_ICON[category];
  const tileColor = TILE_COLOR[category] ?? HOME_MUTED;
  const isIncome = INCOME_TYPES.has(category);
  const today = getToday();

  // INCOME has no recurring-payment schedule of its own - pull upcoming
  // projections from the paychecks page instead, same source MobilePaychecks
  // itself reads from.
  useEffect(() => {
    if (category !== "INCOME") return;
    getPaychecks().then((res) => setPaycheckUpcoming(res.data.paychecks ?? [])).catch(() => {});
  }, [category]);

  const monthEnd = useMemo(() => monthEndOf(today), [today]);

  // Only pending/upcoming items ever show here - once a recurring item
  // resolves (posts a transaction, whether auto-posted or confirmed, or gets
  // skipped) it drops off this list entirely instead of sticking around
  // labeled "Paid"/"Skipped". A resolved item already shows for real in the
  // Transactions table below, so keeping it here too would just be a
  // duplicate. dismissedIds hides a just-resolved row immediately, ahead of
  // the next upcomingItems refresh reflecting the same thing from the server.
  const categoryUpcoming = useMemo(() => {
    return upcomingItems.filter((i) =>
      i.category === category &&
      (i.status === "pending" || i.status === "upcoming") &&
      !dismissedIds.has(i.id)
    );
  }, [upcomingItems, category, dismissedIds]);

  const upcomingPaychecks = useMemo(() => {
    return paycheckUpcoming.filter((p) => p.pay_date >= today && p.pay_date <= monthEnd);
  }, [paycheckUpcoming, today, monthEnd]);

  const handleConfirm = async (id, amount) => {
    await confirmRecurringPayment(id, { amount });
    setDismissedIds((prev) => new Set(prev).add(id));
    onRefresh?.();
  };

  const handleSkip = async (id) => {
    await skipRecurringPayment(id);
    setDismissedIds((prev) => new Set(prev).add(id));
    onRefresh?.();
  };

  const catTxns = transactions
    .filter((t) => t.category === category)
    .sort((a, b) => {
      if (amountSort === "asc") return parseFloat(a.amount) - parseFloat(b.amount);
      if (amountSort === "desc") return parseFloat(b.amount) - parseFloat(a.amount);
      return new Date(b.transaction_date) - new Date(a.transaction_date);
    });
  const total = catTxns.reduce((s, t) => s + parseFloat(t.amount), 0);

  return (
    <>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 2px 20px" }}>
        <button
          onClick={onBack}
          aria-label="Back to home"
          style={{
            width: 36, height: 36, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
            background: HOME_SURFACE, border: "1px solid rgba(255,255,255,0.07)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <IconBack />
        </button>
        <div style={{
          flex: "0 0 auto", width: 34, height: 34, borderRadius: 10, background: tileColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
        }}>
          <Icon />
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.4px", color: HOME_TEXT }}>
          {CATEGORY_CONFIG[category]?.label ?? category}
        </h1>
      </div>

      {/* Summary */}
      <div style={{ margin: "0 2px 20px" }}>
        <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: HOME_MUTED, textTransform: "uppercase", letterSpacing: "0.4px" }}>
          {periodLabel()}
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1, backgroundColor: HOME_SURFACE, borderRadius: 18, padding: "13px 15px 14px" }}>
            <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 500, color: HOME_MUTED }}>Total</p>
            {loading ? (
              <Skel h={23} w="65%" />
            ) : (
              <p style={{ margin: 0, fontSize: 23, fontWeight: 700, letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums", color: isIncome ? HOME_INCOME : HOME_TEXT }}>
                {fmt(total)}
              </p>
            )}
          </div>
          <div style={{ flex: 1, backgroundColor: HOME_SURFACE, borderRadius: 18, padding: "13px 15px 14px" }}>
            <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 500, color: HOME_MUTED }}>Transactions</p>
            {loading ? (
              <Skel h={23} w="35%" />
            ) : (
              <p style={{ margin: 0, fontSize: 23, fontWeight: 700, letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums", color: HOME_TEXT }}>
                {catTxns.length}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Upcoming - this category's scheduled items still awaiting their due
          date or a confirm/skip (#60). Same table styling as Transactions
          below, dotted dividers instead of solid to mark these as not-yet-real.
          A row disappears once it resolves (posts or gets skipped) rather than
          sticking around labeled - it's already visible for real below. */}
      {category === "INCOME" ? (
        upcomingPaychecks.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 4px 12px" }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px", color: HOME_TEXT }}>Upcoming</h2>
              <button onClick={onOpenPaychecks} aria-label="Open Paychecks"
                style={{ color: HOME_MUTED, background: "none", border: "none", cursor: "pointer", padding: 3, display: "inline-flex" }}
              >
                <IconArrowUpRight />
              </button>
            </div>
            <div style={{ ...UPCOMING_CARD_STYLE, marginBottom: 20 }}>
              {upcomingPaychecks.map((p, i) => (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "11px 14px",
                  backgroundColor: "transparent", borderTop: i === 0 ? "none" : `1px dotted ${HOME_DIVIDER}`,
                }}>
                  <div style={{
                    flex: "0 0 auto", width: 40, height: 40, borderRadius: "50%", background: tileColor,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16)",
                  }}>
                    <Icon />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.2px", color: HOME_TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.schedule_name ?? "Paycheck"}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 500, color: HOME_MUTED }}>
                      {relativeDate(p.pay_date)}
                    </p>
                  </div>
                  <span style={{ flex: "0 0 auto", marginLeft: 10, fontSize: 16, fontWeight: 600, letterSpacing: "-0.2px", fontVariantNumeric: "tabular-nums", color: HOME_INCOME }}>
                    {p.amount != null ? fmt(p.amount) : p.estimated_amount != null ? `~${fmt(p.estimated_amount)}` : "Upcoming"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        categoryUpcoming.length > 0 && (
          <div>
            <h2 style={{ margin: "0 4px 12px", fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px", color: HOME_TEXT }}>Upcoming</h2>
            <div style={{ ...UPCOMING_CARD_STYLE, marginBottom: 20 }}>
              {categoryUpcoming.map((item, i) => (
                <UpcomingRow
                  key={item.id}
                  item={item}
                  today={today}
                  tileColor={tileColor}
                  icon={Icon}
                  first={i === 0}
                  onConfirm={handleConfirm}
                  onSkip={handleSkip}
                />
              ))}
            </div>
          </div>
        )
      )}

      {/* Transactions */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 4px 12px" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px", color: HOME_TEXT }}>Transactions</h2>
          <AmountSortButton sort={amountSort} onToggle={() => setAmountSort(nextAmountSort)} color={tileColor} />
        </div>
        <div style={{ backgroundColor: HOME_SURFACE, borderRadius: 18, overflow: "hidden" }}>
          {openId !== null && (
            <div
              style={{ position: "fixed", inset: 0, zIndex: 5 }}
              onTouchStart={() => setOpenId(null)}
              onClick={() => setOpenId(null)}
            />
          )}
          {loading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 14px", borderTop: i > 0 ? `1px solid ${HOME_DIVIDER}` : "none" }}>
                <Skel h={40} w={40} style={{ borderRadius: "50%" }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <Skel h={16} w="55%" />
                  <Skel h={13} w="30%" />
                </div>
                <Skel h={16} w={60} />
              </div>
            ))
          ) : catTxns.length === 0 ? (
            <p style={{ fontSize: 13, color: HOME_MUTED, textAlign: "center", padding: "22px 0" }}>
              No transactions this month
            </p>
          ) : (
            catTxns.map((t, i) => (
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
                  <div style={{
                    flex: "0 0 auto", width: 40, height: 40, borderRadius: "50%", background: tileColor,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16)",
                  }}>
                    <Icon />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.2px", color: HOME_TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {t.name}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 500, color: HOME_MUTED }}>
                      {relativeDate(t.transaction_date)}
                    </p>
                  </div>
                  <span style={{ flex: "0 0 auto", marginLeft: 10, fontSize: 16, fontWeight: 600, letterSpacing: "-0.2px", fontVariantNumeric: "tabular-nums", color: isIncome ? HOME_INCOME : HOME_TEXT }}>
                    {isIncome ? "+" : "−"}{fmt(t.amount)}
                  </span>
                </div>
              </SwipeableRow>
            ))
          )}
        </div>
      </div>
    </>
  );
}
