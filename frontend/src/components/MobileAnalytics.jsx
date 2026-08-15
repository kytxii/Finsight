import { useState, useMemo } from "react";
import MobileActivity from "./MobileActivity";
import Skel from "./Skel";
import { CATEGORY_CONFIG, INCOME_TYPES, fmt } from "../utils/finance";
import { getNow } from "../utils/time";
import {
  HOME_TEXT, HOME_MUTED, HOME_SURFACE, HOME_DIVIDER, HOME_INCOME, HOME_EXPENSE, HOME_ACCENT,
  TILE_COLOR, CATEGORY_ICON,
} from "./categoryVisuals";

// Analytics tab (#29): spending/income charts on top of the Activity
// transaction browser. Hand-rolled visuals throughout - no charting library,
// matching every other screen in this dark UI system (recharts was one of
// the markers of the stale desktop-derived UI this replaces).

const TREND_MONTHS = 6;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

// Last N months, oldest first, including the current one (real "now", not
// the selected period - the trend charts are a rolling window anchored to
// today, independent of the Category Breakdown's period picker below).
function lastMonths(n) {
  const now = getNow();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "short" }),
    });
  }
  return out;
}

function SectionCard({ title, children }) {
  return (
    <div style={{ backgroundColor: HOME_SURFACE, borderRadius: 18, padding: "16px 16px 18px", marginBottom: 16 }}>
      <p style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: HOME_TEXT }}>{title}</p>
      {children}
    </div>
  );
}

// Compact dollar label for the narrow per-month columns in the Savings
// Rate chart - fmt()'s full "$1,234.00" doesn't fit six across. Full value
// is still available via the bar's title tooltip.
function fmtShort(amount) {
  const rounded = Math.round(amount);
  if (Math.abs(rounded) >= 1000) {
    return `$${(rounded / 1000).toFixed(rounded % 1000 === 0 ? 0 : 1)}k`;
  }
  return `$${rounded}`;
}

function Empty() {
  return <p style={{ fontSize: 13, color: HOME_MUTED, textAlign: "center", padding: "18px 0" }}>Not enough data yet</p>;
}

// Loading placeholders shaped like each chart's real layout, rather than
// reusing the "no data yet" text for both loading and empty states.
function CategoryBreakdownSkel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {[70, 55, 62, 40].map((w, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Skel w={34} h={34} style={{ borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <Skel w={`${w}%`} h={13} />
              <Skel w={40} h={13} />
            </div>
            <Skel w="100%" h={6} style={{ borderRadius: 999 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Mirrors the Income vs. Expense / Savings Rate bar-chart layout: N month
// columns, each with 1 or 2 bars of varied height plus a label underneath.
function TrendChartSkel({ bars = 1 }) {
  const heights = [55, 80, 40, 95, 65, 70];
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 6, height: 130 }}>
      {heights.map((h, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 3, width: "100%", justifyContent: "center" }}>
            {Array.from({ length: bars }).map((_, b) => (
              <Skel key={b} w={bars === 1 ? 14 : 8} h={`${h}%`} style={{ borderRadius: "3px 3px 0 0" }} />
            ))}
          </div>
          <Skel w={20} h={11} style={{ marginTop: 4 }} />
        </div>
      ))}
    </div>
  );
}

function IconChevron({ dir, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

// Simple dropdown-style picker anchored under whichever of month/year was
// tapped - not a full-screen sheet, this is a short list (12 months, or a
// handful of years).
function PickerList({ options, onSelect, onClose }) {
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={onClose} />
      <div style={{
        position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
        zIndex: 21, backgroundColor: HOME_SURFACE, border: `1px solid ${HOME_DIVIDER}`, borderRadius: 14,
        padding: 6, maxHeight: 260, overflowY: "auto", boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, minWidth: 220,
      }}>
        {options.map(({ value, label, disabled }) => (
          <button
            key={value}
            disabled={disabled}
            onClick={() => onSelect(value)}
            style={{
              padding: "8px 10px", borderRadius: 8, border: "none", background: "transparent",
              color: disabled ? HOME_DIVIDER : HOME_TEXT, fontSize: 13.5, fontWeight: 600,
              cursor: disabled ? "default" : "pointer", textAlign: "center",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

export default function MobileAnalytics({ transactions, deposits = [], loading, onEditTransaction, onDeleteTransaction, onEditDeposit, onDeleteDeposit, jump }) {
  const now = getNow();

  // ── Category Breakdown period - navigable via arrows or tapping month/year
  // directly, independent of the trend charts below (#29).
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() }); // month: 0-11
  const [picker, setPicker] = useState(null); // null | "month" | "year"

  const periodKey = `${period.year}-${String(period.month + 1).padStart(2, "0")}`;
  const periodLabel = new Date(period.year, period.month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const isCurrentMonth = period.year === now.getFullYear() && period.month === now.getMonth();

  function shiftMonth(delta) {
    setPeriod((p) => {
      let month = p.month + delta;
      let year = p.year;
      if (month < 0) { month = 11; year -= 1; }
      else if (month > 11) { month = 0; year += 1; }
      return { year, month };
    });
  }

  const yearOptions = useMemo(() => {
    let minYear = now.getFullYear();
    transactions.forEach((t) => {
      const y = parseInt(t.transaction_date.slice(0, 4), 10);
      if (y < minYear) minYear = y;
    });
    const years = [];
    for (let y = now.getFullYear(); y >= minYear; y--) years.push(y);
    return years;
  }, [transactions, now]);

  // ── Category breakdown - every category present in the selected period,
  // largest first, bar length proportional to the largest category (not the
  // sum) so a single dominant category doesn't shrink every other bar to a
  // sliver.
  const categoryBreakdown = useMemo(() => {
    const totals = {};
    transactions.forEach((t) => {
      if (monthKey(t.transaction_date) !== periodKey) return;
      totals[t.category] = (totals[t.category] ?? 0) + parseFloat(t.amount);
    });
    // Tip deposits add to Tips on top of the logged tip transactions - same
    // definition as Home's dashCategoryTotals (#56/#99): deposits aren't a
    // subset of tips earned, they're additive.
    const periodDeposits = deposits.reduce(
      (s, d) => (monthKey(d.deposit_date) === periodKey ? s + parseFloat(d.amount) : s),
      0,
    );
    if (periodDeposits) totals.TIPS = (totals.TIPS ?? 0) + periodDeposits;
    const rows = Object.entries(totals)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
    const max = rows[0]?.total ?? 0;
    return { rows, max };
  }, [transactions, deposits, periodKey]);

  // ── Income vs. expense, last 6 months. SAVINGS excluded from "expense" -
  // money moved to savings isn't spent (same definition as #69's Home fix,
  // applied here from the start rather than repeating the bug).
  const months = useMemo(() => lastMonths(TREND_MONTHS), []);
  // One extra month before the trend window, purely so the first displayed
  // month has a prior month to compare against for the savings % change below.
  const extendedMonths = useMemo(() => lastMonths(TREND_MONTHS + 1), []);

  const monthlyTotals = useMemo(() => {
    const byMonth = {};
    extendedMonths.forEach((m) => { byMonth[m.key] = { income: 0, expense: 0, savings: 0 }; });
    transactions.forEach((t) => {
      const key = monthKey(t.transaction_date);
      const bucket = byMonth[key];
      if (!bucket) return; // outside the trend window
      const amt = parseFloat(t.amount);
      if (INCOME_TYPES.has(t.category)) bucket.income += amt;
      else if (t.category === "SAVINGS") bucket.savings += amt;
      else bucket.expense += amt;
    });
    return byMonth;
  }, [transactions, extendedMonths]);

  const trendMax = useMemo(
    () => Math.max(1, ...months.map((m) => Math.max(monthlyTotals[m.key].income, monthlyTotals[m.key].expense))),
    [months, monthlyTotals],
  );

  const hasTrendData = months.some((m) => monthlyTotals[m.key].income > 0 || monthlyTotals[m.key].expense > 0);

  // ── Savings: dollar amount actually moved to SAVINGS that month, plus how
  // it changed vs. the month before (e.g. $100 -> $150 is +50%). Retrospective
  // across the same trend window as the chart above - deliberately not the
  // same number as Home's "Estimated Savings" card, which is a forward-
  // looking projection for the current month only (get_estimated_savings,
  // #17/#73).
  const savingsSummary = useMemo(() => {
    return months.map((m, i) => {
      const prevKey = extendedMonths[i].key; // one slot behind - extendedMonths has the extra lead-in month
      const prevAmount = monthlyTotals[prevKey]?.savings ?? 0;
      const amount = monthlyTotals[m.key]?.savings ?? 0;
      if (prevAmount > 0) return { ...m, amount, change: ((amount - prevAmount) / prevAmount) * 100, isNew: false };
      if (amount > 0) return { ...m, amount, change: null, isNew: true }; // started from $0 - no meaningful %
      return { ...m, amount, change: null, isNew: false };
    });
  }, [months, extendedMonths, monthlyTotals]);

  const hasSavingsData = savingsSummary.some((m) => m.amount > 0);
  const savingsMax = Math.max(1, ...savingsSummary.map((m) => m.amount));

  return (
    <>
      {/* Period header - matches Home's uppercase period-label placement */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, margin: "4px 2px 18px" }}>
        <button onClick={() => shiftMonth(-1)} aria-label="Previous month" style={{ color: HOME_MUTED, background: "none", border: "none", cursor: "pointer", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <IconChevron dir="left" />
        </button>

        {/* Fixed width so the arrows on either side stay put as the label
            text changes length between months (e.g. "May" vs "September") -
            same fix as the Activity category button's reflow issue (#29).
            Text size matches Home's own period-label header (periodLabel(),
            fontSize 20 / weight 800 / -0.4px tracking). */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 10, position: "relative", width: 175, flexShrink: 0 }}>
          <span
            onClick={() => setPicker(picker === "month" ? null : "month")}
            style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px", color: HOME_TEXT, cursor: "pointer" }}
          >
            {MONTH_NAMES[period.month]}
          </span>
          <span
            onClick={() => setPicker(picker === "year" ? null : "year")}
            style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px", color: HOME_MUTED, cursor: "pointer" }}
          >
            {period.year}
          </span>

          {picker === "month" && (
            <PickerList
              options={MONTH_NAMES.map((label, i) => ({ value: i, label: label.slice(0, 3) }))}
              onSelect={(m) => { setPeriod((p) => ({ ...p, month: m })); setPicker(null); }}
              onClose={() => setPicker(null)}
            />
          )}
          {picker === "year" && (
            <PickerList
              options={yearOptions.map((y) => ({ value: y, label: String(y) }))}
              onSelect={(y) => { setPeriod((p) => ({ ...p, year: y })); setPicker(null); }}
              onClose={() => setPicker(null)}
            />
          )}
        </div>

        <button onClick={() => shiftMonth(1)} disabled={isCurrentMonth} aria-label="Next month" style={{ color: isCurrentMonth ? HOME_DIVIDER : HOME_MUTED, background: "none", border: "none", cursor: isCurrentMonth ? "default" : "pointer", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <IconChevron dir="right" />
        </button>
      </div>

      <SectionCard title="Category Breakdown">
        {loading ? (
          <CategoryBreakdownSkel />
        ) : categoryBreakdown.rows.length === 0 ? (
          <p style={{ fontSize: 13, color: HOME_MUTED, textAlign: "center", padding: "10px 0" }}>No transactions in {periodLabel}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {categoryBreakdown.rows.map(({ category, total }) => {
              const Icon = CATEGORY_ICON[category];
              const color = TILE_COLOR[category] ?? HOME_MUTED;
              const pct = categoryBreakdown.max > 0 ? (total / categoryBreakdown.max) * 100 : 0;
              return (
                <div key={category} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    flex: "0 0 auto", width: 34, height: 34, borderRadius: "50%", background: color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16)",
                  }}>
                    {Icon && <Icon />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: HOME_TEXT }}>{CATEGORY_CONFIG[category]?.label ?? category}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: HOME_TEXT, fontVariantNumeric: "tabular-nums" }}>{fmt(total)}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, backgroundColor: HOME_DIVIDER, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, backgroundColor: color }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Income vs. Expense">
        {loading ? (
          <TrendChartSkel bars={2} />
        ) : !hasTrendData ? (
          <Empty />
        ) : (
          <>
            {/* No alignItems:flex-end here - that would override the default
                stretch and collapse each month column to its content height,
                which breaks the height:X% bars nested inside (percentage
                heights need a definite-height ancestor). Bars anchor to the
                bottom via alignItems:flex-end one level down instead. */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 6, height: 130 }}>
              {months.map((m) => {
                const { income, expense } = monthlyTotals[m.key];
                const incomeH = Math.max(2, (income / trendMax) * 100);
                const expenseH = Math.max(2, (expense / trendMax) * 100);
                return (
                  <div key={m.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 3, width: "100%", justifyContent: "center" }}>
                      <div title={fmt(income)} style={{ width: 8, height: `${incomeH}%`, borderRadius: "3px 3px 0 0", backgroundColor: HOME_INCOME }} />
                      <div title={fmt(expense)} style={{ width: 8, height: `${expenseH}%`, borderRadius: "3px 3px 0 0", backgroundColor: HOME_EXPENSE }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: HOME_MUTED, marginTop: 4 }}>{m.label}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 14 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: HOME_MUTED }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: HOME_INCOME }} /> Income
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: HOME_MUTED }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: HOME_EXPENSE }} /> Expense
              </span>
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard title="Savings Rate">
        {loading ? (
          <TrendChartSkel bars={1} />
        ) : !hasSavingsData ? (
          <Empty />
        ) : (
          <>
            {/* One bar per month, height proportional to $ saved that month
                relative to the window's own max (mirrors the Income vs.
                Expense bars above). Full amount is in the title tooltip -
                the label below is the compact form (#29). */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 6, height: 110 }}>
              {savingsSummary.map((m) => {
                const h = Math.max(2, (m.amount / savingsMax) * 100);
                return (
                  <div key={m.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%", justifyContent: "center" }}>
                      <div title={fmt(m.amount)} style={{ width: 14, height: `${h}%`, borderRadius: "3px 3px 0 0", backgroundColor: HOME_ACCENT }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: HOME_MUTED, marginTop: 4 }}>{m.label}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", marginTop: 10 }}>
              {savingsSummary.map((m) => (
                <div key={m.key} style={{ flex: 1, textAlign: "center" }}>
                  <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: HOME_TEXT }}>{fmtShort(m.amount)}</p>
                  <p style={{
                    margin: "2px 0 0", fontSize: 10.5, fontWeight: 700,
                    color: m.isNew ? HOME_ACCENT : m.change == null ? HOME_MUTED : m.change >= 0 ? HOME_INCOME : HOME_EXPENSE,
                  }}>
                    {m.isNew ? "New" : m.change == null ? "—" : `${m.change >= 0 ? "+" : "-"}${Math.abs(m.change).toFixed(0)}%`}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </SectionCard>

      <MobileActivity
        transactions={transactions}
        deposits={deposits}
        loading={loading}
        onEditTransaction={onEditTransaction}
        onDeleteTransaction={onDeleteTransaction}
        onEditDeposit={onEditDeposit}
        onDeleteDeposit={onDeleteDeposit}
        jump={jump}
      />
    </>
  );
}
