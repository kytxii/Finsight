import { fmt, CATEGORY_CONFIG } from "../utils/finance";
import { HOME_TEXT, HOME_MUTED, HOME_SURFACE, HOME_DIVIDER, HOME_INCOME, HOME_EXPENSE, TILE_COLOR } from "./categoryVisuals";

// Bottom sheet explaining how a single overview-card stat was derived. Opened by
// tapping a cell on the Home overview card (#42). `cell` is the tapped stat key
// (balance | bills | cash | savings) or null when closed.

const TITLES = {
  balance: "Current Balance",
  bills: "Upcoming Bills",
  cash: "Estimated Cash",
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

function Note({ children }) {
  return <p style={{ margin: "12px 2px 0", fontSize: 12.5, lineHeight: 1.5, color: HOME_MUTED }}>{children}</p>;
}

// ── Per-cell content ─────────────────────────────────────────────────────────

function BalanceBody() {
  return (
    <>
      <Row label="Checking" value="$3,284.19" color={HOME_TEXT} strong />
      <Note>
        This is placeholder data. A live balance will appear here once bank account
        integration is connected, and Estimated Cash will build forward from it.
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
  const reserved = surplus - parseFloat(safeToSpend.free_to_allocate);
  return (
    <>
      <Row label="Current balance" value={fmt(safeToSpend.running_balance)} />
      <Row label="Projected income" value={`+${fmt(safeToSpend.projected_income)}`} color={HOME_INCOME} divider />
      <Row label="Bills this month" value={`−${fmt(safeToSpend.bills_before_month_end)}`} color={HOME_EXPENSE} divider />
      <Row label="Estimated cash" value={fmt(safeToSpend.spendable_surplus)} color={surplus >= 0 ? HOME_INCOME : HOME_EXPENSE} strong divider />
      {reserved > 0.005 && (
        <Note>{fmt(reserved)} of this is set aside as your spending reserve, leaving {fmt(safeToSpend.free_to_allocate)} free to allocate.</Note>
      )}
      <Note>Projected leftover once every bill this month has been paid.</Note>
    </>
  );
}

function SavingsBody({ savings, status, savingsTxns }) {
  if (status === "no-history") {
    return <Note>Your savings estimate needs at least 3 months of spending history to project from.</Note>;
  }
  if (status !== "ok" || !savings) {
    return <Note>Add a paycheck amount and some spending history to estimate what you can save.</Note>;
  }
  return (
    <>
      <Row label="Projected income" value={fmt(savings.projected_income)} color={HOME_INCOME} />
      <Row label="Avg. monthly spending" value={`−${fmt(savings.projected_spending)}`} color={HOME_EXPENSE} divider />
      <Row label="Fixed bills" value={`−${fmt(savings.committed_recurring)}`} color={HOME_EXPENSE} divider />
      <Row label="Could save this month" value={fmt(savings.estimated_savings)} color={TILE_COLOR.SAVINGS} strong divider />

      <p style={{ margin: "18px 2px 6px", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: HOME_MUTED }}>
        Saved so far · {fmt(savings.saved_so_far)}
      </p>
      {savingsTxns.length === 0 ? (
        <Note>You haven't recorded any savings this month yet.</Note>
      ) : (
        savingsTxns.map((t, i) => (
          <div key={t.id ?? i} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            padding: "10px 0", borderTop: i > 0 ? `1px solid ${HOME_DIVIDER}` : "none",
          }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: HOME_TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</p>
              <p style={{ margin: "1px 0 0", fontSize: 12, color: HOME_MUTED }}>{shortDate(t.transaction_date)}</p>
            </div>
            <span style={{ fontSize: 14.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: TILE_COLOR.SAVINGS, flexShrink: 0 }}>
              {fmt(t.amount)}
            </span>
          </div>
        ))
      )}
    </>
  );
}

export default function OverviewBreakdownSheet({ cell, onClose, safeToSpend, safeToSpendStatus, savings, savingsStatus, transactions = [] }) {
  if (!cell) return null;

  const savingsTxns = savings
    ? transactions
        .filter((t) => t.category === "SAVINGS" && t.transaction_date >= savings.month_start && t.transaction_date < savings.month_end)
        .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
    : [];

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end" }}
    >
      <style>{`@keyframes breakdown-up { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxHeight: "82vh", overflowY: "auto", overscrollBehavior: "contain",
          background: HOME_SURFACE, borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: "10px 18px calc(env(safe-area-inset-bottom, 0px) + 24px)",
          animation: "breakdown-up 0.26s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "4px 0 12px" }}>
          <div style={{ width: 38, height: 4, borderRadius: 999, background: "rgba(255,255,255,0.18)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px", color: HOME_TEXT }}>{TITLES[cell]}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "rgba(255,255,255,0.08)", border: "none", color: HOME_MUTED, width: 30, height: 30, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {cell === "balance" && <BalanceBody />}
        {cell === "bills" && <BillsBody safeToSpend={safeToSpend} status={safeToSpendStatus} />}
        {cell === "cash" && <CashBody safeToSpend={safeToSpend} status={safeToSpendStatus} />}
        {cell === "savings" && <SavingsBody savings={savings} status={savingsStatus} savingsTxns={savingsTxns} />}
      </div>
    </div>
  );
}
