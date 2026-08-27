import { useState, useEffect, useMemo, useRef } from "react";
import SwipeableRow from "./SwipeableRow";
import AmountSortButton from "./AmountSortButton";
import Skel from "../shared/Skel";
import CurrencyInput from "../shared/CurrencyInput";
import NotePill from "../shared/NotePill";
import { CATEGORY_CONFIG, INCOME_TYPES, fmt, nextAmountSort } from "../../utils/finance";
import { periodLabel, relativeDate } from "../../utils/mobileFormat";
import { getToday } from "../../utils/time";
import { getPaychecks } from "../../api/paychecks";
import { confirmRecurringPayment, skipRecurringPayment } from "../../api/recurringPayments";
import {
  HOME_TEXT, HOME_MUTED, HOME_SURFACE, HOME_DIVIDER, HOME_INCOME, HOME_EXPENSE, HOME_ACCENT,
  TILE_COLOR, CATEGORY_ICON,
} from "../shared/categoryVisuals";

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

const TX_PAGE_SIZE = 25;

function monthEndOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return end.toLocaleDateString("en-CA");
}

const UPCOMING_CARD_STYLE = {
  background: "transparent",
  border: `1px solid ${HOME_DIVIDER}`,
  borderRadius: 18,
  overflow: "hidden",
};

// Background tint gets stronger as the due date approaches (#60).
function urgencyBackground(dueDate, today, tileColor) {
  const days = Math.round((new Date(dueDate + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
  if (days <= 3) return `color-mix(in srgb, ${HOME_EXPENSE} 16%, transparent)`;
  if (days <= 7) return `color-mix(in srgb, ${tileColor} 12%, transparent)`;
  return "transparent";
}

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
  category, transactions, monthlyHistory = [], loading, upcomingItems = [], onBack, onEditTransaction, onDeleteTransaction, onOpenPaychecks, onRefresh,
}) {
  const [openId, setOpenId] = useState(null);
  const [amountSort, setAmountSort] = useState(null); // null | "asc" | "desc"
  const [visibleCount, setVisibleCount] = useState(TX_PAGE_SIZE);
  const loadMoreRef = useRef(null);
  const [dismissedIds, setDismissedIds] = useState(new Set()); // resolved this render, hidden ahead of the next upcomingItems refresh
  const [paycheckUpcoming, setPaycheckUpcoming] = useState([]);
  const Icon = CATEGORY_ICON[category];
  const tileColor = TILE_COLOR[category] ?? HOME_MUTED;
  const isIncome = INCOME_TYPES.has(category);
  const today = getToday();

  // INCOME has no recurring schedule, so upcoming items come from paychecks instead.
  useEffect(() => {
    if (category !== "INCOME") return;
    getPaychecks().then((res) => setPaycheckUpcoming(res.data.paychecks ?? [])).catch(() => {});
  }, [category]);

  const monthEnd = useMemo(() => monthEndOf(today), [today]);

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

  const visibleTxns = catTxns.slice(0, visibleCount);
  const hasMoreTxns = visibleCount < catTxns.length;

  const [prevWindowKey, setPrevWindowKey] = useState(`${category}|${amountSort}`);
  const windowKey = `${category}|${amountSort}`;
  if (prevWindowKey !== windowKey) {
    setPrevWindowKey(windowKey);
    setVisibleCount(TX_PAGE_SIZE);
  }

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMoreTxns) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) => c + TX_PAGE_SIZE);
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMoreTxns, visibleCount]);

  const monthlyTotals = monthlyHistory.map((bucket) =>
    bucket.filter((t) => t.category === category).reduce((s, t) => s + parseFloat(t.amount), 0)
  );
  const historyTotals = monthlyTotals.length > 0 ? [...monthlyTotals.slice(0, -1), total] : [];
  const lastMonthTotal = historyTotals.length >= 2 ? historyTotals[historyTotals.length - 2] : 0;
  const pctChange = lastMonthTotal > 0 ? ((total - lastMonthTotal) / lastMonthTotal) * 100 : null;
  const changeUp = pctChange !== null && pctChange >= 0;
  const changeGood = changeUp === isIncome;
  const changeColor = changeGood ? HOME_INCOME : HOME_EXPENSE;
  const barMax = Math.max(...historyTotals, 0) || 1;

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
          <div style={{ flex: 1, backgroundColor: HOME_SURFACE, borderRadius: 18, padding: "13px 15px 14px", display: "flex", flexDirection: "column" }}>
            {loading ? (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <Skel h={13} w={70} />
                  <Skel h={15} w={28} />
                </div>
                <div style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                  {[11, 7, 15, 9, 13, 17].map((h, i) => (
                    <Skel key={i} w={12} h={h} style={{ borderRadius: "2px 2px 0 0" }} />
                  ))}
                </div>
              </>
            ) : historyTotals.every((v) => v === 0) ? (
              <>
                <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 500, color: HOME_MUTED }}>vs Last Month</p>
                <p style={{ margin: 0, fontSize: 23, fontWeight: 700, color: HOME_MUTED }}>—</p>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: HOME_MUTED }}>vs Last Month</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {pctChange !== null && (
                      <svg width={11} height={11} viewBox="0 0 24 24" fill={changeColor} style={{ transform: changeUp ? undefined : "rotate(180deg)", flexShrink: 0 }}>
                        <path d="M12 3 L22 20 L2 20 Z" />
                      </svg>
                    )}
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: "-0.3px", fontVariantNumeric: "tabular-nums", color: pctChange !== null ? changeColor : HOME_TEXT }}>
                      {pctChange !== null ? `${Math.round(Math.abs(pctChange))}%` : "New"}
                    </p>
                  </div>
                </div>
                <div style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                  {historyTotals.map((v, i) => {
                    const opacity = historyTotals.length > 1 ? 0.35 + (i / (historyTotals.length - 1)) * 0.65 : 1;
                    return (
                      <div key={i} style={{
                        width: 12, flex: "0 0 auto", borderRadius: "3px 3px 0 0",
                        height: `${Math.max((v / barMax) * 20, 2)}px`,
                        backgroundColor: tileColor, opacity,
                      }} />
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Scheduled items awaiting due date or confirm/skip (#60), dotted dividers to mark them as not-yet-real. */}
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
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "0 4px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px", color: HOME_TEXT }}>Transactions</h2>
            <span style={{
              display: "block", minWidth: 26, height: 26, lineHeight: "26px",
              padding: "0 8px", borderRadius: 999, textAlign: "center",
              fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums",
              color: tileColor, backgroundColor: `color-mix(in srgb, ${tileColor} 16%, transparent)`,
              boxSizing: "content-box",
            }}>
              {catTxns.length}
            </span>
          </div>
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
            visibleTxns.map((t, i) => (
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
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <p style={{ margin: 0, flex: "0 1 auto", minWidth: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.2px", color: HOME_TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {t.name}
                      </p>
                      <NotePill note={t.note} style={{ flexShrink: 0 }} />
                    </div>
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
          {hasMoreTxns && (
            <div ref={loadMoreRef} style={{ padding: "14px 0", textAlign: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: HOME_MUTED }}>
                Loading more…
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
