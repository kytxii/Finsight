import { useState, useMemo } from "react";
import MobileActivity from "./MobileActivity";
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

function Empty() {
  return <p style={{ fontSize: 13, color: HOME_MUTED, textAlign: "center", padding: "18px 0" }}>Not enough data yet</p>;
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

export default function MobileAnalytics({ transactions, loading, onEditTransaction, onDeleteTransaction, jump }) {
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
    const rows = Object.entries(totals)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
    const max = rows[0]?.total ?? 0;
    return { rows, max };
  }, [transactions, periodKey]);

  // ── Income vs. expense, last 6 months. SAVINGS excluded from "expense" -
  // money moved to savings isn't spent (same definition as #69's Home fix,
  // applied here from the start rather than repeating the bug).
  const months = useMemo(() => lastMonths(TREND_MONTHS), []);
  // One extra month before the trend window, purely so the first displayed
  // month has something to compare against for the savings % change below.
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

  // ── Savings % change, month over month: how much more/less you saved this
  // month vs. the one before, e.g. $100 -> $150 is +50%. Not "% of income" -
  // that definition could read over 100% (saved more than that month's
  // income, e.g. from a windfall) with no good way to display it. Month-over-
  // month growth is unbounded either way, but at least "+301%" reads
  // naturally as "way more than last month" instead of looking like a bug.
  const savingsChange = useMemo(() => {
    return months.map((m, i) => {
      const prevKey = extendedMonths[i].key; // one slot behind - extendedMonths has the extra lead-in month
      const prevSavings = monthlyTotals[prevKey]?.savings ?? 0;
      const thisSavings = monthlyTotals[m.key]?.savings ?? 0;
      if (prevSavings > 0) return { ...m, change: ((thisSavings - prevSavings) / prevSavings) * 100, isNew: false, thisSavings };
      if (thisSavings > 0) return { ...m, change: null, isNew: true, thisSavings }; // started from $0 - no meaningful %
      return { ...m, change: null, isNew: false, thisSavings };
    });
  }, [months, extendedMonths, monthlyTotals]);

  const hasSavingsData = savingsChange.some((m) => m.change != null || m.isNew);
  const changeMax = Math.max(1, ...savingsChange.map((m) => m.change != null ? Math.abs(m.change) : 0));

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
          <Empty />
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
          <Empty />
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
          <Empty />
        ) : !hasSavingsData ? (
          <Empty />
        ) : (
          <>
            {/* Diverging bar: positive change grows up from the middle
                zero-line, negative grows down. No alignItems:flex-end at the
                outer level - default stretch keeps each half a definite
                height so the height:X% bars inside resolve correctly (#29). */}
            <div style={{ display: "flex", height: 130 }}>
              {savingsChange.map((m) => {
                const barPct = m.change != null ? Math.min(100, (Math.abs(m.change) / changeMax) * 100) : 0;
                const positive = m.change != null && m.change >= 0;
                const color = m.isNew ? HOME_ACCENT : positive ? HOME_INCOME : HOME_EXPENSE;
                return (
                  <div key={m.key} style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}>
                      {(m.isNew || positive) && (
                        <div style={{ width: 16, height: `${m.isNew ? 55 : barPct}%`, borderRadius: "4px 4px 0 0", backgroundColor: color, opacity: m.isNew ? 0.7 : 1 }} />
                      )}
                    </div>
                    <div style={{ height: 1, backgroundColor: HOME_DIVIDER }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-start", alignItems: "center" }}>
                      {!m.isNew && !positive && m.change != null && (
                        <div style={{ width: 16, height: `${barPct}%`, borderRadius: "0 0 4px 4px", backgroundColor: color }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", marginTop: 8 }}>
              {savingsChange.map((m) => (
                <div key={m.key} style={{ flex: 1, textAlign: "center" }}>
                  <p style={{
                    margin: 0, fontSize: 11, fontWeight: 700,
                    color: m.isNew ? HOME_ACCENT : m.change == null ? HOME_MUTED : m.change >= 0 ? HOME_INCOME : HOME_EXPENSE,
                  }}>
                    {m.isNew ? "New" : m.change == null ? "—" : `${m.change >= 0 ? "+" : "-"}${Math.abs(m.change).toFixed(0)}%`}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, fontWeight: 600, color: HOME_MUTED }}>{m.label}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </SectionCard>

      <MobileActivity
        transactions={transactions}
        loading={loading}
        onEditTransaction={onEditTransaction}
        onDeleteTransaction={onDeleteTransaction}
        jump={jump}
      />
    </>
  );
}
