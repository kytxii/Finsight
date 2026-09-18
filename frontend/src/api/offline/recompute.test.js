import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";

import { recomputeDerived } from "./recompute";
import { RESPONSES, connect, readCached } from "./db";

const put = async (key, value) => (await connect()).put(RESPONSES, { value }, key);

// "Today" is the real clock here, so the fixture is built relative to it -
// pinning a date would make these tests pass only during the month they were
// written.
//
// Local date parts, not toISOString(): recompute.js builds its own "today"
// from the local calendar, and UTC can already be on tomorrow's date, which
// would make a transaction dated "now" look future-dated and get filtered out.
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const today = iso(now);
const thisMonth = today.slice(0, 7);
// Anchored to last month so "today" is always strictly after it, including
// on the 1st.
const lastMonthStart = iso(new Date(now.getFullYear(), now.getMonth() - 1, 1));

beforeEach(async () => {
  await (await connect()).clear(RESPONSES);
});

describe("recomputeDerived", () => {
  it("recomputes the running balance from the cached rows", async () => {
    await put("balanceAnchor", { current_balance: "1000.00", as_of_date: lastMonthStart });
    await put("transactions", [
      { id: "t1", name: "Groceries", amount: "60.00", category: "EXPENSE", transaction_date: today },
    ]);
    await put("tipDeposits", []);

    await recomputeDerived();

    const cached = await readCached("runningBalance");
    expect(cached.value.balance).toBe("940.00");
    expect(cached.value.as_of_date).toBe(lastMonthStart);
  });

  it("leaves a value alone when it can't be computed rather than blanking it", async () => {
    // A stale server answer beats nothing: the panel keeps showing the last
    // real figure instead of emptying out mid-outage.
    await put("runningBalance", { balance: "123.45", as_of_date: lastMonthStart });
    await put("transactions", []);
    // No anchor cached, so there's nothing to compute from.

    await recomputeDerived();

    expect((await readCached("runningBalance")).value.balance).toBe("123.45");
  });

  it("recomputes upcoming recurring from the cached bills", async () => {
    await put("recurringPayments", [
      { id: "r1", name: "Rent", amount: "500.00", category: "BILL", day_of_month: 28, active: true },
    ]);
    await put("transactions", []);

    await recomputeDerived();

    const [item] = (await readCached("upcomingRecurring")).value;
    expect(item).toMatchObject({ id: "r1", name: "Rent" });
    expect(item.due_date.startsWith(thisMonth)).toBe(true);
  });

  it("recomputes a cash-on-hand key the dashboards left unparameterised", async () => {
    // Both dashboards call getCashOnHand() with no args, so the cached key is
    // literally cashOnHand:undefined-undefined and means "this month".
    await put("cashOnHand:undefined-undefined", { cash_on_hand: "0.00" });
    await put("transactions", [
      { id: "t2", name: "Tips", amount: "80.00", category: "TIPS", transaction_date: today },
    ]);
    await put("tipDeposits", []);

    await recomputeDerived();

    const cached = await readCached("cashOnHand:undefined-undefined");
    expect(cached.value.tips_earned).toBe("80.00");
  });

  it("touches nothing when no derived key has ever been cached", async () => {
    await put("transactions", []);

    await recomputeDerived();

    // upcomingRecurring and runningBalance are written unconditionally when
    // computable; with no bills and no anchor, neither is.
    expect(await readCached("cashOnHand:undefined-undefined")).toBeUndefined();
    expect(await readCached("installmentInsights:i1")).toBeUndefined();
  });
});
