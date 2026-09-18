import { useEffect, useState } from "react";
import { subscribeToKey } from "../../api/offline/cache";
import { getTransactions } from "../../api/transactions";
import { getSpendableSurplus, getEstimatedSavings } from "../../api/paychecks";
import { getTipDeposits } from "../../api/tipDeposits";

/**
 * Core dashboard data: transactions, cash-flow health (safe-to-spend,
 * estimated savings), and tip deposits - fetched once on mount and
 * re-fetchable via `refresh()`. safeToSpend/savings loading (including every
 * status branch) was duplicated byte-for-byte between Dashboard.jsx and
 * MobileDashboard.jsx (#177, #190). tipDeposits loading differed only in its
 * error handler - desktop reset to `[]` on failure, mobile left the prior
 * (possibly stale) value - unified on desktop's behavior since resetting on
 * a failed load is the safer default and nothing depended on the stale-on-
 * error case.
 *
 * `fetchTransactions` is injected (each dashboard passes its own dev-menu-
 * wrapped fetch, see useDevMenu) so this hook doesn't need to know dev
 * tooling exists. `extraLoaders` are extra no-arg loaders a platform wants
 * folded into the same mount-fetch/refresh cycle (desktop's cash-on-hand,
 * mobile's upcoming bills) without hardcoding either into a hook both
 * platforms share.
 *
 * Deliberately does not touch a `loading` flag beyond the initial mount, or
 * call sites relying on a refresh's own loading semantics (e.g. each
 * dashboard's Dev Tools "Re-fetch" button) would need to change - see each
 * page for how it drives its own loading state around `refresh()`.
 */
export function useDashboardData(fetchTransactions = getTransactions, extraLoaders = []) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tipDeposits, setTipDeposits] = useState([]);
  const [safeToSpend, setSafeToSpend] = useState(null);
  const [safeToSpendStatus, setSafeToSpendStatus] = useState("loading"); // loading | ok | no-balance | no-schedule | error
  const [savings, setSavings] = useState(null);
  const [savingsStatus, setSavingsStatus] = useState("loading"); // loading | ok | no-schedule | no-amounts | no-history | error
  const [refreshFailed, setRefreshFailed] = useState(false);

  function loadSafeToSpend() {
    getSpendableSurplus()
      .then((res) => {
        setSafeToSpend(res.data);
        setSafeToSpendStatus("ok");
      })
      .catch((err) => {
        const detail = err.response?.data?.detail;
        setSafeToSpend(null);
        if (detail === "No starting balance set") setSafeToSpendStatus("no-balance");
        else if (detail === "No active paycheck schedule found") setSafeToSpendStatus("no-schedule");
        else setSafeToSpendStatus("error");
      });
  }

  function loadSavings() {
    getEstimatedSavings()
      .then((res) => {
        setSavings(res.data);
        setSavingsStatus("ok");
      })
      .catch((err) => {
        const detail = err.response?.data?.detail;
        setSavings(null);
        if (detail === "No active paycheck schedule found") setSavingsStatus("no-schedule");
        else if (detail === "No paycheck amounts yet") setSavingsStatus("no-amounts");
        else if (detail === "Not enough spending history") setSavingsStatus("no-history");
        else setSavingsStatus("error");
      });
  }

  function loadTipDeposits() {
    getTipDeposits()
      .then((res) => setTipDeposits(res.data))
      .catch(() => setTipDeposits([]));
  }

  function loadAll() {
    loadSafeToSpend();
    loadSavings();
    loadTipDeposits();
    extraLoaders.forEach((fn) => fn());
  }

  // A cached read returns instantly and refreshes underneath (#204). Without
  // this the dashboard would sit on last-known data until the next explicit
  // refresh - these are the keys whose freshness is visible on first paint.
  useEffect(() => {
    const stops = [
      subscribeToKey("transactions", setTransactions),
      subscribeToKey("tipDeposits", setTipDeposits),
      subscribeToKey("spendableSurplus", (data) => {
        setSafeToSpend(data);
        setSafeToSpendStatus("ok");
      }),
      subscribeToKey("estimatedSavings", (data) => {
        setSavings(data);
        setSavingsStatus("ok");
      }),
    ];
    return () => stops.forEach((stop) => stop());
  }, []);

  useEffect(() => {
    fetchTransactions()
      .then((res) => {
        setTransactions(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    loadAll();
    // Runs once on mount - fetchTransactions/extraLoaders are expected to be
    // stable per caller rather than tracked as effect deps (matches the
    // original per-page effects this replaces, which had the same shape).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    fetchTransactions()
      .then((res) => { setTransactions(res.data); setRefreshFailed(false); })
      .catch(() => setRefreshFailed(true));
    loadAll();
  }

  return {
    transactions,
    setTransactions,
    loading,
    setLoading,
    tipDeposits,
    setTipDeposits,
    safeToSpend,
    safeToSpendStatus,
    savings,
    savingsStatus,
    refresh,
    refreshFailed,
  };
}
