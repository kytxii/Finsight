import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  getTransactions,
  createTransaction,
  deleteTransaction,
} from "../api/transactions";
import { getSpendableSurplus, getEstimatedSavings } from "../api/paychecks";
import { getUpcomingRecurringPayments } from "../api/recurringPayments";
import { getTipDeposits, deleteTipDeposit } from "../api/tipDeposits";
import CurrencyInput from "../components/CurrencyInput";
import MobileTransactionModal from "../components/MobileTransactionModal";
import MobileDepositModal from "../components/MobileDepositModal";
import {
  CATEGORY_CONFIG,
  INCOME_TYPES,
  lockedNameFor,
} from "../utils/finance";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../context/AuthContext";
import { getPresetRange } from "../components/DateRangeFilter";
import { getToday } from "../utils/time";
import { errorMessage } from "../utils/errors";
import MobilePageSlide from "../components/MobilePageSlide";
import MobileScreen from "../components/MobileScreen";
import { useSheetDrag } from "../hooks/useSheetDrag";
import Footer from "../components/Footer";
import AccountPanel from "../components/AccountPanel";
import OverviewBreakdownSheet from "../components/OverviewBreakdownSheet";
import MobileHome from "../components/MobileHome";
import MobileTopbar from "../components/MobileTopbar";
import MobileCategory from "../components/MobileCategory";
import MobileTips from "../components/MobileTips";
import MobilePaychecks from "../components/MobilePaychecks";
import MobileRecurring from "../components/MobileRecurring";
import MobileInstallments from "../components/MobileInstallments";
import MobileAnalytics from "../components/MobileAnalytics";
import ImportPanel from "../components/ImportPanel";
import { HOME_BG, HOME_TEXT, HOME_MUTED, HOME_DIVIDER, HOME_SURFACE, HOME_INCOME, HOME_EXPENSE, ACCENT, TILE_COLOR } from "../components/categoryVisuals";
import CategoryPicker from "../components/CategoryPicker";
import CompactDateField from "../components/CompactDateField";

// ── Icons ────────────────────────────────────────────────────────────────────

function IconDashboard({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconActivity({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6h16M4 12h10M4 18h16" />
    </svg>
  );
}

function IconPlus({ size = 24 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconAI({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
    </svg>
  );
}

function IconMore({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function IconChevronLeft({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const newBatchRow = () => ({
  _key: Math.random(),
  name: "",
  amount: "",
  category: "EXPENSE",
  transaction_date: getToday(),
});

export default function MobileDashboard() {
  const dark = useTheme();
  const { logout, user, isDemo } = useAuth();
  const navigate = useNavigate();

  const bg = dark ? "var(--dark-bg)" : "var(--light-bg)";
  const surface = dark ? "var(--dark-surface)" : "var(--light-surface)";
  const border = dark ? "var(--dark-border)" : "var(--light-border)";
  const text = dark ? "var(--dark-text)" : "var(--light-text)";
  const muted = `color-mix(in srgb, ${text} 50%, transparent)`;

  // ── Navigation
  const [navTab, setNavTab] = useState("dashboard");
  const [categoryView, setCategoryView] = useState(null);
  const mainRef = useRef(null);

  // Slide direction is derived from these. Tabs sit at whole numbers in bottom-nav
  // order; a category detail sits just past the dashboard it was pushed from, so
  // pushing reads as forward and going back reads as back. (#46)
  const NAV_ORDER = { dashboard: 0, activity: 1, ai: 2 };
  const pageKey = categoryView ? `category:${categoryView}` : navTab;
  const pageOrder = categoryView ? NAV_ORDER.dashboard + 0.5 : NAV_ORDER[navTab] ?? 0;

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pageKey]);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [entrySheetOpen, setEntrySheetOpen] = useState(false);

  // ── Drawer / Recurring / Account
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const [devForceEmpty, setDevForceEmpty] = useState(false);
  const [devDelay, setDevDelay] = useState(0);
  const [devForceError, setDevForceError] = useState(false);
  const [devLastFetch, setDevLastFetch] = useState(null);
  const devForceErrorRef = useRef(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [installmentsOpen, setInstallmentsOpen] = useState(false);
  const [installmentsAddSignal, setInstallmentsAddSignal] = useState(0);
  const [recurringAddSignal, setRecurringAddSignal] = useState(0);
  const [paychecksOpen, setPaychecksOpen] = useState(false);
  const [breakdownCell, setBreakdownCell] = useState(null); // null | balance | bills | cash | savings
  const [accountOpen, setAccountOpen] = useState(false);
  // Opening Account straight from the avatar icon (skipping Menu) shouldn't
  // play the drawer's internal Menu->Account horizontal slide - the inner
  // track sits at rest on Menu the whole time the sheet is closed, so
  // flipping accountOpen still animates it across even though the user never
  // saw Menu (#107). Only set true by that one entry point; navigating to
  // Account from within an already-open Menu leaves this false, so that
  // slide-over still plays as real in-drawer navigation.
  const [skipAccountSlide, setSkipAccountSlide] = useState(false);
  useEffect(() => {
    if (!skipAccountSlide) return;
    // Double rAF: let the browser paint one frame with the track already in
    // position and no transition, then re-enable the transition for any
    // subsequent in-drawer navigation - re-adding `transition` doesn't itself
    // animate anything since the transform value isn't changing here.
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setSkipAccountSlide(false));
    });
    return () => cancelAnimationFrame(id);
  }, [skipAccountSlide]);
  const [acctSave, setAcctSave] = useState({
    isDirty: false,
    isSaving: false,
    saveStatus: null,
    onSave: null,
  });

  // ── Data
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tipDeposits, setTipDeposits] = useState([]);
  const [safeToSpend, setSafeToSpend] = useState(null);
  const [safeToSpendStatus, setSafeToSpendStatus] = useState("loading"); // loading | ok | no-balance | no-schedule | error
  const [savings, setSavings] = useState(null);
  const [savingsStatus, setSavingsStatus] = useState("loading"); // loading | ok | no-schedule | no-amounts | no-history | error
  // Rest-of-month recurring-payment occurrences (#60), unfiltered by category -
  // MobileHome derives its pending count from this, MobileCategory filters it
  // per category page.
  const [upcomingItems, setUpcomingItems] = useState([]);

  async function devFetch() {
    if (devForceErrorRef.current) {
      devForceErrorRef.current = false;
      setDevForceError(false);
      throw new Error("Forced error");
    }
    if (devDelay > 0) await new Promise(r => setTimeout(r, devDelay));
    return getTransactions();
  }

  function loadSafeToSpend() {
    getSpendableSurplus().then((res) => {
      setSafeToSpend(res.data);
      setSafeToSpendStatus("ok");
    }).catch((err) => {
      const detail = err.response?.data?.detail;
      setSafeToSpend(null);
      if (detail === "No starting balance set") setSafeToSpendStatus("no-balance");
      else if (detail === "No active paycheck schedule found") setSafeToSpendStatus("no-schedule");
      else setSafeToSpendStatus("error");
    });
  }

  function loadSavings() {
    getEstimatedSavings().then((res) => {
      setSavings(res.data);
      setSavingsStatus("ok");
    }).catch((err) => {
      const detail = err.response?.data?.detail;
      setSavings(null);
      if (detail === "No active paycheck schedule found") setSavingsStatus("no-schedule");
      else if (detail === "No paycheck amounts yet") setSavingsStatus("no-amounts");
      else if (detail === "Not enough spending history") setSavingsStatus("no-history");
      else setSavingsStatus("error");
    });
  }

  function loadTipDeposits() {
    getTipDeposits().then((res) => setTipDeposits(res.data)).catch(() => {});
  }

  function loadUpcoming() {
    getUpcomingRecurringPayments().then((res) => setUpcomingItems(res.data)).catch(() => {});
  }

  useEffect(() => {
    devFetch().then((res) => {
      setTransactions(res.data);
      setLoading(false);
      setDevLastFetch(new Date());
    }).catch(() => {
      // Stay in the loading state rather than flipping to "loaded with zero
      // transactions" - transactions never got set, so every stat derived
      // from it (dashSummary, dashCategoryTotals, ...) would otherwise
      // render as real $0.00/-$0.00 values indistinguishable from an
      // account that's genuinely empty, instead of skeletons.
    });
    loadSafeToSpend();
    loadSavings();
    loadTipDeposits();
    loadUpcoming();
  }, []);

  function refresh() {
    // setLoading(false) here is a no-op for the normal silent-refresh caller
    // (already false, React bails out) - it only matters for Dev Tools'
    // "Re-fetch" button, which sets loading=true before calling this to
    // re-test the skeleton flow; without it, a successful re-fetch through
    // that button would leave skeletons stuck on regardless of outcome.
    devFetch().then((res) => {
      setTransactions(res.data);
      setLoading(false);
      setDevLastFetch(new Date());
    }).catch(() => {});
    loadSafeToSpend();
    loadSavings();
    loadTipDeposits();
    loadUpcoming();
  }

  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editingDeposit, setEditingDeposit] = useState(null);

  const handleDelete = async (id) => {
    await deleteTransaction(id);
    refresh();
  };

  const handleDeleteDeposit = async (id) => {
    await deleteTipDeposit(id);
    refresh();
  };

  // ── Quick entry
  const [quickCat, setQuickCat] = useState("EXPENSE");
  const [quickForm, setQuickForm] = useState({
    name: "",
    amount: "",
    transaction_date: getToday(),
  });
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickError, setQuickError] = useState("");
  const quickTileColor = TILE_COLOR[quickCat];
  const quickFieldStyle = { backgroundColor: "rgba(255,255,255,0.04)", borderColor: HOME_DIVIDER, color: HOME_TEXT };

  const [batchSheetOpen, setBatchSheetOpen] = useState(false);
  const [batchItems, setBatchItems] = useState(() => [newBatchRow()]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [deletingKeys, setDeletingKeys] = useState([]);
  const [enteringKey, setEnteringKey] = useState(null);
  const batchListRef = useRef(null);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [importSaveState, setImportSaveState] = useState({ isDirty: false, isSaving: false, saveStatus: "idle", validCount: 0, onSave: null });

  useEffect(() => {
    if (!batchSheetOpen) {
      setBatchItems([newBatchRow()]);
      setBatchError("");
      setDeletingKeys([]);
    }
  }, [batchSheetOpen]);

  const handleQuickSubmit = async (e) => {
    e.preventDefault();
    setQuickError("");
    setQuickLoading(true);
    try {
      await createTransaction({
        name: lockedNameFor(quickCat) ?? quickForm.name,
        amount: parseFloat(quickForm.amount),
        transaction_date: quickForm.transaction_date,
        category: quickCat,
      });
      setQuickForm((f) => ({
        ...f,
        name: lockedNameFor(quickCat) ?? "",
        amount: "",
      }));
      setEntrySheetOpen(false);
      setAddSheetOpen(false);
      refresh();
    } catch (err) {
      setQuickError(errorMessage(err));
    } finally {
      setQuickLoading(false);
    }
  };

  const handleBatchSubmit = async () => {
    setBatchError("");
    const invalid = batchItems.find(
      (item) =>
        !item.amount ||
        parseFloat(item.amount) <= 0 ||
        (!lockedNameFor(item.category) && !item.name.trim()),
    );
    if (invalid) {
      setBatchError("All rows need a name and amount");
      return;
    }
    setBatchLoading(true);
    try {
      await Promise.all(
        batchItems.map((item) =>
          createTransaction({
            name: lockedNameFor(item.category) ?? item.name.trim(),
            amount: parseFloat(item.amount),
            category: item.category,
            transaction_date: item.transaction_date,
          }),
        ),
      );
      setBatchSheetOpen(false);
      setAddSheetOpen(false);
      refresh();
    } catch (err) {
      setBatchError(errorMessage(err));
    } finally {
      setBatchLoading(false);
    }
  };

  // ── Dashboard state (fixed to current month - no picker on the Home tab)
  const dashDateRange = useMemo(() => getPresetRange("Current Month"), []);

  // ── Analytics tab: jump-to-transaction request from Home's search dropdown,
  // passed through MobileAnalytics to the Activity section within it.
  // { id, token } - token changes on every pick so the effect in
  // MobileActivity always re-fires, even for the same transaction twice.
  // Everything else about Activity (search/chip/sort/scroll) is local state
  // owned by MobileActivity itself, not lifted here (#29).
  const [activityJump, setActivityJump] = useState(null);

  // ── Search
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const debounceRef = useRef(null);
  const searchContainerRef = useRef(null);
  const searchToggleRef = useRef(null);
  const { dragY, handlers: sheetDragHandlers } = useSheetDrag(() => {
    setAddSheetOpen(false);
    setEntrySheetOpen(false);
    setBatchSheetOpen(false);
  });
  const { onTouchStart: onSheetTouchStart, onTouchMove: onSheetTouchMove, onTouchEnd: onSheetTouchEnd } =
    sheetDragHandlers;
  // Separate drag instance for the drawer - its own dismiss target
  // (Menu/Account, not Add/Entry/Batch), kept independent of the shared one
  // above so the two sheets' drag states can't clash.
  const { dragY: drawerDragY, handlers: drawerDragHandlers } = useSheetDrag(() => {
    setDrawerOpen(false);
    setAccountOpen(false);
  });
  const { onTouchStart: onDrawerTouchStart, onTouchMove: onDrawerTouchMove, onTouchEnd: onDrawerTouchEnd } =
    drawerDragHandlers;

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setSearchOpen(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 300);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === "Escape") {
      setSearchOpen(false);
      setSearchVisible(false);
      setQuery("");
      setDebouncedQuery("");
    }
    if (e.key === "Enter") {
      const cmd = query.trim().toLowerCase();
      if (cmd === "/dev true" || cmd === "/dev false") {
        e.target.blur();
        if (cmd === "/dev true") { setDrawerOpen(true); setDevOpen(true); }
        else setDevOpen(false);
        setQuery("✓");
        setDebouncedQuery("");
        setSearchOpen(false);
        setTimeout(() => setQuery(""), 800);
      }
    }
  };

  const handleToggleSearch = () => {
    setSearchVisible((v) => {
      if (v) {
        setSearchOpen(false);
        setQuery("");
        setDebouncedQuery("");
      }
      return !v;
    });
  };

  // Click/tap off the search bar minimizes it entirely, not just the
  // suggestions dropdown - matches handleToggleSearch's own "already open"
  // branch. Excludes the toggle button itself (searchToggleRef) since that's
  // outside searchContainerRef's subtree - without the exclusion, tapping the
  // toggle to close would race this handler: mousedown fires first and closes
  // via this effect, then the click's onToggleSearch reads the now-stale
  // "was open" state and immediately reopens it.
  useEffect(() => {
    function onMouseDown(e) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target) &&
        !(searchToggleRef.current && searchToggleRef.current.contains(e.target))
      ) {
        setSearchOpen(false);
        setSearchVisible(false);
        setQuery("");
        setDebouncedQuery("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const suggestions = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return [];
    return transactions
      .filter(
        (t) =>
          t.name?.toLowerCase().includes(q) ||
          t.category?.toLowerCase().includes(q) ||
          (CATEGORY_CONFIG[t.category]?.label ?? "")
            .toLowerCase()
            .includes(q) ||
          String(t.amount).includes(q),
      )
      .slice(0, 5);
  }, [debouncedQuery, transactions]);

  // Selecting a search result opens the detail modal directly (#27) instead
  // of jumping to the Activity tab and scrolling/highlighting the row -
  // that scroll+highlight flow still exists (MobileActivity's `jump` effect)
  // but is now reached via the modal's own locate action, not automatically.
  const handleSelectTransaction = useCallback((t) => {
    setQuery("");
    setDebouncedQuery("");
    setSearchOpen(false);
    setEditingTransaction(t);
  }, []);

  // Locate action from within MobileTransactionModal: close the modal, switch
  // to Activity, and hand off to MobileActivity's existing jump-to-transaction
  // effect (reset filters, expand pagination/collapse to the target's month,
  // scroll it into view, highlight it) - unchanged from before #27, just no
  // longer the only way to reach a transaction from search.
  const handleLocateTransaction = useCallback((t) => {
    setEditingTransaction(null);
    setNavTab("activity");
    setActivityJump({ id: t.id, token: Date.now() });
  }, []);

  // ── Dashboard computed
  const dashFiltered = useMemo(() => {
    if (devForceEmpty) return [];
    if (!dashDateRange.from && !dashDateRange.to) return transactions;
    return transactions.filter((t) => {
      const d = new Date(t.transaction_date + "T00:00:00");
      if (dashDateRange.from && d < dashDateRange.from) return false;
      if (dashDateRange.to && d > dashDateRange.to) return false;
      return true;
    });
  }, [transactions, dashDateRange, devForceEmpty]);

  const dashSorted = useMemo(
    () =>
      [...dashFiltered].sort(
        (a, b) => new Date(b.transaction_date) - new Date(a.transaction_date),
      ),
    [dashFiltered],
  );
  // Tip deposits add to Tips/Income on top of the logged tip transactions -
  // they aren't a subset of them, mirroring MobileTips.jsx's own cash-on-hand
  // + deposited = total split (#56).
  const depositsInRange = useCallback(
    (from, to) =>
      tipDeposits
        .filter((d) => {
          const dt = new Date(d.deposit_date + "T00:00:00");
          if (from && dt < from) return false;
          if (to && dt > to) return false;
          return true;
        })
        .reduce((s, d) => s + parseFloat(d.amount), 0),
    [tipDeposits],
  );

  const dashMonthDeposits = useMemo(
    () => depositsInRange(dashDateRange.from, dashDateRange.to),
    [depositsInRange, dashDateRange],
  );

  const dashSummary = useMemo(() => {
    const totalIn = dashFiltered
      .filter((t) => INCOME_TYPES.has(t.category))
      .reduce((s, t) => s + parseFloat(t.amount), 0) + dashMonthDeposits;
    // SAVINGS excluded: money moved to savings isn't spent, it's still yours -
    // counting it here would inflate Expenses and drag down Net for the same
    // reason. (#69)
    const totalOut = dashFiltered
      .filter((t) => !INCOME_TYPES.has(t.category) && t.category !== "SAVINGS")
      .reduce((s, t) => s + parseFloat(t.amount), 0);
    const net = totalIn - totalOut;
    return { totalIn, totalOut, net };
  }, [dashFiltered, dashMonthDeposits]);

  const dashCategoryTotals = useMemo(() => {
    const totals = {};
    dashFiltered.forEach((t) => {
      totals[t.category] = (totals[t.category] ?? 0) + parseFloat(t.amount);
    });
    if (dashMonthDeposits) totals.TIPS = (totals.TIPS ?? 0) + dashMonthDeposits;
    return totals;
  }, [dashFiltered, dashMonthDeposits]);

  // Count of this-month recurring items awaiting a confirm/skip (#58), surfaced
  // as a small addition to the Home overview's "Upcoming Bills" caption.
  const pendingBillsCount = useMemo(
    () => upcomingItems.filter((i) => i.status === "pending").length,
    [upcomingItems],
  );

  // ── Last month (for the small +/-% badges on Home's Income/Expense cards)
  const dashLastMonthRange = useMemo(() => getPresetRange("Last Month"), []);
  const dashLastMonthDeposits = useMemo(
    () => depositsInRange(dashLastMonthRange.from, dashLastMonthRange.to),
    [depositsInRange, dashLastMonthRange],
  );
  const dashLastMonthSummary = useMemo(() => {
    const inRange = transactions.filter((t) => {
      const d = new Date(t.transaction_date + "T00:00:00");
      return d >= dashLastMonthRange.from && d <= dashLastMonthRange.to;
    });
    const totalIn = inRange
      .filter((t) => INCOME_TYPES.has(t.category))
      .reduce((s, t) => s + parseFloat(t.amount), 0) + dashLastMonthDeposits;
    // Same SAVINGS exclusion as dashSummary.totalOut, so the Expenses
    // change-badge compares like-for-like across months (#69).
    const totalOut = inRange
      .filter((t) => !INCOME_TYPES.has(t.category) && t.category !== "SAVINGS")
      .reduce((s, t) => s + parseFloat(t.amount), 0);
    return { totalIn, totalOut };
  }, [transactions, dashLastMonthRange, dashLastMonthDeposits]);

  useEffect(() => {
    document.body.style.overflow =
      addSheetOpen || entrySheetOpen || batchSheetOpen || importSheetOpen || drawerOpen || accountOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [addSheetOpen, entrySheetOpen, batchSheetOpen, importSheetOpen, drawerOpen, accountOpen]);

  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handler = () =>
      setKeyboardOpen(vv.height < window.screen.height * 0.8);
    vv.addEventListener("resize", handler);
    return () => vv.removeEventListener("resize", handler);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="h-dvh flex flex-col overflow-hidden"
      style={{ backgroundColor: navTab === "dashboard" || navTab === "activity" ? HOME_BG : bg, color: text }}
    >

      {/* ── Topbar - avatar/add/search - a true sibling of <main>, not nested
          inside the sliding page content, so it stays fixed in place across
          every tab and every page transition instead of unmounting/jumping
          with them (#29). */}
      <MobileTopbar
        user={user}
        onOpenAccount={() => { setSkipAccountSlide(true); setDrawerOpen(true); setAccountOpen(true); }}
        onOpenAdd={() => setAddSheetOpen(true)}
        onToggleSearch={handleToggleSearch}
        searchVisible={searchVisible}
        searchContainerRef={searchContainerRef}
        searchToggleRef={searchToggleRef}
        query={query}
        debouncedQuery={debouncedQuery}
        searchOpen={searchOpen}
        suggestions={suggestions}
        onQueryChange={handleQueryChange}
        onSearchKeyDown={handleSearchKeyDown}
        onSelectTransaction={handleSelectTransaction}
      />

      {/* ── Main content ── */}
      <main
        ref={mainRef}
        className="flex-1 px-4 pb-28 space-y-4 overflow-y-auto"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem + 54px)", WebkitOverflowScrolling: "touch" }}
      >
        <style>{`@keyframes skel-pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }`}</style>
        <MobilePageSlide pageKey={pageKey} order={pageOrder} layerClassName="space-y-4">
        {/* Dashboard tab */}
        {navTab === "dashboard" && (
          <>
            {categoryView === "TIPS" ? (
              <MobileTips
                transactions={transactions}
                loading={loading}
                onBack={() => setCategoryView(null)}
                onEditTransaction={setEditingTransaction}
                onDeleteTransaction={handleDelete}
                onRefresh={refresh}
              />
            ) : categoryView ? (
              <MobileCategory
                category={categoryView}
                transactions={dashFiltered}
                loading={loading}
                upcomingItems={upcomingItems}
                onBack={() => setCategoryView(null)}
                onEditTransaction={setEditingTransaction}
                onDeleteTransaction={handleDelete}
                onOpenPaychecks={() => setPaychecksOpen(true)}
                onRefresh={refresh}
              />
            ) : (
              <>
                <MobileHome
                    loading={loading}
                    dashSummary={dashSummary}
                    dashLastMonthSummary={dashLastMonthSummary}
                    safeToSpend={safeToSpend}
                    safeToSpendStatus={safeToSpendStatus}
                    savings={savings}
                    savingsStatus={savingsStatus}
                    pendingBillsCount={pendingBillsCount}
                    dashSorted={dashSorted}
                    dashCategoryTotals={dashCategoryTotals}
                    onOpenRecurring={() => setRecurringOpen(true)}
                    onOpenInstallments={() => setInstallmentsOpen(true)}
                    onOpenPaychecks={() => setPaychecksOpen(true)}
                    onOpenBreakdown={(key) => setBreakdownCell(key)}
                    onViewCategory={(cat) => setCategoryView(cat)}
                    onSeeAllTransactions={() => setNavTab("activity")}
                    onEditTransaction={setEditingTransaction}
                  />
              </>
            )}
          </>
        )}

        {/* Analytics tab: charts + the Activity transaction browser (#29) */}
        {navTab === "activity" && (
          <MobileAnalytics
            transactions={transactions}
            deposits={tipDeposits}
            loading={loading}
            onEditTransaction={setEditingTransaction}
            onDeleteTransaction={handleDelete}
            onEditDeposit={setEditingDeposit}
            onDeleteDeposit={handleDeleteDeposit}
            jump={activityJump}
          />
        )}

        {/* AI tab */}
        {navTab === "ai" && (
          <div className="flex flex-col h-[calc(100dvh-12rem)]">
            <div
              className="flex-1 flex flex-col items-center justify-center gap-3 rounded-2xl border"
              style={{ backgroundColor: surface, borderColor: border }}
            >
              <IconAI size={36} />
              <p className="text-base font-semibold" style={{ color: text }}>
                Finsight AI
              </p>
              <p className="text-sm text-center px-8" style={{ color: muted }}>
                AI assistant coming soon. Ask questions about your spending, get
                insights, and more.
              </p>
            </div>
          </div>
        )}
        </MobilePageSlide>
      </main>

      {/* ── Bottom nav — full-width liquid-glass bar, ported from the Cranberry project's BottomNav ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex px-4 pointer-events-none"
        style={{ paddingBottom: "max(7px, calc(env(safe-area-inset-bottom, 0px) / 2))" }}
      >
        <div
          className="p-1.5 rounded-full pointer-events-auto w-full"
          style={{
            backgroundColor: "rgba(255,255,255,0.05)",
            backdropFilter: "blur(28px) saturate(200%)",
            WebkitBackdropFilter: "blur(28px) saturate(200%)",
            border: "1px solid rgba(255,255,255,0.16)",
            boxShadow: "0 10px 34px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(255,255,255,0.04)",
          }}
        >
          {/* Padding lives on the outer glass shell above; this inner element
              carries no box-model offsets of its own, so the absolutely
              positioned highlight slot below shares the exact same coordinate
              space as the flex buttons (position:absolute resolves against
              the padding box of the nearest positioned ancestor — if that
              ancestor also had the padding, the slot's 0/100% math would be
              measured against a wider box than the buttons actually occupy). */}
          <div className="relative flex items-center w-full">
          {(() => {
            const items = [
              { id: "dashboard", label: "Dashboard", Icon: IconDashboard },
              { id: "activity", label: "Analytics", Icon: IconActivity },
              { id: "ai", label: "AI", Icon: IconAI },
              { id: "more", label: "Menu", Icon: IconMore },
            ];
            const activeIndex = items.findIndex(({ id }) => id === navTab);
            return (
              <>
                {activeIndex !== -1 && (
                  // Outer slot exactly matches one flex-1 button's box (same left/width math
                  // the buttons use), so translateX(N * 100%) — relative to the slot's own
                  // width — lines up perfectly with the Nth button. The inner div is purely
                  // cosmetic inset, kept off the positioned box so it can't skew the math.
                  <div
                    aria-hidden
                    style={{
                      position: "absolute", top: 0, bottom: 0, left: 0,
                      width: `${100 / items.length}%`,
                      transform: `translateX(${activeIndex * 100}%)`,
                      transition: "transform 280ms cubic-bezier(0.32, 0.72, 0, 1)",
                    }}
                  >
                    <div style={{
                      position: "absolute", inset: "4px 3px",
                      borderRadius: 999,
                      backgroundColor: "rgba(255,255,255,0.1)",
                    }} />
                  </div>
                )}
                {items.map(({ id, label, Icon }) => {
                  if (id === "more") {
                    return (
                      <button
                        key="more"
                        onClick={() => setDrawerOpen(true)}
                        className="relative z-10 flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-full transition-colors duration-200 cursor-pointer active:scale-95"
                        style={{ color: "#8e8e93" }}
                      >
                        <IconMore size={20} />
                        <span className="text-[10px] font-semibold">Menu</span>
                      </button>
                    );
                  }
                  const active = navTab === id;
                  return (
                    <button
                      key={id}
                      onClick={() => { setNavTab(id); setCategoryView(null); }}
                      className="relative z-10 flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-full transition-colors duration-200 cursor-pointer active:scale-95"
                      style={{ color: active ? ACCENT : "#8e8e93" }}
                    >
                      <Icon size={20} />
                      <span className="text-[10px] font-semibold">{label}</span>
                    </button>
                  );
                })}
              </>
            );
          })()}
          </div>
        </div>
      </nav>

      {/* ── Overlay ── */}
      <div
        className="fixed inset-0 z-40"
        style={{
          backgroundColor: "rgba(0,0,0,0.5)",
          opacity: addSheetOpen ? 1 : 0,
          pointerEvents: addSheetOpen ? "auto" : "none",
          transition: "opacity 250ms ease",
        }}
        onClick={() => {
          setAddSheetOpen(false);
          setEntrySheetOpen(false);
          setBatchSheetOpen(false);
          setImportSheetOpen(false);
        }}
      />

      {/* ── Add sheet ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl p-5 space-y-3"
        style={{
          backgroundColor: HOME_SURFACE,
          paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))",
          transform: `translateY(${addSheetOpen && !entrySheetOpen && !batchSheetOpen && !importSheetOpen ? dragY : 100}${addSheetOpen && !entrySheetOpen && !batchSheetOpen && !importSheetOpen && dragY > 0 ? "" : "%"})`,
          transition:
            dragY > 0
              ? "none"
              : "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onTouchStart={onSheetTouchStart}
        onTouchMove={onSheetTouchMove}
        onTouchEnd={onSheetTouchEnd}
      >
        <div
          className="w-10 h-1 rounded-full mx-auto mb-4"
          style={{ backgroundColor: HOME_DIVIDER }}
        />
        <p className="text-sm font-semibold mb-1" style={{ color: HOME_MUTED }}>
          Add
        </p>

        <button
          onClick={() => setEntrySheetOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left cursor-pointer active:scale-[0.97] transition-transform duration-150"
          style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "none", color: HOME_TEXT }}
        >
          <span style={{ color: HOME_INCOME }}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold">Transaction</p>
            <p className="text-xs" style={{ color: HOME_MUTED }}>
              Add a single transaction
            </p>
          </div>
        </button>
        <button
          onClick={() => setBatchSheetOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left cursor-pointer active:scale-[0.97] transition-transform duration-150"
          style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "none", color: HOME_TEXT }}
        >
          <span style={{ color: HOME_INCOME }}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold">Batch Add</p>
            <p className="text-xs" style={{ color: HOME_MUTED }}>
              Add multiple at once
            </p>
          </div>
        </button>
        <button
          onClick={() => setImportSheetOpen(true)}
          disabled={isDemo()}
          title={isDemo() ? "Unavailable in demo mode" : undefined}
          className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-transform duration-150 ${isDemo() ? "cursor-not-allowed" : "cursor-pointer active:scale-[0.97]"}`}
          style={{
            backgroundColor: "rgba(255,255,255,0.04)",
            backgroundImage: isDemo() ? `repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255,255,255,0.06) 4px, rgba(255,255,255,0.06) 6px)` : undefined,
            border: "none",
            color: HOME_TEXT,
            opacity: isDemo() ? 0.45 : 1,
          }}
        >
          <span style={{ color: HOME_INCOME }}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold">Import</p>
            <p className="text-xs" style={{ color: HOME_MUTED }}>
              CSV from your bank
            </p>
          </div>
        </button>
      </div>

      {/* ── Entry sheet ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          backgroundColor: HOME_SURFACE,
          borderRadius: keyboardOpen ? "16px 16px 16px 16px" : "16px 16px 0 0",
          transition: "border-radius 150ms ease, border-bottom 150ms ease",
          paddingBottom: "env(safe-area-inset-bottom)",
          transform: `translateY(${entrySheetOpen ? dragY : 100}${entrySheetOpen && dragY > 0 ? "" : "%"})`,
          transition:
            dragY > 0
              ? "none"
              : "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onTouchStart={onSheetTouchStart}
        onTouchMove={onSheetTouchMove}
        onTouchEnd={onSheetTouchEnd}
      >
        <div
          className="px-5 py-4 flex items-center justify-between border-b"
          style={{ borderColor: HOME_DIVIDER }}
          onTouchStart={onSheetTouchStart}
          onTouchMove={onSheetTouchMove}
          onTouchEnd={onSheetTouchEnd}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEntrySheetOpen(false)}
              className="p-1 rounded-lg cursor-pointer active:scale-90 transition-transform duration-150"
              style={{ color: HOME_MUTED }}
            >
              <IconChevronLeft />
            </button>
            <p className="text-sm font-semibold" style={{ color: HOME_TEXT }}>
              New Transaction
            </p>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <CategoryPicker
            value={quickCat}
            onChange={(key) => {
              setQuickCat(key);
              setQuickForm((f) => ({ ...f, name: lockedNameFor(key) ?? f.name }));
            }}
          />
          <form onSubmit={handleQuickSubmit} className="space-y-3">
            <input
              type="text"
              placeholder="Name"
              value={quickForm.name}
              onChange={(e) =>
                !lockedNameFor(quickCat) &&
                setQuickForm((f) => ({ ...f, name: e.target.value }))
              }
              required={!lockedNameFor(quickCat)}
              disabled={!!lockedNameFor(quickCat)}
              className="w-full rounded-xl px-4 py-2.5 text-sm border"
              style={
                lockedNameFor(quickCat)
                  ? {
                      ...quickFieldStyle,
                      cursor: "not-allowed",
                      opacity: 0.45,
                      backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255,255,255,0.08) 4px, rgba(255,255,255,0.08) 6px)`,
                    }
                  : quickFieldStyle
              }
            />
            <div className="grid grid-cols-2 gap-3">
              <CurrencyInput
                placeholder="0.00"
                value={quickForm.amount}
                onChange={(v) =>
                  setQuickForm((f) => ({ ...f, amount: v }))
                }
                required
                className="rounded-xl px-4 py-2.5 text-sm border"
                style={quickFieldStyle}
              />
              <CompactDateField
                value={quickForm.transaction_date}
                onChange={(v) => setQuickForm((f) => ({ ...f, transaction_date: v }))}
                required
                className="rounded-xl px-3 py-2.5 text-sm border"
                style={quickFieldStyle}
              />
            </div>
            {quickError && <p className="text-xs text-red-500">{quickError}</p>}
            <button
              type="submit"
              disabled={quickLoading}
              className="w-full py-2.5 rounded-xl text-sm font-bold tracking-wide disabled:opacity-50 cursor-pointer active:scale-95"
              style={{
                border: "none",
                color: "#fff",
                backgroundColor: quickTileColor,
              }}
            >
              {quickLoading ? "Saving…" : "Add Transaction"}
            </button>
          </form>
        </div>
      </div>

      {/* ── Batch add sheet ── */}
      {/* Backdrop is the shared Add-sheet overlay above (like Entry) - addSheetOpen
          stays true while this is open so the back button returns to the Add
          picker instead of closing outright; a dedicated overlay here would
          double-stack on top of that one. */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl flex flex-col"
        style={{
          backgroundColor: HOME_SURFACE,
          maxHeight: "85dvh",
          paddingBottom: "env(safe-area-inset-bottom)",
          transform: `translateY(${batchSheetOpen ? dragY : 100}${batchSheetOpen && dragY > 0 ? "" : "%"})`,
          transition:
            dragY > 0
              ? "none"
              : "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div
          className="flex justify-center py-3 shrink-0"
          onTouchStart={onSheetTouchStart}
          onTouchMove={onSheetTouchMove}
          onTouchEnd={onSheetTouchEnd}
        >
          <div
            className="w-10 h-1 rounded-full"
            style={{ backgroundColor: HOME_DIVIDER }}
          />
        </div>
        <div
          className="px-5 pb-3 flex items-center justify-between border-b shrink-0"
          style={{ borderColor: HOME_DIVIDER }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBatchSheetOpen(false)}
              className="p-1 rounded-lg cursor-pointer active:scale-90 transition-transform duration-150"
              style={{ color: HOME_MUTED }}
            >
              <IconChevronLeft />
            </button>
            <p className="text-sm font-semibold" style={{ color: HOME_TEXT }}>
              Batch Add{" "}
              <span style={{ color: HOME_MUTED, fontWeight: 400 }}>
                · {batchItems.length} rows
              </span>
            </p>
          </div>
          <button
            onClick={handleBatchSubmit}
            disabled={batchLoading}
            className="px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50 active:scale-95 transition-transform duration-150"
            style={{
              color: "#fff",
              border: "none",
              backgroundColor: HOME_INCOME,
            }}
          >
            {batchLoading
              ? "Adding…"
              : (() => {
                  const n = batchItems.filter(
                    (r) =>
                      parseFloat(r.amount) > 0 &&
                      (!!lockedNameFor(r.category) || r.name.trim()),
                  ).length;
                  return n
                    ? `Add ${n} transaction${n === 1 ? "" : "s"}`
                    : "Add transactions";
                })()}
          </button>
        </div>
        <div ref={batchListRef} className="flex-1 overflow-y-auto px-4 py-3">
          {batchItems.map((item, idx) => {
            // TILE_COLOR (pinned), not the `--category-*` CSS var - that var
            // resolves to the .dark block's pastel shades when the light/dark
            // toggle is dark, which read as washed-out on a solid fill (those
            // pastels are tuned for colored text on a dark bg, not tiles).
            const catColor = TILE_COLOR[item.category];
            return (
              <div
                key={item._key}
                style={{
                  maxHeight:
                    deletingKeys.includes(item._key) ||
                    enteringKey === item._key
                      ? 0
                      : 130,
                  overflow: "hidden",
                  marginBottom:
                    deletingKeys.includes(item._key) ||
                    enteringKey === item._key
                      ? 0
                      : 8,
                  transition: deletingKeys.includes(item._key)
                    ? "max-height 350ms ease, margin-bottom 350ms ease"
                    : "max-height 220ms ease, margin-bottom 220ms ease",
                }}
              >
                <div
                  className="rounded-xl border p-3 flex flex-col gap-2"
                  style={{
                    borderColor: HOME_DIVIDER,
                    backgroundColor: "rgba(255,255,255,0.04)",
                    transform: deletingKeys.includes(item._key)
                      ? "translateX(60px)"
                      : "translateX(0)",
                    opacity: deletingKeys.includes(item._key) ? 0 : 1,
                    transition: "transform 350ms ease, opacity 250ms ease",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-bold shrink-0 w-5 text-center"
                      style={{ color: HOME_MUTED }}
                    >
                      {idx + 1}
                    </span>
                    <select
                      value={item.category}
                      onChange={(e) =>
                        setBatchItems((prev) =>
                          prev.map((r, i) =>
                            i === idx
                              ? {
                                  ...r,
                                  category: e.target.value,
                                  name:
                                    lockedNameFor(e.target.value) ?? r.name,
                                }
                              : r,
                          ),
                        )
                      }
                      className="flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold cursor-pointer"
                      style={{
                        color: "#fff",
                        border: "none",
                        backgroundColor: catColor,
                        colorScheme: "dark",
                      }}
                    >
                      {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                        <option
                          key={key}
                          value={key}
                          style={{ backgroundColor: HOME_SURFACE, color: HOME_TEXT }}
                        >
                          {cfg.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        setDeletingKeys((prev) => [...prev, item._key]);
                        setTimeout(() => {
                          setBatchItems((prev) =>
                            prev.filter((r) => r._key !== item._key),
                          );
                          setDeletingKeys((prev) =>
                            prev.filter((k) => k !== item._key),
                          );
                        }, 350);
                      }}
                      className="p-1 rounded-lg cursor-pointer shrink-0"
                      style={{ color: HOME_MUTED }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Name"
                      value={lockedNameFor(item.category) ?? item.name}
                      onChange={(e) =>
                        !lockedNameFor(item.category) &&
                        setBatchItems((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, name: e.target.value } : r,
                          ),
                        )
                      }
                      disabled={!!lockedNameFor(item.category)}
                      className="flex-1 rounded-lg px-2 py-1.5 text-xs border min-w-0"
                      style={{
                        backgroundColor: HOME_SURFACE,
                        borderColor: HOME_DIVIDER,
                        color: HOME_TEXT,
                        opacity: lockedNameFor(item.category) ? 0.45 : 1,
                        cursor:
                          lockedNameFor(item.category) ? "not-allowed" : undefined,
                        backgroundImage:
                          lockedNameFor(item.category)
                            ? `repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255,255,255,0.08) 4px, rgba(255,255,255,0.08) 6px)`
                            : undefined,
                      }}
                    />
                    <CurrencyInput
                      placeholder="0.00"
                      value={item.amount}
                      onChange={(v) =>
                        setBatchItems((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, amount: v } : r,
                          ),
                        )
                      }
                      className="rounded-lg px-2 py-1.5 text-xs border"
                      style={{
                        width: 72,
                        backgroundColor: HOME_SURFACE,
                        borderColor: HOME_DIVIDER,
                        color: HOME_TEXT,
                      }}
                    />
                    <input
                      type="date"
                      value={item.transaction_date}
                      onChange={(e) =>
                        setBatchItems((prev) =>
                          prev.map((r, i) =>
                            i === idx
                              ? { ...r, transaction_date: e.target.value }
                              : r,
                          ),
                        )
                      }
                      className="rounded-lg px-2 py-1.5 text-xs border"
                      style={{
                        width: 112,
                        backgroundColor: HOME_SURFACE,
                        borderColor: HOME_DIVIDER,
                        color: HOME_TEXT,
                        colorScheme: "dark",
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div
          className="px-4 py-3 border-t shrink-0"
          style={{ borderColor: HOME_DIVIDER }}
        >
          {batchError && (
            <p
              className="text-xs mb-2"
              style={{ color: "var(--category-expense)" }}
            >
              {batchError}
            </p>
          )}
          <button
            onClick={() => {
              const row = newBatchRow();
              setBatchItems((prev) => [...prev, row]);
              setEnteringKey(row._key);
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  setEnteringKey(null);
                  const start = performance.now();
                  const track = () => {
                    if (batchListRef.current)
                      batchListRef.current.scrollTop =
                        batchListRef.current.scrollHeight;
                    if (performance.now() - start < 260)
                      requestAnimationFrame(track);
                  };
                  requestAnimationFrame(track);
                }),
              );
            }}
            className="w-full py-2.5 rounded-xl text-sm font-semibold cursor-pointer active:scale-95 transition-transform duration-150"
            style={{
              color: HOME_MUTED,
              border: "none",
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            + Add row
          </button>
        </div>
      </div>

      {/* ── Import sheet ── */}
      {/* Backdrop is the shared Add-sheet overlay above, same reasoning as
          the Batch sheet. */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl flex flex-col"
        style={{
          backgroundColor: HOME_SURFACE,
          maxHeight: "85dvh",
          overflow: "hidden",
          paddingBottom: "env(safe-area-inset-bottom)",
          transform: `translateY(${importSheetOpen ? dragY : 100}${importSheetOpen && dragY > 0 ? "" : "%"})`,
          transition:
            dragY > 0
              ? "none"
              : "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div
          className="flex justify-center py-3 shrink-0"
          onTouchStart={onSheetTouchStart}
          onTouchMove={onSheetTouchMove}
          onTouchEnd={onSheetTouchEnd}
        >
          <div
            className="w-10 h-1 rounded-full"
            style={{ backgroundColor: HOME_DIVIDER }}
          />
        </div>
        <div
          className="px-5 pb-3 flex items-center justify-between border-b shrink-0"
          style={{ borderColor: HOME_DIVIDER }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImportSheetOpen(false)}
              className="p-1 rounded-lg cursor-pointer active:scale-90 transition-transform duration-150"
              style={{ color: HOME_MUTED }}
            >
              <IconChevronLeft />
            </button>
            <p className="text-sm font-semibold" style={{ color: HOME_TEXT }}>
              Import
            </p>
          </div>
          <button
            onClick={importSaveState.onSave}
            disabled={!importSaveState.isDirty || importSaveState.isSaving}
            className="px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50 active:scale-95 transition-transform duration-150"
            style={{
              color: "#fff",
              border: "none",
              backgroundColor: HOME_INCOME,
            }}
          >
            {importSaveState.isSaving
              ? "Importing…"
              : importSaveState.validCount
                ? `Import ${importSaveState.validCount} transaction${importSaveState.validCount === 1 ? "" : "s"}`
                : "Import"}
          </button>
        </div>
        <ImportPanel
          active={importSheetOpen}
          onSaveStateChange={setImportSaveState}
          onSaved={(newTxs) => { setTransactions(prev => [...(newTxs || []), ...prev]); setImportSheetOpen(false); setAddSheetOpen(false); }}
          onCancel={() => setImportSheetOpen(false)}
          mobile
        />
      </div>


      {/* ── Overview stat breakdown sheet (#42) ── */}
      <OverviewBreakdownSheet
        cell={breakdownCell}
        onClose={() => setBreakdownCell(null)}
        safeToSpend={safeToSpend}
        safeToSpendStatus={safeToSpendStatus}
        savings={savings}
        savingsStatus={savingsStatus}
      />

      {/* ── Recurring payments overlay ── */}
      <MobileScreen open={recurringOpen} style={{ backgroundColor: HOME_BG, color: HOME_TEXT }}>
          <div
            className="px-4 pb-3 flex items-center justify-between shrink-0"
            style={{ borderBottom: `1px solid ${HOME_DIVIDER}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => setRecurringOpen(false)}
                aria-label="Back to home"
                style={{
                  width: 36, height: 36, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
                  background: HOME_SURFACE, border: "1px solid rgba(255,255,255,0.07)",
                  display: "flex", alignItems: "center", justifyContent: "center", color: HOME_TEXT,
                }}
              >
                <IconChevronLeft size={19} />
              </button>
              <span className="text-base font-semibold" style={{ color: HOME_TEXT }}>
                Recurring Payments
              </span>
            </div>
            <button
              onClick={() => setRecurringAddSignal(n => n + 1)}
              aria-label="Add recurring payment"
              style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
                background: HOME_SURFACE, border: "1px solid rgba(255,255,255,0.07)",
                display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
              }}
            >
              <IconPlus size={19} />
            </button>
          </div>
          <MobileRecurring onSaved={refresh} openAddSignal={recurringAddSignal} />
      </MobileScreen>

      {/* ── Installments overlay ── */}
      <MobileScreen open={installmentsOpen} style={{ backgroundColor: HOME_BG, color: HOME_TEXT }}>
          <div
            className="px-4 pb-3 flex items-center justify-between shrink-0"
            style={{ borderBottom: `1px solid ${HOME_DIVIDER}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => setInstallmentsOpen(false)}
                aria-label="Back to home"
                style={{
                  width: 36, height: 36, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
                  background: HOME_SURFACE, border: "1px solid rgba(255,255,255,0.07)",
                  display: "flex", alignItems: "center", justifyContent: "center", color: HOME_TEXT,
                }}
              >
                <IconChevronLeft size={19} />
              </button>
              <span className="text-base font-semibold" style={{ color: HOME_TEXT }}>
                Installments
              </span>
            </div>
            <button
              onClick={() => setInstallmentsAddSignal(n => n + 1)}
              aria-label="Add installment"
              style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
                background: HOME_SURFACE, border: "1px solid rgba(255,255,255,0.07)",
                display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
              }}
            >
              <IconPlus size={19} />
            </button>
          </div>
          <MobileInstallments onSaved={refresh} openAddSignal={installmentsAddSignal} />
      </MobileScreen>

      {/* ── Paychecks overlay ── */}
      <MobileScreen open={paychecksOpen} style={{ backgroundColor: HOME_BG, color: HOME_TEXT }}>
          <div
            className="px-4 pb-3 flex items-center shrink-0"
            style={{ borderBottom: `1px solid ${HOME_DIVIDER}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPaychecksOpen(false)}
                aria-label="Back to home"
                style={{
                  width: 36, height: 36, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
                  background: HOME_SURFACE, border: "1px solid rgba(255,255,255,0.07)",
                  display: "flex", alignItems: "center", justifyContent: "center", color: HOME_TEXT,
                }}
              >
                <IconChevronLeft size={19} />
              </button>
              <span className="text-base font-semibold" style={{ color: HOME_TEXT }}>
                Paychecks
              </span>
            </div>
          </div>
          <MobilePaychecks onSaved={refresh} />
      </MobileScreen>

      {/* ── Drawer backdrop ── */}
      {(drawerOpen || accountOpen) && (
        <div
          className="fixed inset-0 z-40"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={() => { setDrawerOpen(false); setAccountOpen(false); }}
        />
      )}

      {/* ── Drawer (menu + account as sliding track) ── */}
      {/* Bottom sheet, same shape as MobileTransactionModal's detail sheet
          (rounded top, capped height, backdrop dim) rather than a full-screen
          page push or the old right-side drawer. The Menu/Account/Dev-Tools
          sub-navigation inside stays a horizontal (translateX) track,
          independent of this outer vertical open/close transform - capped
          height + internal scroll per sub-panel covers Account/Dev Tools'
          longer content since all three share one fixed-height container. */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          backgroundColor: HOME_SURFACE,
          color: HOME_TEXT,
          borderRadius: "20px 20px 0 0",
          overflow: "hidden",
          height: "72dvh",
          display: "flex",
          flexDirection: "column",
          paddingBottom: "env(safe-area-inset-bottom)",
          transform: `translateY(${(drawerOpen || accountOpen) ? drawerDragY : 100}${(drawerOpen || accountOpen) && drawerDragY > 0 ? "" : "%"})`,
          transition: drawerDragY > 0 ? "none" : "transform 250ms ease",
        }}
      >
        <div
          className="flex justify-center py-3 shrink-0"
          onTouchStart={onDrawerTouchStart}
          onTouchMove={onDrawerTouchMove}
          onTouchEnd={onDrawerTouchEnd}
        >
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: HOME_DIVIDER }} />
        </div>
        <div
          style={{
            display: "flex",
            width: "300%",
            flex: 1,
            minHeight: 0,
            transform: devOpen ? "translateX(-66.667%)" : accountOpen ? "translateX(-33.333%)" : "translateX(0)",
            transition: skipAccountSlide ? "none" : "transform 250ms ease",
          }}
        >
          {/* Menu panel - account/profile, tool shortcuts, and app settings.
              Paychecks/Recurring Payments/Installments duplicate Home's Tools
              card entries by request - kept here too as a second access point.
              Light/dark toggle dropped, mobile is pinned dark everywhere else
              at this point so it barely changed anything visible. */}
          <div
            style={{
              width: "33.333%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              className="px-5 py-4 flex items-center justify-between border-b shrink-0"
              style={{ borderColor: HOME_DIVIDER }}
              onTouchStart={onDrawerTouchStart}
              onTouchMove={onDrawerTouchMove}
              onTouchEnd={onDrawerTouchEnd}
            >
              <span className="text-sm font-semibold" style={{ color: HOME_MUTED }}>
                Menu
              </span>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1 rounded-lg cursor-pointer active:scale-90 transition-transform duration-150"
                aria-label="Close menu"
                style={{ color: HOME_MUTED }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <button
              className="px-5 py-5 flex items-center gap-3 w-full text-left cursor-pointer active:scale-[0.98] transition-transform duration-150"
              style={{ background: "transparent", border: "none" }}
              onClick={() => setAccountOpen(true)}
            >
              <div
                className="w-10 h-10 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-sm font-bold"
                style={{
                  backgroundColor: "rgba(255,255,255,0.1)",
                  color: HOME_TEXT,
                }}
              >
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt="avatar"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  (user?.first_name?.[0]?.toUpperCase() ?? "?")
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  {user ? `${user.first_name} ${user.last_name}` : "—"}
                </p>
                <p className="text-xs truncate" style={{ color: HOME_MUTED }}>
                  {user?.email_address ?? "—"}
                </p>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: HOME_MUTED, flexShrink: 0 }}
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
            <div className="mx-5 border-t" style={{ borderColor: HOME_DIVIDER }} />
            <div className="px-3 py-3 flex flex-col gap-2">
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer text-left active:scale-[0.97] transition-transform duration-150"
                style={{ color: HOME_TEXT, border: "none", backgroundColor: "rgba(255,255,255,0.05)" }}
                onClick={() => setPaychecksOpen(true)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
                Paychecks
              </button>
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer text-left active:scale-[0.97] transition-transform duration-150"
                style={{ color: HOME_TEXT, border: "none", backgroundColor: "rgba(255,255,255,0.05)" }}
                onClick={() => setRecurringOpen(true)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M12 7v5l4 2" />
                </svg>
                Recurring Payments
              </button>
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer text-left active:scale-[0.97] transition-transform duration-150"
                style={{ color: HOME_TEXT, border: "none", backgroundColor: "rgba(255,255,255,0.05)" }}
                onClick={() => setInstallmentsOpen(true)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="5" x2="5" y2="19" />
                  <circle cx="6.5" cy="6.5" r="2.5" />
                  <circle cx="17.5" cy="17.5" r="2.5" />
                </svg>
                Installments
              </button>
            </div>
            <div className="mx-5 border-t" style={{ borderColor: HOME_DIVIDER }} />
            <div className="px-3 py-3 flex-1 flex flex-col gap-3">
              <a
                href="https://forms.gle/BC6ebwbZtgYmSYBeA"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left cursor-pointer active:scale-[0.97] transition-transform duration-150"
                style={{
                  color: HOME_TEXT,
                  textDecoration: "none",
                  border: "none",
                  backgroundColor: "rgba(255,255,255,0.05)",
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Feedback
              </a>
            </div>
            <div className="mx-5 border-t" style={{ borderColor: HOME_DIVIDER }} />
            <div className="px-3 py-3">
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer text-left active:scale-[0.97] transition-transform duration-150"
                style={{ color: HOME_EXPENSE, backgroundColor: "color-mix(in srgb, var(--category-expense) 8%, transparent)", border: "none" }}
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Log out
              </button>
            </div>
          </div>

          {/* Account panel */}
          <div
            style={{
              width: "33.333%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              className="px-5 py-4 flex items-center justify-between border-b shrink-0"
              style={{ borderColor: HOME_DIVIDER }}
              onTouchStart={onDrawerTouchStart}
              onTouchMove={onDrawerTouchMove}
              onTouchEnd={onDrawerTouchEnd}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAccountOpen(false)}
                  className="p-1 rounded-lg cursor-pointer"
                  style={{ color: HOME_MUTED }}
                >
                  <IconChevronLeft />
                </button>
                <span
                  className="text-sm font-semibold"
                  style={{ color: HOME_MUTED }}
                >
                  Account
                </span>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                {(() => {
                  const status = acctSave.isSaving
                    ? "Saving…"
                    : acctSave.isDirty
                      ? "Unsaved"
                      : acctSave.saveStatus === "saved"
                        ? "Saved"
                        : null;
                  const statusColor =
                    acctSave.saveStatus === "saved" && !acctSave.isDirty
                      ? "var(--category-income)"
                      : HOME_MUTED;
                  return status ? (
                    <span
                      style={{
                        fontSize: "11px",
                        color: statusColor,
                        transition: "color 0.3s",
                      }}
                    >
                      {status}
                    </span>
                  ) : null;
                })()}
                <button
                  onClick={() => acctSave.onSave?.()}
                  disabled={!acctSave.isDirty || acctSave.isSaving}
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "4px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--category-income)",
                    color: "var(--category-income)",
                    backgroundColor: acctSave.isDirty
                      ? "color-mix(in srgb, var(--category-income) 18%, transparent)"
                      : "transparent",
                    boxShadow: acctSave.isDirty
                      ? "0 0 0 2px color-mix(in srgb, var(--category-income) 20%, transparent)"
                      : "none",
                    cursor:
                      acctSave.isDirty && !acctSave.isSaving
                        ? "pointer"
                        : "default",
                    opacity: acctSave.isDirty
                      ? acctSave.isSaving
                        ? 0.6
                        : 1
                      : 0.25,
                    transition: "all 0.2s ease",
                  }}
                >
                  {acctSave.isSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
            <AccountPanel onSaveStateChange={setAcctSave} />
          </div>

          {/* Dev tools panel - lowest priority of the drawer surfaces (#30),
              light pass: swap the theme-toggle colors for the pinned-dark
              ones, no structural changes. */}
          <div style={{ width: "33.333%", height: "100%", display: "flex", flexDirection: "column" }}>
            <div
              className="px-5 py-4 flex items-center gap-2 border-b shrink-0"
              style={{ borderColor: HOME_DIVIDER }}
              onTouchStart={onDrawerTouchStart}
              onTouchMove={onDrawerTouchMove}
              onTouchEnd={onDrawerTouchEnd}
            >
              <button onClick={() => setDevOpen(false)} className="p-1 rounded-lg cursor-pointer" style={{ color: HOME_MUTED }}>
                <IconChevronLeft />
              </button>
              <span className="text-sm font-semibold" style={{ color: "var(--category-expense)" }}>Dev Tools</span>
            </div>
            <div className="flex-1 overflow-y-auto py-2 flex flex-col" style={{ color: HOME_TEXT }}>

              <MDevSection label="LOADING & STATE" border={HOME_DIVIDER} muted={HOME_MUTED} first />
              <DevRow label="Skeleton" description="Toggle loading state">
                <DevToggle active={loading} onToggle={() => setLoading(v => !v)} />
              </DevRow>
              <DevRow label="Force empty" description="Zero out display data">
                <DevToggle active={devForceEmpty} onToggle={() => setDevForceEmpty(v => !v)} />
              </DevRow>
              <DevRow label="Force next error" description="Next fetch throws">
                <DevToggle active={devForceError} onToggle={() => { const n = !devForceError; setDevForceError(n); devForceErrorRef.current = n; }} />
              </DevRow>
              <DevRow label="Re-fetch" description="Reload transactions">
                <button onClick={() => { setLoading(true); refresh(); }} className="px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer border" style={{ color: HOME_TEXT, borderColor: HOME_DIVIDER, backgroundColor: "rgba(255,255,255,0.06)" }}>Run</button>
              </DevRow>

              <MDevSection label="NETWORK" border={HOME_DIVIDER} muted={HOME_MUTED} />
              <div className="px-5 py-2 flex flex-col gap-1">
                <span className="text-xs" style={{ color: HOME_MUTED }}>Slow network</span>
                <div className="flex gap-1">
                  {[0, 500, 2000, 5000].map(ms => (
                    <button key={ms} onClick={() => setDevDelay(ms)} style={{ flex: 1, padding: "4px 0", borderRadius: 6, border: `1px solid ${devDelay === ms ? "var(--category-expense)" : HOME_DIVIDER}`, backgroundColor: devDelay === ms ? "color-mix(in srgb, var(--category-expense) 12%, transparent)" : "transparent", color: devDelay === ms ? "var(--category-expense)" : HOME_MUTED, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
                      {ms === 0 ? "Off" : ms < 1000 ? `${ms}ms` : `${ms/1000}s`}
                    </button>
                  ))}
                </div>
              </div>

              <MDevSection label="DATA" border={HOME_DIVIDER} muted={HOME_MUTED} />
              <MDevInfo label="Transactions" value={transactions.length} muted={HOME_MUTED} text={HOME_TEXT} />
              <MDevInfo label="Last fetch" value={devLastFetch ? devLastFetch.toLocaleTimeString() : "—"} muted={HOME_MUTED} text={HOME_TEXT} />
              <MDevInfo label="Nav tab" value={navTab} muted={HOME_MUTED} text={HOME_TEXT} />
              <MDevInfo label="Date range" value={dashDateRange.from ? `${dashDateRange.from.toLocaleDateString("en-US",{month:"short",day:"numeric"})} → ${dashDateRange.to?.toLocaleDateString("en-US",{month:"short",day:"numeric"}) ?? "…"}` : "All time"} muted={HOME_MUTED} text={HOME_TEXT} />

              <MDevSection label="UI" border={HOME_DIVIDER} muted={HOME_MUTED} />
              <DevRow label="Toggle theme" description="Flip dark / light">
                <button onClick={() => document.documentElement.classList.toggle("dark")} className="px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer border" style={{ color: HOME_TEXT, borderColor: HOME_DIVIDER, backgroundColor: "rgba(255,255,255,0.06)" }}>Flip</button>
              </DevRow>

              <MDevSection label="SESSION" border={HOME_DIVIDER} muted={HOME_MUTED} />
              <MDevInfo label="Token expiry" value={(() => { try { const t = localStorage.getItem("token"); if (!t) return "None"; const p = JSON.parse(atob(t.split(".")[1])); return p.exp ? new Date(p.exp * 1000).toLocaleTimeString() : "No exp"; } catch { return "Invalid"; } })()} muted={HOME_MUTED} text={HOME_TEXT} />
              <div className="px-5 py-2">
                <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="w-full py-2 rounded-xl text-xs font-bold cursor-pointer border" style={{ color: "var(--category-expense)", borderColor: "var(--category-expense)", backgroundColor: "color-mix(in srgb, var(--category-expense) 8%, transparent)" }}>
                  Clear localStorage + Reload
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>

      {editingTransaction && (
        <MobileTransactionModal
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSaved={() => {
            setEditingTransaction(null);
            refresh();
          }}
          onDelete={handleDelete}
          onLocate={handleLocateTransaction}
        />
      )}

      {editingDeposit && (
        <MobileDepositModal
          deposit={editingDeposit}
          onClose={() => setEditingDeposit(null)}
          onSaved={() => {
            setEditingDeposit(null);
            refresh();
          }}
          onDelete={handleDeleteDeposit}
        />
      )}

      {transactions.length === 0 && <Footer />}
    </div>
  );
}

function MDevSection({ label, border, muted, first = false }) {
  return (
    <div style={{ padding: "8px 20px 4px", borderTop: first ? "none" : `1px solid ${border}`, marginTop: first ? 0 : 4 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: muted }}>{label}</span>
    </div>
  );
}

function MDevInfo({ label, value, muted, text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 20px", gap: 12 }}>
      <span style={{ fontSize: 13, color: muted }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: text, fontFamily: "monospace", textAlign: "right", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(value)}</span>
    </div>
  );
}

function DevRow({ label, description, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "6px 20px" }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500 }}>{label}</p>
        <p style={{ fontSize: 11, opacity: 0.45, marginTop: 1 }}>{description}</p>
      </div>
      {children}
    </div>
  );
}

function DevToggle({ active, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 42, height: 24, borderRadius: 999, border: "none", cursor: "pointer", flexShrink: 0,
        backgroundColor: active ? "var(--category-income)" : "rgba(128,128,128,0.25)",
        position: "relative", transition: "background-color 200ms ease",
      }}
    >
      <div style={{
        position: "absolute", top: 3, left: active ? "calc(100% - 21px)" : 3,
        width: 18, height: 18, borderRadius: "50%", backgroundColor: "#fff",
        transition: "left 200ms ease", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

