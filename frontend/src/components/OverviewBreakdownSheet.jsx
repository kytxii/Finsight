import { useEffect, useState } from "react";
import { fmt, CATEGORY_CONFIG } from "../utils/finance";
import { useSheetDrag, SHEET_EASE } from "../hooks/useSheetDrag";
import { HOME_TEXT, HOME_MUTED, HOME_SURFACE, HOME_DIVIDER, HOME_INCOME, HOME_EXPENSE, TILE_COLOR } from "./categoryVisuals";

const EXIT_MS = 260; // matches the breakdown-up entry duration

// Bottom sheet explaining how a single overview-card stat was derived. Opened by
// tapping a cell on the Home overview card (#42). `cell` is the tapped stat key
// (balance | bills | cash | savings) or null when closed.

const TITLES = {
  balance: "Current Balance",
  bills: "Upcoming Bills",
  cash: "Available Cash",
  savings: "Estimated Savings",
};

function shortDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Row({ label, value, color = HOME_TEXT, strong = false, muted = false, divider = false }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      padding: "10px 0", borderTop: divider ? `1px solid ${HOME_DIVIDER}` : "none",
    }}>
      <span style={{ fontSize: strong ? 15 : 14, fontWeight: strong ? 700 : 500, color: muted ? HOME_MUTED : HOME_TEXT }}>{label}</span>
      <span style={{ fontSize: strong ? 16 : 14.5, fontWeight: strong ? 800 : 600, fontVariantNumeric: "tabular-nums", color }}>{value}</span>
    </div>
  );
}

// The exact row markup Upcoming Bills uses for each line item - dot, bold
// name, muted meta subtitle underneath - reused here so Available Cash and
// Estimated Savings share its spacing, padding, and two-line rhythm instead
// of a flatter single-line label/value pair.
function DotRow({ label, meta, value, color = HOME_TEXT, dotColor = HOME_MUTED, divider = false }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      padding: "11px 0", borderTop: divider ? `1px solid ${HOME_DIVIDER}` : "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: HOME_TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</p>
          {meta && <p style={{ margin: "1px 0 0", fontSize: 12, color: HOME_MUTED }}>{meta}</p>}
        </div>
      </div>
      <span style={{ fontSize: 14.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", color, flexShrink: 0 }}>{value}</span>
    </div>
  );
}

function Note({ children }) {
  return <p style={{ margin: "12px 2px 0", fontSize: 12.5, lineHeight: 1.5, color: HOME_MUTED }}>{children}</p>;
}

// ── Per-cell content ─────────────────────────────────────────────────────────

function BalanceBody({ safeToSpend, status }) {
  if (status !== "ok" || !safeToSpend) {
    return <Note>Set a starting balance in Paychecks to track your running balance here.</Note>;
  }
  return (
    <>
      <Row label="Checking" value={fmt(safeToSpend.running_balance)} color={HOME_TEXT} strong />
      <Note>
        Builds forward from the starting balance you set in Paychecks, using your
        actual transactions since then. A live bank-synced balance will replace
        this once account integration ships.
      </Note>
    </>
  );
}

function BillsBody({ safeToSpend, status }) {
  if (status !== "ok" || !safeToSpend) {
    return <Note>Set up a paycheck schedule and starting balance to see your upcoming bills.</Note>;
  }
  const bills = safeToSpend.bills_breakdown ?? [];
  return (
    <>
      <p style={{ margin: "0 2px 6px", fontSize: 12.5, color: HOME_MUTED }}>
        Due before your next paycheck on {shortDate(safeToSpend.next_payday)}
      </p>
      {bills.length === 0 ? (
        <Note>No bills are due before your next paycheck.</Note>
      ) : (
        <>
          {bills.map((b, i) => {
            const color = TILE_COLOR[b.category] ?? HOME_MUTED;
            const label = CATEGORY_CONFIG[b.category]?.label ?? b.category;
            return (
              <div key={`${b.name}-${i}`} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                padding: "11px 0", borderTop: i > 0 ? `1px solid ${HOME_DIVIDER}` : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: HOME_TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</p>
                    <p style={{ margin: "1px 0 0", fontSize: 12, color: HOME_MUTED }}>
                      {b.due_date ? `${label} · due ${shortDate(b.due_date)}` : `${label} · estimated`}
                    </p>
                  </div>
                </div>
                <span style={{ fontSize: 14.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: HOME_TEXT, flexShrink: 0 }}>
                  {fmt(b.amount)}
                </span>
              </div>
            );
          })}
          <Row label="Total due" value={fmt(safeToSpend.bills_before_next_payday)} color={TILE_COLOR.BILL} strong divider />
        </>
      )}
    </>
  );
}

function CashBody({ safeToSpend, status }) {
  if (status !== "ok" || !safeToSpend) {
    return <Note>Set a starting balance and paycheck schedule to project your leftover cash.</Note>;
  }
  const surplus = parseFloat(safeToSpend.spendable_surplus);
  const freeToAllocate = parseFloat(safeToSpend.free_to_allocate);
  const reserved = surplus - freeToAllocate;
  const nextPaydayLabel = shortDate(safeToSpend.next_payday);
  const billCount = safeToSpend.bills_breakdown?.length ?? 0;
  return (
    <>
      <DotRow label="Current balance" meta="As of today" value={fmt(safeToSpend.running_balance)} />
      <DotRow
        label="Next paycheck"
        meta={safeToSpend.next_payday_estimate != null ? `Estimated · ${nextPaydayLabel}` : `No estimate yet · ${nextPaydayLabel}`}
        value={safeToSpend.next_payday_estimate != null ? `+${fmt(safeToSpend.next_payday_estimate)}` : "—"}
        color={HOME_INCOME}
        dotColor={HOME_INCOME}
        divider
      />
      <DotRow
        label="Bills before then"
        meta={billCount > 0 ? `${billCount} bill${billCount !== 1 ? "s" : ""} due` : "None due"}
        value={`−${fmt(safeToSpend.bills_before_next_payday)}`}
        color={HOME_EXPENSE}
        dotColor={HOME_EXPENSE}
        divider
      />
      {reserved > 0.005 && (
        <DotRow label="Spending reserve" meta="Set aside, not spendable" value={`−${fmt(reserved)}`} color={HOME_EXPENSE} dotColor={HOME_EXPENSE} divider />
      )}
      <Row label="Available cash" value={fmt(safeToSpend.free_to_allocate)} color={freeToAllocate >= 0 ? HOME_INCOME : HOME_EXPENSE} strong divider />
    </>
  );
}

function SavingsBody({ savings, status }) {
  if (status === "no-history") {
    return <Note>Your savings estimate needs at least 3 months of spending history to project from.</Note>;
  }
  if (status !== "ok" || !savings) {
    return <Note>Add a paycheck amount and some spending history to estimate what you can save.</Note>;
  }
  return (
    <>
      {/* whole_month_income covers the full month regardless of whether it's
          already landed - a raise or amount correction shows up immediately
          instead of vanishing once payday passes. The spending side blends
          what's actually posted so far with a historical rate for the days
          left, so the total gets more accurate as the month goes on (#85). */}
      <DotRow label="Income this month" meta="Paychecks + other income" value={`+${fmt(savings.whole_month_income)}`} color={HOME_INCOME} dotColor={HOME_INCOME} />
      <DotRow label="Fixed bills" meta="Recurring, non-savings" value={`−${fmt(savings.committed_recurring)}`} color={HOME_EXPENSE} dotColor={HOME_EXPENSE} divider />
      <DotRow label="Spent so far" meta="Discretionary, this month" value={`−${fmt(savings.discretionary_spent_so_far)}`} color={HOME_EXPENSE} dotColor={HOME_EXPENSE} divider />
      <DotRow label="Typical spending" meta="Historical avg, rest of month" value={`−${fmt(savings.discretionary_projected_remaining)}`} color={HOME_EXPENSE} dotColor={HOME_EXPENSE} divider />
      <Row
        label="Saved / projected"
        value={`${fmt(savings.saved_so_far)} / ${fmt(savings.estimated_savings)}`}
        color={TILE_COLOR.SAVINGS}
        strong
        divider
      />
    </>
  );
}

export default function OverviewBreakdownSheet({ cell, onClose, safeToSpend, safeToSpendStatus, savings, savingsStatus }) {
  // Closing is staged rather than immediate: the parent unmounts this component
  // the moment onClose fires, which would cut the exit animation off. Hold it for
  // one animation, then hand control back. (#46)
  const [closing, setClosing] = useState(false);
  const requestClose = () => setClosing(true);

  // This component is mounted permanently by MobileDashboard and self-guards on
  // `cell` below, so `closing` does not reset itself between openings. Without
  // this it stays true after the first close and every later open renders the
  // sheet off-screen behind a transparent, full-screen backdrop that swallows
  // every click.
  const [prevCell, setPrevCell] = useState(cell);
  if (prevCell !== cell) {
    setPrevCell(cell);
    if (cell) setClosing(false);
  }

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(onClose, EXIT_MS);
    return () => clearTimeout(timer);
  }, [closing, onClose]);

  const { dragY, dragging, handlers } = useSheetDrag(requestClose);
  if (!cell) return null;

  return (
    <div
      onClick={requestClose}
      style={{
        position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-end",
        background: closing ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.55)",
        transition: `background ${EXIT_MS}ms ease`,
      }}
    >
      <style>{`@keyframes breakdown-up { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxHeight: "82vh", overflowY: "auto", overscrollBehavior: "contain",
          background: HOME_SURFACE, borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: "10px 18px calc(env(safe-area-inset-bottom, 0px) + 24px)",
          // Exit rides a transition rather than a keyframe so it starts from
          // wherever the sheet currently sits. Releasing a drag past the threshold
          // resets dragY to 0 in the same batch as closing, but the transition
          // interpolates from the last painted offset, so there is no snap back
          // to rest before it slides away.
          transform: closing ? "translateY(100%)" : dragging ? `translateY(${dragY}px)` : undefined,
          // Skip the entry animation once a drag or close is under way, or it
          // restarts mid-gesture and the sheet jumps back to the bottom.
          animation: dragging || closing ? undefined : "breakdown-up 0.26s cubic-bezier(0.32, 0.72, 0, 1)",
          transition: dragging ? "none" : `transform ${EXIT_MS}ms ${SHEET_EASE}`,
        }}
      >
        {/* Drag region spans the notch and the title row rather than the notch
            alone, so the gesture does not demand a precise hit. It stops short of
            the panel body, which is the scroll container (overflowY above) and
            would fight the drag. Close still works: these handlers never call
            preventDefault, so a tap that does not move falls through as a click. */}
        <div {...handlers} style={{ touchAction: "none" }}>
          <div style={{ display: "flex", justifyContent: "center", padding: "4px 0 12px", cursor: "grab" }}>
            <div style={{ width: 38, height: 4, borderRadius: 999, background: "rgba(255,255,255,0.18)" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px", color: HOME_TEXT }}>{TITLES[cell]}</h2>
          </div>
        </div>

        {cell === "balance" && <BalanceBody safeToSpend={safeToSpend} status={safeToSpendStatus} />}
        {cell === "bills" && <BillsBody safeToSpend={safeToSpend} status={safeToSpendStatus} />}
        {cell === "cash" && <CashBody safeToSpend={safeToSpend} status={safeToSpendStatus} />}
        {cell === "savings" && <SavingsBody savings={savings} status={savingsStatus} />}
      </div>
    </div>
  );
}
