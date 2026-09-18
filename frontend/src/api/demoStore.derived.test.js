import { describe, it, expect, beforeEach } from "vitest";
import { initDemo, clearDemo } from "./demoStore";
import {
  getRunningBalance,
  getSpendableSurplus,
  getEstimatedSavings,
  getUpcomingRecurringPayments,
  getCashOnHand,
  getInstallmentInsights,
  getInstallments,
} from "./demoStore";

// The six derived getters moved onto utils/derived.js, shared with the
// offline layer. utils/derived.test.js covers the math; this covers the
// wiring - that demoDataset() hands those functions the field names they
// expect, against the real seeded demo data. A mismatch there is silent
// (undefined spreads into NaN or an empty list) and wouldn't fail any test
// of the math itself.

beforeEach(() => {
  clearDemo();
  initDemo();
});

describe("demo mode derived values", () => {
  it("returns a real running balance, not NaN", async () => {
    const { data } = await getRunningBalance();
    expect(data.balance).toMatch(/^-?\d+\.\d{2}$/);
    expect(data.as_of_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns spendable surplus with a next payday and bills breakdown", async () => {
    const { data } = await getSpendableSurplus();
    expect(data.next_payday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.spendable_surplus).toMatch(/^-?\d+\.\d{2}$/);
    expect(data.running_balance).toMatch(/^-?\d+\.\d{2}$/);
    expect(Array.isArray(data.bills_breakdown)).toBe(true);
  });

  it("returns estimated savings for the seeded month", async () => {
    const { data } = await getEstimatedSavings();
    expect(data.estimated_savings).toMatch(/^\d+\.\d{2}$/);
    expect(data.whole_month_income).toMatch(/^\d+\.\d{2}$/);
    expect(data.month_start).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("returns upcoming recurring items with a status each", async () => {
    const { data } = await getUpcomingRecurringPayments();
    expect(data.length).toBeGreaterThan(0);
    data.forEach((item) => {
      expect(["paid", "skipped", "pending", "upcoming"]).toContain(item.status);
      expect(item.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("returns cash on hand for the seeded month", async () => {
    const { data } = await getCashOnHand();
    expect(data.cash_on_hand).toMatch(/^\d+\.\d{2}$/);
  });

  it("returns insights for a seeded installment", async () => {
    const { data: installments } = await getInstallments();
    expect(installments.length).toBeGreaterThan(0);
    const { data } = await getInstallmentInsights(installments[0].id);
    expect(typeof data.available).toBe("boolean");
    expect("monthly_payment" in data).toBe(true);
  });

  it("rejects with a 404 when an installment id doesn't exist", async () => {
    await expect(getInstallmentInsights("no-such-id")).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
});
