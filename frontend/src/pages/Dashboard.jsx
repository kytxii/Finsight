import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import {
  PieChart,
  Pie,
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
import { getSpendableSurplus, getRunningBalance, getEstimatedSavings } from "../api/paychecks";
import {
  CATEGORIES,
  CATEGORY_CONFIG,
  INCOME_TYPES,
  fmt,
} from "../utils/finance";
import { getNow, getToday } from "../utils/time";
import Navbar from "../components/Navbar";
import BatchAddPanel from "../components/BatchAddPanel";
import { PRESETS, getPresetRange } from "../components/DateRangeFilter";
import SummaryCard from "../components/SummaryCard";
import ChartCard from "../components/ChartCard";
import TransactionTable from "../components/TransactionTable";
import EditTransactionModal from "../components/EditTransactionModal";
import Footer from "../components/Footer";
import RenderWakeButton from "../components/RenderWakeButton";

export default function Dashboard() {
  const dark = useTheme();
  const { isDemo } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [safeToSpend, setSafeToSpend] = useState(null);
  const [safeToSpendStatus, setSafeToSpendStatus] = useState("loading"); // loading | ok | no-balance | no-schedule | error
  const [savings, setSavings] = useState(null);
  const [savingsStatus, setSavingsStatus] = useState("loading"); // loading | ok | no-schedule | no-amounts | no-history | error
  const [bankBalance, setBankBalance] = useState(null);
  const [bankBalanceStatus, setBankBalanceStatus] = useState("loading"); // loading | ok | no-balance | error
  const [backendSleeping, setBackendSleeping] = useState(false);
  const [devMenuOpen, setDevMenuOpen] = useState(false);
  const [devForceEmpty, setDevForceEmpty] = useState(false);
  const [devDelay, setDevDelay] = useState(0);
  const [devForceError, setDevForceError] = useState(false);
  const [devLastFetch, setDevLastFetch] = useState(null);
  const devForceErrorRef = useRef(false);
  const [activeTab, setActiveTab] = useState("ALL");
  const [addMode, setAddMode] = useState(null); // null | "menu" | "single" | "batch"
  const addOpen = addMode !== null;
  const addToday = getToday();
  const [addForm, setAddForm] = useState({ name: "", amount: "", category: "EXPENSE", transaction_date: addToday });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [batchSaveState, setBatchSaveState] = useState({ isDirty: false, isSaving: false, saveStatus: "idle", onSave: null });
  const [editingTransaction, setEditingTransaction] = useState(null);
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
  const [fromVal, setFromVal] = useState("");
  const [toVal, setToVal] = useState("");
  const [catHov, setCatHov] = useState(null);
  const [periodHov, setPeriodHov] = useState(null);

  function handlePreset(label) {
    setActivePreset(label);
    setFromVal("");
    setToVal("");
    setDateRange(getPresetRange(label));
  }

  function handleCustomDate(from, to) {
    setActivePreset(null);
    setDateRange({
      from: from ? new Date(from + "T00:00:00") : null,
      to:   to   ? new Date(to   + "T23:59:59") : null,
    });
  }
  function handleAddChange(e) {
    const { name, value } = e.target;
    setAddForm(f => ({ ...f, [name]: value, ...(name === "category" && value === "TIPS" ? { name: "Cash" } : {}) }));
  }

  async function handleAddSubmit(e) {
    e.preventDefault();
    setAddError("");
    setAddLoading(true);
    try {
      await createTransaction({ ...addForm, amount: parseFloat(addForm.amount) });
      setAddForm({ name: "", amount: "", category: "EXPENSE", transaction_date: addToday });
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
    const sleepTimer = setTimeout(() => setBackendSleeping(true), 4000);
    devFetch().then((res) => {
      clearTimeout(sleepTimer);
      setTransactions(res.data);
      setLoading(false);
      setBackendSleeping(false);
      setDevLastFetch(new Date());
    }).catch(() => { clearTimeout(sleepTimer); setLoading(false); });
    return () => clearTimeout(sleepTimer);
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

  function loadBankBalance() {
    getRunningBalance().then((res) => {
      setBankBalance(res.data);
      setBankBalanceStatus("ok");
    }).catch((err) => {
      const detail = err.response?.data?.detail;
      setBankBalance(null);
      setBankBalanceStatus(detail === "No starting balance set" ? "no-balance" : "error");
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

  useEffect(() => { loadSafeToSpend(); loadBankBalance(); loadSavings(); }, []);

  function refreshTransactions() {
    devFetch().then((res) => {
      setTransactions(res.data);
      setDevLastFetch(new Date());
    }).catch(() => {});
    loadSafeToSpend();
    loadBankBalance();
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

  const handleSelectTransaction = useCallback(
    (t) => {
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

    // Previous period savings rate delta
    let savingsRateDelta = null;
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
      categoryTotal,
      txCount,
      avgTx,
      pctOfTotal,
      categoryDelta,
    };
  }, [filtered, transactions, activeTab, dateRange]);

  const pieData = useMemo(() => {
    if (activeTab !== "ALL") {
      const grouped = {};
      filtered.forEach((t) => {
        grouped[t.name] = (grouped[t.name] ?? 0) + parseFloat(t.amount);
      });
      const entries = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
      const START = 100,
        END = 40;
      const step =
        entries.length > 1 ? (START - END) / (entries.length - 1) : 0;
      return entries.map(([name, value], i) => ({
        name,
        value: parseFloat(value.toFixed(2)),
        color: `color-mix(in srgb, var(--category-${activeTab.toLowerCase()}) ${Math.round(START - i * step)}%, black)`,
      }));
    }
    const grouped = {};
    filtered.forEach((t) => {
      grouped[t.category] = (grouped[t.category] ?? 0) + parseFloat(t.amount);
    });
    return Object.entries(grouped).map(([cat, value]) => ({
      name: CATEGORY_CONFIG[cat]?.label ?? cat,
      value: parseFloat(value.toFixed(2)),
      color: `var(--category-${cat.toLowerCase()})`,
    }));
  }, [filtered, activeTab]);

  const barData = useMemo(() => {
    if (activeTab !== "ALL") {
      const grouped = {};
      filtered.forEach((t) => {
        grouped[t.name] = (grouped[t.name] ?? 0) + parseFloat(t.amount);
      });
      const entries = Object.entries(grouped)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12);
      const START = 100,
        END = 30;
      const step =
        entries.length > 1 ? (START - END) / (entries.length - 1) : 0;
      return entries.map(([name, total], i) => ({
        month: name,
        total: parseFloat(total.toFixed(2)),
        color: `color-mix(in srgb, var(--category-${activeTab.toLowerCase()}) ${Math.round(START - i * step)}%, black)`,
      }));
    }
    const grouped = {};
    filtered.forEach((t) => {
      const month = new Date(t.transaction_date).toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      });
      if (!grouped[month]) grouped[month] = { income: 0, expense: 0 };
      if (INCOME_TYPES.has(t.category)) {
        grouped[month].income += parseFloat(t.amount);
      } else {
        grouped[month].expense += parseFloat(t.amount);
      }
    });
    return Object.entries(grouped)
      .sort((a, b) => new Date("1 " + a[0]) - new Date("1 " + b[0]))
      .map(([month, { income, expense }]) => ({
        month,
        income: parseFloat(income.toFixed(2)),
        expense: parseFloat(expense.toFixed(2)),
      }));
  }, [filtered, activeTab]);

  const smallMultiples = useMemo(() => {
    if (activeTab !== "ALL") return [];
    const byCategory = {};
    filtered.forEach((t) => {
      byCategory[t.category] = (byCategory[t.category] ?? 0) + parseFloat(t.amount);
    });
    return Object.entries(byCategory)
      .map(([cat, total]) => ({ cat, total: parseFloat(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);
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
    if (!addOpen || addMode === "batch") return;
    function handleOutsideClick(e) {
      if (addFormRef.current && !addFormRef.current.contains(e.target)) {
        setAddMode(null);
        setAddError("");
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [addOpen, addMode]);

  const activeColor = `var(--category-${activeTab.toLowerCase()})`;
  const catColor = `var(--category-${addForm.category.toLowerCase()})`;
  const net = summary.totalIn - summary.totalOut;
  const netColor = net >= 0 ? "var(--category-income)" : "var(--category-expense)";
  const text    = dark ? "var(--dark-text)"    : "var(--light-text)";
  const muted   = `color-mix(in srgb, ${text} 50%, transparent)`;
  const bg      = dark ? "var(--dark-bg)"      : "var(--light-bg)";
  const border  = dark ? "var(--dark-border)"  : "var(--light-border)";
  const surface = dark ? "var(--dark-surface)" : "var(--light-surface)";
  // Secondary "savings" line on the Safe to Spend card: plain target until a
  // savings transaction lands, then saved/target progress. Muted prompts for the
  // actionable not-ready states; hidden for loading/error and no-schedule (the
  // card headline already prompts for setup).
  const savingsExtra = (() => {
    if (savingsStatus === "ok" && savings) {
      if (parseFloat(savings.estimated_savings) <= 0) return null; // nothing to save this month - stay quiet
      const target = fmt(savings.estimated_savings);
      const saved = parseFloat(savings.saved_so_far);
      const label = saved > 0
        ? `${fmt(savings.saved_so_far)} / ${target} saved this month`
        : `savable ~${target} this month`;
      return { label, color: "var(--category-savings)" };
    }
    if (savingsStatus === "no-amounts") return { label: "Add a paycheck amount to project savings", color: muted };
    if (savingsStatus === "no-history") return { label: "Savings estimate needs 3 months of history", color: muted };
    return null;
  })();
  const tooltipProps = {
    contentStyle: {
      backgroundColor: dark ? "var(--dark-surface)" : "var(--light-surface)",
      borderColor: dark ? "var(--dark-border)" : "var(--light-border)",
      borderRadius: "12px",
      color: text,
    },
    labelStyle: { color: text },
    itemStyle: { color: text },
  };

  return (
    <div
      className="min-h-dvh"
      style={{ backgroundColor: dark ? "var(--dark-bg)" : "var(--light-bg)" }}
    >
      <Navbar
        transactions={transactions}
        onSelectTransaction={handleSelectTransaction}
        onDeleteRecurringPayment={refreshTransactions}
        onSaveRecurringPayment={refreshTransactions}
        onPaycheckSaved={refreshTransactions}
        onCommand={(cmd, val) => { if (cmd === "devtools") setDevMenuOpen(val); }}
      />

        {/* ── Filter sidebar ── */}
        <aside style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: addMode === "batch" ? 460 : 210,
          height: "100dvh",
          zIndex: 9,
          borderRight: `1px solid ${border}`,
          backgroundColor: surface,
          overflow: "hidden",
          transition: "width 250ms ease",
        }}>
          <div style={{ position: "absolute", inset: 0, overflowY: "auto", padding: "20px 10px", paddingTop: 96, display: "flex", flexDirection: "column", gap: 28, opacity: addMode === "batch" ? 0 : 1, pointerEvents: addMode === "batch" ? "none" : "auto", transition: "opacity 200ms ease" }}>

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
                onClick={() => setAddMode("single")}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--category-income) 80%, black)";
                  e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.35)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = "var(--category-income)";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "9px 0", borderRadius: 10, border: "none", cursor: "pointer",
                  backgroundColor: "var(--category-income)", color: "#000",
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
                  <button type="button" onClick={() => setAddMode("batch")}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = `color-mix(in srgb, ${text} 35%, transparent)`; e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${text} 8%, transparent)`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = `color-mix(in srgb, ${text} 15%, transparent)`; e.currentTarget.style.backgroundColor = "transparent"; }}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "6px 0", borderRadius: 8, border: `1px solid color-mix(in srgb, ${text} 15%, transparent)`, backgroundColor: "transparent", color: muted, fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "border-color 150ms ease, background-color 150ms ease" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                    </svg>
                    Batch
                  </button>
                  <button type="button" disabled
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "6px 0", borderRadius: 8, border: `1px solid color-mix(in srgb, ${text} 10%, transparent)`, backgroundColor: "transparent", color: `color-mix(in srgb, ${muted} 50%, transparent)`, fontSize: 11, fontWeight: 600, cursor: "not-allowed" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Import
                  </button>
                </div>
                {[
                  { label: "Name", name: "name", type: "text", placeholder: "e.g. Netflix", required: addForm.category !== "TIPS", disabled: addForm.category === "TIPS" },
                  { label: "Amount", name: "amount", type: "number", placeholder: "$0.00", required: true },
                ].map(({ label, ...props }) => (
                  <div key={props.name}>
                    <p style={{ fontSize: 10, color: muted, marginBottom: 3, paddingLeft: 2 }}>{label}</p>
                    <input {...props} value={addForm[props.name]} onChange={handleAddChange} min={props.type === "number" ? "0.01" : undefined} step={props.type === "number" ? "0.01" : undefined}
                      style={{ width: "100%", borderRadius: 7, padding: "6px 8px", fontSize: 12, border: `1px solid ${border}`, backgroundColor: bg, backgroundImage: props.name === "name" && addForm.category === "TIPS" ? `repeating-linear-gradient(-45deg, transparent, transparent 4px, color-mix(in srgb, ${text} 6%, transparent) 4px, color-mix(in srgb, ${text} 6%, transparent) 6px)` : undefined, color: text, boxSizing: "border-box", outline: "none", opacity: props.name === "name" && addForm.category === "TIPS" ? 0.45 : 1, cursor: props.name === "name" && addForm.category === "TIPS" ? "not-allowed" : undefined }}
                    />
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
                    style={{ width: "100%", borderRadius: 7, padding: "6px 8px", fontSize: 12, border: `1px solid ${border}`, backgroundColor: bg, color: text, colorScheme: dark ? "dark" : "light", boxSizing: "border-box", outline: "none" }}
                  />
                </div>
                {addError && <p style={{ fontSize: 11, color: "var(--category-expense)" }}>{addError}</p>}
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
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {CATEGORIES.map(cat => {
              const catColor = `var(--category-${cat.toLowerCase()})`;
              const isActive = activeTab === cat;
              const isHov = catHov === cat;
              return (
                <button key={cat} onClick={() => setActiveTab(cat)}
                  onMouseEnter={() => setCatHov(cat)} onMouseLeave={() => setCatHov(null)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "6px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                    fontSize: 13, fontWeight: isActive ? 600 : 400,
                    color: isActive ? catColor : isHov ? catColor : text,
                    backgroundColor: isActive ? `color-mix(in srgb, ${catColor} 12%, transparent)` : isHov ? `color-mix(in srgb, ${catColor} 7%, transparent)` : "transparent",
                    transition: "background-color 120ms, color 120ms",
                  }}
                >
                  {cat === "ALL" ? "All" : CATEGORY_CONFIG[cat].label}
                </button>
              );
            })}
            </div>
          </div>

          {/* Period */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: muted, marginBottom: 6, paddingLeft: 10 }}>PERIOD</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {PRESETS.map(label => {
              const isActive = activePreset === label;
              const isHov = periodHov === label;
              return (
                <button key={label} onClick={() => handlePreset(label)}
                  onMouseEnter={() => setPeriodHov(label)} onMouseLeave={() => setPeriodHov(null)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "6px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                    fontSize: 13, fontWeight: isActive ? 600 : 400,
                    color: isActive ? activeColor : isHov ? activeColor : text,
                    backgroundColor: isActive ? `color-mix(in srgb, ${activeColor} 12%, transparent)` : isHov ? `color-mix(in srgb, ${activeColor} 7%, transparent)` : "transparent",
                    transition: "background-color 120ms, color 120ms",
                  }}
                >
                  {label}
                </button>
              );
            })}
            </div>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6, padding: "0 4px" }}>
              {[["From", fromVal, v => { setFromVal(v); handleCustomDate(v, toVal); }], ["To", toVal, v => { setToVal(v); handleCustomDate(fromVal, v); }]].map(([label, val, onChange]) => (
                <div key={label}>
                  <p style={{ fontSize: 10, color: muted, marginBottom: 3, paddingLeft: 2 }}>{label}</p>
                  <input type="date" value={val} onChange={e => onChange(e.target.value)}
                    style={{ width: "100%", borderRadius: 7, padding: "5px 8px", fontSize: 12, border: `1px solid ${border}`, backgroundColor: bg, color: text, colorScheme: dark ? "dark" : "light", boxSizing: "border-box" }}
                  />
                </div>
              ))}
            </div>
          </div>

          </div>

          {/* Batch panel */}
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", paddingTop: 84, opacity: addMode === "batch" ? 1 : 0, pointerEvents: addMode === "batch" ? "auto" : "none", transition: "opacity 200ms ease" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: text, margin: 0 }}>Batch Transactions</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {batchSaveState.saveStatus === "saved" && (
                  <span style={{ fontSize: 11, color: "var(--category-income)" }}>Saved</span>
                )}
                <button
                  onClick={batchSaveState.onSave}
                  disabled={!batchSaveState.isDirty || batchSaveState.isSaving}
                  style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid var(--category-income)", color: "var(--category-income)", backgroundColor: "color-mix(in srgb, var(--category-income) 12%, transparent)", fontSize: 12, fontWeight: 600, cursor: batchSaveState.isDirty && !batchSaveState.isSaving ? "pointer" : "default", opacity: !batchSaveState.isDirty || batchSaveState.isSaving ? 0.4 : 1, transition: "opacity 150ms ease" }}
                >
                  {batchSaveState.isSaving ? "Adding…" : batchSaveState.validCount ? `Add ${batchSaveState.validCount} transaction${batchSaveState.validCount !== 1 ? "s" : ""}` : "Add transactions"}
                </button>
              </div>
            </div>
            <BatchAddPanel active={addMode === "batch"} onSaveStateChange={setBatchSaveState} onSaved={() => { refreshTransactions(); setAddMode(null); }} onCancel={() => setAddMode(null)} />
          </div>

        </aside>

        {/* ── Main content ── */}
        <div style={{ marginLeft: addMode === "batch" ? 460 : 210, transition: "margin-left 250ms ease" }}>
        <main className="px-6 py-6 space-y-5">
        <style>{`@keyframes skel-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>
        {backendSleeping && <BackendWaking dark={dark} text={text} muted={muted} />}
        {!backendSleeping && loading ? (
          <div className={`grid grid-cols-2 ${activeTab === "ALL" ? "lg:grid-cols-5" : "lg:grid-cols-4"} gap-4`}>
            {[...Array(activeTab === "ALL" ? 5 : 4)].map((_, i) => (
              <div key={i} className="rounded-2xl px-5 py-5 border" style={{ backgroundColor: surface, borderTopWidth: 3, borderTopColor: border, borderRightColor: border, borderBottomColor: border, borderLeftColor: border }}>
                <Skel h={24} w="52%" dark={dark} />
                <Skel h={36} w="62%" dark={dark} style={{ marginTop: 4 }} />
                <Skel h={16} w="38%" dark={dark} style={{ marginTop: 6 }} />
              </div>
            ))}
          </div>
        ) : (
        <div className={`grid grid-cols-2 ${activeTab === "ALL" ? "lg:grid-cols-5" : "lg:grid-cols-4"} gap-4`}>
          {activeTab === "ALL" ? (
            <>
              <SummaryCard
                label="INCOME"
                value={fmt(summary.totalIn)}
                activeColor="var(--category-income)"
                valueColor="var(--category-income)"
              />
              <SummaryCard
                label="EXPENSES"
                value={fmt(summary.totalOut)}
                activeColor="var(--category-expense)"
                valueColor="var(--category-expense)"
              />
              <SummaryCard
                label="NET"
                value={(net >= 0 ? "+" : "-") + fmt(Math.abs(net))}
                activeColor={netColor}
                valueColor={netColor}
              />
              {(() => {
                if (bankBalanceStatus === "ok") {
                  const val = parseFloat(bankBalance.balance);
                  const color = val >= 0 ? "var(--category-income)" : "var(--category-expense)";
                  const asOf = new Date(bankBalance.as_of_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  return (
                    <SummaryCard
                      label="LIVE BANK BALANCE"
                      value={fmt(bankBalance.balance)}
                      activeColor={color}
                      valueColor={color}
                      deltaLabel={`since ${asOf}`}
                      deltaUp={val >= 0}
                    />
                  );
                }
                return (
                  <SummaryCard
                    label="LIVE BANK BALANCE"
                    value={bankBalanceStatus === "loading" ? "—" : "Not set up"}
                    activeColor={muted}
                    deltaLabel={bankBalanceStatus === "loading" ? null : "Set a starting balance"}
                    deltaUp={true}
                  />
                );
              })()}
              {(() => {
                if (safeToSpendStatus === "ok") {
                  const val = parseFloat(safeToSpend.spendable_surplus);
                  const color = val >= 0 ? "var(--category-income)" : "var(--category-expense)";
                  return (
                    <SummaryCard
                      label="LEFTOVER"
                      value={fmt(safeToSpend.spendable_surplus)}
                      activeColor={color}
                      valueColor={color}
                      extraLabel={savingsExtra?.label}
                      extraColor={savingsExtra?.color}
                    />
                  );
                }
                const prompt = safeToSpendStatus === "no-balance"
                  ? "Set a starting balance"
                  : safeToSpendStatus === "no-schedule"
                    ? "Set up a paycheck schedule"
                    : safeToSpendStatus === "loading" ? "—" : "Unavailable";
                return (
                  <SummaryCard
                    label="LEFTOVER"
                    value={safeToSpendStatus === "loading" ? "—" : "Not set up"}
                    activeColor={muted}
                    deltaLabel={safeToSpendStatus === "loading" ? null : prompt}
                    deltaUp={true}
                    extraLabel={savingsExtra?.label}
                    extraColor={savingsExtra?.color}
                  />
                );
              })()}
            </>
          ) : (
            <>
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
                      ? "var(--category-income)"
                      : "var(--category-expense)"
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
            </>
          )}
        </div>
        )}

        {!backendSleeping && loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* donut chart skeleton */}
            <div className="rounded-2xl p-6 border" style={{ backgroundColor: surface, borderColor: border }}>
              <Skel h={28} w="42%" dark={dark} />
              <div style={{ height: 275, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 20 }}>
                <DonutSkel dark={dark} surface={surface} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", justifyContent: "center" }}>
                  {[55, 70, 48, 62, 40].map((w, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Skel h={9} w={9} dark={dark} style={{ borderRadius: "50%", flexShrink: 0 }} />
                      <Skel h={12} w={w} dark={dark} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* bar chart skeleton */}
            <div className="rounded-2xl p-6 border" style={{ backgroundColor: surface, borderColor: border }}>
              <Skel h={28} w="42%" dark={dark} />
              <Skel h={275} dark={dark} style={{ marginTop: 20, borderRadius: 12 }} />
            </div>
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard
            title={
              activeTab === "ALL"
                ? "Category Breakdown"
                : "Spending Over Time"
            }
            activeColor={activeColor}
          >
            {activeTab === "ALL" ? (
              pieData.length > 0 ? (
                <div style={{ height: 275, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ position: "relative" }}>
                  <ResponsiveContainer
                    width="100%"
                    height={215}
                    style={{ pointerEvents: "none" }}
                  >
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={100}
                        strokeWidth={0}
                        animationBegin={0}
                        animationDuration={500}
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip {...tooltipProps} formatter={(v) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <span style={{ fontSize: 26, fontWeight: 700, color: text, lineHeight: 1 }}>{filtered.length}</span>
                    <span style={{ fontSize: 11, color: muted, marginTop: 4 }}>transactions</span>
                  </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px 16px",
                      justifyContent: "center",
                      marginTop: 8,
                    }}
                  >
                    {pieData.map((entry) => (
                      <div
                        key={entry.name}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: "50%",
                            backgroundColor: entry.color,
                            flexShrink: 0,
                            display: "inline-block",
                          }}
                        />
                        <span style={{ color: text, fontSize: 12 }}>
                          {entry.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <Empty />
              )
            ) : areaData.length > 0 ? (
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
                    isAnimationActive={true}
                    animationBegin={0}
                    animationDuration={1000}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <Empty />
            )}
          </ChartCard>

          <ChartCard
            title={
              activeTab === "ALL"
                ? "Category Totals"
                : `Top ${CATEGORY_CONFIG[activeTab].label} by Name`
            }
            activeColor={activeColor}
          >
            {activeTab === "ALL" ? (
              smallMultiples.length > 0 ? (() => {
                const max = Math.max(...smallMultiples.map((d) => d.total));
                return (
                  <div style={{ height: 250, display: "flex", flexDirection: "column", justifyContent: "center", gap: 14, padding: "8px 0" }}>
                    {smallMultiples.map(({ cat, total }) => {
                      const catColor = `var(--category-${cat.toLowerCase()})`;
                      const pct = max > 0 ? (total / max) * 100 : 0;
                      return (
                        <div key={cat} style={{ display: "flex", alignItems: "center", gap: 18 }}>
                          <span style={{ width: 130, fontSize: 14, fontWeight: 600, color: catColor, flexShrink: 0, textAlign: "right" }}>
                            {CATEGORY_CONFIG[cat]?.label ?? cat}
                          </span>
                          <div style={{ flex: 1, height: 14, borderRadius: 7, backgroundColor: `color-mix(in srgb, ${catColor} 15%, transparent)` }}>
                            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 7, backgroundColor: catColor, transition: "width 0.4s ease" }} />
                          </div>
                          <span style={{ width: 80, fontSize: 14, fontWeight: 600, color: text, flexShrink: 0 }}>{fmt(total)}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })() : <Empty />
            ) : barData.length > 0 ? (
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

        {!backendSleeping && loading ? (
          <div className="rounded-2xl border" style={{ backgroundColor: surface, borderColor: border }}>
            {/* card header — matches px-6 py-4 */}
            <div className="px-6 py-4 border-b" style={{ borderColor: border }}>
              <Skel h={28} w="160px" dark={dark} />
            </div>
            {/* thead — text-base = 24px line-height, py-3 */}
            <div className="px-6 py-3 border-b flex items-center gap-6" style={{ borderColor: border }}>
              <Skel h={24} w="110px" dark={dark} />
              <Skel h={24} dark={dark} style={{ flex: 1 }} />
              <Skel h={24} w="90px" dark={dark} />
              <Skel h={24} w="80px" dark={dark} />
              <Skel h={24} w="40px" dark={dark} />
            </div>
            {/* rows — text-lg name = 28px line-height, py-4 */}
            {[...Array(10)].map((_, i) => (
              <div key={i} className="px-6 py-4 border-t flex items-center gap-6" style={{ borderColor: border }}>
                <Skel h={20} w="110px" dark={dark} />
                <Skel h={28} dark={dark} style={{ flex: 1 }} />
                <Skel h={26} w="90px" dark={dark} style={{ borderRadius: 999 }} />
                <Skel h={24} w="80px" dark={dark} />
                <Skel h={20} w="40px" dark={dark} />
              </div>
            ))}
            {/* footer — text-xs = 16px line-height, py-3 */}
            <div className="px-6 py-3 border-t flex items-center justify-between" style={{ borderColor: border }}>
              <Skel h={16} w="160px" dark={dark} />
              <Skel h={16} w="100px" dark={dark} />
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
            onEdit={setEditingTransaction}
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
        <Footer />
        </div>



      {devMenuOpen && !isDemo() && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          width: 280, borderRadius: 14,
          backgroundColor: surface, border: `1px solid ${border}`,
          boxShadow: dark ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.12)",
          overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "80vh",
        }}>
          <div style={{ padding: "10px 14px 9px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--category-expense)" }}>DEV TOOLS</span>
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
                  <button key={ms} onClick={() => setDevDelay(ms)} style={{ flex: 1, padding: "3px 0", borderRadius: 6, border: `1px solid ${devDelay === ms ? "var(--category-expense)" : border}`, backgroundColor: devDelay === ms ? "color-mix(in srgb, var(--category-expense) 12%, transparent)" : "transparent", color: devDelay === ms ? "var(--category-expense)" : muted, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
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

            <DevMenuSection label="UI" border={border} muted={muted} />
            <DevMenuButton label="Toggle theme" description="Flip dark / light" onClick={() => document.documentElement.classList.toggle("dark")} muted={muted} text={text} border={border} />

            <DevMenuSection label="SESSION" border={border} muted={muted} />
            <DevMenuInfo label="Token expiry" value={(() => { try { const t = localStorage.getItem("token"); if (!t) return "None"; const p = JSON.parse(atob(t.split(".")[1])); return p.exp ? new Date(p.exp * 1000).toLocaleString() : "No exp"; } catch { return "Invalid"; } })()} muted={muted} text={text} />
            <DevMenuButton label="Clear localStorage" description="Wipes all local data + reloads" onClick={() => { localStorage.clear(); window.location.reload(); }} muted={muted} text={"var(--category-expense)"} border={border} danger />

          </div>
        </div>
      )}

      <RenderWakeButton />

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
            border: `1px solid ${dark ? "rgba(251,191,36,0.2)" : "rgba(217,119,6,0.25)"}`,
            backgroundColor: dark
              ? "rgba(251,191,36,0.08)"
              : "rgba(251,191,36,0.12)",
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
              color: dark ? "rgba(251,191,36,0.7)" : "rgba(146,64,14,0.75)",
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
          onClose={() => setEditingTransaction(null)}
          onSaved={() => {
            setEditingTransaction(null);
            refreshTransactions();
          }}
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
        onMouseEnter={e => e.currentTarget.style.backgroundColor = danger ? "color-mix(in srgb, var(--category-expense) 8%, transparent)" : `color-mix(in srgb, ${text} 6%, transparent)`}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
      >
        <span style={{ fontSize: 12, fontWeight: 500, color: danger ? "var(--category-expense)" : text }}>{label}</span>
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
        backgroundColor: active ? "var(--category-income)" : `color-mix(in srgb, ${text} 18%, transparent)`,
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

function BackendWaking({ dark, text, muted }) {
  const accentColor = dark ? "#81c784" : "#43a047";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: accentColor, animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
        ))}
      </div>
      <p style={{ fontSize: 16, fontWeight: 600, color: text, margin: 0 }}>Starting up…</p>
      <p style={{ fontSize: 13, color: muted, margin: 0 }}>Backend is waking up, this usually takes ~50 seconds.</p>
      <style>{`@keyframes pulse-dot { 0%,80%,100%{transform:scale(0.55);opacity:0.35} 40%{transform:scale(1);opacity:1} }`}</style>
    </div>
  );
}

function Empty() {
  return (
    <div className="h-70 flex items-center justify-center text-base dark:text-(--dark-text) text-(--light-text)">
      No data yet
    </div>
  );
}

function Skel({ w = "100%", h = 16, dark = false, style: extra = {} }) {
  const base = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  const hi   = dark ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.11)";
  return (
    <div style={{
      width: w, height: h, borderRadius: 6, flexShrink: 0,
      background: `linear-gradient(90deg, ${base} 25%, ${hi} 50%, ${base} 75%)`,
      backgroundSize: "200% 100%",
      animation: "skel-shimmer 1.4s ease-in-out infinite",
      ...extra,
    }} />
  );
}

function DonutSkel({ dark, surface }) {
  const base = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  const hi   = dark ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.11)";
  return (
    <div style={{
      position: "relative", width: 200, height: 200, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(90deg, ${base} 25%, ${hi} 50%, ${base} 75%)`,
      backgroundSize: "200% 100%",
      animation: "skel-shimmer 1.4s ease-in-out infinite",
    }}>
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: 116, height: 116, borderRadius: "50%",
        backgroundColor: surface,
      }} />
    </div>
  );
}
