import { useEffect, useState } from "react";
import { fmt, CATEGORY_CONFIG } from "../../utils/finance";
import { useSheetDrag, SHEET_EASE } from "../../hooks/useSheetDrag";
import { HOME_TEXT, HOME_MUTED, HOME_SURFACE, HOME_DIVIDER, HOME_INCOME, HOME_EXPENSE, TILE_COLOR } from "../shared/categoryVisuals";

const EXIT_MS = 260; // matches the breakdown-up entry duration

// Explains how a Home overview stat was derived, opened by tapping the cell (#42).

const TITLES = {
  balance: "Current Balance",
  bills: "Upcoming Bills",
  cash: "Available Cash",
  savings: "Estimated Savings",
  income: "Income",
  expenses: "Expenses",
};

function shortDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Row({ label, value, color = HOME_TEXT, strong = false, muted = false, divider = false, compact = false }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      padding: compact ? "6px 0" : "10px 0", borderTop: divider ? `1px solid ${HOME_DIVIDER}` : "none",
    }}>
      <span style={{ fontSize: strong ? (compact ? 13.5 : 15) : (compact ? 12.5 : 14), fontWeight: strong ? 700 : 500, color: muted ? HOME_MUTED : HOME_TEXT }}>{label}</span>
      <span style={{ fontSize: strong ? (compact ? 14.5 : 16) : (compact ? 13 : 14.5), fontWeight: strong ? 800 : 600, fontVariantNumeric: "tabular-nums", color }}>{value}</span>
    </div>
  );
}

function DotRow({ label, meta, value, color = HOME_TEXT, dotColor = HOME_MUTED, divider = false, dashed = false, compact = false }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: compact ? 8 : 12,
      padding: compact ? "6px 0" : "11px 0",
      borderTop: dashed
        ? `1px dashed ${HOME_DIVIDER}`
        : divider ? `1px solid ${HOME_DIVIDER}` : "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: compact ? 7 : 10, minWidth: 0 }}>
        <span style={{ width: compact ? 6 : 8, height: compact ? 6 : 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: compact ? 13 : 14.5, fontWeight: 600, color: HOME_TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</p>
          {meta && <p style={{ margin: "1px 0 0", fontSize: compact ? 10.5 : 12, color: HOME_MUTED }}>{meta}</p>}
        </div>
      </div>
      <span style={{ fontSize: compact ? 13 : 14.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", color, flexShrink: 0 }}>{value}</span>
    </div>
  );
}

function Note({ children, compact = false }) {
  return <p style={{ margin: compact ? "8px 2px 0" : "12px 2px 0", fontSize: compact ? 11.5 : 12.5, lineHeight: 1.45, color: HOME_MUTED }}>{children}</p>;
}

// Per-cell content

export function BalanceBody({ safeToSpend, status, compact = false }) {
  if (status !== "ok" || !safeToSpend) {
    return <Note compact={compact}>Set a starting balance in Paychecks to track your running balance here.</Note>;
  }
  return (
    <>
      <Row label="Checking" value={fmt(safeToSpend.running_balance)} color={HOME_TEXT} strong compact={compact} />
      <Note compact={compact}>
        Builds forward from the starting balance you set in Paychecks, using your
        actual transactions since then. A live bank-synced balance will replace
        this once account integration ships.
      </Note>
    </>
  );
}

export function BillsBody({ safeToSpend, status, compact = false }) {
  if (status !== "ok" || !safeToSpend) {
    return <Note compact={compact}>Set up a paycheck schedule and starting balance to see your upcoming bills.</Note>;
  }
  const bills = safeToSpend.bills_breakdown ?? [];
  return (
    <>
      <p style={{ margin: compact ? "0 2px 3px" : "0 2px 6px", fontSize: compact ? 11.5 : 12.5, color: HOME_MUTED }}>
        Due before your next paycheck on {shortDate(safeToSpend.next_payday)}
      </p>
      {bills.length === 0 ? (
        <Note compact={compact}>No bills are due before your next paycheck.</Note>
      ) : (
        <>
          {bills.map((b, i) => {
            const color = TILE_COLOR[b.category] ?? HOME_MUTED;
            const label = CATEGORY_CONFIG[b.category]?.label ?? b.category;
            return (
              <div key={`${b.name}-${i}`} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: compact ? 8 : 12,
                padding: compact ? "6px 0" : "11px 0", borderTop: i > 0 ? `1px solid ${HOME_DIVIDER}` : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: compact ? 7 : 10, minWidth: 0 }}>
                  <span style={{ width: compact ? 6 : 8, height: compact ? 6 : 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: compact ? 13 : 14.5, fontWeight: 600, color: HOME_TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</p>
                    <p style={{ margin: "1px 0 0", fontSize: compact ? 10.5 : 12, color: HOME_MUTED }}>
                      {b.due_date ? `${label} · due ${shortDate(b.due_date)}` : `${label} · estimated`}
                    </p>
                  </div>
                </div>
                <span style={{ fontSize: compact ? 13 : 14.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: HOME_TEXT, flexShrink: 0 }}>
                  {fmt(b.amount)}
                </span>
              </div>
            );
          })}
          <Row label="Total due" value={fmt(safeToSpend.bills_before_next_payday)} color={TILE_COLOR.BILL} strong divider compact={compact} />
        </>
      )}
    </>
  );
}

export function CashBody({ safeToSpend, status, compact = false }) {
  if (status !== "ok" || !safeToSpend) {
    return <Note compact={compact}>Set a starting balance and paycheck schedule to project your leftover cash.</Note>;
  }
  const surplus = parseFloat(safeToSpend.spendable_surplus);
  const freeToAllocate = parseFloat(safeToSpend.free_to_allocate);
  const reserved = surplus - freeToAllocate;
  const nextPaydayLabel = shortDate(safeToSpend.next_payday);
  const billCount = safeToSpend.bills_breakdown?.length ?? 0;
  return (
    <>
      <DotRow label="Current balance" meta="As of today" value={fmt(safeToSpend.running_balance)} compact={compact} />
      <DotRow
        label="Next paycheck"
        meta={safeToSpend.next_payday_estimate != null ? `Estimated · ${nextPaydayLabel}` : `No estimate yet · ${nextPaydayLabel}`}
        value={safeToSpend.next_payday_estimate != null ? `+${fmt(safeToSpend.next_payday_estimate)}` : "—"}
        color={HOME_INCOME}
        dotColor={HOME_INCOME}
        divider
        compact={compact}
      />
      <DotRow
        label="Bills before then"
        meta={billCount > 0 ? `${billCount} bill${billCount !== 1 ? "s" : ""} due` : "None due"}
        value={`−${fmt(safeToSpend.bills_before_next_payday)}`}
        color={HOME_EXPENSE}
        dotColor={HOME_EXPENSE}
        divider
        compact={compact}
      />
      {reserved > 0.005 && (
        <DotRow label="Spending reserve" meta="Set aside, not spendable" value={`−${fmt(reserved)}`} color={HOME_EXPENSE} dotColor={HOME_EXPENSE} divider compact={compact} />
      )}
      <Row label="Available cash" value={fmt(safeToSpend.free_to_allocate)} color={freeToAllocate >= 0 ? HOME_INCOME : HOME_EXPENSE} strong divider compact={compact} />
    </>
  );
}

export function SavingsBody({ savings, status, compact = false }) {
  if (status === "no-history") {
    return <Note compact={compact}>Your savings estimate needs at least 3 months of spending history to project from.</Note>;
  }
  if (status !== "ok" || !savings) {
    return <Note compact={compact}>Add a paycheck amount and some spending history to estimate what you can save.</Note>;
  }
  const savedSoFar = parseFloat(savings.saved_so_far);
  const ceiling = parseFloat(savings.estimated_savings);
  const overSaved = savedSoFar > ceiling;
  const noRoom = ceiling <= 0 && !overSaved;

  return (
    <>
      <DotRow label="Income this month" meta="Paychecks + other income" value={`+${fmt(savings.whole_month_income)}`} color={HOME_INCOME} dotColor={HOME_INCOME} compact={compact} />
      <DotRow label="Fixed bills" meta="Recurring, non-savings" value={`−${fmt(savings.committed_recurring)}`} color={HOME_EXPENSE} dotColor={HOME_EXPENSE} divider compact={compact} />
      <DotRow label="Spent so far" meta="Discretionary, this month" value={`−${fmt(savings.discretionary_spent_so_far)}`} color={HOME_EXPENSE} dotColor={HOME_EXPENSE} divider compact={compact} />
      <DotRow label="Typical spending" meta="Historical avg, rest of month" value={`−${fmt(savings.discretionary_projected_remaining)}`} color={HOME_EXPENSE} dotColor={HOME_EXPENSE} divider compact={compact} />
      <Row
        label="Saved / projected"
        value={`${fmt(savings.saved_so_far)} / ${fmt(savings.estimated_savings)}`}
        color={TILE_COLOR.SAVINGS}
        strong
        divider
        compact={compact}
      />
      {noRoom && (
        <Note compact={compact}>
          Bills and typical spending account for this month's income, so there's no room left to save. Anything you do put aside still shows above.
        </Note>
      )}
    </>
  );
}

const INCOME_ROWS = [
  { key: "INCOME", label: "Paychecks", meta: "Wages and other income" },
  { key: "REIMBURSEMENT", label: "Reimbursements", meta: "Money paid back to you" },
];

const EXPENSE_ROWS = [
  { key: "EXPENSE", label: "Spending", meta: "Day-to-day purchases" },
  { key: "BILL", label: "Bills", meta: "Recurring bills" },
  { key: "SUBSCRIPTION", label: "Subscriptions", meta: "Recurring services" },
  { key: "DEBT", label: "Debt", meta: "Loan and card payments" },
];

export function IncomeBody({ categoryTotals, deposits = 0, total, cashTips = 0, compact = false }) {
  const rows = INCOME_ROWS
    .map((r) => ({ ...r, amount: categoryTotals?.[r.key] ?? 0 }))
    .filter((r) => r.amount > 0);
  if (deposits > 0) {
    rows.push({ key: "TIPS", label: "Tip deposits", meta: "Cash banked this period", amount: deposits });
  }

  if (rows.length === 0) {
    return <Note compact={compact}>No income recorded for this period yet.</Note>;
  }

  return (
    <>
      {rows.map((r, i) => (
        <DotRow
          key={r.key}
          label={r.label}
          meta={r.meta}
          value={`+${fmt(r.amount)}`}
          color={HOME_INCOME}
          dotColor={TILE_COLOR[r.key]}
          divider={i > 0}
          compact={compact}
        />
      ))}
      <Row label="Total" value={fmt(total)} color={HOME_INCOME} strong divider compact={compact} />
      {cashTips > 0 && (
        <DotRow
          dashed
          label="With cash tips"
          meta={(
            <>
              {"Untracked"}
              <span style={{
                color: TILE_COLOR.TIPS, fontWeight: 800,
                fontSize: compact ? 12 : 13.5, fontVariantNumeric: "tabular-nums",
                // Margin, not literal spaces - HTML collapses whitespace.
                margin: "0 4px",
              }}>
                {fmt(cashTips)}
              </span>
              {"in cash."}
            </>
          )}
          value={fmt(total + cashTips)}
          color={TILE_COLOR.TIPS}
          dotColor={TILE_COLOR.TIPS}
          compact={compact}
        />
      )}
    </>
  );
}

export function ExpensesBody({ categoryTotals, total, compact = false }) {
  const rows = EXPENSE_ROWS
    .map((r) => ({ ...r, amount: categoryTotals?.[r.key] ?? 0 }))
    .filter((r) => r.amount > 0);

  if (rows.length === 0) {
    return <Note compact={compact}>No spending recorded for this period yet.</Note>;
  }

  return (
    <>
      {rows.map((r, i) => (
        <DotRow
          key={r.key}
          label={r.label}
          meta={r.meta}
          value={`−${fmt(r.amount)}`}
          color={HOME_EXPENSE}
          dotColor={TILE_COLOR[r.key]}
          divider={i > 0}
          compact={compact}
        />
      ))}
      <Row label="Total" value={fmt(total)} color={HOME_EXPENSE} strong divider compact={compact} />
      {(categoryTotals?.SAVINGS ?? 0) > 0 && (
        <DotRow
          dashed
          label="Savings"
          meta="Not tracked as spending"
          value={(
            <span style={{
              color: TILE_COLOR.SAVINGS, fontWeight: 800,
              fontSize: compact ? 13.5 : 15.5, fontVariantNumeric: "tabular-nums",
            }}>
              {fmt(categoryTotals.SAVINGS)}
            </span>
          )}
          dotColor={TILE_COLOR.SAVINGS}
          compact={compact}
        />
      )}
    </>
  );
}

export default function OverviewBreakdownSheet({ cell, onClose, safeToSpend, safeToSpendStatus, savings, savingsStatus, summary, categoryTotals, periodDeposits, cashTips, desktop = false }) {
  const [closing, setClosing] = useState(false);
  const requestClose = () => setClosing(true);

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

  const body = (
    <>
      {cell === "balance" && <BalanceBody safeToSpend={safeToSpend} status={safeToSpendStatus} />}
      {cell === "bills" && <BillsBody safeToSpend={safeToSpend} status={safeToSpendStatus} />}
      {cell === "cash" && <CashBody safeToSpend={safeToSpend} status={safeToSpendStatus} />}
      {cell === "savings" && <SavingsBody savings={savings} status={savingsStatus} />}
      {cell === "income" && (
        <IncomeBody
          categoryTotals={categoryTotals}
          deposits={periodDeposits}
          total={summary?.totalIn ?? 0}
          cashTips={cashTips}
        />
      )}
      {cell === "expenses" && <ExpensesBody categoryTotals={categoryTotals} total={summary?.totalOut ?? 0} />}
    </>
  );

  if (desktop) {
    return (
      <div
        onClick={requestClose}
        style={{
          position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          background: closing ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.55)",
          transition: `background ${EXIT_MS}ms ease`,
        }}
      >
        <style>{`@keyframes breakdown-pop { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }`}</style>
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md"
          style={{
            maxHeight: "82vh", overflowY: "auto", overscrollBehavior: "contain",
            background: HOME_SURFACE, borderRadius: 20,
            padding: "20px 22px 24px",
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            opacity: closing ? 0 : 1,
            transform: closing ? "scale(0.96)" : "scale(1)",
            animation: closing ? undefined : "breakdown-pop 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
            transition: `opacity ${EXIT_MS}ms ease, transform ${EXIT_MS}ms ease`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: "-0.3px", color: HOME_TEXT }}>{TITLES[cell]}</h2>
            <button onClick={requestClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: HOME_MUTED, display: "flex", padding: 2 }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          {body}
        </div>
      </div>
    );
  }

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
          transform: closing ? "translateY(100%)" : dragging ? `translateY(${dragY}px)` : undefined,
          // Skips the entry animation mid-drag, or it restarts and jumps the sheet back.
          animation: dragging || closing ? undefined : "breakdown-up 0.26s cubic-bezier(0.32, 0.72, 0, 1)",
          transition: dragging ? "none" : `transform ${EXIT_MS}ms ${SHEET_EASE}`,
        }}
      >
        <div {...handlers} style={{ touchAction: "none" }}>
          <div style={{ display: "flex", justifyContent: "center", padding: "4px 0 12px", cursor: "grab" }}>
            <div style={{ width: 38, height: 4, borderRadius: 999, background: "rgba(255,255,255,0.18)" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px", color: HOME_TEXT }}>{TITLES[cell]}</h2>
          </div>
        </div>

        {body}
      </div>
    </div>
  );
}
