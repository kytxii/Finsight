import { describe, it, expect } from "vitest";
import {
  deriveRunningBalance,
  deriveSpendableSurplus,
  deriveEstimatedSavings,
  deriveUpcomingRecurring,
  deriveCashOnHand,
  deriveInstallmentInsights,
  projectPaychecks,
  isUnavailable,
} from "./derived";

const TODAY = "2026-04-15";

// A dataset small enough to reason about by hand: one schedule paying on the
// 1st, one bill due the 20th, one already-recorded expense.
const base = () => ({
  transactions: [
    { id: "t1", name: "Groceries", amount: "60.00", category: "EXPENSE", transaction_date: "2026-04-10" },
    { id: "t2", name: "Salary", amount: "2000.00", category: "INCOME", transaction_date: "2026-04-01" },
  ],
  tipDeposits: [{ id: "d1", amount: "40.00", deposit_date: "2026-04-05" }],
  recurringPayments: [
    { id: "r1", name: "Rent", amount: "500.00", category: "BILL", day_of_month: 20, active: true },
  ],
  paycheckSchedules: [
    { id: "s1", name: "Job", frequency: "MONTHLY", start_date: "2026-01-01", active: true },
  ],
  paychecks: [
    { id: "p1", schedule_id: "s1", pay_date: "2026-03-01", amount: "2000.00" },
    { id: "p2", schedule_id: "s1", pay_date: "2026-04-01", amount: "2000.00" },
  ],
  installments: [{ id: "i1", name: "Laptop", monthly_payment: "100.00" }],
  balanceAnchor: { current_balance: "1000.00", as_of_date: "2026-04-01" },
  spendingReserve: 0,
  today: TODAY,
});

describe("deriveRunningBalance", () => {
  it("reports the anchor date alongside the balance", () => {
    // 1000 anchor, then strictly after 2026-04-01: -60 groceries, +40 deposit.
    // The 2026-04-01 salary is excluded - the anchor already includes that day.
    const res = deriveRunningBalance(base());
    expect(res.as_of_date).toBe("2026-04-01");
    expect(res.balance).toBe("980.00");
  });

  it("is unavailable with no anchor rather than reporting zero", () => {
    const res = deriveRunningBalance({ ...base(), balanceAnchor: null });
    expect(isUnavailable(res)).toBe(true);
    expect(res.detail).toBe("No starting balance set");
  });
});

describe("deriveSpendableSurplus", () => {
  it("needs an anchor", () => {
    const res = deriveSpendableSurplus({ ...base(), balanceAnchor: null });
    expect(res.detail).toBe("No starting balance set");
  });

  it("needs an active paycheck schedule", () => {
    const res = deriveSpendableSurplus({ ...base(), paycheckSchedules: [] });
    expect(res.detail).toBe("No active paycheck schedule found");
  });

  it("counts a bill falling before the next payday", () => {
    const res = deriveSpendableSurplus(base());
    expect(res.next_payday).toBe("2026-05-01");
    expect(res.bills_before_next_payday).toBe("500.00");
    expect(res.bills_breakdown).toHaveLength(1);
  });

  it("subtracts the spending reserve from what's free to allocate", () => {
    const withReserve = deriveSpendableSurplus({ ...base(), spendingReserve: 200 });
    const without = deriveSpendableSurplus(base());
    expect(parseFloat(without.free_to_allocate) - parseFloat(withReserve.free_to_allocate)).toBeCloseTo(200);
  });
});

describe("deriveEstimatedSavings", () => {
  it("refuses without three months of spending history", () => {
    const res = deriveEstimatedSavings(base());
    expect(res.detail).toBe("Not enough spending history");
  });

  it("computes once each of the three prior months has spending", () => {
    const data = base();
    ["2026-01-12", "2026-02-12", "2026-03-12"].forEach((date, i) => {
      data.transactions.push({
        id: `h${i}`, name: "Dining", amount: "300.00", category: "EXPENSE", transaction_date: date,
      });
    });
    const res = deriveEstimatedSavings(data);
    expect(isUnavailable(res)).toBe(false);
    expect(res.month_start).toBe("2026-04-01");
    expect(res.committed_recurring).toBe("500.00");
  });
});

describe("deriveUpcomingRecurring", () => {
  it("marks a bill still ahead of today as upcoming", () => {
    const [item] = deriveUpcomingRecurring(base());
    expect(item).toMatchObject({ id: "r1", due_date: "2026-04-20", status: "upcoming" });
  });

  it("marks it paid once a linked transaction exists this month", () => {
    const data = base();
    data.transactions.push({
      id: "t3", name: "Rent", amount: "500.00", category: "BILL",
      transaction_date: "2026-04-20", recurring_payment_id: "r1",
    });
    const [item] = deriveUpcomingRecurring(data);
    expect(item.status).toBe("paid");
    expect(item.actual_amount).toBe("500.00");
  });

  it("leaves out income and tips, which aren't bills", () => {
    const data = base();
    data.recurringPayments.push({ id: "r2", name: "Wages", amount: "10.00", category: "INCOME", day_of_month: 5, active: true });
    expect(deriveUpcomingRecurring(data).map((i) => i.id)).toEqual(["r1"]);
  });
});

describe("deriveCashOnHand", () => {
  it("counts tips earned in the period without netting off deposits", () => {
    const data = base();
    data.transactions.push({
      id: "t4", name: "Tips", amount: "80.00", category: "TIPS", transaction_date: "2026-04-03",
    });
    expect(deriveCashOnHand(data, "2026-04").tips_earned).toBe("80.00");
  });
});

describe("deriveInstallmentInsights", () => {
  it("is unavailable for an id that isn't there", () => {
    expect(isUnavailable(deriveInstallmentInsights(base(), "nope"))).toBe(true);
  });

  it("explains itself rather than failing when surplus can't be computed", () => {
    const res = deriveInstallmentInsights({ ...base(), balanceAnchor: null }, "i1");
    expect(res.available).toBe(false);
    expect(res.reason).toBe("No starting balance set");
    expect(res.monthly_payment).toBe("100.00");
  });

  it("gauges the payment against free-to-allocate when surplus resolves", () => {
    const res = deriveInstallmentInsights(base(), "i1");
    expect(res.available).toBe(true);
    expect(res.status).toBeTruthy();
  });
});

describe("projectPaychecks", () => {
  it("fills in the dates a schedule implies without touching existing rows", () => {
    const data = base();
    const projected = projectPaychecks(
      data.paycheckSchedules,
      data.paychecks,
      new Date("2026-06-01T00:00:00"),
    );
    const dates = projected.filter((p) => p.schedule_id === "s1").map((p) => p.pay_date);
    expect(dates).toContain("2026-05-01");
    expect(projected.find((p) => p.pay_date === "2026-04-01").amount).toBe("2000.00");
  });

  it("skips inactive schedules", () => {
    const data = base();
    data.paycheckSchedules[0].active = false;
    const projected = projectPaychecks(data.paycheckSchedules, data.paychecks, new Date("2026-06-01T00:00:00"));
    expect(projected).toHaveLength(2);
  });
});
