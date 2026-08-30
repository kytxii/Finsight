import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  HOME_BG,
  HOME_SURFACE,
  HOME_DIVIDER,
  HOME_TEXT,
  HOME_MUTED,
  HOME_INCOME,
  HOME_EXPENSE,
  ACCENT,
  ACCENT_DEEP,
  ACCENT_TEXT,
  CATEGORY_ACCENT,
  CATEGORY_ICON,
} from "../components/shared/categoryVisuals";
import Skel from "../components/shared/Skel";
import OverviewPanelSkeleton from "../components/skeletons/desktop/OverviewPanelSkeleton";
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
import { useAuth } from "../context/AuthContext";
import { getTransactions, deleteTransaction } from "../api/transactions";
import { deleteRecurringPayment } from "../api/recurringPayments";
import { getSpendableSurplus, getEstimatedSavings } from "../api/paychecks";
import { getTipDeposits } from "../api/tipDeposits";
import {
  CATEGORIES,
  CATEGORY_CONFIG,
  INCOME_TYPES,
  matchesTransaction,
  MONEY_IN_TYPES,
  MONEY_OUT_TYPES,
  fmt,
  fmtWhole,
} from "../utils/finance";
import { getNow } from "../utils/time";
import Navbar from "../components/desktop/Navbar";
import AddTransactionPage from "../components/desktop/AddTransactionPage";
import PaychecksPanel from "../components/desktop/PaychecksPanel";
import RecurringPaymentsModal from "../components/desktop/RecurringPaymentsModal";
import InstallmentsPanel from "../components/desktop/InstallmentsPanel";
import SummaryCard from "../components/desktop/SummaryCard";
import ChartCard from "../components/shared/ChartCard";
import TransactionTable from "../components/desktop/TransactionTable";
import TipsTransactionsCard from "../components/desktop/TipsTransactionsCard";
import CategoryTrendPanel from "../components/desktop/CategoryTrendPanel";
import CategoryDetailPanel from "../components/desktop/CategoryDetailPanel";
import CategoryUpcomingPanel from "../components/desktop/CategoryUpcomingPanel";
import EditTransactionModal from "../components/desktop/EditTransactionModal";
import CreditCardPaymentPanel from "../components/shared/CreditCardPaymentPanel";
import CreditCardsPanel from "../components/desktop/CreditCardsPanel";
import {
  BalanceBody,
  BillsBody,
  CashBody,
  SavingsBody,
  IncomeBody,
  ExpensesBody,
} from "../components/desktop/OverviewBreakdownSheet";
import Footer from "../components/shared/Footer";

// Shows the month title with arrows when the range is a single month.
function isSingleMonthRange(range) {
  if (!range.from || !range.to) return false;
  const { from, to } = range;
  if (from.getDate() !== 1 || from.getHours() !== 0) return false;
  const expectedTo = new Date(
    from.getFullYear(),
    from.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  return (
    to.getFullYear() === expectedTo.getFullYear() &&
    to.getMonth() === expectedTo.getMonth() &&
    to.getDate() === expectedTo.getDate()
  );
}

function IconToolTile({ children }) {
  return (
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: 9,
        flexShrink: 0,
        background: "#2a2a2e",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#c7c7cc"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </div>
  );
}

function TrendPill({ label, value, color }) {
  return (
    <div
      style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 11px",
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.05)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: color,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          whiteSpace: "nowrap",
          fontSize: 13,
          fontWeight: 600,
          color: HOME_MUTED,
        }}
      >
        {label}
      </span>
      <span
        style={{
          whiteSpace: "nowrap",
          fontSize: 13,
          fontWeight: 700,
          color: HOME_TEXT,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function StackedFraction({ num, den, color }) {
  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-start",
        lineHeight: 1.2,
      }}
    >
      <span
        style={{
          fontSize: 20,
          fontWeight: 700,
          color,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {num}
      </span>
      <span
        style={{
          width: "100%",
          borderTop: `1.5px solid color-mix(in srgb, ${color} 45%, transparent)`,
          margin: "3px 0",
        }}
      />
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: HOME_MUTED,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {den}
      </span>
    </span>
  );
}

// One column of the unified overview panel (#123).
function OverviewColumn({
  label,
  value,
  valueNode,
  color,
  caption,
  onClick,
  active,
  first,
}) {
  const [hovered, setHovered] = useState(false);
  const tint = color ?? HOME_TEXT;
  const interactive = onClick != null;
  const Tag = interactive ? "button" : "div";
  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={onClick}
      onMouseEnter={interactive ? () => setHovered(true) : undefined}
      onMouseLeave={interactive ? () => setHovered(false) : undefined}
      className={`text-left transition-all duration-150 ${interactive ? "cursor-pointer active:scale-[0.98]" : ""}`}
      style={{
        flex: 1,
        minWidth: 0,
        padding: "16px 20px",
        border: "none",
        borderRadius: 0,
        borderLeft: first ? "none" : `1px solid ${HOME_DIVIDER}`,
        backgroundColor: active
          ? `color-mix(in srgb, ${tint} 12%, transparent)`
          : hovered
            ? `color-mix(in srgb, ${tint} 7%, transparent)`
            : "transparent",
        font: "inherit",
        color: "inherit",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: HOME_MUTED,
            margin: 0,
          }}
        >
          {label}
        </p>
        {interactive && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              color: active || hovered ? tint : HOME_MUTED,
              flexShrink: 0,
              transform: active ? "rotate(180deg)" : "none",
              transition: "transform 200ms ease, color 150ms ease",
            }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </div>
      {valueNode ?? (
        <p
          style={{
            fontSize: 22,
            fontWeight: 700,
            color,
            margin: "6px 0 0",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </p>
      )}
      {caption != null && (
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: HOME_MUTED,
            margin: "5px 0 0",
          }}
        >
          {caption}
        </p>
      )}
    </Tag>
  );
}

// Steps from the month being viewed, not from today.
function stepMonth(range, dir) {
  const anchor = range.from ?? getNow();
  const from = new Date(
    anchor.getFullYear(),
    anchor.getMonth() + dir,
    1,
    0,
    0,
    0,
    0,
  );
  const to = new Date(
    anchor.getFullYear(),
    anchor.getMonth() + dir + 1,
    0,
    23,
    59,
    59,
    999,
  );
  return { from, to };
}

function monthRangeFor(year, month) {
  const from = new Date(year, month, 1, 0, 0, 0, 0);
  const to = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// "ALL" is a UI state, not a real category.
const REAL_CATEGORIES = CATEGORIES.filter((c) => c !== "ALL");
const TREND_CATEGORIES = REAL_CATEGORIES;
// The chart aims for this many points, whatever the date range.
const TREND_TARGET_POINTS = 45;
const TREND_LEGEND_PER_ROW = 4;
const TREND_CHART_HEIGHT = "clamp(320px, 45vh, 560px)";

const OVERVIEW_DRAWER_TITLES = {
  balance: "Current Balance",
  bills: "Upcoming Bills",
  cash: "Available Cash",
  savings: "Estimated Savings",
  income: "Income",
  expenses: "Expenses",
};
const TOOL_TITLES = {
  paychecks: "Paychecks",
  recurring: "Recurring Payments",
  installments: "Installments",
  creditCards: "Credit Cards",
  add: "Add Transaction",
};
const TOOL_TRANSITION_MS = 280;
const DRAWER_TRANSITION_MS = 380;
const SWITCH_TRANSITION_MS = 180;
const TREND_CATEGORIES_KEY = "dashboardTrendCategories";
const DEFAULT_TREND_CATEGORIES = TREND_CATEGORIES;

function loadTrendCategories() {
  try {
    const raw = localStorage.getItem(TREND_CATEGORIES_KEY);
    if (!raw) return new Set(DEFAULT_TREND_CATEGORIES);
    const saved = JSON.parse(raw).filter((c) => TREND_CATEGORIES.includes(c));
    return new Set(saved.length > 0 ? saved : DEFAULT_TREND_CATEGORIES);
  } catch {
    return new Set(DEFAULT_TREND_CATEGORIES);
  }
}

export default function Dashboard() {
  const { isDemo } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [tipDeposits, setTipDeposits] = useState([]);

  const [dateRange, setDateRange] = useState(() => {
    const now = getNow();
    const from = new Date(now);
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
    const to = new Date(now);
    to.setMonth(to.getMonth() + 1, 0);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  });

  // Only years that have transactions show in the year picker (#124).
  const trackedYears = useMemo(() => {
    const years = new Set(
      transactions.map((t) => Number(t.transaction_date.slice(0, 4))),
    );
    return [...years].sort((a, b) => a - b);
  }, [transactions]);

  // Only months that have transactions, grouped by year.
  const trackedMonthsByYear = useMemo(() => {
    const map = {};
    for (const t of transactions) {
      const year = Number(t.transaction_date.slice(0, 4));
      const month = Number(t.transaction_date.slice(5, 7)) - 1;
      (map[year] ??= new Set()).add(month);
    }
    return map;
  }, [transactions]);

  const [loading, setLoading] = useState(true);
  const [safeToSpend, setSafeToSpend] = useState(null);
  const [safeToSpendStatus, setSafeToSpendStatus] = useState("loading"); // loading | ok | no-balance | no-schedule | error
  const [savings, setSavings] = useState(null);
  const [savingsStatus, setSavingsStatus] = useState("loading"); // loading | ok | no-schedule | no-amounts | no-history | error
  const [breakdownCell, setBreakdownCell] = useState(null); // null | balance | bills | cash | savings | income | expenses
  const [breakdownClosing, setBreakdownClosing] = useState(false);
  const [outgoingCell, setOutgoingCell] = useState(null);
  const outgoingTimer = useRef(null);
  const breakdownCloseTimer = useRef(null);
  const [devMenuOpen, setDevMenuOpen] = useState(false);
  const [devForceEmpty, setDevForceEmpty] = useState(false);
  const [devDelay, setDevDelay] = useState(0);
  const [devForceError, setDevForceError] = useState(false);
  const [devLastFetch, setDevLastFetch] = useState(null);
  const devForceErrorRef = useRef(false);
  const [activeTab, setActiveTab] = useState("ALL"); // "ALL" | any category
  const [categoryClosing, setCategoryClosing] = useState(false);
  const categoryCloseTimer = useRef(null);
  const [trendMonths, setTrendMonths] = useState(1); // 1 | 3 | 6 | 12 | "all"
  const trendRangeRef = useRef(null);
  const [rangeIndicator, setRangeIndicator] = useState(null);
  const [rangeHovered, setRangeHovered] = useState(null); // which range pill (1|3|6|12|"all") is hovered, or null
  const [visibleCategories, setVisibleCategories] = useState(() =>
    loadTrendCategories(),
  );

  useLayoutEffect(() => {
    const wrap = trendRangeRef.current;
    if (!wrap) return;
    const measure = () => {
      const active = wrap.querySelector('[data-range-active="true"]');
      if (active)
        setRangeIndicator({
          left: active.offsetLeft,
          width: active.offsetWidth,
        });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [trendMonths, loading, activeTab]);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categoriesHovered, setCategoriesHovered] = useState(false);
  const [categoriesSaved, setCategoriesSaved] = useState(false);
  const categoriesPanelRef = useRef(null);
  const [datePicker, setDatePicker] = useState(null);
  const [renderPicker, setRenderPicker] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerWidth, setPickerWidth] = useState(0);
  const pickerTimerRef = useRef(null);
  const pickerContentRef = useRef(null);
  const datePickerRef = useRef(null);
  const PICKER_TRANSITION_MS = 320;
  const PICKER_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

  const pickerBusyRef = useRef(false);
  const pickerBusyTimerRef = useRef(null);
  function lockPicker(ms) {
    pickerBusyRef.current = true;
    clearTimeout(pickerBusyTimerRef.current);
    pickerBusyTimerRef.current = setTimeout(() => {
      pickerBusyRef.current = false;
    }, ms);
  }
  function requestPicker(next) {
    if (pickerBusyRef.current) return;
    setDatePicker((p) => (p === next ? null : next));
  }

  useEffect(() => {
    clearTimeout(pickerTimerRef.current);
    if (datePicker == null) {
      if (renderPicker != null) lockPicker(PICKER_TRANSITION_MS + 60);
      setPickerOpen(false);
      pickerTimerRef.current = setTimeout(
        () => setRenderPicker(null),
        PICKER_TRANSITION_MS,
      );
    } else if (renderPicker == null) {
      lockPicker(PICKER_TRANSITION_MS + 60);
      setRenderPicker(datePicker);
    } else if (renderPicker !== datePicker) {
      lockPicker(PICKER_TRANSITION_MS * 2 + 60);
      setPickerOpen(false);
      pickerTimerRef.current = setTimeout(
        () => setRenderPicker(datePicker),
        PICKER_TRANSITION_MS,
      );
    }
    // renderPicker is set by this effect, so watching it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datePicker]);

  useEffect(
    () => () => {
      clearTimeout(pickerTimerRef.current);
      clearTimeout(pickerBusyTimerRef.current);
    },
    [],
  );

  useLayoutEffect(() => {
    if (renderPicker && pickerContentRef.current) {
      setPickerWidth(pickerContentRef.current.scrollWidth);
    }
    // Re-measures whenever the number of choices can change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderPicker, trackedYears.length, dateRange.from.getFullYear()]);

  useEffect(() => {
    if (renderPicker && renderPicker === datePicker) {
      setPickerOpen(true);
    }
  }, [renderPicker, datePicker, pickerWidth]);
  const [toolMode, setToolMode] = useState(null); // null | "paychecks" | "recurring" | "installments" | "add"
  const [toolClosing, setToolClosing] = useState(false);
  const toolCloseTimer = useRef(null);
  const [openedTools, setOpenedTools] = useState(new Set());
  const [recurringSaveState, setRecurringSaveState] = useState({
    isDirty: false,
    isSaving: false,
    saveStatus: "idle",
    onSave: null,
  });
  const [recurringAddSignal, setRecurringAddSignal] = useState(0);
  const [installmentsAddSignal, setInstallmentsAddSignal] = useState(0);
  const [creditCardsAddSignal, setCreditCardsAddSignal] = useState(0);
  const [creditCardsEditState, setCreditCardsEditState] = useState({
    editMode: false,
    hasRows: false,
    toggleEdit: () => {},
    hasSelection: false,
    selectionCount: 0,
    deleteSelected: () => {},
  });
  // Hold-to-delete on the Credit Cards header button: press and hold fills
  // the ring around the trash icon; releasing early cancels, holding the
  // full duration commits the delete.
  const HOLD_DELETE_MS = 1200;
  const HOLD_DELETE_RING_R = 16;
  const HOLD_DELETE_RING_C = 2 * Math.PI * HOLD_DELETE_RING_R;
  const [holdingDelete, setHoldingDelete] = useState(false);
  function startDeleteHold() {
    if (!(creditCardsEditState.editMode && creditCardsEditState.hasSelection)) return;
    setHoldingDelete(true);
  }
  function cancelDeleteHold() {
    setHoldingDelete(false);
  }
  function onDeleteRingTransitionEnd(e) {
    if (e.propertyName !== "stroke-dashoffset" || !holdingDelete) return;
    setHoldingDelete(false);
    creditCardsEditState.deleteSelected();
  }
  function openTool(mode) {
    clearTimeout(toolCloseTimer.current);
    setToolClosing(false);
    setToolMode(mode);
    setOpenedTools((prev) => (prev.has(mode) ? prev : new Set(prev).add(mode)));
  }
  function closeTool() {
    // Setting toolClosing with no tool open remounts the page, which looks
    // like a full refresh.
    if (toolMode == null) return;
    clearTimeout(toolCloseTimer.current);
    setToolClosing(true);
    toolCloseTimer.current = setTimeout(() => {
      setToolMode(null);
      setToolClosing(false);
    }, TOOL_TRANSITION_MS);
  }

  // Opens the same way Tools do, but keyed to `activeTab`. "ALL" means closed.
  function openCategory(cat) {
    clearTimeout(categoryCloseTimer.current);
    clearTimeout(toolCloseTimer.current);
    setCategoryClosing(false);
    setToolClosing(false);
    setToolMode(null);
    setActiveTab(cat);
  }
  function closeCategory() {
    if (activeTab === "ALL") return;
    clearTimeout(categoryCloseTimer.current);
    setCategoryClosing(true);
    categoryCloseTimer.current = setTimeout(() => {
      setActiveTab("ALL");
      setCategoryClosing(false);
    }, TOOL_TRANSITION_MS);
  }
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editingFromSearch, setEditingFromSearch] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [typeFilter, setTypeFilter] = useState(null);
  const [tableQuery, setTableQuery] = useState("");
  const [sortColumn, setSortColumn] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  function handleSort(col) {
    if (col === "date") {
      if (sortColumn === "date")
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      else {
        setSortColumn("date");
        setSortDir("desc");
      }
    } else {
      if (sortColumn !== col) {
        setSortColumn(col);
        setSortDir("asc");
      } else if (sortDir === "asc") setSortDir("desc");
      else {
        setSortColumn("date");
        setSortDir("desc");
      }
    }
  }
  const [highlightId, setHighlightId] = useState(null);
  const [activePreset, setActivePreset] = useState("Current Month");
  const [catHov, setCatHov] = useState(null);
  const [toolHov, setToolHov] = useState(null);

  function handleStepMonth(dir) {
    setActivePreset(null);
    setDateRange((prev) => stepMonth(prev, dir));
  }

  function gotoMonth(monthIndex) {
    setActivePreset(null);
    setDateRange((prev) =>
      monthRangeFor((prev.from ?? getNow()).getFullYear(), monthIndex),
    );
    setDatePicker(null);
  }

  function gotoYear(year) {
    setActivePreset(null);
    setDateRange((prev) =>
      monthRangeFor(year, (prev.from ?? getNow()).getMonth()),
    );
    setDatePicker(null);
  }

  const tableRef = useRef(null);

  async function devFetch() {
    if (devForceErrorRef.current) {
      devForceErrorRef.current = false;
      setDevForceError(false);
      throw new Error("Forced error");
    }
    if (devDelay > 0) await new Promise((r) => setTimeout(r, devDelay));
    return getTransactions();
  }

  useEffect(() => {
    devFetch()
      .then((res) => {
        setTransactions(res.data);
        setLoading(false);
        setDevLastFetch(new Date());
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  function loadTipDeposits() {
    getTipDeposits()
      .then((res) => setTipDeposits(res.data))
      .catch(() => setTipDeposits([]));
  }

  function loadSafeToSpend() {
    getSpendableSurplus()
      .then((res) => {
        setSafeToSpend(res.data);
        setSafeToSpendStatus("ok");
      })
      .catch((err) => {
        const detail = err.response?.data?.detail;
        setSafeToSpend(null);
        if (detail === "No starting balance set")
          setSafeToSpendStatus("no-balance");
        else if (detail === "No active paycheck schedule found")
          setSafeToSpendStatus("no-schedule");
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
        if (detail === "No active paycheck schedule found")
          setSavingsStatus("no-schedule");
        else if (detail === "No paycheck amounts yet")
          setSavingsStatus("no-amounts");
        else if (detail === "Not enough spending history")
          setSavingsStatus("no-history");
        else setSavingsStatus("error");
      });
  }

  useEffect(() => {
    loadSafeToSpend();
    loadSavings();
    loadTipDeposits();
  }, []);
  useEffect(
    () => () => {
      clearTimeout(breakdownCloseTimer.current);
      clearTimeout(outgoingTimer.current);
      clearTimeout(toolCloseTimer.current);
      clearTimeout(categoryCloseTimer.current);
    },
    [],
  );

  function refreshTransactions() {
    devFetch()
      .then((res) => {
        setTransactions(res.data);
        setDevLastFetch(new Date());
      })
      .catch(() => {});
    loadSafeToSpend();
    loadSavings();
    loadTipDeposits();
  }

  async function handleDelete(t) {
    if (t.recurring_payment_id) {
      // Stops future repeats, but only deletes the transaction that was clicked.
      await Promise.all([
        deleteRecurringPayment(t.recurring_payment_id),
        deleteTransaction(t.id),
      ]);
      setTransactions((prev) => prev.filter((tx) => tx.id !== t.id));
    } else {
      await deleteTransaction(t.id);
      setTransactions((prev) => prev.filter((tx) => tx.id !== t.id));
    }
  }

  const handleSelectTransaction = useCallback((t) => {
    setEditingTransaction(t);
    setEditingFromSearch(true);
  }, []);

  const handleLocateTransaction = useCallback(
    (t) => {
      setEditingTransaction(null);
      setEditingFromSearch(false);
      clearTimeout(categoryCloseTimer.current);
      setCategoryClosing(false);
      setActiveTab("ALL");
      setDateRange({ from: null, to: null });
      const allSorted = [...transactions].sort(
        (a, b) => new Date(b.transaction_date) - new Date(a.transaction_date),
      );
      const idx = allSorted.findIndex((tx) => tx.id === t.id);
      if (idx !== -1) setPage(Math.ceil((idx + 1) / perPage));
      setHighlightId(t.id);
      setTimeout(() => setHighlightId(null), 2500);
      setTimeout(
        () =>
          tableRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        50,
      );
    },
    [transactions, perPage],
  );

  const filtered = useMemo(() => {
    if (devForceEmpty) return [];
    let result =
      activeTab === "ALL"
        ? transactions
        : transactions.filter((t) => t.category === activeTab);

    if (dateRange.from || dateRange.to) {
      result = result.filter((t) => {
        const date = new Date(t.transaction_date + "T00:00:00");
        if (dateRange.from && date < dateRange.from) return false;
        if (dateRange.to && date > dateRange.to) return false;
        return true;
      });
    }

    return result;
  }, [transactions, activeTab, dateRange, devForceEmpty]);

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

  const periodDeposits = useMemo(
    () => depositsInRange(dateRange.from, dateRange.to),
    [depositsInRange, dateRange],
  );

  // The actual deposit rows for the Tips category page's second table
  // (#155/#156), not just their sum - same date-range filter as
  // depositsInRange above.
  const tipDepositsInRange = useMemo(() => {
    return tipDeposits.filter((d) => {
      const dt = new Date(d.deposit_date + "T00:00:00");
      if (dateRange.from && dt < dateRange.from) return false;
      if (dateRange.to && dt > dateRange.to) return false;
      return true;
    });
  }, [tipDeposits, dateRange]);

  // Totals per category for the Income and Expenses drawers (#67). Deposits
  // aren't transactions, so they're added separately there.
  const categoryTotals = useMemo(() => {
    const totals = {};
    filtered.forEach((t) => {
      totals[t.category] = (totals[t.category] ?? 0) + parseFloat(t.amount);
    });
    return totals;
  }, [filtered]);

  const summary = useMemo(() => {
    const totalIn =
      filtered
        .filter((t) => MONEY_IN_TYPES.has(t.category))
        .reduce((sum, t) => sum + parseFloat(t.amount), 0) +
      (activeTab === "ALL" ? periodDeposits : 0);
    const totalOut = filtered
      .filter((t) => MONEY_OUT_TYPES.has(t.category))
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const savingsRate =
      totalIn > 0 ? ((totalIn - totalOut) / totalIn) * 100 : null;

    // Change vs. the period before. Going up is only good news for Income.
    let savingsRateDelta = null;
    let totalInDelta = null;
    let totalOutDelta = null;
    if (dateRange.from) {
      const periodMs =
        (dateRange.to ?? new Date()).getTime() - dateRange.from.getTime();
      const prevFrom = new Date(dateRange.from.getTime() - periodMs);
      const prevTo = dateRange.from;
      const prevFiltered = transactions
        .filter((t) => activeTab === "ALL" || t.category === activeTab)
        .filter((t) => {
          const d = new Date(t.transaction_date + "T00:00:00");
          return d >= prevFrom && d < prevTo;
        });
      const prevIn =
        prevFiltered
          .filter((t) => MONEY_IN_TYPES.has(t.category))
          .reduce((s, t) => s + parseFloat(t.amount), 0) +
        // The end date is exclusive above, so step back a millisecond or a
        // deposit on that exact day gets counted in both periods.
        (activeTab === "ALL"
          ? depositsInRange(prevFrom, new Date(prevTo.getTime() - 1))
          : 0);
      const prevOut = prevFiltered
        .filter((t) => MONEY_OUT_TYPES.has(t.category))
        .reduce((s, t) => s + parseFloat(t.amount), 0);
      if (prevIn > 0 && savingsRate !== null) {
        savingsRateDelta = savingsRate - ((prevIn - prevOut) / prevIn) * 100;
      }
      if (prevIn > 0) totalInDelta = ((totalIn - prevIn) / prevIn) * 100;
      if (prevOut > 0) totalOutDelta = ((totalOut - prevOut) / prevOut) * 100;
    }

    const categoryTotal = filtered.reduce(
      (s, t) => s + parseFloat(t.amount),
      0,
    );
    let categoryDelta = null;
    let pctOfTotal = null;
    if (activeTab !== "ALL") {
      const isIncomeCategory = INCOME_TYPES.has(activeTab);
      const allPeriodTotal = transactions
        .filter((t) => {
          if (!dateRange.from && !dateRange.to) return true;
          const d = new Date(t.transaction_date + "T00:00:00");
          if (dateRange.from && d < dateRange.from) return false;
          if (dateRange.to && d > dateRange.to) return false;
          return true;
        })
        .filter((t) =>
          isIncomeCategory
            ? INCOME_TYPES.has(t.category)
            : !INCOME_TYPES.has(t.category),
        )
        .reduce((s, t) => s + parseFloat(t.amount), 0);
      if (allPeriodTotal > 0)
        pctOfTotal = (categoryTotal / allPeriodTotal) * 100;

      if (dateRange.from) {
        const periodMs =
          (dateRange.to ?? new Date()).getTime() - dateRange.from.getTime();
        const prevFrom = new Date(dateRange.from.getTime() - periodMs);
        const prevTo = dateRange.from;
        const prevTotal = transactions
          .filter((t) => t.category === activeTab)
          .filter((t) => {
            const d = new Date(t.transaction_date + "T00:00:00");
            return d >= prevFrom && d < prevTo;
          })
          .reduce((s, t) => s + parseFloat(t.amount), 0);
        if (prevTotal > 0)
          categoryDelta = ((categoryTotal - prevTotal) / prevTotal) * 100;
      }
    }

    const txCount = filtered.length;
    const avgTx = txCount > 0 ? categoryTotal / txCount : 0;

    return {
      totalIn,
      totalOut,
      savingsRate,
      savingsRateDelta,
      totalInDelta,
      totalOutDelta,
      categoryTotal,
      txCount,
      avgTx,
      pctOfTotal,
      categoryDelta,
    };
  }, [
    filtered,
    transactions,
    activeTab,
    dateRange,
    periodDeposits,
    depositsInRange,
  ]);

  const trendData = useMemo(() => {
    const now = getNow();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let start;
    if (trendMonths === "all") {
      start =
        transactions.length === 0
          ? today
          : transactions.reduce(
              (min, t) => {
                const d = new Date(t.transaction_date + "T00:00:00");
                return d < min ? d : min;
              },
              new Date(transactions[0].transaction_date + "T00:00:00"),
            );
    } else {
      start = new Date(
        today.getFullYear(),
        today.getMonth() - trendMonths + 1,
        1,
      );
    }
    const showYear = start.getFullYear() !== today.getFullYear();
    const dayCount = Math.max(1, Math.round((today - start) / 86400000) + 1);
    const bucketDays = Math.max(1, Math.ceil(dayCount / TREND_TARGET_POINTS));
    const bucketCount = Math.ceil(dayCount / bucketDays);
    const fmtOpts = showYear
      ? { month: "short", day: "numeric", year: "2-digit" }
      : { month: "short", day: "numeric" };

    const buckets = Array.from({ length: bucketCount }, (_, i) => {
      const bucketStart = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + i * bucketDays,
      );
      const bucket = {
        label: bucketStart.toLocaleDateString("en-US", fmtOpts),
      };
      TREND_CATEGORIES.forEach((cat) => {
        bucket[cat] = 0;
      });
      return bucket;
    });
    transactions.forEach((t) => {
      const d = new Date(t.transaction_date + "T00:00:00");
      const dayOffset = Math.round((d - start) / 86400000);
      if (dayOffset < 0 || dayOffset >= dayCount) return;
      const bucket = buckets[Math.floor(dayOffset / bucketDays)];
      bucket[t.category] = (bucket[t.category] ?? 0) + parseFloat(t.amount);
    });
    return buckets.map((b) => {
      const rounded = { label: b.label };
      TREND_CATEGORIES.forEach((cat) => {
        rounded[cat] = parseFloat((b[cat] ?? 0).toFixed(2));
      });
      return rounded;
    });
  }, [transactions, trendMonths]);

  const trendTotals = useMemo(() => {
    const totals = {};
    TREND_CATEGORIES.forEach((cat) => {
      totals[cat] = 0;
    });
    trendData.forEach((d) => {
      TREND_CATEGORIES.forEach((cat) => {
        totals[cat] += d[cat];
      });
    });
    return totals;
  }, [trendData]);

  const visibleTrendCategories = useMemo(
    () => TREND_CATEGORIES.filter((cat) => visibleCategories.has(cat)),
    [visibleCategories],
  );

  const trendLegendRows = useMemo(() => {
    const rows = [];
    for (
      let i = 0;
      i < visibleTrendCategories.length;
      i += TREND_LEGEND_PER_ROW
    ) {
      rows.push(visibleTrendCategories.slice(i, i + TREND_LEGEND_PER_ROW));
    }
    return rows;
  }, [visibleTrendCategories]);

  const trendHasData = useMemo(
    () => trendData.some((d) => TREND_CATEGORIES.some((cat) => d[cat] > 0)),
    [trendData],
  );

  // Biggest merchants by name. Category tabs only.
  const barData = useMemo(() => {
    if (activeTab === "ALL") return [];
    const grouped = {};
    filtered.forEach((t) => {
      grouped[t.name] = (grouped[t.name] ?? 0) + parseFloat(t.amount);
    });
    const entries = Object.entries(grouped)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
    const START = 100,
      END = 30;
    const step = entries.length > 1 ? (START - END) / (entries.length - 1) : 0;
    return entries.map(([name, total], i) => ({
      month: name,
      total: parseFloat(total.toFixed(2)),
      color: `color-mix(in srgb, ${CATEGORY_ACCENT[activeTab]} ${Math.round(START - i * step)}%, black)`,
    }));
  }, [filtered, activeTab]);

  const areaData = useMemo(() => {
    if (activeTab === "ALL") return [];
    const grouped = {};
    filtered.forEach((t) => {
      grouped[t.transaction_date] =
        (grouped[t.transaction_date] ?? 0) + parseFloat(t.amount);
    });
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({
        date: new Date(date + "T00:00:00").getTime(),
        total: parseFloat(total.toFixed(2)),
      }));
  }, [filtered, activeTab]);

  const sorted = useMemo(() => {
    let arr = [...filtered];
    if (tableQuery.trim())
      arr = arr.filter((t) => matchesTransaction(t, tableQuery));
    if (typeFilter === "income")
      arr = arr.filter((t) => INCOME_TYPES.has(t.category));
    else if (typeFilter === "expense")
      arr = arr.filter((t) => !INCOME_TYPES.has(t.category));
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortColumn === "name")
      return arr.sort((a, b) => dir * a.name.localeCompare(b.name));
    if (sortColumn === "amount")
      return arr.sort(
        (a, b) => dir * (parseFloat(a.amount) - parseFloat(b.amount)),
      );
    if (sortColumn === "date")
      return arr.sort(
        (a, b) =>
          dir * (new Date(a.transaction_date) - new Date(b.transaction_date)),
      );
    return arr.sort(
      (a, b) => new Date(b.transaction_date) - new Date(a.transaction_date),
    );
  }, [filtered, tableQuery, typeFilter, sortColumn, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const paginated = sorted.slice((page - 1) * perPage, page * perPage);
  // Deposited Tips shares the Tips page's page/perPage rather than owning
  // separate pagination (#155/#156) - paged the same way, off the same state.
  const paginatedDeposits = tipDepositsInRange
    .slice()
    .sort((a, b) => b.deposit_date.localeCompare(a.deposit_date))
    .slice((page - 1) * perPage, page * perPage);

  useEffect(() => {
    setPage(1);
  }, [filtered, perPage, tableQuery, typeFilter, sortColumn, sortDir]);

  useEffect(() => {
    if (!categoriesOpen) return;
    function handleOutsideClick(e) {
      if (
        categoriesPanelRef.current &&
        !categoriesPanelRef.current.contains(e.target)
      ) {
        setCategoriesOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [categoriesOpen]);

  useEffect(() => {
    if (!datePicker) return;
    function handleOutsideClick(e) {
      if (pickerBusyRef.current) return;
      if (datePickerRef.current && !datePickerRef.current.contains(e.target)) {
        setDatePicker(null);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [datePicker]);

  function toggleTrendCategory(cat) {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
    setCategoriesSaved(false);
  }

  function handleSaveTrendCategories() {
    localStorage.setItem(
      TREND_CATEGORIES_KEY,
      JSON.stringify([...visibleCategories]),
    );
    setCategoriesSaved(true);
    setTimeout(() => setCategoriesSaved(false), 2000);
  }

  const activeColor = CATEGORY_ACCENT[activeTab];
  // Going up is good for income and bad for spending. null when there's no
  // earlier period to compare against.
  const categoryDeltaGood =
    summary.categoryDelta == null
      ? null
      : INCOME_TYPES.has(activeTab)
        ? summary.categoryDelta >= 0
        : summary.categoryDelta <= 0;
  const text = HOME_TEXT;
  const muted = HOME_MUTED;
  const bg = HOME_BG;
  const border = HOME_DIVIDER;
  const surface = HOME_SURFACE;

  // Available Cash reads free_to_allocate, which already has the spending
  // reserve taken out.
  let overviewBalance, overviewBills, overviewCash;
  if (safeToSpendStatus === "ok" && safeToSpend) {
    overviewBalance = { value: fmt(safeToSpend.running_balance), color: text };
    const freeToAllocate = parseFloat(safeToSpend.free_to_allocate);
    const billCount = safeToSpend.bills_breakdown?.length ?? 0;
    overviewCash = {
      value: fmt(safeToSpend.free_to_allocate),
      color: freeToAllocate >= 0 ? HOME_INCOME : HOME_EXPENSE,
    };
    overviewBills = {
      value:
        parseFloat(safeToSpend.bills_before_next_payday) > 0
          ? `-${fmt(safeToSpend.bills_before_next_payday)}`
          : fmt(safeToSpend.bills_before_next_payday),
      color: CATEGORY_ACCENT.BILL,
      caption:
        billCount > 0
          ? `${billCount} bill${billCount !== 1 ? "s" : ""} due`
          : "No bills due",
    };
  } else if (safeToSpendStatus === "loading") {
    overviewBalance = { value: "—", color: muted };
    overviewCash = { value: "—", color: muted };
    overviewBills = { value: "—", color: muted };
  } else {
    const prompt =
      safeToSpendStatus === "no-balance"
        ? "Set a starting balance"
        : safeToSpendStatus === "no-schedule"
          ? "Set up a paycheck schedule"
          : "Unavailable";
    overviewBalance = { value: "Not set up", color: muted, caption: prompt };
    overviewCash = { value: "Not set up", color: muted, caption: prompt };
    overviewBills = { value: "—", color: muted };
  }

  let overviewSavings;
  if (savingsStatus === "ok" && savings) {
    const savedSoFar = parseFloat(savings.saved_so_far);
    const ceiling = parseFloat(savings.estimated_savings);
    const overSaved = savedSoFar > ceiling;
    overviewSavings =
      overSaved || ceiling > 0
        ? {
            saved: fmtWhole(savings.saved_so_far),
            estimated: fmtWhole(savings.estimated_savings),
            color: CATEGORY_ACCENT.SAVINGS,
          }
        : {
            value: fmtWhole(savings.saved_so_far),
            color: CATEGORY_ACCENT.SAVINGS,
            caption: "No room to save this month",
          };
  } else if (savingsStatus === "loading") {
    overviewSavings = { value: "—", color: muted };
  } else if (savingsStatus === "no-history") {
    overviewSavings = {
      value: "—",
      color: muted,
      caption: "Needs 3 months of history",
    };
  } else {
    overviewSavings = {
      value: "—",
      color: muted,
      caption: "Add a paycheck amount",
    };
  }

  function toggleBreakdown(cell) {
    clearTimeout(breakdownCloseTimer.current);
    if (breakdownCell === cell) {
      clearTimeout(outgoingTimer.current);
      setOutgoingCell(null);
      setBreakdownClosing(true);
      breakdownCloseTimer.current = setTimeout(() => {
        setBreakdownCell(null);
        setBreakdownClosing(false);
      }, DRAWER_TRANSITION_MS);
    } else if (breakdownCell == null) {
      setBreakdownClosing(false);
      setBreakdownCell(cell);
    } else {
      clearTimeout(outgoingTimer.current);
      setOutgoingCell(breakdownCell);
      setBreakdownCell(cell);
      outgoingTimer.current = setTimeout(
        () => setOutgoingCell(null),
        SWITCH_TRANSITION_MS,
      );
    }
  }

  function closeBreakdown() {
    clearTimeout(breakdownCloseTimer.current);
    clearTimeout(outgoingTimer.current);
    setOutgoingCell(null);
    setBreakdownClosing(true);
    breakdownCloseTimer.current = setTimeout(() => {
      setBreakdownCell(null);
      setBreakdownClosing(false);
    }, DRAWER_TRANSITION_MS);
  }

  function drawerColorFor(cell) {
    return {
      balance: overviewBalance.color,
      bills: overviewBills.color,
      cash: overviewCash.color,
      savings: overviewSavings.color,
    }[cell];
  }

  function renderDrawerBody(cell, { showClose = false } = {}) {
    return (
      <>
        <div
          className="flex items-center justify-between"
          style={{ marginBottom: 10 }}
        >
          <h3
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 15,
              fontWeight: 700,
              color: text,
              margin: 0,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: drawerColorFor(cell),
                flexShrink: 0,
              }}
            />
            {OVERVIEW_DRAWER_TITLES[cell]}
          </h3>
          {showClose && (
            <button
              onClick={closeBreakdown}
              aria-label="Close"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: muted,
                display: "flex",
                padding: 2,
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
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
          )}
        </div>
        {cell === "balance" && (
          <BalanceBody safeToSpend={safeToSpend} status={safeToSpendStatus} />
        )}
        {cell === "bills" && (
          <BillsBody safeToSpend={safeToSpend} status={safeToSpendStatus} />
        )}
        {cell === "cash" && (
          <CashBody safeToSpend={safeToSpend} status={safeToSpendStatus} />
        )}
        {cell === "savings" && (
          <SavingsBody savings={savings} status={savingsStatus} />
        )}
        {cell === "income" && (
          <IncomeBody
            categoryTotals={categoryTotals}
            deposits={activeTab === "ALL" ? periodDeposits : 0}
            total={summary.totalIn}
            cashTips={categoryTotals.TIPS ?? 0}
          />
        )}
        {cell === "expenses" && (
          <ExpensesBody
            categoryTotals={categoryTotals}
            total={summary.totalOut}
          />
        )}
      </>
    );
  }

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

  return (
    <div className="h-dvh flex flex-col" style={{ backgroundColor: bg }}>
      <Navbar
        transactions={transactions}
        onSelectTransaction={handleSelectTransaction}
        onOpenTool={openTool}
        onCommand={(cmd, val) => {
          if (cmd === "devtools") setDevMenuOpen(val);
        }}
      />

      <div className="flex-1 flex min-h-0">
        <aside
          style={{
            position: "relative",
            flexShrink: 0,
            width: "16.5rem",
            borderRight: `1px solid ${border}`,
            backgroundColor: surface,
            overflow: "hidden",
          }}
        >
          {/* scrollbarGutter reserves the scrollbar's width, or content reflows
              narrower the moment the list overflows (#11). */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              overflowY: "auto",
              scrollbarGutter: "stable",
              padding: "20px 10px",
              display: "flex",
              flexDirection: "column",
              gap: 28,
            }}
          >
            {/* Opens the same main-content takeover Tools use (toolMode "add"). */}
            <button
              onClick={() => openTool("add")}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${HOME_INCOME} 80%, black)`;
                e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.35)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = HOME_INCOME;
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "translateY(0)";
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "9px 0",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                backgroundColor: HOME_INCOME,
                color: "#000",
                fontSize: 13,
                fontWeight: 700,
                transition:
                  "background-color 150ms ease, box-shadow 150ms ease, transform 150ms ease",
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5v14" />
              </svg>
              Add Transaction
            </button>

            <div>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: muted,
                  marginBottom: 6,
                  paddingLeft: 10,
                }}
              >
                CATEGORY
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {REAL_CATEGORIES.map((cat) => {
                  const catColor = CATEGORY_ACCENT[cat];
                  const isActive = activeTab === cat;
                  const isHov = catHov === cat;
                  const Icon = CATEGORY_ICON[cat];
                  return (
                    <button
                      key={cat}
                      onClick={() => openCategory(cat)}
                      onMouseEnter={() => setCatHov(cat)}
                      onMouseLeave={() => setCatHov(null)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 11,
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 11px",
                        borderRadius: 12,
                        border: "none",
                        cursor: "pointer",
                        fontSize: 15,
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? text : muted,
                        backgroundColor: isActive
                          ? `color-mix(in srgb, ${catColor} 14%, transparent)`
                          : isHov
                            ? `color-mix(in srgb, ${catColor} 8%, transparent)`
                            : "transparent",
                        transition: "background-color 120ms, color 120ms",
                      }}
                    >
                      <span
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 9,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: catColor,
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
                        }}
                      >
                        <Icon />
                      </span>
                      {CATEGORY_CONFIG[cat].label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tools */}
            <div>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: muted,
                  marginBottom: 6,
                  paddingLeft: 10,
                }}
              >
                TOOLS
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {[
                  {
                    key: "paychecks",
                    label: "Paychecks",
                    icon: (
                      <>
                        <rect x="3" y="6.5" width="18" height="11" rx="2.2" />
                        <circle cx="12" cy="12" r="2.3" />
                      </>
                    ),
                  },
                  {
                    key: "recurring",
                    label: "Recurring Payments",
                    icon: (
                      <>
                        <path d="M17 3.5l3 3-3 3" />
                        <path d="M20 6.5H8.5a4.5 4.5 0 0 0-4.5 4.5" />
                        <path d="M7 20.5l-3-3 3-3" />
                        <path d="M4 17.5h11.5a4.5 4.5 0 0 0 4.5-4.5" />
                      </>
                    ),
                  },
                  {
                    key: "installments",
                    label: "Installments",
                    icon: (
                      <>
                        <line x1="19" y1="5" x2="5" y2="19" />
                        <circle cx="6.5" cy="6.5" r="2.5" />
                        <circle cx="17.5" cy="17.5" r="2.5" />
                      </>
                    ),
                  },
                  {
                    key: "creditCards",
                    label: "Credit Cards",
                    icon: (
                      <>
                        <rect x="2" y="5" width="20" height="14" rx="2.2" />
                        <line x1="2" y1="10" x2="22" y2="10" />
                      </>
                    ),
                  },
                ].map((tool) => {
                  const isActive = toolMode === tool.key;
                  const isHov = toolHov === tool.key;
                  return (
                    <button
                      key={tool.key}
                      onClick={() => openTool(tool.key)}
                      onMouseEnter={() => setToolHov(tool.key)}
                      onMouseLeave={() => setToolHov(null)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 11,
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 11px",
                        borderRadius: 12,
                        border: "none",
                        cursor: "pointer",
                        fontSize: 15,
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? text : muted,
                        backgroundColor: isActive
                          ? `color-mix(in srgb, ${text} 10%, transparent)`
                          : isHov
                            ? `color-mix(in srgb, ${text} 6%, transparent)`
                            : "transparent",
                        transition: "background-color 120ms, color 120ms",
                      }}
                    >
                      <IconToolTile>{tool.icon}</IconToolTile>
                      {tool.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        <div className="flex-1 min-w-0 overflow-y-auto flex flex-col">
          <style>{`
          @keyframes skel-pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
          @keyframes breakdown-fade-in { from { opacity: 0; } to { opacity: 1; } }
          @keyframes breakdown-fade-out { from { opacity: 1; } to { opacity: 0; } }
          @keyframes tool-page-in { from { opacity: 0; transform: translateX(-32px); } to { opacity: 1; transform: translateX(0); } }
        `}</style>
          {toolMode || toolClosing ? (
            <div
              className="px-6 py-6 flex-1"
              style={{
                opacity: toolClosing ? 0 : 1,
                // Only set a transform while actually animating - any value
                // here (even translateX(0)) makes this the containing block
                // for position:fixed descendants, breaking them out of true
                // viewport-fixed positioning (panels like the credit card
                // "+" picker would size/scroll against this div instead).
                transform: toolClosing ? "translateX(-32px)" : undefined,
                transition: `opacity ${TOOL_TRANSITION_MS}ms ease, transform ${TOOL_TRANSITION_MS}ms ease`,
                animation: toolClosing
                  ? undefined
                  : `tool-page-in ${TOOL_TRANSITION_MS}ms ease`,
              }}
            >
              <div
                className="flex items-center gap-3"
                style={{ marginBottom: 20 }}
              >
                <button
                  onClick={closeTool}
                  aria-label="Back"
                  className="rounded-lg cursor-pointer transition-colors"
                  style={{ padding: 6, color: muted }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = text)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = muted)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <h1
                  className="text-3xl font-bold tracking-tight"
                  style={{ color: text }}
                >
                  {TOOL_TITLES[toolMode]}
                </h1>
                {(toolMode === "recurring" || toolMode === "installments" || toolMode === "creditCards") && (
                  <div
                    style={{
                      marginLeft: "auto",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                    }}
                  >
                    {toolMode === "recurring" &&
                      recurringSaveState.saveStatus === "saved" && (
                        <span style={{ fontSize: 12, color: HOME_INCOME }}>
                          Saved
                        </span>
                      )}
                    {toolMode === "recurring" && (
                      <button
                        onClick={recurringSaveState.onSave}
                        disabled={
                          !recurringSaveState.isDirty ||
                          recurringSaveState.isSaving
                        }
                        style={{
                          padding: "6px 14px",
                          borderRadius: 8,
                          border: `1px solid ${HOME_INCOME}`,
                          color: HOME_INCOME,
                          backgroundColor: `color-mix(in srgb, ${HOME_INCOME} 12%, transparent)`,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor:
                            recurringSaveState.isDirty &&
                            !recurringSaveState.isSaving
                              ? "pointer"
                              : "default",
                          opacity:
                            !recurringSaveState.isDirty ||
                            recurringSaveState.isSaving
                              ? 0.4
                              : 1,
                          transition: "opacity 150ms ease",
                        }}
                      >
                        {recurringSaveState.isSaving ? "Saving…" : "Save"}
                      </button>
                    )}
                    {toolMode === "creditCards" && (() => {
                      const showDelete = creditCardsEditState.editMode && creditCardsEditState.hasSelection;
                      return (
                        <button
                          onMouseDown={startDeleteHold}
                          onMouseUp={cancelDeleteHold}
                          onMouseLeave={cancelDeleteHold}
                          onTouchStart={startDeleteHold}
                          onTouchEnd={cancelDeleteHold}
                          aria-label={`Hold to delete ${creditCardsEditState.selectionCount} selected`}
                          tabIndex={showDelete ? 0 : -1}
                          style={{
                            width: showDelete ? 36 : 0,
                            height: 36,
                            borderRadius: "50%",
                            flexShrink: 0,
                            overflow: "hidden",
                            cursor: showDelete ? "pointer" : "default",
                            background: `color-mix(in srgb, ${HOME_EXPENSE} 16%, ${surface})`,
                            border: `1px solid ${HOME_EXPENSE}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                            color: HOME_EXPENSE,
                            opacity: showDelete ? 1 : 0,
                            transform: showDelete ? "scale(1)" : "scale(0.5)",
                            marginLeft: showDelete ? 0 : -10,
                            marginRight: showDelete ? 0 : -10,
                            pointerEvents: showDelete ? "auto" : "none",
                            userSelect: "none",
                            transition:
                              "width 220ms ease, margin 220ms ease, opacity 180ms ease, transform 220ms ease",
                          }}
                        >
                          {/* Ring and icon share one 36x36 coordinate space so they're
                              guaranteed to center on the same point - two separate
                              overlapping SVGs left room for the two boxes to drift
                              apart from each other. */}
                          <svg
                            width="36" height="36" viewBox="0 0 36 36"
                            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                          >
                            <g transform="translate(-1 -1)">
                              <circle
                                cx="18" cy="18" r={HOLD_DELETE_RING_R} fill="none" stroke={HOME_EXPENSE} strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeDasharray={HOLD_DELETE_RING_C}
                                strokeDashoffset={holdingDelete ? 0 : HOLD_DELETE_RING_C}
                                transform="rotate(-90 18 18)"
                                onTransitionEnd={onDeleteRingTransitionEnd}
                                style={{
                                  transition: holdingDelete
                                    ? `stroke-dashoffset ${HOLD_DELETE_MS}ms linear`
                                    : "stroke-dashoffset 150ms ease",
                                }}
                              />
                              {/* Nested SVG viewport, not a hand-computed transform - x/y/width/height
                                  place a 16x16 box at (10,10)-(26,26), i.e. centered in this 36x36
                                  space ((36-16)/2 = 10 on each side), and its own viewBox handles
                                  scaling the 24x24-authored icon down to fit. */}
                              <svg x="10" y="10" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
                              </svg>
                            </g>
                          </svg>
                        </button>
                      );
                    })()}
                    {toolMode === "creditCards" && (
                      <button
                        onClick={creditCardsEditState.toggleEdit}
                        aria-label={creditCardsEditState.editMode ? "Done editing" : "Edit credit card balances"}
                        tabIndex={creditCardsEditState.hasRows ? 0 : -1}
                        style={{
                          width: creditCardsEditState.hasRows ? 36 : 0,
                          height: 36,
                          borderRadius: "50%",
                          flexShrink: 0,
                          overflow: "hidden",
                          cursor: creditCardsEditState.hasRows ? "pointer" : "default",
                          background: creditCardsEditState.editMode
                            ? `color-mix(in srgb, ${HOME_INCOME} 18%, ${surface})`
                            : surface,
                          border: `1px solid ${creditCardsEditState.editMode ? HOME_INCOME : "rgba(255,255,255,0.07)"}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          position: "relative",
                          color: creditCardsEditState.editMode ? HOME_INCOME : "#fff",
                          opacity: creditCardsEditState.hasRows ? 1 : 0,
                          transform: creditCardsEditState.hasRows ? "scale(1)" : "scale(0.5)",
                          marginLeft: creditCardsEditState.hasRows ? 0 : -10,
                          marginRight: creditCardsEditState.hasRows ? 0 : -10,
                          pointerEvents: creditCardsEditState.hasRows ? "auto" : "none",
                          transition:
                            "width 220ms ease, margin 220ms ease, opacity 180ms ease, transform 220ms ease, background 200ms ease, border-color 200ms ease, color 200ms ease",
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          style={{
                            position: "absolute",
                            opacity: creditCardsEditState.editMode ? 1 : 0,
                            transform: creditCardsEditState.editMode ? "scale(1) rotate(0deg)" : "scale(0.4) rotate(-45deg)",
                            transition: "opacity 200ms ease, transform 200ms ease",
                          }}
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                        <svg
                          xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          style={{
                            position: "absolute",
                            opacity: creditCardsEditState.editMode ? 0 : 1,
                            transform: creditCardsEditState.editMode ? "scale(0.4) rotate(45deg)" : "scale(1) rotate(0deg)",
                            transition: "opacity 200ms ease, transform 200ms ease",
                          }}
                        >
                          <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                    )}
                    {/* Same circular "+" mobile uses; the add UI lives in the panel. */}
                    <button
                      onClick={() => {
                        if (toolMode === "recurring") setRecurringAddSignal((n) => n + 1);
                        else if (toolMode === "installments") setInstallmentsAddSignal((n) => n + 1);
                        else setCreditCardsAddSignal((n) => n + 1);
                      }}
                      aria-label={
                        toolMode === "recurring"
                          ? "Add recurring payment"
                          : toolMode === "installments"
                          ? "Add installment"
                          : "Split a transaction as a credit card payment"
                      }
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        flexShrink: 0,
                        cursor: "pointer",
                        background: surface,
                        border: "1px solid rgba(255,255,255,0.07)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                      }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="19"
                        height="19"
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
                    </button>
                  </div>
                )}
              </div>
              {/* Mounted once, then toggled with display - reopening keeps its data. */}
              {openedTools.has("paychecks") && (
                <div
                  style={{
                    display: toolMode === "paychecks" ? "block" : "none",
                  }}
                >
                  <PaychecksPanel desktop onSaved={refreshTransactions} />
                </div>
              )}
              {openedTools.has("recurring") && (
                <div
                  style={{
                    display: toolMode === "recurring" ? "block" : "none",
                  }}
                >
                  <RecurringPaymentsModal
                    desktop
                    addSignal={recurringAddSignal}
                    onSaveStateChange={setRecurringSaveState}
                    onDelete={refreshTransactions}
                    onSaved={refreshTransactions}
                  />
                </div>
              )}
              {openedTools.has("installments") && (
                <div
                  style={{
                    display: toolMode === "installments" ? "block" : "none",
                  }}
                >
                  <InstallmentsPanel
                    desktop
                    addSignal={installmentsAddSignal}
                    onSaved={refreshTransactions}
                  />
                </div>
              )}
              {openedTools.has("creditCards") && (
                <div
                  style={{
                    display: toolMode === "creditCards" ? "block" : "none",
                  }}
                >
                  <CreditCardsPanel
                    addSignal={creditCardsAddSignal}
                    onChanged={refreshTransactions}
                    onEditStateChange={setCreditCardsEditState}
                  />
                </div>
              )}
              {openedTools.has("add") && (
                <div style={{ display: toolMode === "add" ? "block" : "none" }}>
                  <AddTransactionPage
                    onSaved={refreshTransactions}
                    onImported={(newTxs) =>
                      setTransactions((prev) => [...(newTxs || []), ...prev])
                    }
                  />
                </div>
              )}
            </div>
          ) : (
            <main className="px-6 py-6 flex-1">
              {/* Keyed so changing page replays tool-page-in. transform stays `none`
            when idle - a non-none transform becomes a containing block. */}
              <div
                key={activeTab === "ALL" ? "dashboard" : activeTab}
                className="space-y-5"
                style={{
                  opacity: categoryClosing ? 0 : 1,
                  transform: categoryClosing ? "translateX(-32px)" : "none",
                  transition: `opacity ${TOOL_TRANSITION_MS}ms ease, transform ${TOOL_TRANSITION_MS}ms ease`,
                  animation: categoryClosing
                    ? undefined
                    : `tool-page-in ${TOOL_TRANSITION_MS}ms ease`,
                }}
              >
                <div className="flex items-center gap-3">
                  {activeTab !== "ALL" && (
                    <div
                      className="flex items-center gap-3"
                      style={{ flex: 1, minWidth: 0 }}
                    >
                      <button
                        onClick={closeCategory}
                        aria-label="Back to dashboard"
                        className="rounded-lg cursor-pointer transition-colors"
                        style={{ padding: 6, color: muted, flexShrink: 0 }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color = text)
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color = muted)
                        }
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M15 18l-6-6 6-6" />
                        </svg>
                      </button>
                      <h1
                        className="text-3xl font-bold tracking-tight"
                        style={{
                          color: activeColor,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {CATEGORY_CONFIG[activeTab].label}
                      </h1>
                    </div>
                  )}

                  <div
                    className="flex items-center gap-3"
                    style={{ flexShrink: 0 }}
                  >
                    {isSingleMonthRange(dateRange) ? (
                      <>
                        <button
                          onClick={() => handleStepMonth(-1)}
                          aria-label="Previous month"
                          className="rounded-lg cursor-pointer transition-colors"
                          style={{ padding: 6, color: muted }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.color = text)
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.color = muted)
                          }
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M15 18l-6-6 6-6" />
                          </svg>
                        </button>
                        <div ref={datePickerRef} className="flex items-center">
                          <div
                            className="flex items-center"
                            style={{ gap: 10 }}
                          >
                            <button
                              onClick={() => requestPicker("month")}
                              className="text-3xl font-bold tracking-tight cursor-pointer transition-colors"
                              style={{
                                color: datePicker === "month" ? ACCENT : text,
                                background: "none",
                                border: "none",
                                padding: 0,
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.color =
                                  datePicker === "month" ? ACCENT_DEEP : ACCENT)
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.color =
                                  datePicker === "month" ? ACCENT : text)
                              }
                            >
                              {dateRange.from.toLocaleDateString("en-US", {
                                month: "long",
                              })}
                            </button>
                            <button
                              onClick={() => requestPicker("year")}
                              className="text-3xl font-bold tracking-tight cursor-pointer transition-colors"
                              style={{
                                color: datePicker === "year" ? ACCENT : text,
                                background: "none",
                                border: "none",
                                padding: 0,
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.color =
                                  datePicker === "year" ? ACCENT_DEEP : ACCENT)
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.color =
                                  datePicker === "year" ? ACCENT : text)
                              }
                            >
                              {dateRange.from.getFullYear()}
                            </button>
                          </div>

                          <div
                            style={{
                              overflow: "hidden",
                              maxWidth: pickerOpen ? pickerWidth : 0,
                              transition: `max-width ${PICKER_TRANSITION_MS}ms ${PICKER_EASE}`,
                            }}
                          >
                            <div
                              ref={pickerContentRef}
                              className="flex items-center"
                              style={{
                                gap: 4,
                                paddingLeft: 16,
                                width: "max-content",
                              }}
                            >
                              {renderPicker === "month" &&
                                (() => {
                                  const trackedMonths =
                                    trackedMonthsByYear[
                                      dateRange.from.getFullYear()
                                    ];
                                  if (
                                    !trackedMonths ||
                                    trackedMonths.size === 0
                                  ) {
                                    return (
                                      <span
                                        style={{
                                          fontSize: 12.5,
                                          color: muted,
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        No tracked months this year
                                      </span>
                                    );
                                  }
                                  return MONTH_ABBR.map((m, i) => {
                                    if (!trackedMonths.has(i)) return null;
                                    const active =
                                      i === dateRange.from.getMonth();
                                    // Today's month is always outlined, so finding it is a glance.
                                    const isCurrentMonth =
                                      i === getNow().getMonth() &&
                                      dateRange.from.getFullYear() ===
                                        getNow().getFullYear();
                                    return (
                                      <button
                                        key={m}
                                        onClick={() => gotoMonth(i)}
                                        className="transition-colors"
                                        style={{
                                          padding: "6px 10px",
                                          borderRadius: 999,
                                          cursor: "pointer",
                                          fontSize: 13,
                                          fontWeight: 700,
                                          whiteSpace: "nowrap",
                                          border:
                                            isCurrentMonth && !active
                                              ? `1.5px solid ${text}`
                                              : "1.5px solid transparent",
                                          color: active ? ACCENT_TEXT : muted,
                                          backgroundColor: active
                                            ? ACCENT
                                            : "rgba(255,255,255,0.05)",
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.backgroundColor =
                                            active
                                              ? ACCENT_DEEP
                                              : `color-mix(in srgb, ${ACCENT} 22%, transparent)`;
                                          if (!active)
                                            e.currentTarget.style.color =
                                              ACCENT;
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.backgroundColor =
                                            active
                                              ? ACCENT
                                              : "rgba(255,255,255,0.05)";
                                          if (!active)
                                            e.currentTarget.style.color = muted;
                                        }}
                                      >
                                        {m}
                                      </button>
                                    );
                                  });
                                })()}
                              {renderPicker === "year" &&
                                (trackedYears.length === 0 ? (
                                  <span
                                    style={{
                                      fontSize: 12.5,
                                      color: muted,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    No tracked years yet
                                  </span>
                                ) : (
                                  trackedYears.map((y) => {
                                    const active =
                                      y === dateRange.from.getFullYear();
                                    const isCurrentYear =
                                      y === getNow().getFullYear();
                                    return (
                                      <button
                                        key={y}
                                        onClick={() => gotoYear(y)}
                                        className="transition-colors"
                                        style={{
                                          padding: "6px 14px",
                                          borderRadius: 999,
                                          cursor: "pointer",
                                          fontSize: 13,
                                          fontWeight: 700,
                                          fontVariantNumeric: "tabular-nums",
                                          whiteSpace: "nowrap",
                                          border:
                                            isCurrentYear && !active
                                              ? `1.5px solid ${text}`
                                              : "1.5px solid transparent",
                                          color: active ? ACCENT_TEXT : muted,
                                          backgroundColor: active
                                            ? ACCENT
                                            : "rgba(255,255,255,0.05)",
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.backgroundColor =
                                            active
                                              ? ACCENT_DEEP
                                              : `color-mix(in srgb, ${ACCENT} 22%, transparent)`;
                                          if (!active)
                                            e.currentTarget.style.color =
                                              ACCENT;
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.backgroundColor =
                                            active
                                              ? ACCENT
                                              : "rgba(255,255,255,0.05)";
                                          if (!active)
                                            e.currentTarget.style.color = muted;
                                        }}
                                      >
                                        {y}
                                      </button>
                                    );
                                  })
                                ))}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleStepMonth(1)}
                          aria-label="Next month"
                          className="rounded-lg cursor-pointer transition-colors"
                          style={{ padding: 6, color: muted }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.color = text)
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.color = muted)
                          }
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <h1
                        className="text-3xl font-bold tracking-tight"
                        style={{ color: text }}
                      >
                        {activePreset === "All"
                          ? "All Time"
                          : (activePreset ?? "Custom Range")}
                      </h1>
                    )}
                  </div>

                  {activeTab !== "ALL" && (
                    <div style={{ flex: 1, minWidth: 0 }} />
                  )}
                </div>

                {loading ? (
                  activeTab === "ALL" ? (
                    <div className="space-y-4">
                      {/* Hero pair: SummaryCard's own px-6 py-6, label over value, with
                  the change badge's slot on the right. */}
                      <div className="grid grid-cols-2 gap-4">
                        {[...Array(2)].map((_, i) => (
                          <div
                            key={i}
                            className="rounded-2xl px-6 py-6"
                            style={{ backgroundColor: surface }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Skel h={20} w="35%" />
                              <Skel h={14} w={42} />
                            </div>
                            <Skel h={44} w="55%" style={{ marginTop: 10 }} />
                          </div>
                        ))}
                      </div>
                      <OverviewPanelSkeleton
                        surface={surface}
                        border={border}
                      />
                    </div>
                  ) : (
                    <OverviewPanelSkeleton surface={surface} border={border} />
                  )
                ) : activeTab === "ALL" ? (
                  <div className="space-y-4">
                    {/* Hero pair */}
                    <div className="grid grid-cols-2 gap-4">
                      <SummaryCard
                        hero
                        label="INCOME"
                        value={fmt(summary.totalIn)}
                        activeColor={HOME_INCOME}
                        valueColor={HOME_INCOME}
                        changePct={summary.totalInDelta}
                        changeGoodWhenUp={true}
                        onClick={() => toggleBreakdown("income")}
                        active={breakdownCell === "income"}
                      />
                      <SummaryCard
                        hero
                        label="EXPENSES"
                        value={fmt(summary.totalOut)}
                        changePct={summary.totalOutDelta}
                        changeGoodWhenUp={false}
                        activeColor={HOME_EXPENSE}
                        valueColor={HOME_EXPENSE}
                        onClick={() => toggleBreakdown("expenses")}
                        active={breakdownCell === "expenses"}
                      />
                    </div>
                    <div
                      className="grid grid-cols-4 rounded-2xl overflow-hidden"
                      style={{ backgroundColor: surface }}
                    >
                      <OverviewColumn
                        first
                        label="CURRENT BALANCE"
                        value={overviewBalance.value}
                        color={overviewBalance.color}
                        caption={overviewBalance.caption}
                        onClick={() => toggleBreakdown("balance")}
                        active={breakdownCell === "balance"}
                      />
                      <OverviewColumn
                        label="UPCOMING BILLS"
                        value={overviewBills.value}
                        color={overviewBills.color}
                        caption={overviewBills.caption}
                        onClick={() => toggleBreakdown("bills")}
                        active={breakdownCell === "bills"}
                      />
                      <OverviewColumn
                        label="AVAILABLE CASH"
                        value={overviewCash.value}
                        color={overviewCash.color}
                        caption={overviewCash.caption}
                        onClick={() => toggleBreakdown("cash")}
                        active={breakdownCell === "cash"}
                      />
                      <OverviewColumn
                        label="ESTIMATED SAVINGS"
                        value={overviewSavings.value}
                        valueNode={
                          overviewSavings.saved != null ? (
                            <StackedFraction
                              num={overviewSavings.saved}
                              den={overviewSavings.estimated}
                              color={overviewSavings.color}
                            />
                          ) : undefined
                        }
                        color={overviewSavings.color}
                        caption={overviewSavings.caption}
                        onClick={() => toggleBreakdown("savings")}
                        active={breakdownCell === "savings"}
                      />
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateRows:
                          breakdownCell && !breakdownClosing ? "1fr" : "0fr",
                        marginTop: breakdownCell && !breakdownClosing ? 16 : 0,
                        marginBottom:
                          breakdownCell && !breakdownClosing ? 24 : 0,
                        transition: `grid-template-rows ${DRAWER_TRANSITION_MS}ms cubic-bezier(0.32,0.72,0,1), margin-top ${DRAWER_TRANSITION_MS}ms cubic-bezier(0.32,0.72,0,1), margin-bottom ${DRAWER_TRANSITION_MS}ms cubic-bezier(0.32,0.72,0,1)`,
                      }}
                    >
                      <div
                        style={{
                          overflow: "hidden",
                          minHeight: 0,
                          position: "relative",
                        }}
                      >
                        {/* Outgoing layer: the previous cell, fading out over the incoming one. */}
                        {outgoingCell && (
                          <div
                            className="rounded-2xl p-5"
                            style={{
                              position: "absolute",
                              inset: 0,
                              backgroundColor: surface,
                              animation: `breakdown-fade-out ${SWITCH_TRANSITION_MS}ms ease forwards`,
                              pointerEvents: "none",
                            }}
                            // The JS timer and the CSS animation don't stay in sync (#128).
                            onAnimationEnd={() => setOutgoingCell(null)}
                          >
                            {renderDrawerBody(outgoingCell)}
                          </div>
                        )}
                        {breakdownCell && (
                          <div
                            key={breakdownCell}
                            className="rounded-2xl p-5"
                            style={{
                              backgroundColor: surface,
                              opacity: breakdownClosing ? 0 : 1,
                              transition: outgoingCell
                                ? "none"
                                : `opacity ${DRAWER_TRANSITION_MS}ms ease`,
                              animation: outgoingCell
                                ? `breakdown-fade-in ${SWITCH_TRANSITION_MS}ms ease forwards`
                                : undefined,
                            }}
                          >
                            {renderDrawerBody(breakdownCell, {
                              showClose: true,
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className="grid grid-cols-4 rounded-2xl overflow-hidden"
                    style={{ backgroundColor: surface }}
                  >
                    <OverviewColumn
                      first
                      label={`${CATEGORY_CONFIG[activeTab].label.toUpperCase()} TOTAL`}
                      value={fmt(summary.categoryTotal)}
                      color={activeColor}
                    />
                    {INCOME_TYPES.has(activeTab) ? (
                      <OverviewColumn
                        label="PAYMENTS"
                        value={String(summary.txCount)}
                        color={activeColor}
                        caption={
                          summary.txCount > 0
                            ? `avg ${fmt(summary.avgTx)} each`
                            : null
                        }
                      />
                    ) : (
                      <OverviewColumn
                        label="AVG TRANSACTION"
                        value={fmt(summary.avgTx)}
                        color={activeColor}
                      />
                    )}
                    <OverviewColumn
                      label="VS LAST MONTH"
                      value={
                        summary.categoryDelta != null
                          ? `${summary.categoryDelta >= 0 ? "+" : ""}${summary.categoryDelta.toFixed(1)}%`
                          : "—"
                      }
                      color={
                        categoryDeltaGood == null
                          ? muted
                          : categoryDeltaGood
                            ? HOME_INCOME
                            : HOME_EXPENSE
                      }
                      caption={
                        summary.categoryDelta != null
                          ? summary.categoryDelta >= 0
                            ? "↑ higher than last month"
                            : "↓ lower than last month"
                          : null
                      }
                    />
                    <OverviewColumn
                      label={
                        INCOME_TYPES.has(activeTab)
                          ? "% OF TOTAL INCOME"
                          : "% OF TOTAL EXPENSES"
                      }
                      value={
                        summary.pctOfTotal != null
                          ? `${summary.pctOfTotal.toFixed(1)}%`
                          : "—"
                      }
                      color={activeColor}
                    />
                  </div>
                )}

                {loading ? (
                  activeTab === "ALL" ? (
                    <div style={{ marginTop: -16 }}>
                      <div
                        className="flex items-center gap-3"
                        style={{ marginBottom: 20 }}
                      >
                        <Skel h={34} w="130px" style={{ borderRadius: 999 }} />
                        <div
                          className="flex items-center justify-center"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          {[...Array(5)].map((_, i) => (
                            <Skel
                              key={i}
                              h={29}
                              w={`${110 + i * 14}px`}
                              style={{ borderRadius: 999 }}
                            />
                          ))}
                        </div>
                        <Skel h={38} w="360px" style={{ borderRadius: 999 }} />
                      </div>
                      <Skel
                        h={TREND_CHART_HEIGHT}
                        style={{ borderRadius: 16 }}
                      />
                    </div>
                  ) : (
                    /* ChartCard's own p-6, a dotted text-xl title with mb-5, and the
               230px chart body it wraps. */
                    <div className="grid grid-cols-2 gap-4">
                      {[...Array(2)].map((_, i) => (
                        <div
                          key={i}
                          className="rounded-2xl p-6"
                          style={{ backgroundColor: surface }}
                        >
                          <div className="flex items-center gap-2">
                            <Skel
                              h={8}
                              w="8px"
                              style={{ borderRadius: 999, flexShrink: 0 }}
                            />
                            <Skel h={28} w="42%" />
                          </div>
                          <Skel
                            h={230}
                            style={{ marginTop: 20, borderRadius: 12 }}
                          />
                        </div>
                      ))}
                    </div>
                  )
                ) : activeTab === "ALL" ? (
                  /* Full-bleed trend */
                  <div style={{ marginTop: -16 }}>
                    <div
                      className="flex items-center gap-3"
                      style={{ marginBottom: 20 }}
                    >
                      <div
                        ref={categoriesPanelRef}
                        style={{ position: "relative", flexShrink: 0 }}
                      >
                        <button
                          onClick={() => setCategoriesOpen((v) => !v)}
                          onMouseEnter={() => setCategoriesHovered(true)}
                          onMouseLeave={() => setCategoriesHovered(false)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 16px",
                            borderRadius: 999,
                            border: "none",
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: 600,
                            color: text,
                            backgroundColor: categoriesOpen
                              ? "rgba(255,255,255,0.09)"
                              : categoriesHovered
                                ? "rgba(255,255,255,0.08)"
                                : "rgba(255,255,255,0.05)",
                            transition: "background-color 150ms ease",
                          }}
                        >
                          Categories
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="15"
                            height="15"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                              transform: categoriesOpen
                                ? "rotate(180deg)"
                                : "none",
                              transition: "transform 150ms ease",
                            }}
                          >
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </button>
                        {categoriesOpen && (
                          <div
                            style={{
                              position: "absolute",
                              top: "calc(100% + 8px)",
                              left: 0,
                              zIndex: 20,
                              width: 230,
                              borderRadius: 14,
                              backgroundColor: HOME_SURFACE,
                              boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
                              padding: 8,
                            }}
                          >
                            {TREND_CATEGORIES.map((cat) => {
                              const on = visibleCategories.has(cat);
                              const color = CATEGORY_ACCENT[cat];
                              return (
                                <button
                                  key={cat}
                                  onClick={() => toggleTrendCategory(cat)}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    width: "100%",
                                    textAlign: "left",
                                    padding: "7px 8px",
                                    borderRadius: 8,
                                    border: "none",
                                    cursor: "pointer",
                                    fontSize: 13,
                                    fontWeight: 500,
                                    color: text,
                                    backgroundColor: "transparent",
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 11,
                                      height: 11,
                                      borderRadius: "50%",
                                      flexShrink: 0,
                                      boxSizing: "border-box",
                                      backgroundColor: on
                                        ? color
                                        : "transparent",
                                      border: `2px solid ${color}`,
                                    }}
                                  />
                                  {CATEGORY_CONFIG[cat].label}
                                </button>
                              );
                            })}
                            <div
                              style={{
                                borderTop: `1px solid ${HOME_DIVIDER}`,
                                marginTop: 6,
                                paddingTop: 8,
                              }}
                            >
                              <button
                                onClick={handleSaveTrendCategories}
                                style={{
                                  width: "100%",
                                  padding: "7px 0",
                                  borderRadius: 8,
                                  border: "none",
                                  cursor: "pointer",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: categoriesSaved
                                    ? HOME_INCOME
                                    : ACCENT_TEXT,
                                  backgroundColor: categoriesSaved
                                    ? `color-mix(in srgb, ${HOME_INCOME} 15%, transparent)`
                                    : ACCENT,
                                  transition:
                                    "background-color 150ms ease, color 150ms ease",
                                }}
                              >
                                {categoriesSaved ? "✓ Saved" : "Save"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Explicit rows of four */}
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {trendLegendRows.map((row, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            {row.map((cat) => (
                              <TrendPill
                                key={cat}
                                label={CATEGORY_CONFIG[cat].label}
                                value={fmt(trendTotals[cat])}
                                color={CATEGORY_ACCENT[cat]}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                      <div
                        ref={trendRangeRef}
                        className="flex items-center gap-1"
                        style={{
                          position: "relative",
                          padding: 2,
                          borderRadius: 999,
                          backgroundColor: "rgba(255,255,255,0.05)",
                          flexShrink: 0,
                        }}
                      >
                        {/* Sliding selection */}
                        {rangeIndicator && (
                          <div
                            aria-hidden="true"
                            style={{
                              position: "absolute",
                              top: 2,
                              bottom: 2,
                              left: rangeIndicator.left,
                              width: rangeIndicator.width,
                              borderRadius: 999,
                              backgroundColor: ACCENT,
                              pointerEvents: "none",
                              transition:
                                "left 280ms cubic-bezier(0.4, 0, 0.2, 1), width 280ms cubic-bezier(0.4, 0, 0.2, 1)",
                            }}
                          />
                        )}
                        {[
                          [1, "1M"],
                          [3, "3M"],
                          [6, "6M"],
                          [12, "1Y"],
                          ["all", "Lifetime"],
                        ].map(([n, label]) => (
                          <button
                            key={n}
                            data-range-active={trendMonths === n}
                            onClick={() => setTrendMonths(n)}
                            onMouseEnter={() => setRangeHovered(n)}
                            onMouseLeave={() => setRangeHovered(null)}
                            style={{
                              position: "relative",
                              zIndex: 1,
                              padding: "8px 16px",
                              borderRadius: 999,
                              border: "none",
                              cursor: "pointer",
                              fontSize: 14,
                              fontWeight: 700,
                              color:
                                trendMonths === n
                                  ? ACCENT_TEXT
                                  : rangeHovered === n
                                    ? ACCENT
                                    : muted,
                              backgroundColor:
                                trendMonths === n
                                  ? "transparent"
                                  : rangeHovered === n
                                    ? `color-mix(in srgb, ${ACCENT} 16%, transparent)`
                                    : "transparent",
                              transition:
                                "color 150ms ease, background-color 150ms ease",
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {visibleCategories.size === 0 ? (
                      <div
                        style={{
                          height: TREND_CHART_HEIGHT,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <p style={{ color: muted, fontSize: 13 }}>
                          No categories selected — pick one from Categories
                          above.
                        </p>
                      </div>
                    ) : trendHasData ? (
                      <div style={{ height: TREND_CHART_HEIGHT }}>
                        <ResponsiveContainer
                          width="100%"
                          height="100%"
                          style={{ pointerEvents: "none" }}
                        >
                          <AreaChart data={trendData}>
                            <defs>
                              {TREND_CATEGORIES.map((cat) => (
                                <linearGradient
                                  key={cat}
                                  id={`trend${cat}Fill`}
                                  x1="0"
                                  y1="0"
                                  x2="0"
                                  y2="1"
                                >
                                  <stop
                                    offset="5%"
                                    stopColor={CATEGORY_ACCENT[cat]}
                                    stopOpacity={0.3}
                                  />
                                  <stop
                                    offset="95%"
                                    stopColor={CATEGORY_ACCENT[cat]}
                                    stopOpacity={0.02}
                                  />
                                </linearGradient>
                              ))}
                            </defs>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                              stroke="rgba(255,255,255,0.06)"
                            />
                            <XAxis
                              dataKey="label"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 12, fill: text }}
                              interval={Math.max(
                                0,
                                Math.ceil(trendData.length / 8) - 1,
                              )}
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(v) => `$${v}`}
                              tick={{ fontSize: 12, fill: text }}
                            />
                            <Tooltip
                              {...tooltipProps}
                              formatter={(v) => fmt(v)}
                            />
                            {visibleTrendCategories.map((cat) => (
                              <Area
                                key={cat}
                                type="linear"
                                dataKey={cat}
                                name={CATEGORY_CONFIG[cat].label}
                                stroke={CATEGORY_ACCENT[cat]}
                                strokeWidth={2}
                                fill={`url(#trend${cat}Fill)`}
                                dot={(props) => {
                                  const { cx, cy, payload, index } = props;
                                  if (!payload[cat])
                                    return (
                                      <circle
                                        key={index}
                                        cx={cx}
                                        cy={cy}
                                        r={0}
                                      />
                                    );
                                  return (
                                    <circle
                                      key={index}
                                      cx={cx}
                                      cy={cy}
                                      r={3.5}
                                      fill={CATEGORY_ACCENT[cat]}
                                      stroke={bg}
                                      strokeWidth={1.5}
                                    />
                                  );
                                }}
                                animationDuration={900}
                                animationEasing="ease-in-out"
                              />
                            ))}
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <Empty />
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <ChartCard
                      title="Spending Over Time"
                      activeColor={activeColor}
                    >
                      {areaData.length > 0 ? (
                        <ResponsiveContainer
                          width="100%"
                          height={230}
                          style={{ pointerEvents: "none" }}
                        >
                          <AreaChart data={areaData}>
                            <defs>
                              <linearGradient
                                id="areaFill"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="5%"
                                  stopColor={activeColor}
                                  stopOpacity={0.3}
                                />
                                <stop
                                  offset="95%"
                                  stopColor={activeColor}
                                  stopOpacity={0.02}
                                />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                              stroke={"rgba(255,255,255,0.06)"}
                            />
                            <XAxis
                              dataKey="date"
                              type="number"
                              scale="time"
                              domain={["dataMin", "dataMax"]}
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 12, fill: text }}
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
                              tick={{ fontSize: 12, fill: text }}
                            />
                            <Tooltip
                              {...tooltipProps}
                              cursor={{
                                stroke: activeColor,
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
                                      style={{
                                        margin: 0,
                                        opacity: 0.7,
                                        fontSize: 12,
                                      }}
                                    >
                                      {new Date(date).toLocaleDateString(
                                        "en-US",
                                        {
                                          month: "short",
                                          day: "numeric",
                                          year: "numeric",
                                        },
                                      )}
                                    </p>
                                    <p style={{ margin: 0, fontWeight: 600 }}>
                                      {fmt(total)}
                                    </p>
                                  </div>
                                );
                              }}
                            />
                            <Area
                              key={activeTab}
                              type="monotone"
                              dataKey="total"
                              stroke={activeColor}
                              strokeWidth={2}
                              fill="url(#areaFill)"
                              dot={{ fill: activeColor, r: 4, strokeWidth: 0 }}
                              activeDot={{ r: 6, strokeWidth: 0 }}
                              isAnimationActive={false}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <Empty />
                      )}
                    </ChartCard>

                    <ChartCard
                      title={`Top ${CATEGORY_CONFIG[activeTab].label} by Name`}
                      activeColor={activeColor}
                    >
                      {barData.length > 0 ? (
                        <ResponsiveContainer
                          width="100%"
                          height={230}
                          style={{ pointerEvents: "none" }}
                        >
                          <BarChart data={barData}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="month"
                              axisLine={false}
                              tickLine={false}
                              interval={0}
                              height={60}
                              tick={(props) => {
                                const val = props.payload?.value ?? "";
                                const label =
                                  val.length > 12
                                    ? val.slice(0, 12) + "…"
                                    : val;
                                return (
                                  <text
                                    x={props.x}
                                    y={props.y}
                                    dy={8}
                                    textAnchor="end"
                                    fontSize={12}
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
                              tick={{ fontSize: 12, fill: text }}
                            />
                            <Tooltip
                              {...tooltipProps}
                              formatter={(v) => fmt(v)}
                              cursor={false}
                            />
                            <Bar
                              dataKey="total"
                              radius={[6, 6, 0, 0]}
                              barSize={32}
                            >
                              {barData.map((entry) => (
                                <Cell key={entry.month} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <Empty />
                      )}
                    </ChartCard>
                  </div>
                )}

                {loading ? (
                  <div
                    className="grid gap-4"
                    style={{ gridTemplateColumns: "2fr 1fr" }}
                  >
                    <div
                      className="rounded-2xl"
                      style={{ backgroundColor: surface }}
                    >
                      {/* Card header */}
                      <div
                        className="px-6 py-4 border-b flex items-center justify-between"
                        style={{ borderColor: border }}
                      >
                        <div className="flex items-center gap-3">
                          <Skel h={28} w="140px" />
                          <Skel h={30} w="176px" style={{ borderRadius: 8 }} />
                        </div>
                        <Skel h={28} w="200px" style={{ borderRadius: 999 }} />
                      </div>
                      {/* thead */}
                      <div
                        className="px-6 py-3 border-b flex items-center gap-6"
                        style={{ borderColor: border }}
                      >
                        <Skel h={24} style={{ flex: 1 }} />
                        <Skel h={24} w="90px" />
                        <Skel h={24} w="110px" />
                        <Skel h={24} w="40px" />
                      </div>
                      {/* rows */}
                      {[...Array(10)].map((_, i) => (
                        <div
                          key={i}
                          className="px-6 py-4 border-t flex items-center gap-6"
                          style={{ borderColor: border }}
                        >
                          <div
                            className="flex items-center gap-3"
                            style={{ flex: 1 }}
                          >
                            <Skel
                              h={9}
                              w="9px"
                              style={{ borderRadius: 999, flexShrink: 0 }}
                            />
                            <Skel h={28} style={{ flex: 1 }} />
                          </div>
                          <Skel h={24} w="90px" />
                          <Skel h={20} w="110px" />
                          <Skel h={20} w="40px" />
                        </div>
                      ))}
                    </div>
                    {/* Side panel */}
                    <div
                      className="rounded-2xl"
                      style={{ backgroundColor: surface }}
                    >
                      <div
                        className="px-6 py-4 border-b flex items-center gap-3"
                        style={{ borderColor: border }}
                      >
                        <Skel
                          h={9}
                          w="9px"
                          style={{ borderRadius: 999, flexShrink: 0 }}
                        />
                        <Skel h={28} w="120px" />
                      </div>
                      <div
                        className="flex items-center justify-center"
                        style={{
                          padding: "16px",
                          borderBottom: `1px solid ${border}`,
                        }}
                      >
                        <Skel h={180} w={180} style={{ borderRadius: "50%" }} />
                      </div>
                      {[...Array(8)].map((_, i) => (
                        <div
                          key={i}
                          className="px-6 flex items-center gap-4"
                          style={{
                            paddingTop: 13,
                            paddingBottom: 13,
                            borderTop: i === 0 ? "none" : `1px solid ${border}`,
                          }}
                        >
                          <Skel
                            h={9}
                            w="9px"
                            style={{ borderRadius: 999, flexShrink: 0 }}
                          />
                          <Skel h={24} style={{ flex: 1 }} />
                          <Skel h={28} w="72px" />
                          <Skel h={24} w="84px" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    className="grid gap-4"
                    style={{ gridTemplateColumns: "2fr 1fr" }}
                  >
                    <div ref={tableRef}>
                      {activeTab === "TIPS" ? (
                        <TipsTransactionsCard
                          tipsRows={paginated}
                          tipsTotal={sorted.length}
                          depositRows={paginatedDeposits}
                          page={page}
                          perPage={perPage}
                          onPageChange={setPage}
                          onPerPageChange={setPerPage}
                          query={tableQuery}
                          onQueryChange={setTableQuery}
                          onEditTransaction={(t) => {
                            setEditingTransaction(t);
                            setEditingFromSearch(false);
                          }}
                          onDeleteTransaction={handleDelete}
                          onSaved={refreshTransactions}
                          activeColor={activeColor}
                        />
                      ) : (
                        <TransactionTable
                          rows={paginated}
                          page={page}
                          perPage={perPage}
                          total={sorted.length}
                          onPageChange={setPage}
                          onPerPageChange={setPerPage}
                          onEdit={(t) => {
                            setEditingTransaction(t);
                            setEditingFromSearch(false);
                          }}
                          onDelete={handleDelete}
                          activeColor={activeColor}
                          highlightId={highlightId}
                          sortColumn={sortColumn}
                          sortDir={sortDir}
                          onSort={handleSort}
                          query={tableQuery}
                          onQueryChange={setTableQuery}
                        />
                      )}
                    </div>
                    {activeTab === "ALL" ? (
                      <CategoryTrendPanel
                        transactions={transactions}
                        dateRange={dateRange}
                      />
                    ) : (
                      // Self-hides when the category has nothing scheduled (#127).
                      <div className="space-y-4">
                        <CategoryUpcomingPanel
                          category={activeTab}
                          onRefresh={refreshTransactions}
                        />
                        <CategoryDetailPanel
                          category={activeTab}
                          transactions={transactions}
                          dateRange={dateRange}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </main>
          )}
          <Footer />
        </div>
      </div>

      {devMenuOpen && !isDemo() && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 9999,
            width: 280,
            borderRadius: 14,
            backgroundColor: surface,
            border: `1px solid ${border}`,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            maxHeight: "80vh",
          }}
        >
          <div
            style={{
              padding: "10px 14px 9px",
              borderBottom: `1px solid ${border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: HOME_EXPENSE,
              }}
            >
              DEV TOOLS
            </span>
            <button
              onClick={() => setDevMenuOpen(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: muted,
                display: "flex",
                padding: 2,
              }}
            >
              <svg
                width="13"
                height="13"
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
          <div style={{ overflowY: "auto", padding: "6px 0 10px" }}>
            <DevMenuSection
              label="LOADING & STATE"
              border={border}
              muted={muted}
            />
            <DevMenuRow
              label="Skeletons"
              active={loading}
              onToggle={() => setLoading((v) => !v)}
              muted={muted}
              text={text}
              border={border}
            />
            <DevMenuRow
              label="Force empty"
              active={devForceEmpty}
              onToggle={() => setDevForceEmpty((v) => !v)}
              muted={muted}
              text={text}
              border={border}
            />
            <DevMenuRow
              label="Force next error"
              active={devForceError}
              onToggle={() => {
                const next = !devForceError;
                setDevForceError(next);
                devForceErrorRef.current = next;
              }}
              muted={muted}
              text={text}
              border={border}
            />
            <DevMenuButton
              label="Re-fetch"
              description="Reload transactions"
              onClick={() => {
                setLoading(true);
                refreshTransactions();
                setTimeout(() => setLoading(false), devDelay + 200);
              }}
              muted={muted}
              text={text}
              border={border}
            />

            <DevMenuSection label="NETWORK" border={border} muted={muted} />
            <div
              style={{
                padding: "4px 14px 6px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 11, color: muted }}>Slow network</span>
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 500, 2000, 5000].map((ms) => (
                  <button
                    key={ms}
                    onClick={() => setDevDelay(ms)}
                    style={{
                      flex: 1,
                      padding: "3px 0",
                      borderRadius: 6,
                      border: `1px solid ${devDelay === ms ? HOME_EXPENSE : border}`,
                      backgroundColor:
                        devDelay === ms
                          ? `color-mix(in srgb, ${HOME_EXPENSE} 12%, transparent)`
                          : "transparent",
                      color: devDelay === ms ? HOME_EXPENSE : muted,
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {ms === 0 ? "Off" : ms < 1000 ? `${ms}ms` : `${ms / 1000}s`}
                  </button>
                ))}
              </div>
            </div>

            <DevMenuSection label="DATA" border={border} muted={muted} />
            <DevMenuInfo
              label="Transactions"
              value={transactions.length}
              muted={muted}
              text={text}
            />
            <DevMenuInfo
              label="Last fetch"
              value={devLastFetch ? devLastFetch.toLocaleTimeString() : "—"}
              muted={muted}
              text={text}
            />
            <DevMenuInfo
              label="Date range"
              value={
                dateRange.from
                  ? `${dateRange.from.toLocaleDateString("en-US", { month: "short", day: "numeric" })} → ${dateRange.to?.toLocaleDateString("en-US", { month: "short", day: "numeric" }) ?? "…"}`
                  : "All time"
              }
              muted={muted}
              text={text}
            />
            <DevMenuInfo
              label="Active tab"
              value={activeTab}
              muted={muted}
              text={text}
            />
            <DevMenuInfo
              label="Sort"
              value={`${sortColumn} ${sortDir}`}
              muted={muted}
              text={text}
            />

            <DevMenuSection label="SESSION" border={border} muted={muted} />
            <DevMenuInfo
              label="Token expiry"
              value={(() => {
                try {
                  const t = localStorage.getItem("token");
                  if (!t) return "None";
                  const p = JSON.parse(atob(t.split(".")[1]));
                  return p.exp
                    ? new Date(p.exp * 1000).toLocaleString()
                    : "No exp";
                } catch {
                  return "Invalid";
                }
              })()}
              muted={muted}
              text={text}
            />
            <DevMenuButton
              label="Clear localStorage"
              description="Wipes all local data + reloads"
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              muted={muted}
              text={HOME_EXPENSE}
              border={border}
              danger
            />
          </div>
        </div>
      )}

      {isDemo() && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            left: "24px",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            gap: "7px",
            padding: "6px 12px",
            borderRadius: "8px",
            border: "1px solid rgba(251,191,36,0.2)",
            backgroundColor: "rgba(251,191,36,0.08)",
            backdropFilter: "blur(8px)",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: "#fbbf24",
              flexShrink: 0,
              animation: "demo-pulse 1.8s ease-in-out infinite",
            }}
          />
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.04em",
              color: "rgba(251,191,36,0.7)",
              whiteSpace: "nowrap",
            }}
          >
            Demo · Not live data
          </span>
        </div>
      )}

      {editingTransaction && (
        editingTransaction.credit_card_payment_id ? (
          <CreditCardPaymentPanel
            key={editingTransaction.id}
            desktop
            paymentId={editingTransaction.credit_card_payment_id}
            onClose={() => {
              setEditingTransaction(null);
              setEditingFromSearch(false);
            }}
            onChanged={refreshTransactions}
          />
        ) : (
          <EditTransactionModal
            // Keyed by id, or switching rows keeps the previous form values (#81).
            key={editingTransaction.id}
            transaction={editingTransaction}
            onClose={() => {
              setEditingTransaction(null);
              setEditingFromSearch(false);
            }}
            onSaved={() => {
              setEditingTransaction(null);
              setEditingFromSearch(false);
              refreshTransactions();
            }}
            onDelete={handleDelete}
            onLocate={editingFromSearch ? handleLocateTransaction : undefined}
          />
        )
      )}
    </div>
  );
}

function DevMenuSection({ label, border, muted }) {
  return (
    <div
      style={{
        padding: "8px 14px 4px",
        borderTop: `1px solid ${border}`,
        marginTop: 4,
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: muted,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function DevMenuInfo({ label, value, muted, text }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "4px 14px",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 12, color: muted }}>{label}</span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: text,
          fontFamily: "monospace",
          textAlign: "right",
          maxWidth: 140,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function DevMenuButton({
  label,
  description,
  onClick,
  muted,
  text,
  border,
  danger,
}) {
  return (
    <div style={{ padding: "3px 14px" }}>
      <button
        onClick={onClick}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "5px 8px",
          borderRadius: 8,
          border: `1px solid ${border}`,
          background: "transparent",
          cursor: "pointer",
          transition: "background-color 150ms ease",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = danger
            ? `color-mix(in srgb, ${HOME_EXPENSE} 8%, transparent)`
            : `color-mix(in srgb, ${text} 6%, transparent)`)
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = "transparent")
        }
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: danger ? HOME_EXPENSE : text,
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 10, color: muted }}>{description}</span>
      </button>
    </div>
  );
}

function DevMenuRow({ label, active, onToggle, muted, text, border }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 14px",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 500, color: text }}>
        {label}
      </span>
      <button
        onClick={onToggle}
        style={{
          width: 38,
          height: 22,
          borderRadius: 999,
          border: "none",
          cursor: "pointer",
          flexShrink: 0,
          backgroundColor: active
            ? HOME_INCOME
            : `color-mix(in srgb, ${text} 18%, transparent)`,
          position: "relative",
          transition: "background-color 180ms ease",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 3,
            left: active ? "calc(100% - 19px)" : 3,
            width: 16,
            height: 16,
            borderRadius: "50%",
            backgroundColor: "#fff",
            transition: "left 180ms ease",
            boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
          }}
        />
      </button>
    </div>
  );
}

function Empty() {
  return (
    <div
      className="h-70 flex items-center justify-center text-base"
      style={{ color: HOME_TEXT }}
    >
      No data yet
    </div>
  );
}
