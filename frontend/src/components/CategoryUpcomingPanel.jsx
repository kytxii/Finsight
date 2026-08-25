import { useCallback, useEffect, useMemo, useState } from "react";
import { CATEGORY_CONFIG, fmt } from "../utils/finance";
import { getToday } from "../utils/time";
import { relativeDate } from "../utils/mobileFormat";
import { getPaychecks } from "../api/paychecks";
import { confirmRecurringPayment, skipRecurringPayment, getUpcomingRecurringPayments } from "../api/recurringPayments";
import {
  HOME_SURFACE,
  HOME_DIVIDER,
  HOME_TEXT,
  HOME_MUTED,
  HOME_INCOME,
  HOME_EXPENSE,
  CATEGORY_ACCENT,
  PANEL_ROW_PAD_Y,
} from "./categoryVisuals";

// Desktop's per-category Upcoming panel (#127) - the counterpart to the
// section MobileCategory has had since #60, which desktop never got. Same data
// and the same rules (only pending/upcoming rows, INCOME reads paychecks
// instead of recurring payments); the styling follows desktop's panel language
// - card shell, PANEL_ROW_PAD_Y rows, solid dividers - rather than porting
// mobile's dotted-divider treatment onto a surface built for a different scale.
//
// Fetches its own data instead of taking it from Dashboard: it only ever
// mounts on a category page, so hoisting the request would make the ALL
// dashboard pay for something it never renders.

function monthEndOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
}

// A due date inside the next few days tints its row - the same escalation
// mobile uses, so an overdue bill reads as urgent on both.
function urgencyBackground(dueDate, today, tint) {
  const days = Math.round((new Date(dueDate + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
  if (days <= 3) return `color-mix(in srgb, ${HOME_EXPENSE} 14%, transparent)`;
  if (days <= 7) return `color-mix(in srgb, ${tint} 10%, transparent)`;
  return "transparent";
}

function ActionButton({ children, onClick, disabled, tint }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="rounded-lg transition-colors"
      style={{
        padding: "5px 11px",
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        border: `1px solid ${tint ? "transparent" : HOME_DIVIDER}`,
        color: tint ? "#04121a" : HOME_MUTED,
        backgroundColor: tint
          ? (hovered && !disabled ? `color-mix(in srgb, ${tint} 85%, white)` : tint)
          : (hovered && !disabled ? "rgba(255,255,255,0.07)" : "transparent"),
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

// A pending row swaps its amount for an editable confirm field, because the
// figure on a variable bill (#58) is an estimate until the real one is known.
function UpcomingRow({ item, today, color, first, onConfirm, onSkip }) {
  const [confirming, setConfirming] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pending = item.status === "pending";
  const displayAmount = pending ? (item.estimated_amount ?? item.amount) : item.amount;

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
    <div
      className="px-6"
      style={{
        paddingTop: PANEL_ROW_PAD_Y,
        paddingBottom: PANEL_ROW_PAD_Y,
        borderTop: first ? "none" : `1px solid ${HOME_DIVIDER}`,
        backgroundColor: pending ? urgencyBackground(item.due_date, today, color) : "transparent",
      }}
    >
      <div className="flex items-center gap-3">
        <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: color, flexShrink: 0, opacity: pending ? 1 : 0.45 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="text-base font-semibold" style={{ margin: 0, color: HOME_TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.name}
          </p>
          <p style={{ margin: "1px 0 0", fontSize: 12.5, color: HOME_MUTED }}>
            {pending ? "Due " : ""}{relativeDate(item.due_date)}
          </p>
        </div>
        {confirming ? (
          <input
            autoFocus
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitConfirm();
              if (e.key === "Escape") setConfirming(false);
            }}
            onBlur={commitConfirm}
            disabled={busy}
            className="rounded-lg"
            style={{
              width: 96, padding: "5px 9px", textAlign: "right",
              fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums",
              color: HOME_TEXT, backgroundColor: "rgba(255,255,255,0.06)",
              border: `1px solid ${color}`, outline: "none",
            }}
          />
        ) : (
          <span
            className="text-base font-bold"
            style={{ fontVariantNumeric: "tabular-nums", color: pending ? HOME_TEXT : HOME_MUTED, flexShrink: 0 }}
          >
            {displayAmount != null ? fmt(displayAmount) : "—"}
          </span>
        )}
      </div>

      {pending && !confirming && (
        <div className="flex items-center justify-end gap-2" style={{ marginTop: 8 }}>
          <ActionButton onClick={handleSkip} disabled={busy}>Skip</ActionButton>
          <ActionButton onClick={startConfirm} disabled={busy} tint={color}>Confirm</ActionButton>
        </div>
      )}
      {error && (
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: HOME_EXPENSE, textAlign: "right" }}>{error}</p>
      )}
    </div>
  );
}

function PaycheckRow({ paycheck, color, first }) {
  return (
    <div
      className="px-6 flex items-center gap-3"
      style={{
        paddingTop: PANEL_ROW_PAD_Y,
        paddingBottom: PANEL_ROW_PAD_Y,
        borderTop: first ? "none" : `1px solid ${HOME_DIVIDER}`,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="text-base font-semibold" style={{ margin: 0, color: HOME_TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {paycheck.schedule_name ?? "Paycheck"}
        </p>
        <p style={{ margin: "1px 0 0", fontSize: 12.5, color: HOME_MUTED }}>{relativeDate(paycheck.pay_date)}</p>
      </div>
      <span className="text-base font-bold" style={{ fontVariantNumeric: "tabular-nums", color: HOME_INCOME, flexShrink: 0 }}>
        {paycheck.amount != null
          ? fmt(paycheck.amount)
          : paycheck.estimated_amount != null
            ? `~${fmt(paycheck.estimated_amount)}`
            : "Upcoming"}
      </span>
    </div>
  );
}

export default function CategoryUpcomingPanel({ category, onRefresh }) {
  const [items, setItems] = useState([]);
  const [paychecks, setPaychecks] = useState([]);
  // Rows resolved in this render, hidden immediately rather than waiting for
  // the refetch to reflect it.
  const [dismissedIds, setDismissedIds] = useState(new Set());

  const color = CATEGORY_ACCENT[category] ?? HOME_MUTED;
  const label = CATEGORY_CONFIG[category]?.label ?? category;
  const isIncome = category === "INCOME";
  const today = getToday();
  const monthEnd = useMemo(() => monthEndOf(today), [today]);

  const load = useCallback(() => {
    if (isIncome) {
      getPaychecks().then((res) => setPaychecks(res.data.paychecks ?? [])).catch(() => setPaychecks([]));
    } else {
      getUpcomingRecurringPayments().then((res) => setItems(res.data)).catch(() => setItems([]));
    }
  }, [isIncome]);

  useEffect(() => { load(); }, [load]);

  // Dismissals belong to the category that produced them, so switching pages
  // clears them. Done in render rather than an effect so the stale set never
  // gets a frame to hide a row on the new category (same pattern
  // OverviewBreakdownSheet uses to reset its own per-open state).
  const [prevCategory, setPrevCategory] = useState(category);
  if (prevCategory !== category) {
    setPrevCategory(category);
    setDismissedIds(new Set());
  }

  const categoryUpcoming = useMemo(
    () => items.filter((i) =>
      i.category === category &&
      (i.status === "pending" || i.status === "upcoming") &&
      !dismissedIds.has(i.id)
    ),
    [items, category, dismissedIds],
  );

  const upcomingPaychecks = useMemo(
    () => paychecks.filter((p) => p.pay_date >= today && p.pay_date <= monthEnd),
    [paychecks, today, monthEnd],
  );

  const handleConfirm = async (id, amount) => {
    await confirmRecurringPayment(id, { amount });
    setDismissedIds((prev) => new Set(prev).add(id));
    load();
    onRefresh?.();
  };

  const handleSkip = async (id) => {
    await skipRecurringPayment(id);
    setDismissedIds((prev) => new Set(prev).add(id));
    load();
    onRefresh?.();
  };

  const rows = isIncome ? upcomingPaychecks : categoryUpcoming;
  // Nothing scheduled means no panel at all, same as mobile - an empty card
  // would just be a permanent blank on categories that never have upcoming
  // items (e.g. one-off spending).
  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl" style={{ backgroundColor: HOME_SURFACE, color: HOME_TEXT }}>
      <div className="px-6 py-4 border-b flex items-center justify-between gap-3" style={{ borderColor: HOME_DIVIDER }}>
        <div className="flex items-center gap-3">
          <span style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: color, flexShrink: 0 }} />
          <h3 className="text-xl font-semibold">Upcoming</h3>
        </div>
        <span style={{ fontSize: 12.5, color: HOME_MUTED }}>
          {isIncome ? "This month" : `${label} due`}
        </span>
      </div>

      {isIncome
        ? upcomingPaychecks.map((p, i) => (
            <PaycheckRow key={p.id} paycheck={p} color={color} first={i === 0} />
          ))
        : categoryUpcoming.map((item, i) => (
            <UpcomingRow
              key={item.id}
              item={item}
              today={today}
              color={color}
              first={i === 0}
              onConfirm={handleConfirm}
              onSkip={handleSkip}
            />
          ))}
    </div>
  );
}
