import { readCached, writeCached, connect, RESPONSES } from "./db";
import {
  deriveRunningBalance,
  deriveSpendableSurplus,
  deriveEstimatedSavings,
  deriveUpcomingRecurring,
  deriveCashOnHand,
  deriveInstallmentInsights,
  isUnavailable,
} from "../../utils/derived";

// Keep server-derived values honest after an offline write (#204).
//
// Six endpoints are computed server-side from the rows this app writes:
// running balance, spendable surplus, estimated savings, upcoming recurring,
// cash on hand, installment insights. They're cached like any other response,
// which is right while the backend is reachable - but a queued write changes
// the data underneath them and no new response is coming, so without this
// they sit at values that contradict the list the user just edited. Add a $50
// expense offline and the balance wouldn't move.
//
// The math is utils/derived.js, shared with demo mode. The server stays
// authoritative: every one of these keys is overwritten by the real response
// on the next successful fetch, and the two may disagree slightly in the
// meantime - accepted deliberately (#204), since the alternative is a number
// that's definitely wrong rather than one that's probably right.

const CACHE_KEYS = {
  transactions: "transactions",
  tipDeposits: "tipDeposits",
  recurringPayments: "recurringPayments",
  paycheckSchedules: "paycheckSchedules",
  paychecks: "paychecks",
  installments: "installments",
  balanceAnchor: "balanceAnchor",
  spendingReserve: "spendingReserve",
};

function todayStr() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Assemble the dataset utils/derived.js works on from whatever is cached.
 *
 * A key that was never fetched comes back undefined and becomes an empty
 * list. That's the honest reading - the app has no knowledge of those rows -
 * and the derive functions already treat "no schedules" or "no anchor" as
 * reasons a value can't be computed rather than as zero.
 */
async function buildDataset() {
  const entries = await Promise.all(
    Object.values(CACHE_KEYS).map((key) => readCached(key)),
  );
  const byField = {};
  Object.keys(CACHE_KEYS).forEach((field, i) => {
    byField[field] = entries[i]?.value;
  });

  const reserve = byField.spendingReserve?.spending_reserve;

  return {
    transactions: byField.transactions ?? [],
    tipDeposits: byField.tipDeposits ?? [],
    recurringPayments: byField.recurringPayments ?? [],
    paycheckSchedules: byField.paycheckSchedules ?? [],
    paychecks: byField.paychecks ?? [],
    installments: byField.installments ?? [],
    balanceAnchor: byField.balanceAnchor ?? null,
    spendingReserve: reserve != null ? parseFloat(reserve) : 0,
    today: todayStr(),
  };
}

/**
 * The month a cashOnHand cache key refers to.
 *
 * Both dashboards call getCashOnHand() with no arguments and let the server
 * resolve "this month", which makes the key literally
 * "cashOnHand:undefined-undefined" - so an unparseable suffix means the
 * current month. An explicit suffix is "YYYY-M" (the month isn't padded at
 * the call site) while the math compares against "YYYY-MM" slices of ISO
 * dates, hence the pad.
 */
function periodFromKey(key, today) {
  const suffix = key.slice("cashOnHand:".length);
  const match = /^(\d{4})-(\d{1,2})$/.exec(suffix);
  if (!match) return today.slice(0, 7);
  return `${match[1]}-${match[2].padStart(2, "0")}`;
}

/** Cached keys are per-period (cashOnHand:2026-04) and per-row
 *  (installmentInsights:<id>), so the ones actually present have to be read
 *  off the store rather than assumed. */
async function keysWithPrefix(prefix) {
  try {
    const db = await connect();
    const all = await db.getAllKeys(RESPONSES);
    return all.filter((k) => typeof k === "string" && k.startsWith(prefix));
  } catch {
    return [];
  }
}

/**
 * Recompute every derived value that has something cached, from the local
 * data as it stands right now.
 *
 * A value that can't be computed - no anchor, no schedule, not enough
 * history - leaves its cached entry alone rather than clearing it. The
 * previous server answer is a better thing to show than nothing, and the
 * server's own 404 for that case is already what the UI handles.
 */
export async function recomputeDerived() {
  const data = await buildDataset();

  const write = async (key, value) => {
    if (!isUnavailable(value)) await writeCached(key, value);
  };

  await write("runningBalance", deriveRunningBalance(data));
  await write("spendableSurplus", deriveSpendableSurplus(data));
  await write("estimatedSavings", deriveEstimatedSavings(data));
  await write("upcomingRecurring", deriveUpcomingRecurring(data));

  for (const key of await keysWithPrefix("cashOnHand:")) {
    await write(key, deriveCashOnHand(data, periodFromKey(key, data.today)));
  }

  for (const key of await keysWithPrefix("installmentInsights:")) {
    await write(
      key,
      deriveInstallmentInsights(data, key.slice("installmentInsights:".length)),
    );
  }
}
