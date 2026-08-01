import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import {
  getTransactions,
  createTransaction,
  deleteTransaction,
} from "../api/transactions";
import { getSpendableSurplus, getEstimatedSavings } from "../api/paychecks";
import CurrencyInput from "../components/CurrencyInput";
import EditTransactionModal from "../components/EditTransactionModal";
import {
  CATEGORIES,
  CATEGORY_CONFIG,
  INCOME_TYPES,
  fmt,
} from "../utils/finance";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../context/AuthContext";
import { PRESETS, getPresetRange } from "../components/DateRangeFilter";
import { getToday } from "../utils/time";
import Footer from "../components/Footer";
import AccountPanel from "../components/AccountPanel";
import OverviewBreakdownSheet from "../components/OverviewBreakdownSheet";
import MobileHome from "../components/MobileHome";
import MobileCategory from "../components/MobileCategory";
import MobileTips from "../components/MobileTips";
import MobilePaychecks from "../components/MobilePaychecks";
import MobileRecurring from "../components/MobileRecurring";
import SwipeableRow from "../components/SwipeableRow";
import { HOME_BG, HOME_TEXT, HOME_MUTED, HOME_DIVIDER, HOME_SURFACE, HOME_INCOME, ACCENT } from "../components/categoryVisuals";

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

function IconAnalytics({ size = 20 }) {
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
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
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

// ── Transaction list shared component ────────────────────────────────────────

function TransactionList({
  items,
  total,
  page,
  setPage,
  perPage,
  setPerPage,
  accentColor,
  highlightId,
  text,
  muted,
  border,
  surface,
  onEdit,
  onDelete,
}) {
  const [openId, setOpenId] = useState(null);

  if (total === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm" style={{ color: muted }}>
        No transactions
      </p>
    );
  }
  return (
    <>
      {openId !== null && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 5 }}
          onTouchStart={() => setOpenId(null)}
          onClick={() => setOpenId(null)}
        />
      )}
      {items.map((t) => {
        const isIncome = INCOME_TYPES.has(t.category);
        return (
          <SwipeableRow
            key={t.id}
            id={t.id}
            openId={openId}
            setOpenId={setOpenId}
            onEdit={() => onEdit(t)}
            onDelete={() => onDelete(t.id)}
            border={border}
            surface={surface}
            text={text}
          >
            <div
              className="px-4 py-3 flex items-center gap-3"
              style={{
                backgroundColor:
                  t.id === highlightId
                    ? `color-mix(in srgb, var(--category-${t.category.toLowerCase()}) 12%, transparent)`
                    : surface,
                transition: "background-color 0.6s ease",
              }}
            >
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: text }}
                >
                  {t.name}
                </p>
                <p className="text-xs" style={{ color: muted }}>
                  <span
                    className="font-medium"
                    style={{
                      color: `var(--category-${t.category.toLowerCase()})`,
                    }}
                  >
                    {CATEGORY_CONFIG[t.category]?.label}
                  </span>
                  {" · "}
                  {new Date(
                    t.transaction_date + "T00:00:00",
                  ).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
              <p
                className="text-sm font-bold shrink-0"
                style={{
                  color: isIncome
                    ? "var(--category-income)"
                    : "var(--category-expense)",
                }}
              >
                {isIncome ? "+" : "-"}
                {fmt(t.amount)}
              </p>
            </div>
          </SwipeableRow>
        );
      })}
      <div
        className="px-4 py-3 border-t flex items-center justify-between text-xs"
        style={{ borderColor: border, color: muted }}
      >
        <div className="flex items-center gap-2">
          <span>Rows:</span>
          {[10, 20, 50].map((n) => (
            <button
              key={n}
              onClick={() => setPerPage(n)}
              className="px-3 py-2 rounded-lg border font-semibold cursor-pointer transition-all duration-150"
              style={{
                color: perPage === n ? accentColor : muted,
                borderColor: perPage === n ? accentColor : border,
                backgroundColor:
                  perPage === n
                    ? `color-mix(in srgb, ${accentColor} 12%, transparent)`
                    : "transparent",
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span>
            {`${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)}`}{" "}
            of {total}
          </span>
          <button
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
            className="px-3 py-2 rounded-lg border font-semibold cursor-pointer disabled:opacity-30"
            style={{ color: muted, borderColor: border }}
          >
            ←
          </button>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page * perPage >= total}
            className="px-3 py-2 rounded-lg border font-semibold cursor-pointer disabled:opacity-30"
            style={{ color: muted, borderColor: border }}
          >
            →
          </button>
        </div>
      </div>
    </>
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
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const bg = dark ? "var(--dark-bg)" : "var(--light-bg)";
  const surface = dark ? "var(--dark-surface)" : "var(--light-surface)";
  const border = dark ? "var(--dark-border)" : "var(--light-border)";
  const text = dark ? "var(--dark-text)" : "var(--light-text)";
  const muted = `color-mix(in srgb, ${text} 50%, transparent)`;

  // ── Navigation
  const [navTab, setNavTab] = useState("dashboard");
  const [categoryView, setCategoryView] = useState(null);
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
  const [recurringAddSignal, setRecurringAddSignal] = useState(0);
  const [paychecksOpen, setPaychecksOpen] = useState(false);
  const [breakdownCell, setBreakdownCell] = useState(null); // null | balance | bills | cash | savings
  const [accountOpen, setAccountOpen] = useState(false);
  const [acctSave, setAcctSave] = useState({
    isDirty: false,
    isSaving: false,
    saveStatus: null,
    onSave: null,
  });

  // ── Data
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [safeToSpend, setSafeToSpend] = useState(null);
  const [safeToSpendStatus, setSafeToSpendStatus] = useState("loading"); // loading | ok | no-balance | no-schedule | error
  const [savings, setSavings] = useState(null);
  const [savingsStatus, setSavingsStatus] = useState("loading"); // loading | ok | no-schedule | no-amounts | no-history | error

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

  useEffect(() => {
    devFetch().then((res) => {
      setTransactions(res.data);
      setLoading(false);
      setDevLastFetch(new Date());
    }).catch(() => { setLoading(false); });
    loadSafeToSpend();
    loadSavings();
  }, []);

  function refresh() {
    devFetch().then((res) => {
      setTransactions(res.data);
      setDevLastFetch(new Date());
    }).catch(() => {});
    loadSafeToSpend();
    loadSavings();
  }

  const [editingTransaction, setEditingTransaction] = useState(null);

  const handleDelete = async (id) => {
    await deleteTransaction(id);
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
  const quickColor = `var(--category-${quickCat.toLowerCase()})`;
  const inputStyle = { backgroundColor: bg, borderColor: border, color: text };

  const [batchSheetOpen, setBatchSheetOpen] = useState(false);
  const [batchItems, setBatchItems] = useState(() => [newBatchRow()]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [deletingKeys, setDeletingKeys] = useState([]);
  const [enteringKey, setEnteringKey] = useState(null);
  const batchListRef = useRef(null);

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
        name: quickForm.name,
        amount: parseFloat(quickForm.amount),
        transaction_date: quickForm.transaction_date,
        category: quickCat,
      });
      setQuickForm((f) => ({ ...f, name: "", amount: "" }));
      setEntrySheetOpen(false);
      setAddSheetOpen(false);
      refresh();
    } catch (err) {
      setQuickError(err.response?.data?.detail ?? "Something went wrong");
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
        (item.category !== "TIPS" && !item.name.trim()),
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
            name: item.category === "TIPS" ? "Cash" : item.name.trim(),
            amount: parseFloat(item.amount),
            category: item.category,
            transaction_date: item.transaction_date,
          }),
        ),
      );
      setBatchSheetOpen(false);
      refresh();
    } catch (err) {
      setBatchError(err.response?.data?.detail ?? "Something went wrong");
    } finally {
      setBatchLoading(false);
    }
  };

  // ── Dashboard state (fixed to current month - no picker on the Home tab)
  const dashDateRange = useMemo(() => getPresetRange("Current Month"), []);

  // ── Analytics state
  const [analyticsTab, setAnalyticsTab] = useState("ALL");
  const [analyticsPreset, setAnalyticsPreset] = useState("Current Month");
  const [analyticsFromVal, setAnalyticsFromVal] = useState("");
  const [analyticsToVal, setAnalyticsToVal] = useState("");
  const [analyticsDateRange, setAnalyticsDateRange] = useState(() =>
    getPresetRange("Current Month"),
  );
  const [analyticsPage, setAnalyticsPage] = useState(1);
  const [analyticsPerPage, setAnalyticsPerPage] = useState(10);
  const [analyticsAmountSort, setAnalyticsAmountSort] = useState(null);
  const [analyticsTypeFilter, setAnalyticsTypeFilter] = useState(null);

  // ── Search
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const debounceRef = useRef(null);
  const searchContainerRef = useRef(null);
  const analyticsTableRef = useRef(null);
  const touchStartY = useRef(0);
  const dragYRef = useRef(0);
  const [dragY, setDragY] = useState(0);

  function onSheetTouchStart(e) {
    touchStartY.current = e.touches[0].clientY;
    dragYRef.current = 0;
    setDragY(0);
  }

  function onSheetTouchMove(e) {
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) {
      dragYRef.current = delta;
      setDragY(delta);
    }
  }

  function onSheetTouchEnd() {
    if (dragYRef.current > 80) {
      setAddSheetOpen(false);
      setEntrySheetOpen(false);
      setBatchSheetOpen(false);
    }
    dragYRef.current = 0;
    setDragY(0);
  }

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

  useEffect(() => {
    function onMouseDown(e) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target)
      ) {
        setSearchOpen(false);
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

  const handleSelectTransaction = useCallback(
    (t) => {
      setQuery("");
      setDebouncedQuery("");
      setSearchOpen(false);
      setNavTab("analytics");
      setAnalyticsTab("ALL");
      setAnalyticsPreset("All");
      setAnalyticsFromVal("");
      setAnalyticsToVal("");
      setAnalyticsDateRange(getPresetRange("All"));
      const allSorted = [...transactions].sort(
        (a, b) => new Date(b.transaction_date) - new Date(a.transaction_date),
      );
      const idx = allSorted.findIndex((tx) => tx.id === t.id);
      if (idx !== -1) setAnalyticsPage(Math.ceil((idx + 1) / analyticsPerPage));
      setHighlightId(t.id);
      setTimeout(() => setHighlightId(null), 2500);
      setTimeout(
        () =>
          analyticsTableRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        50,
      );
    },
    [transactions, analyticsPerPage],
  );

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
  const dashSummary = useMemo(() => {
    const totalIn = dashFiltered
      .filter((t) => INCOME_TYPES.has(t.category))
      .reduce((s, t) => s + parseFloat(t.amount), 0);
    const totalOut = dashFiltered
      .filter((t) => !INCOME_TYPES.has(t.category))
      .reduce((s, t) => s + parseFloat(t.amount), 0);
    const net = totalIn - totalOut;
    return { totalIn, totalOut, net };
  }, [dashFiltered]);

  const dashCategoryTotals = useMemo(() => {
    const totals = {};
    dashFiltered.forEach((t) => {
      totals[t.category] = (totals[t.category] ?? 0) + parseFloat(t.amount);
    });
    return totals;
  }, [dashFiltered]);

  // ── Last month (for the small +/-% badges on Home's Income/Expense cards)
  const dashLastMonthRange = useMemo(() => getPresetRange("Last Month"), []);
  const dashLastMonthSummary = useMemo(() => {
    const inRange = transactions.filter((t) => {
      const d = new Date(t.transaction_date + "T00:00:00");
      return d >= dashLastMonthRange.from && d <= dashLastMonthRange.to;
    });
    const totalIn = inRange
      .filter((t) => INCOME_TYPES.has(t.category))
      .reduce((s, t) => s + parseFloat(t.amount), 0);
    const totalOut = inRange
      .filter((t) => !INCOME_TYPES.has(t.category))
      .reduce((s, t) => s + parseFloat(t.amount), 0);
    return { totalIn, totalOut };
  }, [transactions, dashLastMonthRange]);

  // ── Analytics computed
  const analyticsColor = `var(--category-${analyticsTab.toLowerCase()})`;

  const analyticsFiltered = useMemo(() => {
    let result =
      analyticsTab === "ALL"
        ? transactions
        : transactions.filter((t) => t.category === analyticsTab);
    if (analyticsDateRange.from || analyticsDateRange.to) {
      result = result.filter((t) => {
        const d = new Date(t.transaction_date + "T00:00:00");
        if (analyticsDateRange.from && d < analyticsDateRange.from)
          return false;
        if (analyticsDateRange.to && d > analyticsDateRange.to) return false;
        return true;
      });
    }
    return result;
  }, [transactions, analyticsTab, analyticsDateRange]);

  const analyticsSorted = useMemo(() => {
    let arr = [...analyticsFiltered];
    if (analyticsTypeFilter === "income")
      arr = arr.filter((t) => INCOME_TYPES.has(t.category));
    else if (analyticsTypeFilter === "expense")
      arr = arr.filter((t) => !INCOME_TYPES.has(t.category));
    if (analyticsAmountSort === "asc")
      return arr.sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));
    if (analyticsAmountSort === "desc")
      return arr.sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));
    return arr.sort(
      (a, b) => new Date(b.transaction_date) - new Date(a.transaction_date),
    );
  }, [analyticsFiltered, analyticsAmountSort, analyticsTypeFilter]);
  const analyticsPaginated = analyticsSorted.slice(
    (analyticsPage - 1) * analyticsPerPage,
    analyticsPage * analyticsPerPage,
  );
  useEffect(() => {
    setAnalyticsPage(1);
  }, [analyticsFiltered, analyticsPerPage]);

  useEffect(() => {
    document.body.style.overflow =
      addSheetOpen || entrySheetOpen || batchSheetOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [addSheetOpen, entrySheetOpen, batchSheetOpen]);

  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handler = () =>
      setKeyboardOpen(vv.height < window.screen.height * 0.8);
    vv.addEventListener("resize", handler);
    return () => vv.removeEventListener("resize", handler);
  }, []);

  const analyticsSummary = useMemo(() => {
    const totalIn = analyticsFiltered
      .filter((t) => INCOME_TYPES.has(t.category))
      .reduce((s, t) => s + parseFloat(t.amount), 0);
    const totalOut = analyticsFiltered
      .filter((t) => !INCOME_TYPES.has(t.category))
      .reduce((s, t) => s + parseFloat(t.amount), 0);
    const categoryTotal = totalIn + totalOut;
    const txCount = analyticsFiltered.length;
    const avgTx = txCount > 0 ? categoryTotal / txCount : 0;
    const savingsRate =
      totalIn > 0 ? ((totalIn - totalOut) / totalIn) * 100 : null;

    let pctOfTotal = null;
    if (analyticsTab !== "ALL") {
      const isIncome = INCOME_TYPES.has(analyticsTab);
      const periodTotal = transactions
        .filter((t) => {
          if (!analyticsDateRange.from && !analyticsDateRange.to) return true;
          const d = new Date(t.transaction_date + "T00:00:00");
          if (analyticsDateRange.from && d < analyticsDateRange.from)
            return false;
          if (analyticsDateRange.to && d > analyticsDateRange.to) return false;
          return true;
        })
        .filter((t) =>
          isIncome
            ? INCOME_TYPES.has(t.category)
            : !INCOME_TYPES.has(t.category),
        )
        .reduce((s, t) => s + parseFloat(t.amount), 0);
      if (periodTotal > 0) pctOfTotal = (categoryTotal / periodTotal) * 100;
    }

    return {
      totalIn,
      totalOut,
      categoryTotal,
      txCount,
      avgTx,
      savingsRate,
      pctOfTotal,
    };
  }, [analyticsFiltered, transactions, analyticsTab, analyticsDateRange]);

  const analyticsAreaData = useMemo(() => {
    if (analyticsTab === "ALL") return [];
    const grouped = {};
    analyticsFiltered.forEach((t) => {
      grouped[t.transaction_date] =
        (grouped[t.transaction_date] ?? 0) + parseFloat(t.amount);
    });
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({
        date: new Date(date + "T00:00:00").getTime(),
        total: parseFloat(total.toFixed(2)),
      }));
  }, [analyticsFiltered, analyticsTab]);

  const analyticsBarData = useMemo(() => {
    if (analyticsTab !== "ALL") {
      const grouped = {};
      analyticsFiltered.forEach((t) => {
        grouped[t.name] = (grouped[t.name] ?? 0) + parseFloat(t.amount);
      });
      const entries = Object.entries(grouped)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      const START = 100,
        END = 30;
      const step =
        entries.length > 1 ? (START - END) / (entries.length - 1) : 0;
      return entries.map(([name, total], i) => ({
        month: name,
        total: parseFloat(total.toFixed(2)),
        color: `color-mix(in srgb, ${analyticsColor} ${Math.round(START - i * step)}%, black)`,
      }));
    }
    const grouped = {};
    analyticsFiltered.forEach((t) => {
      const month = new Date(
        t.transaction_date + "T00:00:00",
      ).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      if (!grouped[month]) grouped[month] = { income: 0, expense: 0 };
      if (INCOME_TYPES.has(t.category))
        grouped[month].income += parseFloat(t.amount);
      else grouped[month].expense += parseFloat(t.amount);
    });
    return Object.entries(grouped)
      .sort((a, b) => new Date("1 " + a[0]) - new Date("1 " + b[0]))
      .map(([month, { income, expense }]) => ({
        month,
        income: parseFloat(income.toFixed(2)),
        expense: parseFloat(expense.toFixed(2)),
      }));
  }, [analyticsFiltered, analyticsTab, analyticsColor]);

  const analyticsSmallMultiples = useMemo(() => {
    if (analyticsTab !== "ALL") return [];
    const byCategory = {};
    analyticsFiltered.forEach((t) => {
      byCategory[t.category] =
        (byCategory[t.category] ?? 0) + parseFloat(t.amount);
    });
    return Object.entries(byCategory)
      .map(([cat, total]) => ({ cat, total: parseFloat(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);
  }, [analyticsFiltered, analyticsTab]);

  const tooltipProps = {
    contentStyle: {
      backgroundColor: surface,
      borderColor: border,
      borderRadius: "12px",
      color: text,
    },
    labelStyle: { color: text },
    itemStyle: { color: text },
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="h-dvh flex flex-col overflow-hidden"
      style={{ backgroundColor: navTab === "dashboard" ? HOME_BG : bg, color: text }}
    >

      {/* ── Main content ── */}
      <main
        className="flex-1 px-4 pb-28 space-y-4 overflow-y-auto"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)", WebkitOverflowScrolling: "touch" }}
      >
        <style>{`@keyframes skel-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>
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
                onBack={() => setCategoryView(null)}
                onEditTransaction={setEditingTransaction}
                onDeleteTransaction={handleDelete}
              />
            ) : (
              <>
                <MobileHome
                    loading={loading}
                    user={user}
                    dashSummary={dashSummary}
                    dashLastMonthSummary={dashLastMonthSummary}
                    safeToSpend={safeToSpend}
                    safeToSpendStatus={safeToSpendStatus}
                    savings={savings}
                    savingsStatus={savingsStatus}
                    dashSorted={dashSorted}
                    dashCategoryTotals={dashCategoryTotals}
                    searchVisible={searchVisible}
                    onToggleSearch={handleToggleSearch}
                    searchContainerRef={searchContainerRef}
                    query={query}
                    debouncedQuery={debouncedQuery}
                    searchOpen={searchOpen}
                    suggestions={suggestions}
                    onQueryChange={handleQueryChange}
                    onSearchKeyDown={handleSearchKeyDown}
                    onSelectTransaction={handleSelectTransaction}
                    onOpenAccount={() => { setDrawerOpen(true); setAccountOpen(true); }}
                    onOpenAdd={() => setAddSheetOpen(true)}
                    onOpenRecurring={() => setRecurringOpen(true)}
                    onOpenPaychecks={() => setPaychecksOpen(true)}
                    onOpenBreakdown={(key) => setBreakdownCell(key)}
                    onViewCategory={(cat) => setCategoryView(cat)}
                    onViewSpendingByCategory={() => { setNavTab("analytics"); setAnalyticsTab("ALL"); }}
                    onSeeAllTransactions={() => {
                      setNavTab("analytics");
                      setAnalyticsTab("ALL");
                      setAnalyticsPreset("All");
                      setAnalyticsFromVal("");
                      setAnalyticsToVal("");
                      setAnalyticsDateRange(getPresetRange("All"));
                    }}
                    onEditTransaction={setEditingTransaction}
                  />
              </>
            )}
          </>
        )}
        {/* Analytics tab */}
        {navTab === "analytics" && (
          <>
            {/* Filters */}
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={analyticsTab}
                  onChange={(e) => setAnalyticsTab(e.target.value)}
                  className="rounded-xl px-3 py-2 text-xs font-semibold border cursor-pointer w-full"
                  style={{
                    color: text,
                    borderColor: analyticsColor,
                    backgroundColor: dark
                      ? `color-mix(in srgb, ${analyticsColor} 12%, transparent)`
                      : "var(--light-surface)",
                    boxShadow: `0 0 0 2px color-mix(in srgb, ${analyticsColor} 20%, transparent)`,
                    colorScheme: dark ? "dark" : "light",
                  }}
                >
                  {CATEGORIES.map((cat) => (
                    <option
                      key={cat}
                      value={cat}
                      style={{ backgroundColor: bg, color: text }}
                    >
                      {cat === "ALL" ? "All" : CATEGORY_CONFIG[cat].label}
                    </option>
                  ))}
                </select>
                <select
                  value={analyticsPreset ?? "custom"}
                  onChange={(e) => {
                    setAnalyticsPreset(e.target.value);
                    setAnalyticsFromVal("");
                    setAnalyticsToVal("");
                    setAnalyticsDateRange(getPresetRange(e.target.value));
                  }}
                  className="rounded-xl px-3 py-2 text-xs font-semibold border cursor-pointer w-full"
                  style={{
                    color: text,
                    borderColor: analyticsColor,
                    backgroundColor: dark
                      ? `color-mix(in srgb, ${analyticsColor} 12%, transparent)`
                      : "var(--light-surface)",
                    boxShadow: `0 0 0 2px color-mix(in srgb, ${analyticsColor} 20%, transparent)`,
                    colorScheme: dark ? "dark" : "light",
                  }}
                >
                  {PRESETS.map((label) => (
                    <option
                      key={label}
                      value={label}
                      style={{ backgroundColor: bg, color: text }}
                    >
                      {label}
                    </option>
                  ))}
                  {!analyticsPreset && (
                    <option
                      value="custom"
                      disabled
                      style={{ backgroundColor: bg, color: text }}
                    >
                      Custom
                    </option>
                  )}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={analyticsFromVal}
                  onChange={(e) => {
                    setAnalyticsFromVal(e.target.value);
                    setAnalyticsPreset(null);
                    setAnalyticsDateRange((r) => ({
                      ...r,
                      from: e.target.value
                        ? new Date(e.target.value + "T00:00:00")
                        : null,
                    }));
                  }}
                  className="flex-1 rounded-xl px-2 py-2 text-[10px] font-semibold border min-w-0"
                  style={{
                    backgroundColor: dark
                      ? "var(--dark-bg)"
                      : "var(--light-surface)",
                    borderColor: border,
                    color: text,
                    colorScheme: dark ? "dark" : "light",
                  }}
                />
                <span
                  className="text-[10px] uppercase font-bold shrink-0"
                  style={{ color: muted }}
                >
                  to
                </span>
                <input
                  type="date"
                  value={analyticsToVal}
                  onChange={(e) => {
                    setAnalyticsToVal(e.target.value);
                    setAnalyticsPreset(null);
                    setAnalyticsDateRange((r) => ({
                      ...r,
                      to: e.target.value
                        ? new Date(e.target.value + "T23:59:59")
                        : null,
                    }));
                  }}
                  className="flex-1 rounded-xl px-2 py-2 text-[10px] font-semibold border min-w-0"
                  style={{
                    backgroundColor: dark
                      ? "var(--dark-bg)"
                      : "var(--light-surface)",
                    borderColor: border,
                    color: text,
                    colorScheme: dark ? "dark" : "light",
                  }}
                />
              </div>
            </div>

            {/* Summary cards — single category only */}
            {analyticsTab !== "ALL" && (
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    label: `${CATEGORY_CONFIG[analyticsTab]?.label.toUpperCase()} TOTAL`,
                    value: fmt(analyticsSummary.categoryTotal),
                    color: analyticsColor,
                  },
                  {
                    label: "TRANSACTIONS",
                    value: String(analyticsSummary.txCount),
                    color: analyticsColor,
                  },
                  {
                    label: "AVG TRANSACTION",
                    value: fmt(analyticsSummary.avgTx),
                    color: analyticsColor,
                  },
                  {
                    label: INCOME_TYPES.has(analyticsTab)
                      ? "% OF TOTAL INCOME"
                      : "% OF TOTAL EXPENSES",
                    value:
                      analyticsSummary.pctOfTotal != null
                        ? `${analyticsSummary.pctOfTotal.toFixed(1)}%`
                        : "—",
                    color: analyticsColor,
                  },
                ].map(({ label, value, color }) => (
                  <div
                    key={label}
                    className="rounded-2xl px-4 py-4 border"
                    style={{
                      backgroundColor: surface,
                      borderColor: border,
                      borderTopColor: color,
                      borderTopWidth: "3px",
                    }}
                  >
                    <p
                      className="text-xs font-medium mb-1"
                      style={{ color: muted }}
                    >
                      {label}
                    </p>
                    <p
                      className="text-lg font-bold tracking-tight"
                      style={{ color }}
                    >
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Area chart (single category) */}
            {analyticsTab !== "ALL" && analyticsAreaData.length > 0 && (
              <div
                className="rounded-2xl border p-4"
                style={{
                  backgroundColor: surface,
                  borderColor: analyticsColor,
                }}
              >
                <p
                  className="text-base font-semibold mb-3"
                  style={{ color: text }}
                >
                  {CATEGORY_CONFIG[analyticsTab]?.label} Over Time
                </p>
                <ResponsiveContainer
                  width="100%"
                  height={220}
                  style={{ pointerEvents: "none" }}
                >
                  <AreaChart data={analyticsAreaData}>
                    <defs>
                      <linearGradient
                        id="areaFillMobile"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor={analyticsColor}
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor={analyticsColor}
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={
                        dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"
                      }
                    />
                    <XAxis
                      dataKey="date"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: text }}
                      tickFormatter={(v) =>
                        new Date(v).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      }
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `$${v}`}
                      tick={{ fontSize: 11, fill: text }}
                    />
                    <Tooltip
                      {...tooltipProps}
                      cursor={{
                        stroke: analyticsColor,
                        strokeWidth: 1,
                        strokeDasharray: "4 4",
                      }}
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const { date, total } = payload[0].payload;
                        return (
                          <div
                            style={{
                              ...tooltipProps.contentStyle,
                              padding: "8px 12px",
                            }}
                          >
                            <p
                              style={{ margin: 0, opacity: 0.7, fontSize: 11 }}
                            >
                              {new Date(date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </p>
                            <p style={{ margin: 0, fontWeight: 600 }}>
                              {fmt(total)}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Area
                      key={analyticsTab}
                      type="monotone"
                      dataKey="total"
                      stroke={analyticsColor}
                      strokeWidth={2}
                      fill="url(#areaFillMobile)"
                      dot={{ fill: analyticsColor, r: 4, strokeWidth: 0 }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                      isAnimationActive
                      animationBegin={0}
                      animationDuration={1000}
                      animationEasing="ease-out"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Category overview bar — ALL only */}
            {analyticsTab === "ALL" && analyticsSmallMultiples.length > 0 && (
              <div
                className="rounded-2xl border p-4"
                style={{ backgroundColor: surface, borderColor: border }}
              >
                <p
                  className="text-base font-semibold mb-3"
                  style={{ color: text }}
                >
                  Spending by Category
                </p>
                {(() => {
                  const max = Math.max(
                    ...analyticsSmallMultiples.map((d) => d.total),
                  );
                  return (
                    <div className="space-y-2">
                      {analyticsSmallMultiples.map(({ cat, total }) => {
                        const catColor = `var(--category-${cat.toLowerCase()})`;
                        const pct = max > 0 ? (total / max) * 100 : 0;
                        return (
                          <div key={cat} className="flex items-center gap-2">
                            <span
                              style={{
                                width: 100,
                                fontSize: 11,
                                fontWeight: 600,
                                color: catColor,
                                flexShrink: 0,
                                textAlign: "right",
                              }}
                            >
                              {CATEGORY_CONFIG[cat]?.label ?? cat}
                            </span>
                            <div
                              style={{
                                flex: 1,
                                height: 10,
                                borderRadius: 5,
                                backgroundColor: `color-mix(in srgb, ${catColor} 15%, transparent)`,
                              }}
                            >
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: "100%",
                                  borderRadius: 5,
                                  backgroundColor: catColor,
                                  transition: "width 0.4s ease",
                                }}
                              />
                            </div>
                            <span
                              style={{
                                width: 68,
                                fontSize: 11,
                                fontWeight: 600,
                                color: text,
                                flexShrink: 0,
                              }}
                            >
                              {fmt(total)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Top by name — single category */}
            {analyticsTab !== "ALL" && analyticsBarData.length > 0 && (
              <div
                className="rounded-2xl border p-4"
                style={{
                  backgroundColor: surface,
                  borderColor: analyticsColor,
                }}
              >
                <p
                  className="text-base font-semibold mb-3"
                  style={{ color: text }}
                >
                  Top {CATEGORY_CONFIG[analyticsTab]?.label} by Name
                </p>
                <ResponsiveContainer
                  width="100%"
                  height={200}
                  style={{ pointerEvents: "none" }}
                >
                  <BarChart data={analyticsBarData} barSize={20}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={
                        dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"
                      }
                    />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      height={50}
                      tick={(props) => {
                        const val = props.payload?.value ?? "";
                        const label =
                          val.length > 10 ? val.slice(0, 10) + "…" : val;
                        return (
                          <text
                            x={props.x}
                            y={props.y}
                            dy={6}
                            textAnchor="end"
                            fontSize={11}
                            style={{ fill: text }}
                            transform={`rotate(-35, ${props.x}, ${props.y})`}
                          >
                            {label}
                          </text>
                        );
                      }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `$${v}`}
                      tick={{ fontSize: 10, fill: text }}
                    />
                    <Tooltip
                      {...tooltipProps}
                      formatter={(v) => fmt(v)}
                      cursor={false}
                    />
                    <Bar dataKey="total" radius={[5, 5, 0, 0]} barSize={20}>
                      {analyticsBarData.map((entry) => (
                        <Cell key={entry.month} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Transaction table */}
            <div
              ref={analyticsTableRef}
              className="rounded-2xl border"
              style={{ backgroundColor: surface, borderColor: analyticsColor }}
            >
              <div
                className="px-4 py-3 border-b flex items-center justify-between"
                style={{ borderColor: border }}
              >
                <p className="text-base font-semibold" style={{ color: text }}>
                  Transactions
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                  <button
                    onClick={() =>
                      setAnalyticsTypeFilter((f) =>
                        f === null
                          ? "income"
                          : f === "income"
                            ? "expense"
                            : null,
                      )
                    }
                    style={{
                      color:
                        analyticsTypeFilter === "income"
                          ? "var(--category-income)"
                          : analyticsTypeFilter === "expense"
                            ? "var(--category-expense)"
                            : muted,
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      fontSize: 12,
                      fontWeight: 600,
                      background: `color-mix(in srgb, ${text} 6%, transparent)`,
                      border: "none",
                      cursor: "pointer",
                      borderRadius: 8,
                      padding: "3px 8px",
                    }}
                  >
                    {analyticsTypeFilter === "income"
                      ? "Income"
                      : analyticsTypeFilter === "expense"
                        ? "Expense"
                        : "All"}
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
                      {analyticsTypeFilter === "income" ? (
                        <>
                          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                          <polyline points="17 6 23 6 23 12" />
                        </>
                      ) : analyticsTypeFilter === "expense" ? (
                        <>
                          <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
                          <polyline points="17 18 23 18 23 12" />
                        </>
                      ) : (
                        <>
                          <path d="M12 19V5M5 12l7-7 7 7" opacity="0.4" />
                          <path d="M12 5v14M5 12l7 7 7-7" opacity="0.4" />
                        </>
                      )}
                    </svg>
                  </button>
                  <button
                    onClick={() =>
                      setAnalyticsAmountSort((s) =>
                        s === "desc" ? "asc" : s === "asc" ? null : "desc",
                      )
                    }
                    style={{
                      color: analyticsAmountSort ? analyticsColor : muted,
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      fontSize: 12,
                      fontWeight: 600,
                      background: `color-mix(in srgb, ${text} 6%, transparent)`,
                      border: "none",
                      cursor: "pointer",
                      borderRadius: 8,
                      padding: "3px 8px",
                    }}
                  >
                    Amount
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
                      {analyticsAmountSort === "asc" ? (
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      ) : analyticsAmountSort === "desc" ? (
                        <path d="M12 5v14M5 12l7 7 7-7" />
                      ) : (
                        <>
                          <path d="M12 19V5M5 12l7-7 7 7" opacity="0.4" />
                          <path d="M12 5v14M5 12l7 7 7-7" opacity="0.4" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>
              <TransactionList
                items={analyticsPaginated}
                total={analyticsSorted.length}
                page={analyticsPage}
                setPage={setAnalyticsPage}
                perPage={analyticsPerPage}
                setPerPage={setAnalyticsPerPage}
                accentColor={analyticsColor}
                highlightId={highlightId}
                text={text}
                muted={muted}
                border={border}
                surface={surface}
                onEdit={setEditingTransaction}
                onDelete={handleDelete}
              />
            </div>
          </>
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
              { id: "analytics", label: "Analytics", Icon: IconAnalytics },
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
        }}
      />

      {/* ── Add sheet ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-x p-5 space-y-3"
        style={{
          backgroundColor: surface,
          borderColor: border,
          paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))",
          transform: `translateY(${addSheetOpen && !entrySheetOpen ? dragY : 100}${addSheetOpen && !entrySheetOpen && dragY > 0 ? "" : "%"})`,
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
          style={{ backgroundColor: border }}
        />
        <p className="text-sm font-semibold mb-1" style={{ color: muted }}>
          Add
        </p>

        <button
          onClick={() => setEntrySheetOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left cursor-pointer active:scale-[0.97] transition-transform duration-150"
          style={{ backgroundColor: bg, borderColor: border, color: text }}
        >
          <span style={{ color: "var(--category-income)" }}>
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
            <p className="text-xs" style={{ color: muted }}>
              Add a single transaction
            </p>
          </div>
        </button>
        <button
          onClick={() => {
            setAddSheetOpen(false);
            setBatchSheetOpen(true);
          }}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left cursor-pointer active:scale-[0.97] transition-transform duration-150"
          style={{ backgroundColor: bg, borderColor: border, color: text }}
        >
          <span style={{ color: "var(--category-income)" }}>
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
            <p className="text-xs" style={{ color: muted }}>
              Add multiple at once
            </p>
          </div>
        </button>
        <button
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left cursor-not-allowed opacity-50"
          style={{ backgroundColor: bg, borderColor: border, color: text }}
          disabled
        >
          <span style={{ color: muted }}>
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
            <p className="text-xs" style={{ color: muted }}>
              PDF, CSV — coming soon
            </p>
          </div>
        </button>
      </div>

      {/* ── Entry sheet ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-x"
        style={{
          backgroundColor: surface,
          borderColor: border,
          borderRadius: keyboardOpen ? "16px 16px 16px 16px" : "16px 16px 0 0",
          borderBottom: keyboardOpen ? `1px solid ${border}` : "none",
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
          style={{ borderColor: border }}
          onTouchStart={onSheetTouchStart}
          onTouchMove={onSheetTouchMove}
          onTouchEnd={onSheetTouchEnd}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEntrySheetOpen(false)}
              className="p-1 rounded-lg cursor-pointer active:scale-90 transition-transform duration-150"
              style={{ color: muted }}
            >
              <IconChevronLeft />
            </button>
            <p className="text-sm font-semibold" style={{ color: text }}>
              New Transaction
            </p>
          </div>
        </div>
        <div className="p-5 space-y-3">
          {/* Category pills — two rows, proportionally sized to label length */}
          {[
            Object.entries(CATEGORY_CONFIG).slice(0, 4),
            Object.entries(CATEGORY_CONFIG).slice(4),
          ].map((row, ri) => (
            <div key={ri} className="flex gap-2">
              {row.map(([key, cfg]) => {
                const active = quickCat === key;
                const color = `var(--category-${key.toLowerCase()})`;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setQuickCat(key);
                      setQuickForm((f) => ({
                        ...f,
                        name: key === "TIPS" ? "Cash" : f.name,
                      }));
                    }}
                    className="py-1.5 rounded-xl text-xs font-semibold border cursor-pointer active:scale-95 transition-all duration-150 text-center"
                    style={{
                      flex: cfg.label.length + 4,
                      color: active ? color : muted,
                      borderColor: active ? color : border,
                      backgroundColor: active
                        ? `color-mix(in srgb, ${color} 15%, transparent)`
                        : "transparent",
                      boxShadow: active
                        ? `0 0 0 2px color-mix(in srgb, ${color} 20%, transparent)`
                        : "none",
                    }}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          ))}
          {/* Fallback dropdown — uncomment to restore
            <select
              value={quickCat}
              onChange={(e) => { setQuickCat(e.target.value); setQuickForm((f) => ({ ...f, name: e.target.value === "TIPS" ? "Cash" : "" })); }}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold border cursor-pointer"
              style={{ ...inputStyle, borderColor: quickColor }}
            >
              {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
            </select>
            */}
          <form onSubmit={handleQuickSubmit} className="space-y-3">
            <input
              type="text"
              placeholder="Name"
              value={quickForm.name}
              onChange={(e) =>
                quickCat !== "TIPS" &&
                setQuickForm((f) => ({ ...f, name: e.target.value }))
              }
              required={quickCat !== "TIPS"}
              disabled={quickCat === "TIPS"}
              className="w-full rounded-xl px-4 py-2.5 text-sm border"
              style={
                quickCat === "TIPS"
                  ? {
                      ...inputStyle,
                      cursor: "not-allowed",
                      opacity: 0.45,
                      backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 4px, color-mix(in srgb, ${dark ? "var(--dark-text)" : "var(--light-text)"} 6%, transparent) 4px, color-mix(in srgb, ${dark ? "var(--dark-text)" : "var(--light-text)"} 6%, transparent) 6px)`,
                    }
                  : inputStyle
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
                style={inputStyle}
              />
              <input
                type="date"
                value={quickForm.transaction_date}
                onChange={(e) =>
                  setQuickForm((f) => ({
                    ...f,
                    transaction_date: e.target.value,
                  }))
                }
                required
                className="rounded-xl px-3 py-2.5 text-sm border"
                style={inputStyle}
              />
            </div>
            {quickError && <p className="text-xs text-red-500">{quickError}</p>}
            <button
              type="submit"
              disabled={quickLoading}
              className="w-full py-2.5 rounded-xl text-sm font-bold tracking-wide disabled:opacity-50 cursor-pointer active:scale-95 border"
              style={{
                color: quickColor,
                borderColor: quickColor,
                backgroundColor: `color-mix(in srgb, ${quickColor} 12%, transparent)`,
                boxShadow: `0 0 0 2px color-mix(in srgb, ${quickColor} 20%, transparent)`,
              }}
            >
              {quickLoading ? "Saving…" : "Add Transaction"}
            </button>
          </form>
        </div>
      </div>

      {/* ── Batch add overlay ── */}
      <div
        className="fixed inset-0 z-40"
        style={{
          backgroundColor: "rgba(0,0,0,0.5)",
          opacity: batchSheetOpen ? 1 : 0,
          pointerEvents: batchSheetOpen ? "auto" : "none",
          transition: "opacity 250ms ease",
        }}
        onClick={() => setBatchSheetOpen(false)}
      />

      {/* ── Batch add sheet ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-x flex flex-col"
        style={{
          backgroundColor: surface,
          borderColor: border,
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
            style={{ backgroundColor: border }}
          />
        </div>
        <div
          className="px-5 pb-3 flex items-center justify-between border-b shrink-0"
          style={{ borderColor: border }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBatchSheetOpen(false)}
              className="p-1 rounded-lg cursor-pointer active:scale-90 transition-transform duration-150"
              style={{ color: muted }}
            >
              <IconChevronLeft />
            </button>
            <p className="text-sm font-semibold" style={{ color: text }}>
              Batch Add{" "}
              <span style={{ color: muted, fontWeight: 400 }}>
                · {batchItems.length} rows
              </span>
            </p>
          </div>
          <button
            onClick={handleBatchSubmit}
            disabled={batchLoading}
            className="px-4 py-1.5 rounded-xl text-xs font-bold border cursor-pointer disabled:opacity-50 active:scale-95 transition-transform duration-150"
            style={{
              color: "var(--category-income)",
              borderColor: "var(--category-income)",
              backgroundColor:
                "color-mix(in srgb, var(--category-income) 12%, transparent)",
            }}
          >
            {batchLoading
              ? "Adding…"
              : (() => {
                  const n = batchItems.filter(
                    (r) =>
                      parseFloat(r.amount) > 0 &&
                      (r.category === "TIPS" || r.name.trim()),
                  ).length;
                  return n
                    ? `Add ${n} transaction${n === 1 ? "" : "s"}`
                    : "Add transactions";
                })()}
          </button>
        </div>
        <div ref={batchListRef} className="flex-1 overflow-y-auto px-4 py-3">
          {batchItems.map((item, idx) => {
            const catColor = `var(--category-${item.category.toLowerCase()})`;
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
                    borderColor: border,
                    backgroundColor: bg,
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
                      style={{ color: muted }}
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
                                    e.target.value === "TIPS" ? "Cash" : r.name,
                                }
                              : r,
                          ),
                        )
                      }
                      className="flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold border cursor-pointer"
                      style={{
                        color: catColor,
                        borderColor: catColor,
                        backgroundColor: `color-mix(in srgb, ${catColor} 10%, transparent)`,
                        colorScheme: dark ? "dark" : "light",
                      }}
                    >
                      {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                        <option
                          key={key}
                          value={key}
                          style={{ backgroundColor: bg, color: text }}
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
                      style={{ color: muted }}
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
                      value={item.category === "TIPS" ? "Cash" : item.name}
                      onChange={(e) =>
                        item.category !== "TIPS" &&
                        setBatchItems((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, name: e.target.value } : r,
                          ),
                        )
                      }
                      disabled={item.category === "TIPS"}
                      className="flex-1 rounded-lg px-2 py-1.5 text-xs border min-w-0"
                      style={{
                        backgroundColor: surface,
                        borderColor: border,
                        color: text,
                        opacity: item.category === "TIPS" ? 0.45 : 1,
                        cursor:
                          item.category === "TIPS" ? "not-allowed" : undefined,
                        backgroundImage:
                          item.category === "TIPS"
                            ? `repeating-linear-gradient(-45deg, transparent, transparent 4px, color-mix(in srgb, ${text} 6%, transparent) 4px, color-mix(in srgb, ${text} 6%, transparent) 6px)`
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
                        backgroundColor: surface,
                        borderColor: border,
                        color: text,
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
                        backgroundColor: surface,
                        borderColor: border,
                        color: text,
                        colorScheme: dark ? "dark" : "light",
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
          style={{ borderColor: border }}
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
            className="w-full py-2.5 rounded-xl text-sm font-semibold border cursor-pointer active:scale-95 transition-transform duration-150"
            style={{
              color: muted,
              borderColor: border,
              backgroundColor: `color-mix(in srgb, ${text} 5%, transparent)`,
            }}
          >
            + Add row
          </button>
        </div>
      </div>

      {/* ── Drawer overlay ── */}
      {(drawerOpen || accountOpen) && (
        <div
          className="fixed inset-0 z-40"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => {
            setDrawerOpen(false);
            setAccountOpen(false);
          }}
        />
      )}

      {/* ── Overview stat breakdown sheet (#42) ── */}
      <OverviewBreakdownSheet
        cell={breakdownCell}
        onClose={() => setBreakdownCell(null)}
        safeToSpend={safeToSpend}
        safeToSpendStatus={safeToSpendStatus}
        savings={savings}
        savingsStatus={savingsStatus}
        transactions={transactions}
      />

      {/* ── Recurring payments overlay ── */}
      {recurringOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ backgroundColor: HOME_BG, color: HOME_TEXT }}
        >
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
                display: "flex", alignItems: "center", justifyContent: "center", color: HOME_INCOME,
              }}
            >
              <IconPlus size={19} />
            </button>
          </div>
          <MobileRecurring onSaved={refresh} openAddSignal={recurringAddSignal} />
        </div>
      )}

      {/* ── Paychecks overlay ── */}
      {paychecksOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ backgroundColor: HOME_BG, color: HOME_TEXT }}
        >
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
        </div>
      )}

      {/* ── Drawer (menu + account as sliding track) ── */}
      <div
        className="fixed top-0 right-0 h-full w-72 z-50 border-l"
        style={{
          backgroundColor: surface,
          borderColor: border,
          color: text,
          overflow: "hidden",
          transform:
            drawerOpen || accountOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 250ms ease",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "300%",
            height: "100%",
            transform: devOpen ? "translateX(-66.667%)" : accountOpen ? "translateX(-33.333%)" : "translateX(0)",
            transition: "transform 250ms ease",
          }}
        >
          {/* Menu panel */}
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
              style={{ borderColor: border, paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
            >
              <span className="text-sm font-semibold" style={{ color: muted }}>
                Menu
              </span>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1 rounded-lg cursor-pointer"
                aria-label="Close menu"
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
              className="px-5 py-5 flex items-center gap-3 w-full text-left cursor-pointer"
              style={{ background: "transparent", border: "none" }}
              onClick={() => setAccountOpen(true)}
            >
              <div
                className="w-10 h-10 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-sm font-bold"
                style={{
                  backgroundColor: `color-mix(in srgb, ${text} 12%, transparent)`,
                  color: text,
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
                <p className="text-xs truncate" style={{ color: muted }}>
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
                style={{ color: muted, flexShrink: 0 }}
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
            <div className="mx-5 border-t" style={{ borderColor: border }} />
            <div className="px-3 py-3 flex-1">
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer text-left border"
                style={{
                  color: text,
                  borderColor: `color-mix(in srgb, ${text} 18%, transparent)`,
                  backgroundColor: `color-mix(in srgb, ${text} 5%, transparent)`,
                }}
                onClick={() => {
                  setDrawerOpen(false);
                  setRecurringOpen(true);
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
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M12 7v5l4 2" />
                </svg>
                Recurring Payments
              </button>
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 mt-2 rounded-xl text-sm font-medium cursor-pointer text-left border"
                style={{
                  color: text,
                  borderColor: `color-mix(in srgb, ${text} 18%, transparent)`,
                  backgroundColor: `color-mix(in srgb, ${text} 5%, transparent)`,
                }}
                onClick={() => {
                  setDrawerOpen(false);
                  setPaychecksOpen(true);
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
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
                Paychecks
              </button>
            </div>
            <div className="mx-5 border-t" style={{ borderColor: border }} />
            <div className="px-3 py-3 flex-shrink-0 flex flex-col gap-3">
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer text-left border"
                style={{
                  color: text,
                  borderColor: `color-mix(in srgb, ${text} 18%, transparent)`,
                  backgroundColor: `color-mix(in srgb, ${text} 5%, transparent)`,
                }}
                onClick={() =>
                  document.documentElement.classList.toggle("dark")
                }
              >
                {dark ? (
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
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                  </svg>
                ) : (
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
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                  </svg>
                )}
                {dark ? "Light Mode" : "Dark Mode"}
              </button>
              <a
                href="https://forms.gle/BC6ebwbZtgYmSYBeA"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left border"
                style={{
                  color: text,
                  textDecoration: "none",
                  borderColor: `color-mix(in srgb, ${text} 18%, transparent)`,
                  backgroundColor: `color-mix(in srgb, ${text} 5%, transparent)`,
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
            <div className="mx-5 border-t" style={{ borderColor: border }} />
            <div className="px-3 py-3">
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer text-left"
                style={{ color: "var(--category-expense)" }}
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
              style={{ borderColor: border, paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAccountOpen(false)}
                  className="p-1 rounded-lg cursor-pointer"
                  style={{ color: muted }}
                >
                  <IconChevronLeft />
                </button>
                <span
                  className="text-sm font-semibold"
                  style={{ color: muted }}
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
                      : `color-mix(in srgb, ${text} 40%, transparent)`;
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

          {/* Dev tools panel */}
          <div style={{ width: "33.333%", height: "100%", display: "flex", flexDirection: "column" }}>
            <div className="px-5 py-4 flex items-center gap-2 border-b shrink-0" style={{ borderColor: border, paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}>
              <button onClick={() => setDevOpen(false)} className="p-1 rounded-lg cursor-pointer" style={{ color: muted }}>
                <IconChevronLeft />
              </button>
              <span className="text-sm font-semibold" style={{ color: "var(--category-expense)" }}>Dev Tools</span>
            </div>
            <div className="flex-1 overflow-y-auto py-2 flex flex-col">

              <MDevSection label="LOADING & STATE" border={border} muted={muted} first />
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
                <button onClick={() => { setLoading(true); refresh(); }} className="px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer border" style={{ color: text, borderColor: border, backgroundColor: `color-mix(in srgb, ${text} 6%, transparent)` }}>Run</button>
              </DevRow>

              <MDevSection label="NETWORK" border={border} muted={muted} />
              <div className="px-5 py-2 flex flex-col gap-1">
                <span className="text-xs" style={{ color: muted }}>Slow network</span>
                <div className="flex gap-1">
                  {[0, 500, 2000, 5000].map(ms => (
                    <button key={ms} onClick={() => setDevDelay(ms)} style={{ flex: 1, padding: "4px 0", borderRadius: 6, border: `1px solid ${devDelay === ms ? "var(--category-expense)" : border}`, backgroundColor: devDelay === ms ? "color-mix(in srgb, var(--category-expense) 12%, transparent)" : "transparent", color: devDelay === ms ? "var(--category-expense)" : muted, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
                      {ms === 0 ? "Off" : ms < 1000 ? `${ms}ms` : `${ms/1000}s`}
                    </button>
                  ))}
                </div>
              </div>

              <MDevSection label="DATA" border={border} muted={muted} />
              <MDevInfo label="Transactions" value={transactions.length} muted={muted} text={text} />
              <MDevInfo label="Last fetch" value={devLastFetch ? devLastFetch.toLocaleTimeString() : "—"} muted={muted} text={text} />
              <MDevInfo label="Nav tab" value={navTab} muted={muted} text={text} />
              <MDevInfo label="Date range" value={dashDateRange.from ? `${dashDateRange.from.toLocaleDateString("en-US",{month:"short",day:"numeric"})} → ${dashDateRange.to?.toLocaleDateString("en-US",{month:"short",day:"numeric"}) ?? "…"}` : "All time"} muted={muted} text={text} />

              <MDevSection label="UI" border={border} muted={muted} />
              <DevRow label="Toggle theme" description="Flip dark / light">
                <button onClick={() => document.documentElement.classList.toggle("dark")} className="px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer border" style={{ color: text, borderColor: border, backgroundColor: `color-mix(in srgb, ${text} 6%, transparent)` }}>Flip</button>
              </DevRow>

              <MDevSection label="SESSION" border={border} muted={muted} />
              <MDevInfo label="Token expiry" value={(() => { try { const t = localStorage.getItem("token"); if (!t) return "None"; const p = JSON.parse(atob(t.split(".")[1])); return p.exp ? new Date(p.exp * 1000).toLocaleTimeString() : "No exp"; } catch { return "Invalid"; } })()} muted={muted} text={text} />
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
        <EditTransactionModal
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSaved={() => {
            setEditingTransaction(null);
            refresh();
          }}
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

