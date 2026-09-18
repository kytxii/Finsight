import { computeCashOnHand } from "./cashOnHand";
import { computeRunningBalance } from "./runningBalance";
import { computeGaugeStatus } from "./installmentMath";
import {
  toDateStr,
  nextMonthStart,
  addMonthsClamped,
  iterPayDates,
  generatePayDatesThrough,
  averageRecentAmounts,
  committedItems,
  computeSpendableSurplus,
  computeEstimatedSavings,
} from "./paycheckMath";

// Server-derived values, computed locally (#204).
//
// The backend owns these numbers and stays authoritative - every one of them
// is overwritten by the real response as soon as it arrives. They're
// recomputed here for the two cases where no response is coming: demo mode,
// which has no backend at all, and offline mode, where a queued write has
// changed the local data underneath figures that would otherwise sit frozen
// at their last-fetched values.
//
// Every function here is pure: it takes a dataset and returns a value. It
// reads no store and writes nothing, which is what lets demoStore (localStorage)
// and api/offline/recompute.js (IndexedDB) share one implementation instead of
// keeping two - previously demoStore held the only copy, and offline mode had
// none.
//
// A dataset is a plain object of the arrays these calculations need:
//
//   { transactions, tipDeposits, recurringPayments, paycheckSchedules,
//     paychecks, installments, balanceAnchor, spendingReserve, today }
//
// `today` is a "YYYY-MM-DD" string so callers control it - demo mode pins a
// fixed date, offline mode uses the real one.

export const PAYCHECK_EXPENSE_CATEGORIES = new Set([
  "EXPENSE",
  "BILL",
  "SUBSCRIPTION",
  "SAVINGS",
  "DEBT",
]);
// Excludes SAVINGS - moving money into savings isn't spending it.
export const NON_SAVINGS_EXPENSE_CATEGORIES = new Set([
  "EXPENSE",
  "BILL",
  "SUBSCRIPTION",
  "DEBT",
]);
// Money that's actually arrived. Cash tips don't count until deposited (#131).
export const MONEY_IN_CATEGORIES = new Set(["INCOME", "REIMBURSEMENT"]);
export const RECURRING_BLOCKED_CATEGORIES = new Set(["INCOME", "TIPS"]);
export const SAVINGS_HISTORY_MONTHS = 3;

/**
 * The shape returned when a value genuinely can't be computed - no starting
 * balance, no paycheck schedule, not enough history. The server answers these
 * with a 404 and a detail string, so callers map this onto whatever their
 * transport expects rather than each inventing their own sentinel.
 */
export function unavailable(detail) {
  return { unavailable: true, detail };
}

export function isUnavailable(result) {
  return result != null && result.unavailable === true;
}

/**
 * Fill in the paycheck rows a schedule implies but that don't exist yet, in
 * memory only.
 *
 * demoStore persists its backfill (it's standing in for a backend that would
 * have written those rows); offline mode must not, because the real backend
 * owns that table and will send the authoritative rows on reconnect. Hence a
 * pure projection here and a persisting wrapper there.
 */
export function projectPaychecks(schedules, paychecks, through, makeId = () => null) {
  const projected = paychecks.slice();

  schedules
    .filter((schedule) => schedule.active !== false)
    .forEach((schedule) => {
      const existingDates = new Set(
        projected
          .filter((p) => p.schedule_id === schedule.id)
          .map((p) => p.pay_date),
      );

      generatePayDatesThrough(schedule, through).forEach((d) => {
        const dateStr = toDateStr(d);
        if (!existingDates.has(dateStr)) {
          projected.push({
            id: makeId(),
            schedule_id: schedule.id,
            pay_date: dateStr,
            amount: null,
          });
        }
      });
    });

  return projected;
}

export function averageRecentRecurringAmounts(recurringPaymentId, allTransactions, limit = 3) {
  const amounts = allTransactions
    .filter((t) => t.recurring_payment_id === recurringPaymentId)
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
    .slice(0, limit)
    .map((t) => parseFloat(t.amount));
  if (amounts.length === 0) return null;
  return amounts.reduce((a, b) => a + b, 0) / amounts.length;
}

export function deriveRunningBalanceValue({ balanceAnchor, transactions, tipDeposits, today }) {
  if (!balanceAnchor) return null;
  return computeRunningBalance(balanceAnchor, transactions, tipDeposits, today);
}

export function deriveRunningBalance(data) {
  const balance = deriveRunningBalanceValue(data);
  if (balance == null) return unavailable("No starting balance set");
  return {
    balance: balance.toFixed(2),
    as_of_date: data.balanceAnchor.as_of_date,
  };
}

export function deriveSpendableSurplus(data) {
  const { transactions, recurringPayments, paycheckSchedules, paychecks, spendingReserve, today } = data;

  const runningBalance = deriveRunningBalanceValue(data);
  if (runningBalance == null) return unavailable("No starting balance set");

  const schedules = paycheckSchedules.filter((s) => s.active !== false);
  if (schedules.length === 0) return unavailable("No active paycheck schedule found");

  const todayDate = new Date(today + "T00:00:00");
  let nextPayday = null;
  let nextSchedule = null;
  schedules.forEach((schedule) => {
    for (const d of iterPayDates(schedule)) {
      if (d >= todayDate) {
        if (nextPayday === null || d.getTime() < nextPayday.getTime()) {
          nextPayday = d;
          nextSchedule = schedule;
        }
        break;
      }
    }
  });

  const nextPaydayStr = toDateStr(nextPayday);
  const projected = projectPaychecks(schedules, paychecks, nextPayday);
  const enteredNextPaycheck = projected.find(
    (p) => p.schedule_id === nextSchedule?.id && p.pay_date === nextPaydayStr && p.amount != null,
  );
  const nextPaydayEstimate = enteredNextPaycheck
    ? parseFloat(enteredNextPaycheck.amount)
    : nextSchedule
      ? averageRecentAmounts(nextSchedule.id, projected)
      : null;

  const recurring = recurringPayments.filter(
    (rp) => rp.active !== false && PAYCHECK_EXPENSE_CATEGORIES.has(rp.category),
  );
  const { total: billsBeforeNextPayday, items: billsBreakdown } = committedItems(
    recurring,
    todayDate,
    nextPayday,
  );

  const { spendableSurplus, freeToAllocate } = computeSpendableSurplus(
    runningBalance,
    nextPaydayEstimate,
    billsBeforeNextPayday,
    spendingReserve ?? 0,
  );

  return {
    next_payday: nextPaydayStr,
    spendable_surplus: spendableSurplus.toFixed(2),
    free_to_allocate: freeToAllocate.toFixed(2),
    bills_before_next_payday: billsBeforeNextPayday.toFixed(2),
    next_payday_estimate: nextPaydayEstimate != null ? nextPaydayEstimate.toFixed(2) : null,
    running_balance: runningBalance.toFixed(2),
    bills_breakdown: billsBreakdown,
  };
}

function wholeMonthIncome({ transactions, tipDeposits, paychecks }, schedules, monthStartStr, monthEndStr) {
  const actualIncome =
    transactions
      .filter(
        (t) =>
          MONEY_IN_CATEGORIES.has(t.category) &&
          t.transaction_date >= monthStartStr &&
          t.transaction_date < monthEndStr,
      )
      .reduce((sum, t) => sum + parseFloat(t.amount), 0) +
    tipDeposits
      .filter((d) => d.deposit_date >= monthStartStr && d.deposit_date < monthEndStr)
      .reduce((sum, d) => sum + parseFloat(d.amount), 0);

  if (schedules.length === 0) return actualIncome;

  const projected = projectPaychecks(schedules, paychecks, new Date(monthEndStr + "T00:00:00"));
  const scheduleIds = new Set(schedules.map((s) => s.id));
  const unfilled = projected.filter(
    (p) =>
      scheduleIds.has(p.schedule_id) &&
      p.pay_date >= monthStartStr &&
      p.pay_date < monthEndStr &&
      p.amount == null,
  );

  const projectedUnfilled = unfilled.reduce(
    (sum, p) => sum + (averageRecentAmounts(p.schedule_id, projected) ?? 0),
    0,
  );

  return actualIncome + projectedUnfilled;
}

export function deriveEstimatedSavings(data) {
  const { transactions, recurringPayments, paycheckSchedules, today } = data;

  const schedules = paycheckSchedules.filter((s) => s.active !== false);
  if (schedules.length === 0) return unavailable("No active paycheck schedule found");

  const todayDate = new Date(today + "T00:00:00");
  const monthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
  const monthStartStr = toDateStr(monthStart);
  const monthEndStr = toDateStr(nextMonthStart(todayDate));

  const income = wholeMonthIncome(data, schedules, monthStartStr, monthEndStr);
  if (income <= 0) return unavailable("No paycheck amounts yet");

  const historyStartStr = toDateStr(addMonthsClamped(monthStart, -SAVINGS_HISTORY_MONTHS));

  const recurringNames = new Set(
    recurringPayments
      .filter(
        (rp) =>
          rp.active !== false &&
          !rp.is_estimate &&
          NON_SAVINGS_EXPENSE_CATEGORIES.has(rp.category),
      )
      .map((rp) => rp.name),
  );

  const isDiscretionary = (t) =>
    NON_SAVINGS_EXPENSE_CATEGORIES.has(t.category) &&
    !t._recurring_id &&
    !t.recurring_payment_id &&
    !t.credit_card_charge_id &&
    !t.paid_with_cash;

  const totalsByMonth = {};
  transactions
    .filter(
      (t) =>
        isDiscretionary(t) &&
        !recurringNames.has(t.name) &&
        t.transaction_date >= historyStartStr &&
        t.transaction_date < monthStartStr,
    )
    .forEach((t) => {
      const key = t.transaction_date.slice(0, 7);
      totalsByMonth[key] = (totalsByMonth[key] ?? 0) + parseFloat(t.amount);
    });

  const expectedMonths = [];
  for (let n = 1; n <= SAVINGS_HISTORY_MONTHS; n++) {
    expectedMonths.push(toDateStr(addMonthsClamped(monthStart, -n)).slice(0, 7));
  }
  if (!expectedMonths.every((m) => m in totalsByMonth)) {
    return unavailable("Not enough spending history");
  }

  const monthlyDiscretionaryAvg =
    Object.values(totalsByMonth).reduce((a, b) => a + b, 0) / SAVINGS_HISTORY_MONTHS;

  const savedSoFar = transactions
    .filter(
      (t) =>
        t.category === "SAVINGS" &&
        t.transaction_date >= monthStartStr &&
        t.transaction_date < monthEndStr,
    )
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  // A dated bill explicitly skipped this month never materialized and never
  // will for this month - it shouldn't still eat room in the ceiling (#133).
  const currentMonthPrefix = today.slice(0, 7);
  const linkedThisMonth = new Set(
    transactions
      .filter(
        (t) =>
          t.recurring_payment_id &&
          t.transaction_date >= monthStartStr &&
          t.transaction_date < monthEndStr,
      )
      .map((t) => t.recurring_payment_id),
  );
  const wasSkipped = (rp) =>
    rp.last_applied_month === currentMonthPrefix && !linkedThisMonth.has(rp.id);

  const committedRecurring = recurringPayments
    .filter(
      (rp) =>
        rp.active !== false &&
        !(rp.is_estimate && rp.day_of_month == null) &&
        NON_SAVINGS_EXPENSE_CATEGORIES.has(rp.category) &&
        !wasSkipped(rp),
    )
    .reduce((sum, rp) => sum + parseFloat(rp.amount), 0);

  const todayStr = toDateStr(todayDate);
  const discretionarySpentSoFar = transactions
    .filter(
      (t) =>
        isDiscretionary(t) &&
        t.transaction_date >= monthStartStr &&
        t.transaction_date <= todayStr,
    )
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const { estimatedSavings, discretionaryProjectedRemaining } = computeEstimatedSavings(
    income,
    committedRecurring,
    discretionarySpentSoFar,
    monthlyDiscretionaryAvg,
  );

  return {
    month_start: monthStartStr,
    month_end: monthEndStr,
    estimated_savings: estimatedSavings.toFixed(2),
    saved_so_far: savedSoFar.toFixed(2),
    whole_month_income: income.toFixed(2),
    committed_recurring: committedRecurring.toFixed(2),
    discretionary_spent_so_far: discretionarySpentSoFar.toFixed(2),
    discretionary_projected_remaining: discretionaryProjectedRemaining.toFixed(2),
  };
}

export function deriveUpcomingRecurring({ transactions, recurringPayments, today }) {
  const todayDate = new Date(today + "T00:00:00");
  const prefix = today.slice(0, 7);
  const maxDay = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).getDate();

  return recurringPayments
    .filter(
      (rp) =>
        rp.active !== false &&
        rp.day_of_month != null &&
        !RECURRING_BLOCKED_CATEGORIES.has(rp.category),
    )
    .map((rp) => {
      const day = Math.min(rp.day_of_month, maxDay);
      const dueDate = `${prefix}-${String(day).padStart(2, "0")}`;
      const linked = transactions.find(
        (t) => t.recurring_payment_id === rp.id && t.transaction_date.startsWith(prefix),
      );

      let status;
      if (linked) status = "paid";
      else if (rp.last_applied_month === prefix) status = "skipped";
      else if (dueDate <= toDateStr(todayDate)) status = "pending";
      else status = "upcoming";

      return {
        id: rp.id,
        name: rp.name,
        category: rp.category,
        due_date: dueDate,
        status,
        is_estimate: !!rp.is_estimate,
        amount: rp.amount,
        actual_amount: linked ? linked.amount : null,
        estimated_amount:
          status === "pending"
            ? (averageRecentRecurringAmounts(rp.id, transactions)?.toFixed(2) ?? null)
            : null,
      };
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export function deriveCashOnHand({ transactions, tipDeposits }, period) {
  return computeCashOnHand(transactions, tipDeposits, period);
}

const NO_TERM_REASON = "Set a term for this installment to see insights";

export function deriveInstallmentInsights(data, installmentId) {
  const installment = (data.installments ?? []).find((i) => i.id === installmentId);
  if (!installment) return unavailable("Installment not found");

  if (installment.monthly_payment == null) {
    return {
      available: false,
      reason: NO_TERM_REASON,
      monthly_payment: null,
      available_cash: null,
      ratio: null,
      status: null,
    };
  }

  const surplus = deriveSpendableSurplus(data);
  if (isUnavailable(surplus)) {
    return {
      available: false,
      reason: surplus.detail ?? "Not enough budget data yet",
      monthly_payment: installment.monthly_payment,
      available_cash: null,
      ratio: null,
      status: null,
    };
  }

  const { status, ratio } = computeGaugeStatus(
    installment.monthly_payment,
    surplus.free_to_allocate,
  );
  return {
    available: true,
    reason: null,
    monthly_payment: installment.monthly_payment,
    available_cash: surplus.free_to_allocate,
    ratio,
    status,
  };
}
