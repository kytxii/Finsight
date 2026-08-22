import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HOME_BG, HOME_SURFACE, HOME_DIVIDER, HOME_TEXT, HOME_MUTED, HOME_INCOME, HOME_EXPENSE, ACCENT, ACCENT_TEXT, CATEGORY_ACCENT, CATEGORY_ICON } from "../components/categoryVisuals";
import Skel from "../components/Skel";
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
import { getTransactions, createTransaction, deleteTransaction } from "../api/transactions";
import { deleteRecurringPayment } from "../api/recurringPayments";
import { getSpendableSurplus, getEstimatedSavings } from "../api/paychecks";
import CurrencyInput from "../components/CurrencyInput";
import {
  CATEGORIES,
  CATEGORY_CONFIG,
  INCOME_TYPES,
  fmt,
  fmtWhole,
  lockedNameFor,
} from "../utils/finance";
import { getNow, getToday } from "../utils/time";
import Navbar from "../components/Navbar";
import BatchAddPanel from "../components/BatchAddPanel";
import ImportPanel from "../components/ImportPanel";
import PaychecksPanel from "../components/PaychecksPanel";
import RecurringPaymentsModal from "../components/RecurringPaymentsModal";
import InstallmentsPanel from "../components/InstallmentsPanel";
import SummaryCard from "../components/SummaryCard";
import ChartCard from "../components/ChartCard";
import TransactionTable from "../components/TransactionTable";
import EditTransactionModal from "../components/EditTransactionModal";
import { BalanceBody, BillsBody, CashBody, SavingsBody } from "../components/OverviewBreakdownSheet";
import Footer from "../components/Footer";

// True when `range` is exactly one calendar month (the shape both
// "Current Month"/"Last Month" presets and the month-stepper produce) -
// drives whether the page header shows a month title with prev/next arrows
// or a plain preset label.
function isSingleMonthRange(range) {
  if (!range.from || !range.to) return false;
  const { from, to } = range;
  if (from.getDate() !== 1 || from.getHours() !== 0) return false;
  const expectedTo = new Date(from.getFullYear(), from.getMonth() + 1, 0, 23, 59, 59, 999);
  return to.getFullYear() === expectedTo.getFullYear()
    && to.getMonth() === expectedTo.getMonth()
    && to.getDate() === expectedTo.getDate();
}

// "All" isn't a real category, so it has no entry in CATEGORY_ICON - same
// four-square glyph the sidebar's own Batch mode button already uses.
function IconAllTile() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

// Sidebar Tools icon - the exact tile mobile uses: #c7c7cc glyph on a fixed
// #2a2a2e dark-grey square (MobileHome.jsx's IconGray + its icon-tile div),
// dropped into the desktop button as-is rather than recolored to track the
// button's own muted/active state.
function IconToolTile({ children }) {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: "#2a2a2e",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c7c7cc" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </div>
  );
}

// A floating stat chip for the borderless trend section - a subtle glass
// tint is enough to read as "a card" without the section itself needing a
// background of its own.
function TrendPill({ label, value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: HOME_MUTED }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: HOME_TEXT, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function monthYearLabel(date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// Neither PRESETS nor getPresetRange generalize past "this month" / "last
// month relative to today" - the arrows need to walk to an arbitrary month
// relative to whatever's currently showing, so this steps off `range.from`
// instead of `now`.
function stepMonth(range, dir) {
  const anchor = range.from ?? getNow();
  const from = new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1, 0, 0, 0, 0);
  const to = new Date(anchor.getFullYear(), anchor.getMonth() + dir + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

// Real categories only - "ALL" isn't a per-line series, it's the tab that
// gets you to this chart in the first place.
const TREND_CATEGORIES = CATEGORIES.filter((c) => c !== "ALL");
// Target point count for the full-bleed trend chart's day buckets - stays
// daily up to ~45 days (covers every 1M view, even a 31-day month) and
// widens the bucket for longer ranges so the chart doesn't get noisier as
// the window grows.
const TREND_TARGET_POINTS = 45;
// Scales with viewport height instead of a fixed 560px, which looked right
// on the screen it was tuned on but way oversized on shorter displays (a
// 1366x768 laptop, a browser window that isn't maximized) - 45vh keeps it
// proportionate, clamped so it's never too cramped or too dominant.
const TREND_CHART_HEIGHT = "clamp(320px, 45vh, 560px)";

// Titles for the shared overview-card drawer (brainstorm option 2) - matches
// OverviewBreakdownSheet's own TITLES copy, kept local since that file can
// only export components (react-refresh/only-export-components).
const OVERVIEW_DRAWER_TITLES = {
  balance: "Current Balance",
  bills: "Upcoming Bills",
  cash: "Available Cash",
  savings: "Estimated Savings",
};
// Sidebar Tools (Paychecks/Recurring Payments/Installments) - main-content
// takeover page titles.
const TOOL_TITLES = {
  paychecks: "Paychecks",
  recurring: "Recurring Payments",
  installments: "Installments",
};
const TOOL_TRANSITION_MS = 280;
const DRAWER_TRANSITION_MS = 380;
// Shorter than DRAWER_TRANSITION_MS on purpose - swapping content in an
// already-open drawer only needs a quick crossfade (the drawer itself isn't
// moving), not the full open/close duration.
const SWITCH_TRANSITION_MS = 180;
const TREND_CATEGORIES_KEY = "dashboardTrendCategories";
const DEFAULT_TREND_CATEGORIES = ["INCOME", "EXPENSE"];

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
  const [loading, setLoading] = useState(true);
  const [safeToSpend, setSafeToSpend] = useState(null);
  const [safeToSpendStatus, setSafeToSpendStatus] = useState("loading"); // loading | ok | no-balance | no-schedule | error
  const [savings, setSavings] = useState(null);
  const [savingsStatus, setSavingsStatus] = useState("loading"); // loading | ok | no-schedule | no-amounts | no-history | error
  const [breakdownCell, setBreakdownCell] = useState(null); // null | balance | bills | cash | savings
  // Staged close: content (and the active-card ring) stays put while the
  // drawer fades/slides out, then unmounts once the transition finishes -
  // otherwise it would just vanish instantly instead of animating closed.
  const [breakdownClosing, setBreakdownClosing] = useState(false);
  // Switching from one already-open card to a different one: breakdownCell
  // moves to the new cell immediately, and the *previous* cell's key sits
  // here just long enough to render as a second, absolutely-positioned layer
  // fading out while the new content (a fresh key={breakdownCell} mount)
  // fades in on top of it - a real crossfade, not a fade-to-blank-then-back.
  const [outgoingCell, setOutgoingCell] = useState(null);
  const outgoingTimer = useRef(null);
  const breakdownCloseTimer = useRef(null);
  const [devMenuOpen, setDevMenuOpen] = useState(false);
  const [devForceEmpty, setDevForceEmpty] = useState(false);
  const [devDelay, setDevDelay] = useState(0);
  const [devForceError, setDevForceError] = useState(false);
  const [devLastFetch, setDevLastFetch] = useState(null);
  const devForceErrorRef = useRef(false);
  const [activeTab, setActiveTab] = useState("ALL");
  const [trendMonths, setTrendMonths] = useState(1); // 1 | 3 | 6 | 12 | "all" - full-bleed trend chart's own window
  const [visibleCategories, setVisibleCategories] = useState(() => loadTrendCategories());
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categoriesSaved, setCategoriesSaved] = useState(false);
  const categoriesPanelRef = useRef(null);
  const [addMode, setAddMode] = useState(null); // null | "menu" | "single" | "batch" | "import"
  const addOpen = addMode !== null;
  const addToday = getToday();
  const [addForm, setAddForm] = useState({ name: "", amount: "", category: "EXPENSE", transaction_date: addToday, note: "" });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [batchSaveState, setBatchSaveState] = useState({ isDirty: false, isSaving: false, saveStatus: "idle", onSave: null });
  const [importSaveState, setImportSaveState] = useState({ isDirty: false, isSaving: false, saveStatus: "idle", validCount: 0, onSave: null });
  // Sidebar tools (replaces the old PERIOD section) - Paychecks/Recurring/
  // Installments take over the main content pane instead of opening
  // Navbar's separate drawer or ballooning the sidebar. Mutually exclusive
  // with addMode - opening one closes the other.
  const [toolMode, setToolMode] = useState(null); // null | "paychecks" | "recurring" | "installments"
  // Staged close so the page can slide back out instead of just vanishing -
  // toolMode stays set (still rendering the same page) through the slide,
  // and only clears once the transition finishes. Switching directly from
  // one tool to another (not via close) skips this - it's a swap, not an
  // exit, so it doesn't need the slide.
  const [toolClosing, setToolClosing] = useState(false);
  const toolCloseTimer = useRef(null);
  // Which tools have ever been opened this session - gates lazy-mounting
  // each panel (no reason to fetch Paychecks/Recurring/Installments data
  // before the user asks for it), but once a tool's in here it stays
  // mounted for the rest of the session so closing/reopening never refetches.
  const [openedTools, setOpenedTools] = useState(new Set());
  const [recurringSaveState, setRecurringSaveState] = useState({ isDirty: false, isSaving: false, saveStatus: "idle", onSave: null });
  // Same "bump a counter, child watches it" signal MobileDashboard already
  // uses for its own Recurring/Installments "+" buttons - the add UI lives
  // inside each panel (a new draft card, a form), not here, so this is just
  // how the page-level header button reaches in and triggers it.
  const [recurringAddSignal, setRecurringAddSignal] = useState(0);
  const [installmentsAddSignal, setInstallmentsAddSignal] = useState(0);
  function openTool(mode) {
    clearTimeout(toolCloseTimer.current);
    setToolClosing(false);
    setToolMode(mode);
    setOpenedTools(prev => prev.has(mode) ? prev : new Set(prev).add(mode));
    setAddMode(null);
  }
  function closeTool() {
    clearTimeout(toolCloseTimer.current);
    setToolClosing(true);
    toolCloseTimer.current = setTimeout(() => {
      setToolMode(null);
      setToolClosing(false);
    }, TOOL_TRANSITION_MS);
  }
  function openAddMode(mode) { setAddMode(mode); closeTool(); }
  const [editingTransaction, setEditingTransaction] = useState(null);
  // Tracks whether the detail modal was opened from a search result (in
  // which case it offers a Locate action) vs. from the table's own edit
  // pencil (where the row is already in view, so Locate would be a no-op).
  const [editingFromSearch, setEditingFromSearch] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [typeFilter, setTypeFilter] = useState(null);
  const [sortColumn, setSortColumn] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  function handleSort(col) {
    if (col === "date") {
      if (sortColumn === "date") setSortDir(d => d === "asc" ? "desc" : "asc");
      else { setSortColumn("date"); setSortDir("desc"); }
    } else {
      if (sortColumn !== col) { setSortColumn(col); setSortDir("asc"); }
      else if (sortDir === "asc") setSortDir("desc");
      else { setSortColumn("date"); setSortDir("desc"); }
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

  function handleAddChange(e) {
    const { name, value } = e.target;
    setAddForm(f => ({ ...f, [name]: value, ...(name === "category" && lockedNameFor(value) ? { name: lockedNameFor(value) } : {}) }));
  }

  async function handleAddSubmit(e) {
    e.preventDefault();
    setAddError("");
    setAddLoading(true);
    try {
      await createTransaction({ ...addForm, amount: parseFloat(addForm.amount) });
      setAddForm({ name: "", amount: "", category: "EXPENSE", transaction_date: addToday, note: "" });
      setAddMode(null);
      refreshTransactions();
    } catch (err) {
      setAddError(err.response?.data?.detail ?? "Something went wrong");
    } finally {
      setAddLoading(false);
    }
  }

  const tableRef = useRef(null);
  const addFormRef = useRef(null);
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

  async function devFetch() {
    if (devForceErrorRef.current) {
      devForceErrorRef.current = false;
      setDevForceError(false);
      throw new Error("Forced error");
    }
    if (devDelay > 0) await new Promise(r => setTimeout(r, devDelay));
    return getTransactions();
  }

  useEffect(() => {
    devFetch().then((res) => {
      setTransactions(res.data);
      setLoading(false);
      setDevLastFetch(new Date());
    }).catch(() => { setLoading(false); });
  }, []);

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

  useEffect(() => { loadSafeToSpend(); loadSavings(); }, []);
  useEffect(() => () => { clearTimeout(breakdownCloseTimer.current); clearTimeout(outgoingTimer.current); clearTimeout(toolCloseTimer.current); }, []);

  function refreshTransactions() {
    devFetch().then((res) => {
      setTransactions(res.data);
      setDevLastFetch(new Date());
    }).catch(() => {});
    loadSafeToSpend();
    loadSavings();
  }

  async function handleDelete(t) {
    if (t.recurring_payment_id) {
      // Stop future recurrences too, but only remove the transaction actually
      // clicked - recurring payment deletion now deactivates (preserves history).
      await Promise.all([deleteRecurringPayment(t.recurring_payment_id), deleteTransaction(t.id)]);
      setTransactions((prev) => prev.filter((tx) => tx.id !== t.id));
    } else {
      await deleteTransaction(t.id);
      setTransactions((prev) => prev.filter((tx) => tx.id !== t.id));
    }
  }

  // Selecting a search result opens the transaction detail modal (#81)
  // instead of scrolling the table into view.
  const handleSelectTransaction = useCallback((t) => {
    setEditingTransaction(t);
    setEditingFromSearch(true);
  }, []);

  // The old scroll-to-row-and-highlight behavior isn't gone, it's now the
  // modal's "Locate" action — closes the modal, then jumps to the row in
  // the table the same way search-select used to do automatically.
  const handleLocateTransaction = useCallback(
    (t) => {
      setEditingTransaction(null);
      setEditingFromSearch(false);
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

  const summary = useMemo(() => {
    const totalIn = filtered
      .filter((t) => INCOME_TYPES.has(t.category))
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const totalOut = filtered
      .filter((t) => !INCOME_TYPES.has(t.category))
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const savingsRate =
      totalIn > 0 ? ((totalIn - totalOut) / totalIn) * 100 : null;

    // Previous period savings rate delta, plus the same "vs. last period"
    // percent change for the hero Income/Expenses cards themselves (mirrors
    // MobileHome's ChangeBadge - up is only "good" for Income).
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
      const prevIn = prevFiltered
        .filter((t) => INCOME_TYPES.has(t.category))
        .reduce((s, t) => s + parseFloat(t.amount), 0);
      const prevOut = prevFiltered
        .filter((t) => !INCOME_TYPES.has(t.category))
        .reduce((s, t) => s + parseFloat(t.amount), 0);
      if (prevIn > 0 && savingsRate !== null) {
        savingsRateDelta = savingsRate - ((prevIn - prevOut) / prevIn) * 100;
      }
      if (prevIn > 0) totalInDelta = ((totalIn - prevIn) / prevIn) * 100;
      if (prevOut > 0) totalOutDelta = ((totalOut - prevOut) / prevOut) * 100;
    }

    // Category-specific metrics (non-ALL tabs)
    const categoryTotal = totalIn + totalOut;
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
  }, [filtered, transactions, activeTab, dateRange]);

  // Full-bleed ALL-tab trend chart - deliberately reads from `transactions`
  // (everything fetched), not `filtered`, so it's an independent macro view
  // rather than reacting to the page's own category tab / month navigator.
  // Anchored to today, not to whatever month the header is currently on.
  // One field per real category (not just income/expense) so any subset can
  // be toggled on as its own line via the Categories panel.
  //
  // Bucketed by day (never by calendar month - that made "1M" collapse to a
  // single point, nothing for a line to connect), but the bucket *width*
  // scales with the range so the chart stays around TREND_TARGET_POINTS
  // points regardless of span. Daily buckets at 1M (the case that needed
  // fixing - a bucket per day means Income's 2 paychecks show as 2 visible
  // dots, and every empty day is already 0 so the line starts/ends at the
  // axis without synthetic anchor points), widening to multi-day buckets by
  // 6M/1Y/Lifetime - otherwise a dense category like Expenses turns into a
  // jittery single-day sawtooth, and a sparse spike (paycheck in, $0 around
  // it) reads as a near-vertical needle once a year's worth of days get
  // squeezed into the same chart width.
  const trendData = useMemo(() => {
    const now = getNow();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let start;
    if (trendMonths === "all") {
      start = transactions.length === 0
        ? today
        : transactions.reduce((min, t) => {
            const d = new Date(t.transaction_date + "T00:00:00");
            return d < min ? d : min;
          }, new Date(transactions[0].transaction_date + "T00:00:00"));
    } else {
      start = new Date(today.getFullYear(), today.getMonth() - trendMonths + 1, 1);
    }
    const showYear = start.getFullYear() !== today.getFullYear();
    const dayCount = Math.max(1, Math.round((today - start) / 86400000) + 1);
    const bucketDays = Math.max(1, Math.ceil(dayCount / TREND_TARGET_POINTS));
    const bucketCount = Math.ceil(dayCount / bucketDays);
    const fmtOpts = showYear ? { month: "short", day: "numeric", year: "2-digit" } : { month: "short", day: "numeric" };

    const buckets = Array.from({ length: bucketCount }, (_, i) => {
      const bucketStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i * bucketDays);
      const bucket = { label: bucketStart.toLocaleDateString("en-US", fmtOpts) };
      TREND_CATEGORIES.forEach((cat) => { bucket[cat] = 0; });
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
      TREND_CATEGORIES.forEach((cat) => { rounded[cat] = parseFloat((b[cat] ?? 0).toFixed(2)); });
      return rounded;
    });
  }, [transactions, trendMonths]);

  const trendTotals = useMemo(() => {
    const totals = {};
    TREND_CATEGORIES.forEach((cat) => { totals[cat] = 0; });
    trendData.forEach((d) => { TREND_CATEGORIES.forEach((cat) => { totals[cat] += d[cat]; }); });
    return totals;
  }, [trendData]);

  const trendHasData = useMemo(
    () => trendData.some((d) => TREND_CATEGORIES.some((cat) => d[cat] > 0)),
    [trendData],
  );

  // Top merchants by name, category-tab view only - the ALL-tab monthly
  // income/expense shape this used to also produce moved to `trendData`
  // above (the full-bleed trend chart), which reads unfiltered transactions
  // instead of the page's current filter/tab.
  const barData = useMemo(() => {
    if (activeTab === "ALL") return [];
    const grouped = {};
    filtered.forEach((t) => {
      grouped[t.name] = (grouped[t.name] ?? 0) + parseFloat(t.amount);
    });
    const entries = Object.entries(grouped)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
    const START = 100, END = 30;
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
    if (typeFilter === "income") arr = arr.filter(t => INCOME_TYPES.has(t.category));
    else if (typeFilter === "expense") arr = arr.filter(t => !INCOME_TYPES.has(t.category));
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortColumn === "name")   return arr.sort((a, b) => dir * a.name.localeCompare(b.name));
    if (sortColumn === "amount") return arr.sort((a, b) => dir * (parseFloat(a.amount) - parseFloat(b.amount)));
    if (sortColumn === "date")   return arr.sort((a, b) => dir * (new Date(a.transaction_date) - new Date(b.transaction_date)));
    return arr.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
  }, [filtered, typeFilter, sortColumn, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const paginated = sorted.slice((page - 1) * perPage, page * perPage);

  useEffect(() => {
    setPage(1);
  }, [filtered, perPage, typeFilter, sortColumn, sortDir]);

  useEffect(() => {
    if (!addOpen || addMode === "batch" || addMode === "import") return;
    function handleOutsideClick(e) {
      if (addFormRef.current && !addFormRef.current.contains(e.target)) {
        setAddMode(null);
        setAddError("");
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [addOpen, addMode]);

  useEffect(() => {
    if (!categoriesOpen) return;
    function handleOutsideClick(e) {
      if (categoriesPanelRef.current && !categoriesPanelRef.current.contains(e.target)) {
        setCategoriesOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [categoriesOpen]);

  // Toggling previews on the chart immediately; Save just persists that
  // selection to localStorage so it's remembered next visit.
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
    localStorage.setItem(TREND_CATEGORIES_KEY, JSON.stringify([...visibleCategories]));
    setCategoriesSaved(true);
    setTimeout(() => setCategoriesSaved(false), 2000);
  }

  const activeColor = CATEGORY_ACCENT[activeTab];
  const catColor = CATEGORY_ACCENT[addForm.category];
  const text    = HOME_TEXT;
  const muted   = HOME_MUTED;
  const bg      = HOME_BG;
  const border  = HOME_DIVIDER;
  const surface = HOME_SURFACE;

  // Overview fields (Current Balance / Upcoming Bills / Available Cash /
  // Estimated Savings) - same field semantics and copy as mobile's
  // MobileHome.jsx OverviewCard, reading from the same safeToSpend/savings
  // fetches desktop already makes. free_to_allocate (not spendable_surplus)
  // for Available Cash - it's already net of the spending reserve.
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
      value: parseFloat(safeToSpend.bills_before_next_payday) > 0 ? `-${fmt(safeToSpend.bills_before_next_payday)}` : fmt(safeToSpend.bills_before_next_payday),
      color: CATEGORY_ACCENT.BILL,
      caption: billCount > 0 ? `${billCount} bill${billCount !== 1 ? "s" : ""} due` : "No bills due",
    };
  } else if (safeToSpendStatus === "loading") {
    overviewBalance = { value: "—", color: muted };
    overviewCash = { value: "—", color: muted };
    overviewBills = { value: "—", color: muted };
  } else {
    const prompt = safeToSpendStatus === "no-balance"
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
    overviewSavings = {
      value: `${fmtWhole(savings.saved_so_far)} / ${fmtWhole(savings.estimated_savings)}`,
      color: CATEGORY_ACCENT.SAVINGS,
    };
  } else if (savingsStatus === "loading") {
    overviewSavings = { value: "—", color: muted };
  } else if (savingsStatus === "no-history") {
    overviewSavings = { value: "—", color: muted, caption: "Needs 3 months of history" };
  } else {
    overviewSavings = { value: "—", color: muted, caption: "Add a paycheck amount" };
  }

  // Clicking the already-open card (or its own cell again) closes it;
  // clicking a different card while one is already open crossfades to the
  // new content (both the old and new content visible/animating at once -
  // see outgoingCell above) instead of snapping instantly or doing a full
  // close/reopen; clicking from fully-closed just opens.
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
      outgoingTimer.current = setTimeout(() => setOutgoingCell(null), SWITCH_TRANSITION_MS);
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

  // Same color as whichever overview card a cell belongs to - ties the
  // drawer back to the card that opened it via a matching dot next to the
  // title (brainstorm option 3), regardless of grid breakpoint/reflow. A
  // function (not a single lookup) because the crossfade below renders two
  // cells' worth of content at once - the incoming one and the outgoing one.
  function drawerColorFor(cell) {
    return {
      balance: overviewBalance.color,
      bills: overviewBills.color,
      cash: overviewCash.color,
      savings: overviewSavings.color,
    }[cell];
  }

  // The drawer's title+body for a given cell - shared between the current
  // (incoming) layer and the outgoing one fading out beneath it during a
  // switch, so both render identically apart from which cell they show.
  function renderDrawerBody(cell, { showClose = false } = {}) {
    return (
      <>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, color: text, margin: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: drawerColorFor(cell), flexShrink: 0 }} />
            {OVERVIEW_DRAWER_TITLES[cell]}
          </h3>
          {showClose && (
            <button
              onClick={closeBreakdown}
              aria-label="Close"
              style={{ background: "none", border: "none", cursor: "pointer", color: muted, display: "flex", padding: 2 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {cell === "balance" && <BalanceBody safeToSpend={safeToSpend} status={safeToSpendStatus} />}
        {cell === "bills" && <BillsBody safeToSpend={safeToSpend} status={safeToSpendStatus} />}
        {cell === "cash" && <CashBody safeToSpend={safeToSpend} status={safeToSpendStatus} />}
        {cell === "savings" && <SavingsBody savings={savings} status={savingsStatus} />}
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
    <div
      className="h-dvh flex flex-col"
      style={{ backgroundColor: bg }}
    >
      <Navbar
        transactions={transactions}
        onSelectTransaction={handleSelectTransaction}
        onDeleteRecurringPayment={refreshTransactions}
        onSaveRecurringPayment={refreshTransactions}
        onPaycheckSaved={refreshTransactions}
        onCommand={(cmd, val) => { if (cmd === "devtools") setDevMenuOpen(val); }}
      />

      {/* Sidebar + main content share the remaining viewport height below the
          navbar; the sidebar is a normal flex sibling (not position:fixed)
          so it can't drift out of alignment at odd zoom/DPI combos (#11), and
          its own overflow-y scrolls independently while main content scrolls
          in its own pane. */}
      <div className="flex-1 flex min-h-0">
        {/* ── Filter sidebar ── */}
        <aside style={{
          position: "relative",
          flexShrink: 0,
          width: addMode === "batch" ? "28.75rem" : addMode === "import" ? "35rem" : "16.5rem",
          borderRight: `1px solid ${border}`,
          backgroundColor: surface,
          overflow: "hidden",
          transition: "width 250ms ease",
        }}>
          <div style={{ position: "absolute", inset: 0, overflowY: "auto", padding: "20px 10px", display: "flex", flexDirection: "column", gap: 28, opacity: addMode === "batch" || addMode === "import" ? 0 : 1, pointerEvents: addMode === "batch" || addMode === "import" ? "none" : "auto", transition: "opacity 200ms ease" }}>

          {/* Add / inline form */}
          <div ref={addFormRef}>
            {/* 1. "Add Transaction" button — visible when no mode active */}
            <div style={{
              maxHeight: addMode ? 0 : "42px",
              opacity: addMode ? 0 : 1,
              overflow: "hidden",
              transition: "max-height 220ms ease, opacity 150ms ease",
              pointerEvents: addMode ? "none" : "auto",
            }}>
              <button
                onClick={() => openAddMode("single")}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${HOME_INCOME} 80%, black)`;
                  e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.35)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = HOME_INCOME;
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "9px 0", borderRadius: 10, border: "none", cursor: "pointer",
                  backgroundColor: HOME_INCOME, color: "#000",
                  fontSize: 13, fontWeight: 700,
                  transition: "background-color 150ms ease, box-shadow 150ms ease, transform 150ms ease",
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5v14" />
                </svg>
                Add Transaction
              </button>
            </div>

            {/* Single form */}
            <div style={{
              maxHeight: addMode === "single" ? "460px" : 0,
              opacity: addMode === "single" ? 1 : 0,
              overflow: "hidden",
              transition: "max-height 250ms cubic-bezier(0.4,0,0.2,1), opacity 200ms ease",
            }}>
              <form onSubmit={handleAddSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => openAddMode("batch")}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = `color-mix(in srgb, ${text} 35%, transparent)`; e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${text} 8%, transparent)`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = `color-mix(in srgb, ${text} 15%, transparent)`; e.currentTarget.style.backgroundColor = "transparent"; }}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "6px 0", borderRadius: 8, border: `1px solid color-mix(in srgb, ${text} 15%, transparent)`, backgroundColor: "transparent", color: muted, fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "border-color 150ms ease, background-color 150ms ease" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                    </svg>
                    Batch
                  </button>
                  <button type="button" onClick={() => openAddMode("import")}
                    disabled={isDemo()}
                    title={isDemo() ? "Unavailable in demo mode" : undefined}
                    onMouseEnter={e => { if (isDemo()) return; e.currentTarget.style.borderColor = `color-mix(in srgb, ${text} 35%, transparent)`; e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${text} 8%, transparent)`; }}
                    onMouseLeave={e => { if (isDemo()) return; e.currentTarget.style.borderColor = `color-mix(in srgb, ${text} 15%, transparent)`; e.currentTarget.style.backgroundColor = "transparent"; }}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "6px 0", borderRadius: 8, border: `1px solid color-mix(in srgb, ${text} 15%, transparent)`, backgroundColor: "transparent", backgroundImage: isDemo() ? `repeating-linear-gradient(-45deg, transparent, transparent 4px, color-mix(in srgb, ${text} 6%, transparent) 4px, color-mix(in srgb, ${text} 6%, transparent) 6px)` : undefined, color: muted, fontSize: 11, fontWeight: 600, cursor: isDemo() ? "not-allowed" : "pointer", opacity: isDemo() ? 0.45 : 1, transition: "border-color 150ms ease, background-color 150ms ease" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Import
                  </button>
                </div>
                {[
                  { label: "Name", name: "name", type: "text", placeholder: "e.g. Netflix", required: !lockedNameFor(addForm.category), disabled: !!lockedNameFor(addForm.category) },
                  { label: "Amount", name: "amount", type: "number", placeholder: "$0.00", required: true },
                ].map(({ label, ...props }) => (
                  <div key={props.name}>
                    <p style={{ fontSize: 10, color: muted, marginBottom: 3, paddingLeft: 2 }}>{label}</p>
                    {props.name === "amount" ? (
                      <CurrencyInput value={addForm.amount} onChange={v => setAddForm(f => ({ ...f, amount: v }))} placeholder="$0.00" required
                        style={{ width: "100%", borderRadius: 7, padding: "6px 8px", fontSize: 12, border: `1px solid ${border}`, backgroundColor: bg, color: text, boxSizing: "border-box", outline: "none" }}
                      />
                    ) : (
                      <input {...props} value={addForm[props.name]} onChange={handleAddChange}
                        style={{ width: "100%", borderRadius: 7, padding: "6px 8px", fontSize: 12, border: `1px solid ${border}`, backgroundColor: bg, backgroundImage: props.name === "name" && lockedNameFor(addForm.category) ? `repeating-linear-gradient(-45deg, transparent, transparent 4px, color-mix(in srgb, ${text} 6%, transparent) 4px, color-mix(in srgb, ${text} 6%, transparent) 6px)` : undefined, color: text, boxSizing: "border-box", outline: "none", opacity: props.name === "name" && lockedNameFor(addForm.category) ? 0.45 : 1, cursor: props.name === "name" && lockedNameFor(addForm.category) ? "not-allowed" : undefined }}
                      />
                    )}
                  </div>
                ))}
                <div>
                  <p style={{ fontSize: 10, color: muted, marginBottom: 3, paddingLeft: 2 }}>Category</p>
                  <select name="category" value={addForm.category} onChange={handleAddChange}
                    style={{ width: "100%", borderRadius: 7, padding: "6px 8px", fontSize: 12, border: `1px solid ${border}`, backgroundColor: bg, color: catColor, boxSizing: "border-box", outline: "none" }}
                  >
                    {Object.entries(CATEGORY_CONFIG).map(([key, { label }]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p style={{ fontSize: 10, color: muted, marginBottom: 3, paddingLeft: 2 }}>Date</p>
                  <input type="date" name="transaction_date" value={addForm.transaction_date} onChange={handleAddChange} required
                    style={{ width: "100%", borderRadius: 7, padding: "6px 8px", fontSize: 12, border: `1px solid ${border}`, backgroundColor: bg, color: text, colorScheme: "dark", boxSizing: "border-box", outline: "none" }}
                  />
                </div>
                <div>
                  <p style={{ fontSize: 10, color: muted, marginBottom: 3, paddingLeft: 2 }}>Note (optional)</p>
                  <input type="text" name="note" value={addForm.note} onChange={handleAddChange} placeholder="e.g. Refund" maxLength={100}
                    style={{ width: "100%", borderRadius: 7, padding: "6px 8px", fontSize: 12, border: `1px solid ${border}`, backgroundColor: bg, color: text, boxSizing: "border-box", outline: "none" }}
                  />
                </div>
                {addError && <p style={{ fontSize: 11, color: HOME_EXPENSE }}>{addError}</p>}
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => { setAddMode(null); setAddError(""); }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${text} 10%, transparent)`; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1px solid ${border}`, background: "transparent", color: muted, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "background-color 150ms ease" }}
                  >Cancel</button>
                  <button type="submit" disabled={addLoading}
                    onMouseEnter={e => { if (!addLoading) e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${catColor} 25%, transparent)`; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${catColor} 15%, transparent)`; }}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1px solid ${catColor}`, backgroundColor: `color-mix(in srgb, ${catColor} 15%, transparent)`, color: catColor, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: addLoading ? 0.6 : 1, transition: "background-color 150ms ease" }}
                  >{addLoading ? "Adding…" : "Add"}</button>
                </div>
              </form>
            </div>
          </div>

          {/* Category */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: muted, marginBottom: 6, paddingLeft: 10 }}>CATEGORY</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {CATEGORIES.map(cat => {
              const catColor = CATEGORY_ACCENT[cat];
              const isActive = activeTab === cat;
              const isHov = catHov === cat;
              const Icon = cat === "ALL" ? IconAllTile : CATEGORY_ICON[cat];
              return (
                <button key={cat} onClick={() => setActiveTab(cat)}
                  onMouseEnter={() => setCatHov(cat)} onMouseLeave={() => setCatHov(null)}
                  style={{
                    display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left",
                    padding: "8px 11px", borderRadius: 12, border: "none", cursor: "pointer",
                    fontSize: 15, fontWeight: isActive ? 700 : 500,
                    color: isActive ? text : muted,
                    backgroundColor: isActive ? `color-mix(in srgb, ${catColor} 14%, transparent)` : isHov ? `color-mix(in srgb, ${catColor} 8%, transparent)` : "transparent",
                    transition: "background-color 120ms, color 120ms",
                  }}
                >
                  <span style={{
                    width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    backgroundColor: catColor,
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
                  }}>
                    <Icon />
                  </span>
                  {cat === "ALL" ? "All" : CATEGORY_CONFIG[cat].label}
                </button>
              );
            })}
            </div>
          </div>

          {/* Tools - desktop's own pill-button list style (matches Category
              above), with mobile's icon tile (IconToolTile above: grey glyph
              on a #2a2a2e square) dropped in as the icon. */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: muted, marginBottom: 6, paddingLeft: 10 }}>TOOLS</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {[
              {
                key: "paychecks", label: "Paychecks",
                icon: <><rect x="3" y="6.5" width="18" height="11" rx="2.2" /><circle cx="12" cy="12" r="2.3" /></>,
              },
              {
                key: "recurring", label: "Recurring Payments",
                icon: (
                  <>
                    <path d="M17 3.5l3 3-3 3" /><path d="M20 6.5H8.5a4.5 4.5 0 0 0-4.5 4.5" />
                    <path d="M7 20.5l-3-3 3-3" /><path d="M4 17.5h11.5a4.5 4.5 0 0 0 4.5-4.5" />
                  </>
                ),
              },
              {
                key: "installments", label: "Installments",
                icon: <><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>,
              },
            ].map((tool) => {
              const isActive = toolMode === tool.key;
              const isHov = toolHov === tool.key;
              return (
                <button key={tool.key} onClick={() => openTool(tool.key)}
                  onMouseEnter={() => setToolHov(tool.key)} onMouseLeave={() => setToolHov(null)}
                  style={{
                    display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left",
                    padding: "8px 11px", borderRadius: 12, border: "none", cursor: "pointer",
                    fontSize: 15, fontWeight: isActive ? 700 : 500,
                    color: isActive ? text : muted,
                    backgroundColor: isActive ? `color-mix(in srgb, ${text} 10%, transparent)` : isHov ? `color-mix(in srgb, ${text} 6%, transparent)` : "transparent",
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

          {/* Batch panel */}
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", opacity: addMode === "batch" ? 1 : 0, pointerEvents: addMode === "batch" ? "auto" : "none", transition: "opacity 200ms ease" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: text, margin: 0 }}>Batch Transactions</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {batchSaveState.saveStatus === "saved" && (
                  <span style={{ fontSize: 11, color: HOME_INCOME }}>Saved</span>
                )}
                <button
                  onClick={batchSaveState.onSave}
                  disabled={!batchSaveState.isDirty || batchSaveState.isSaving}
                  style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${HOME_INCOME}`, color: HOME_INCOME, backgroundColor: `color-mix(in srgb, ${HOME_INCOME} 12%, transparent)`, fontSize: 12, fontWeight: 600, cursor: batchSaveState.isDirty && !batchSaveState.isSaving ? "pointer" : "default", opacity: !batchSaveState.isDirty || batchSaveState.isSaving ? 0.4 : 1, transition: "opacity 150ms ease" }}
                >
                  {batchSaveState.isSaving ? "Adding…" : batchSaveState.validCount ? `Add ${batchSaveState.validCount} transaction${batchSaveState.validCount !== 1 ? "s" : ""}` : "Add transactions"}
                </button>
              </div>
            </div>
            <BatchAddPanel active={addMode === "batch"} onSaveStateChange={setBatchSaveState} onSaved={() => { refreshTransactions(); setAddMode(null); }} onCancel={() => setAddMode(null)} />
          </div>

          {/* Import panel */}
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", opacity: addMode === "import" ? 1 : 0, pointerEvents: addMode === "import" ? "auto" : "none", transition: "opacity 200ms ease" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: text, margin: 0 }}>Import Transactions</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {importSaveState.saveStatus === "saved" && (
                  <span style={{ fontSize: 11, color: HOME_INCOME }}>Saved</span>
                )}
                <button
                  onClick={importSaveState.onSave}
                  disabled={!importSaveState.isDirty || importSaveState.isSaving}
                  style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${HOME_INCOME}`, color: HOME_INCOME, backgroundColor: `color-mix(in srgb, ${HOME_INCOME} 12%, transparent)`, fontSize: 12, fontWeight: 600, cursor: importSaveState.isDirty && !importSaveState.isSaving ? "pointer" : "default", opacity: !importSaveState.isDirty || importSaveState.isSaving ? 0.4 : 1, transition: "opacity 150ms ease" }}
                >
                  {importSaveState.isSaving ? "Importing…" : importSaveState.validCount ? `Import ${importSaveState.validCount} transaction${importSaveState.validCount !== 1 ? "s" : ""}` : "Import transactions"}
                </button>
              </div>
            </div>
            <ImportPanel active={addMode === "import"} onSaveStateChange={setImportSaveState} onSaved={(newTxs) => { setTransactions(prev => [...(newTxs || []), ...prev]); setAddMode(null); }} onCancel={() => setAddMode(null)} />
          </div>

        </aside>

        {/* ── Main content ── */}
        {/* flex flex-col + flex-1 on the content below makes Footer a real
            sticky footer - it sits right after whatever content there is
            instead of floating mid-page with a dead gap underneath on short
            pages (the tool pages, or a mostly-empty table), which read as
            "the footer is huge" even though Footer.jsx itself is a fixed
            small height. */}
        <div className="flex-1 min-w-0 overflow-y-auto flex flex-col">
        <style>{`
          @keyframes skel-pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
          @keyframes breakdown-fade-in { from { opacity: 0; } to { opacity: 1; } }
          @keyframes breakdown-fade-out { from { opacity: 1; } to { opacity: 0; } }
          @keyframes tool-page-in { from { opacity: 0; transform: translateX(-32px); } to { opacity: 1; transform: translateX(0); } }
        `}</style>
        {(toolMode || toolClosing) ? (
          <div
            className="px-6 py-6 flex-1"
            style={{
              opacity: toolClosing ? 0 : 1,
              transform: toolClosing ? "translateX(-32px)" : "translateX(0)",
              transition: `opacity ${TOOL_TRANSITION_MS}ms ease, transform ${TOOL_TRANSITION_MS}ms ease`,
              animation: toolClosing ? undefined : `tool-page-in ${TOOL_TRANSITION_MS}ms ease`,
            }}
          >
            <div className="flex items-center gap-3" style={{ marginBottom: 20 }}>
              <button
                onClick={closeTool}
                aria-label="Back"
                className="rounded-lg cursor-pointer transition-colors"
                style={{ padding: 6, color: muted }}
                onMouseEnter={e => e.currentTarget.style.color = text}
                onMouseLeave={e => e.currentTarget.style.color = muted}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <h1 className="text-3xl font-bold tracking-tight" style={{ color: text }}>{TOOL_TITLES[toolMode]}</h1>
              {(toolMode === "recurring" || toolMode === "installments") && (
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                  {toolMode === "recurring" && recurringSaveState.saveStatus === "saved" && (
                    <span style={{ fontSize: 12, color: HOME_INCOME }}>Saved</span>
                  )}
                  {toolMode === "recurring" && (
                    <button
                      onClick={recurringSaveState.onSave}
                      disabled={!recurringSaveState.isDirty || recurringSaveState.isSaving}
                      style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${HOME_INCOME}`, color: HOME_INCOME, backgroundColor: `color-mix(in srgb, ${HOME_INCOME} 12%, transparent)`, fontSize: 13, fontWeight: 600, cursor: recurringSaveState.isDirty && !recurringSaveState.isSaving ? "pointer" : "default", opacity: !recurringSaveState.isDirty || recurringSaveState.isSaving ? 0.4 : 1, transition: "opacity 150ms ease" }}
                    >
                      {recurringSaveState.isSaving ? "Saving…" : "Save"}
                    </button>
                  )}
                  {/* Same circular "+" mobile already uses in its own Recurring/
                      Installments headers (MobileDashboard.jsx) - the add UI
                      itself lives in the panel, this just signals it open. */}
                  <button
                    onClick={() => toolMode === "recurring" ? setRecurringAddSignal(n => n + 1) : setInstallmentsAddSignal(n => n + 1)}
                    aria-label={toolMode === "recurring" ? "Add recurring payment" : "Add installment"}
                    style={{
                      width: 36, height: 36, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
                      background: surface, border: "1px solid rgba(255,255,255,0.07)",
                      display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            {/* Each panel mounts once (the first time its tool is opened,
                openedTools below) and then stays mounted for good, just
                toggling display instead of unmounting - closing/switching no
                longer throws away its loaded data or refetches from
                scratch, so reopening is instant instead of skeletons again. */}
            {openedTools.has("paychecks") && (
              <div style={{ display: toolMode === "paychecks" ? "block" : "none" }}>
                <PaychecksPanel desktop onSaved={refreshTransactions} />
              </div>
            )}
            {openedTools.has("recurring") && (
              <div style={{ display: toolMode === "recurring" ? "block" : "none" }}>
                <RecurringPaymentsModal desktop addSignal={recurringAddSignal} onSaveStateChange={setRecurringSaveState} onDelete={refreshTransactions} onSaved={refreshTransactions} />
              </div>
            )}
            {openedTools.has("installments") && (
              <div style={{ display: toolMode === "installments" ? "block" : "none" }}>
                <InstallmentsPanel desktop addSignal={installmentsAddSignal} onSaved={refreshTransactions} />
              </div>
            )}
          </div>
        ) : (
        <main className="px-6 py-6 space-y-5 flex-1">

        {/* Period header - a big month title with prev/next arrows when the
            current range is exactly one calendar month (the common case:
            "Current Month"/"Last Month" presets and the arrows themselves
            all produce this shape), otherwise the active multi-month/all-time
            preset's own label, since stepping doesn't make sense for those. */}
        <div className="flex items-center gap-3">
          {isSingleMonthRange(dateRange) ? (
            <>
              <button
                onClick={() => handleStepMonth(-1)}
                aria-label="Previous month"
                className="rounded-lg cursor-pointer transition-colors"
                style={{ padding: 6, color: muted }}
                onMouseEnter={e => e.currentTarget.style.color = text}
                onMouseLeave={e => e.currentTarget.style.color = muted}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <h1 className="text-3xl font-bold tracking-tight" style={{ color: text, minWidth: "13ch", textAlign: "center" }}>{monthYearLabel(dateRange.from)}</h1>
              <button
                onClick={() => handleStepMonth(1)}
                aria-label="Next month"
                className="rounded-lg cursor-pointer transition-colors"
                style={{ padding: 6, color: muted }}
                onMouseEnter={e => e.currentTarget.style.color = text}
                onMouseLeave={e => e.currentTarget.style.color = muted}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            </>
          ) : (
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: text }}>
              {activePreset === "All" ? "All Time" : activePreset ?? "Custom Range"}
            </h1>
          )}
        </div>

        {loading ? (
          activeTab === "ALL" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="rounded-2xl px-6 py-6" style={{ backgroundColor: surface }}>
                    <Skel h={20} w="35%" />
                    <Skel h={44} w="55%" style={{ marginTop: 10 }} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="rounded-2xl px-5 py-5" style={{ backgroundColor: surface }}>
                    <Skel h={16} w="45%" />
                    <Skel h={34} w="62%" style={{ marginTop: 8 }} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-2xl px-5 py-5" style={{ backgroundColor: surface }}>
                  <Skel h={16} w="45%" />
                  <Skel h={34} w="62%" style={{ marginTop: 8 }} />
                  <Skel h={18} w="72px" style={{ marginTop: 10, borderRadius: 999 }} />
                </div>
              ))}
            </div>
          )
        ) : activeTab === "ALL" ? (
          <div className="space-y-4">
            {/* Hero pair — the two headline figures get the primary billing,
                same treatment mobile gives Income/Expense at the top of Home. */}
            <div className="grid grid-cols-2 gap-4">
              <SummaryCard
                hero
                label="INCOME"
                value={fmt(summary.totalIn)}
                activeColor={HOME_INCOME}
                valueColor={HOME_INCOME}
                changePct={summary.totalInDelta}
                changeGoodWhenUp={true}
              />
              <SummaryCard
                hero
                label="EXPENSES"
                value={fmt(summary.totalOut)}
                changePct={summary.totalOutDelta}
                changeGoodWhenUp={false}
                activeColor={HOME_EXPENSE}
                valueColor={HOME_EXPENSE}
              />
            </div>
            {/* Overview grid — same four fields as mobile's Home overview
                card (Current Balance / Upcoming Bills / Available Cash /
                Estimated Savings). All four cards stay compact/uniform;
                clicking one opens a shared drawer below the grid instead of
                growing the card itself or opening a modal. */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard
                label="CURRENT BALANCE"
                value={overviewBalance.value}
                activeColor={overviewBalance.color}
                valueColor={overviewBalance.color}
                extraLabel={overviewBalance.caption}
                onClick={() => toggleBreakdown("balance")}
                active={breakdownCell === "balance"}
              />
              <SummaryCard
                label="UPCOMING BILLS"
                value={overviewBills.value}
                activeColor={overviewBills.color}
                valueColor={overviewBills.color}
                extraLabel={overviewBills.caption}
                onClick={() => toggleBreakdown("bills")}
                active={breakdownCell === "bills"}
              />
              <SummaryCard
                label="AVAILABLE CASH"
                value={overviewCash.value}
                activeColor={overviewCash.color}
                valueColor={overviewCash.color}
                extraLabel={overviewCash.caption}
                onClick={() => toggleBreakdown("cash")}
                active={breakdownCell === "cash"}
              />
              <SummaryCard
                label="ESTIMATED SAVINGS"
                value={overviewSavings.value}
                activeColor={overviewSavings.color}
                valueColor={overviewSavings.color}
                extraLabel={overviewSavings.caption}
                onClick={() => toggleBreakdown("savings")}
                active={breakdownCell === "savings"}
              />
            </div>

            {/* Outer animator: grid-template-rows 0fr<->1fr is what makes
                everything below (the trend chart) slide smoothly instead of
                insta-jumping - it animates the actual space the drawer
                reserves in the page flow, not just its own opacity. margin-top
                rides the same transition so it collapses to 0 fully closed
                instead of leaving a bare gap (overrides space-y-4's own
                margin via inline style). */}
            <div
              style={{
                display: "grid",
                gridTemplateRows: breakdownCell && !breakdownClosing ? "1fr" : "0fr",
                marginTop: breakdownCell && !breakdownClosing ? 16 : 0,
                transition: `grid-template-rows ${DRAWER_TRANSITION_MS}ms cubic-bezier(0.32,0.72,0,1), margin-top ${DRAWER_TRANSITION_MS}ms cubic-bezier(0.32,0.72,0,1)`,
              }}
            >
              <div style={{ overflow: "hidden", minHeight: 0, position: "relative" }}>
                {/* Outgoing layer: the previous cell, absolutely positioned so
                    it overlaps the incoming one instead of pushing it down -
                    fades itself out via a keyframe the instant it mounts and
                    is unmounted once that finishes (see outgoingTimer). */}
                {outgoingCell && (
                  <div
                    className="rounded-2xl p-5"
                    style={{
                      position: "absolute", inset: 0, backgroundColor: surface,
                      animation: `breakdown-fade-out ${SWITCH_TRANSITION_MS}ms ease forwards`,
                      pointerEvents: "none",
                    }}
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
                      transition: `opacity ${DRAWER_TRANSITION_MS}ms ease`,
                      // Only fades in when there's an outgoing layer under it
                      // (a switch) - a fresh open already gets its motion from
                      // the outer grid-rows/margin animation and doesn't need
                      // a second, redundant entrance animation on top of it.
                      animation: outgoingCell ? `breakdown-fade-in ${SWITCH_TRANSITION_MS}ms ease` : undefined,
                    }}
                  >
                    {renderDrawerBody(breakdownCell, { showClose: true })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              label={`${CATEGORY_CONFIG[activeTab].label.toUpperCase()} TOTAL`}
              value={fmt(summary.categoryTotal)}
              activeColor={activeColor}
            />
            {INCOME_TYPES.has(activeTab) ? (
              <SummaryCard
                label="PAYMENTS"
                value={String(summary.txCount)}
                activeColor={activeColor}
                deltaLabel={
                  summary.txCount > 0
                    ? `avg ${fmt(summary.avgTx)} each`
                    : null
                }
                deltaUp={true}
              />
            ) : (
              <SummaryCard
                label="AVG TRANSACTION"
                value={fmt(summary.avgTx)}
                activeColor={activeColor}
              />
            )}
            <SummaryCard
              label="VS LAST MONTH"
              value={
                summary.categoryDelta != null
                  ? `${summary.categoryDelta >= 0 ? "+" : ""}${summary.categoryDelta.toFixed(1)}%`
                  : "—"
              }
              activeColor={activeColor}
              deltaLabel={
                summary.categoryDelta != null
                  ? summary.categoryDelta >= 0
                    ? "↑ higher than last month"
                    : "↓ lower than last month"
                  : null
              }
              deltaUp={
                INCOME_TYPES.has(activeTab)
                  ? summary.categoryDelta >= 0
                  : summary.categoryDelta <= 0
              }
              valueColor={
                summary.categoryDelta != null
                  ? (
                      INCOME_TYPES.has(activeTab)
                        ? summary.categoryDelta >= 0
                        : summary.categoryDelta <= 0
                    )
                    ? HOME_INCOME
                    : HOME_EXPENSE
                  : undefined
              }
            />
            <SummaryCard
              label={
                INCOME_TYPES.has(activeTab) ? "% OF TOTAL INCOME" : "% OF TOTAL EXPENSES"
              }
              value={
                summary.pctOfTotal != null
                  ? `${summary.pctOfTotal.toFixed(1)}%`
                  : "—"
              }
              activeColor={activeColor}
            />
          </div>
        )}

        {loading ? (
          activeTab === "ALL" ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginBottom: 12 }}>
                <div className="flex items-center gap-3 flex-wrap">
                  <Skel h={34} w="130px" style={{ borderRadius: 999 }} />
                  <Skel h={34} w="130px" style={{ borderRadius: 999 }} />
                </div>
                <Skel h={30} w="120px" style={{ borderRadius: 999 }} />
              </div>
              <Skel h={TREND_CHART_HEIGHT} style={{ borderRadius: 16 }} />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl p-6" style={{ backgroundColor: surface }}>
                <Skel h={28} w="42%" />
                <Skel h={275} style={{ marginTop: 20, borderRadius: 12 }} />
              </div>
              <div className="rounded-2xl p-6" style={{ backgroundColor: surface }}>
                <Skel h={28} w="42%" />
                <Skel h={275} style={{ marginTop: 20, borderRadius: 12 }} />
              </div>
            </div>
          )
        ) : activeTab === "ALL" ? (
          /* Full-bleed trend — no card chrome, floating pills + a month-range
             toggle sit directly over the chart instead of being boxed
             alongside it. Replaces the old donut + boxed income/expense pair. */
          <div>
            <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 20 }}>
                <div ref={categoriesPanelRef} style={{ position: "relative", flexShrink: 0 }}>
                  <button
                    onClick={() => setCategoriesOpen((v) => !v)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999,
                      border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: text,
                      backgroundColor: categoriesOpen ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.05)",
                      transition: "background-color 150ms ease",
                    }}
                  >
                    Categories
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transform: categoriesOpen ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}>
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {categoriesOpen && (
                    <div style={{
                      position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 20, width: 230,
                      borderRadius: 14, backgroundColor: HOME_SURFACE, boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
                      padding: 8,
                    }}>
                      {TREND_CATEGORIES.map((cat) => {
                        const on = visibleCategories.has(cat);
                        const color = CATEGORY_ACCENT[cat];
                        return (
                          <button
                            key={cat}
                            onClick={() => toggleTrendCategory(cat)}
                            style={{
                              display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                              padding: "7px 8px", borderRadius: 8, border: "none", cursor: "pointer",
                              fontSize: 13, fontWeight: 500, color: text, backgroundColor: "transparent",
                            }}
                          >
                            <span style={{
                              width: 11, height: 11, borderRadius: "50%", flexShrink: 0, boxSizing: "border-box",
                              backgroundColor: on ? color : "transparent",
                              border: `2px solid ${color}`,
                            }} />
                            {CATEGORY_CONFIG[cat].label}
                          </button>
                        );
                      })}
                      <div style={{ borderTop: `1px solid ${HOME_DIVIDER}`, marginTop: 6, paddingTop: 8 }}>
                        <button
                          onClick={handleSaveTrendCategories}
                          style={{
                            width: "100%", padding: "7px 0", borderRadius: 8, border: "none", cursor: "pointer",
                            fontSize: 12, fontWeight: 700,
                            color: categoriesSaved ? HOME_INCOME : ACCENT_TEXT,
                            backgroundColor: categoriesSaved ? `color-mix(in srgb, ${HOME_INCOME} 15%, transparent)` : ACCENT,
                            transition: "background-color 150ms ease, color 150ms ease",
                          }}
                        >
                          {categoriesSaved ? "✓ Saved" : "Save"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex-1 flex items-center justify-center gap-2 flex-wrap">
                  {TREND_CATEGORIES.filter((cat) => visibleCategories.has(cat)).map((cat) => (
                    <TrendPill key={cat} label={CATEGORY_CONFIG[cat].label} value={fmt(trendTotals[cat])} color={CATEGORY_ACCENT[cat]} />
                  ))}
                </div>
              <div className="flex items-center gap-1" style={{ padding: 3, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)", flexShrink: 0 }}>
                {[[1, "1M"], [3, "3M"], [6, "6M"], [12, "1Y"], ["all", "Lifetime"]].map(([n, label]) => (
                  <button
                    key={n}
                    onClick={() => setTrendMonths(n)}
                    style={{
                      padding: "5px 12px", borderRadius: 999, border: "none", cursor: "pointer",
                      fontSize: 12, fontWeight: 700,
                      color: trendMonths === n ? ACCENT_TEXT : muted,
                      backgroundColor: trendMonths === n ? ACCENT : "transparent",
                      transition: "background-color 150ms ease, color 150ms ease",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {visibleCategories.size === 0 ? (
              <div style={{ height: TREND_CHART_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ color: muted, fontSize: 13 }}>No categories selected — pick one from Categories above.</p>
              </div>
            ) : trendHasData ? (
              // Sized wrapper + height="100%" instead of a fixed pixel height
              // on ResponsiveContainer directly - recharts coerces a numeric
              // height prop to px, so it can't take the clamp() responsive
              // value itself; the wrapper can.
              <div style={{ height: TREND_CHART_HEIGHT }}>
              <ResponsiveContainer width="100%" height="100%" style={{ pointerEvents: "none" }}>
                <AreaChart data={trendData}>
                  <defs>
                    {TREND_CATEGORIES.map((cat) => (
                      <linearGradient key={cat} id={`trend${cat}Fill`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CATEGORY_ACCENT[cat]} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CATEGORY_ACCENT[cat]} stopOpacity={0.02} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: text }}
                    interval={Math.max(0, Math.ceil(trendData.length / 8) - 1)}
                  />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} tick={{ fontSize: 12, fill: text }} />
                  <Tooltip {...tooltipProps} formatter={(v) => fmt(v)} />
                  {TREND_CATEGORIES.filter((cat) => visibleCategories.has(cat)).map((cat) => (
                    <Area
                      key={cat}
                      type="linear"
                      dataKey={cat}
                      name={CATEGORY_CONFIG[cat].label}
                      stroke={CATEGORY_ACCENT[cat]}
                      strokeWidth={2}
                      fill={`url(#trend${cat}Fill)`}
                      // Only mark days with a real transaction - one bucket per
                      // day means most days are 0, and dotting every zero point
                      // would bury the actual data under noise.
                      dot={(props) => {
                        const { cx, cy, payload, index } = props;
                        if (!payload[cat]) return <circle key={index} cx={cx} cy={cy} r={0} />;
                        return <circle key={index} cx={cx} cy={cy} r={3.5} fill={CATEGORY_ACCENT[cat]} stroke={bg} strokeWidth={1.5} />;
                      }}
                      animationDuration={900}
                      animationEasing="ease-in-out"
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
              </div>
            ) : <Empty />}
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Spending Over Time" activeColor={activeColor}>
            {areaData.length > 0 ? (
              <ResponsiveContainer
                width="100%"
                height={230}
                style={{ pointerEvents: "none" }}
              >
                <AreaChart data={areaData}>
                  <defs>
                    <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
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
                    stroke={
                      "rgba(255,255,255,0.06)"
                    }
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
                          <p style={{ margin: 0, opacity: 0.7, fontSize: 12 }}>
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

          <ChartCard title={`Top ${CATEGORY_CONFIG[activeTab].label} by Name`} activeColor={activeColor}>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={230} style={{ pointerEvents: "none" }}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    height={60}
                    tick={(props) => {
                      const val = props.payload?.value ?? "";
                      const label = val.length > 12 ? val.slice(0, 12) + "…" : val;
                      return (
                        <text x={props.x} y={props.y} dy={8} textAnchor="end" fontSize={12} style={{ fill: text }} transform={`rotate(-35, ${props.x}, ${props.y})`}>
                          {label}
                        </text>
                      );
                    }}
                  />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} tick={{ fontSize: 12, fill: text }} />
                  <Tooltip {...tooltipProps} formatter={(v) => fmt(v)} cursor={false} />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]} barSize={32}>
                    {barData.map((entry) => <Cell key={entry.month} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty />}
          </ChartCard>
        </div>
        )}

        {loading ? (
          <div className="rounded-2xl" style={{ backgroundColor: surface }}>
            {/* card header — matches px-6 py-4 */}
            <div className="px-6 py-4 border-b" style={{ borderColor: border }}>
              <Skel h={28} w="160px" />
            </div>
            {/* thead — text-base = 24px line-height, py-3 */}
            <div className="px-6 py-3 border-b flex items-center gap-6" style={{ borderColor: border }}>
              <Skel h={24} w="110px" />
              <Skel h={24} style={{ flex: 1 }} />
              <Skel h={24} w="90px" />
              <Skel h={24} w="80px" />
              <Skel h={24} w="40px" />
            </div>
            {/* rows — text-lg name = 28px line-height, py-4 */}
            {[...Array(10)].map((_, i) => (
              <div key={i} className="px-6 py-4 border-t flex items-center gap-6" style={{ borderColor: border }}>
                <Skel h={20} w="110px" />
                <Skel h={28} style={{ flex: 1 }} />
                <Skel h={26} w="90px" style={{ borderRadius: 999 }} />
                <Skel h={24} w="80px" />
                <Skel h={20} w="40px" />
              </div>
            ))}
            {/* footer — text-xs = 16px line-height, py-3 */}
            <div className="px-6 py-3 border-t flex items-center justify-between" style={{ borderColor: border }}>
              <Skel h={16} w="160px" />
              <Skel h={16} w="100px" />
            </div>
          </div>
        ) : (
        <div ref={tableRef}>
          <TransactionTable
            rows={paginated}
            page={page}
            perPage={perPage}
            total={sorted.length}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
            onEdit={(t) => { setEditingTransaction(t); setEditingFromSearch(false); }}
            onDelete={handleDelete}
            activeColor={activeColor}
            highlightId={highlightId}
            sortColumn={sortColumn}
            sortDir={sortDir}
            onSort={handleSort}
          />
        </div>
        )}
      </main>
        )}
        <Footer />
        </div>
      </div>

      {devMenuOpen && !isDemo() && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          width: 280, borderRadius: 14,
          backgroundColor: surface, border: `1px solid ${border}`,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "80vh",
        }}>
          <div style={{ padding: "10px 14px 9px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: HOME_EXPENSE }}>DEV TOOLS</span>
            <button onClick={() => setDevMenuOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: muted, display: "flex", padding: 2 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div style={{ overflowY: "auto", padding: "6px 0 10px" }}>

            <DevMenuSection label="LOADING & STATE" border={border} muted={muted} />
            <DevMenuRow label="Skeletons" active={loading} onToggle={() => setLoading(v => !v)} muted={muted} text={text} border={border} />
            <DevMenuRow label="Force empty" active={devForceEmpty} onToggle={() => setDevForceEmpty(v => !v)} muted={muted} text={text} border={border} />
            <DevMenuRow label="Force next error" active={devForceError} onToggle={() => { const next = !devForceError; setDevForceError(next); devForceErrorRef.current = next; }} muted={muted} text={text} border={border} />
            <DevMenuButton label="Re-fetch" description="Reload transactions" onClick={() => { setLoading(true); refreshTransactions(); setTimeout(() => setLoading(false), devDelay + 200); }} muted={muted} text={text} border={border} />

            <DevMenuSection label="NETWORK" border={border} muted={muted} />
            <div style={{ padding: "4px 14px 6px", display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: muted }}>Slow network</span>
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 500, 2000, 5000].map(ms => (
                  <button key={ms} onClick={() => setDevDelay(ms)} style={{ flex: 1, padding: "3px 0", borderRadius: 6, border: `1px solid ${devDelay === ms ? HOME_EXPENSE : border}`, backgroundColor: devDelay === ms ? `color-mix(in srgb, ${HOME_EXPENSE} 12%, transparent)` : "transparent", color: devDelay === ms ? HOME_EXPENSE : muted, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
                    {ms === 0 ? "Off" : ms < 1000 ? `${ms}ms` : `${ms/1000}s`}
                  </button>
                ))}
              </div>
            </div>

            <DevMenuSection label="DATA" border={border} muted={muted} />
            <DevMenuInfo label="Transactions" value={transactions.length} muted={muted} text={text} />
            <DevMenuInfo label="Last fetch" value={devLastFetch ? devLastFetch.toLocaleTimeString() : "—"} muted={muted} text={text} />
            <DevMenuInfo label="Date range" value={dateRange.from ? `${dateRange.from.toLocaleDateString("en-US",{month:"short",day:"numeric"})} → ${dateRange.to?.toLocaleDateString("en-US",{month:"short",day:"numeric"}) ?? "…"}` : "All time"} muted={muted} text={text} />
            <DevMenuInfo label="Active tab" value={activeTab} muted={muted} text={text} />
            <DevMenuInfo label="Sort" value={`${sortColumn} ${sortDir}`} muted={muted} text={text} />

            <DevMenuSection label="SESSION" border={border} muted={muted} />
            <DevMenuInfo label="Token expiry" value={(() => { try { const t = localStorage.getItem("token"); if (!t) return "None"; const p = JSON.parse(atob(t.split(".")[1])); return p.exp ? new Date(p.exp * 1000).toLocaleString() : "No exp"; } catch { return "Invalid"; } })()} muted={muted} text={text} />
            <DevMenuButton label="Clear localStorage" description="Wipes all local data + reloads" onClick={() => { localStorage.clear(); window.location.reload(); }} muted={muted} text={HOME_EXPENSE} border={border} danger />

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
        <EditTransactionModal
          transaction={editingTransaction}
          onClose={() => { setEditingTransaction(null); setEditingFromSearch(false); }}
          onSaved={() => {
            setEditingTransaction(null);
            setEditingFromSearch(false);
            refreshTransactions();
          }}
          onDelete={handleDelete}
          onLocate={editingFromSearch ? handleLocateTransaction : undefined}
        />
      )}

    </div>
  );
}

function DevMenuSection({ label, border, muted }) {
  return (
    <div style={{ padding: "8px 14px 4px", borderTop: `1px solid ${border}`, marginTop: 4 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: muted }}>{label}</span>
    </div>
  );
}

function DevMenuInfo({ label, value, muted, text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 14px", gap: 12 }}>
      <span style={{ fontSize: 12, color: muted }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: text, fontFamily: "monospace", textAlign: "right", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function DevMenuButton({ label, description, onClick, muted, text, border, danger }) {
  return (
    <div style={{ padding: "3px 14px" }}>
      <button onClick={onClick} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 8px", borderRadius: 8, border: `1px solid ${border}`, background: "transparent", cursor: "pointer", transition: "background-color 150ms ease" }}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = danger ? `color-mix(in srgb, ${HOME_EXPENSE} 8%, transparent)` : `color-mix(in srgb, ${text} 6%, transparent)`}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
      >
        <span style={{ fontSize: 12, fontWeight: 500, color: danger ? HOME_EXPENSE : text }}>{label}</span>
        <span style={{ fontSize: 10, color: muted }}>{description}</span>
      </button>
    </div>
  );
}

function DevMenuRow({ label, active, onToggle, muted, text, border }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 14px", gap: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: text }}>{label}</span>
      <button onClick={onToggle} style={{
        width: 38, height: 22, borderRadius: 999, border: "none", cursor: "pointer", flexShrink: 0,
        backgroundColor: active ? HOME_INCOME : `color-mix(in srgb, ${text} 18%, transparent)`,
        position: "relative", transition: "background-color 180ms ease",
      }}>
        <div style={{
          position: "absolute", top: 3, left: active ? "calc(100% - 19px)" : 3,
          width: 16, height: 16, borderRadius: "50%", backgroundColor: "#fff",
          transition: "left 180ms ease", boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        }} />
      </button>
    </div>
  );
}

function Empty() {
  return (
    <div className="h-70 flex items-center justify-center text-base" style={{ color: HOME_TEXT }}>
      No data yet
    </div>
  );
}
