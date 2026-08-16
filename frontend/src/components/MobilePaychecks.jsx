import { useState, useEffect, useMemo, useRef } from "react";
import { fmt } from "../utils/finance";
import { getToday } from "../utils/time";
import {
  getPaycheckSchedules,
  createPaycheckSchedule,
  updatePaycheckSchedule,
  deletePaycheckSchedule,
  getPaychecks,
  updatePaycheckAmount,
  getBalanceAnchor,
  setBalanceAnchor,
  getSpendingReserve,
  setSpendingReserve,
} from "../api/paychecks";
import { IconIncomeTile } from "./categoryIcons";
import CurrencyInput from "./CurrencyInput";
import Skel from "./Skel";
import { HOME_TEXT, HOME_MUTED, HOME_SURFACE, HOME_DIVIDER, HOME_INCOME, HOME_EXPENSE, TILE_COLOR } from "./categoryVisuals";

const GOLD = TILE_COLOR.SAVINGS; // "needs amount" / balance accent

const FREQUENCY_OPTIONS = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Biweekly" },
  { value: "SEMI_MONTHLY", label: "Semi-monthly" },
  { value: "MONTHLY", label: "Monthly" },
];

const FREQUENCY_LABELS = Object.fromEntries(FREQUENCY_OPTIONS.map(({ value, label }) => [value, label]));

const PAGE_SIZE = 15;

// Save lifecycle timings (#112). The panels used to close the instant Save was
// pressed, which made a successful save look identical to a no-op. SAVED_HOLD is
// long enough to read the confirmation without feeling like a stall.
const SAVED_HOLD_MS = 600;
const COLLAPSE_MS = 220;
const HIGHLIGHT_MS = 400;

// Matches the solid treatment every other sheet already uses (MobileInstallments,
// MobileRecurring, MobileTips) - borderless, solid fill, primary weighted 2:1
// against cancel. Paychecks was the last screen still on the old outlined style.
const btnCancelStyle = {
  flex: 1, padding: "10px 0", borderRadius: 12, border: "none",
  backgroundColor: "rgba(255,255,255,0.06)", color: HOME_MUTED,
  fontSize: 14, fontWeight: 600, cursor: "pointer",
};

function btnPrimaryStyle(enabled) {
  return {
    flex: 2, padding: "10px 0", borderRadius: 12, border: "none",
    backgroundColor: HOME_INCOME,
    color: "#fff", fontSize: 14, fontWeight: 700,
    cursor: enabled ? "pointer" : "default",
    opacity: enabled ? 1 : 0.5,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  };
}

function IconCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// Label for a primary save button across the idle -> saving -> saved sequence.
function SaveLabel({ status, idle }) {
  if (status === "saving") return "Saving…";
  if (status === "saved") return <><IconCheck />Saved</>;
  return idle;
}

// Worked example under a helper line (#112) - shows the mechanic as an equation
// instead of spelling the arithmetic out in the sentence. Operators sit at half
// opacity so the figures carry the line, and the result picks up the income
// accent since that's the number the section is actually about.
function Formula({ expr, result }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 5, flexWrap: "wrap", width: "fit-content",
      margin: "6px 2px 0", padding: "5px 9px", borderRadius: 8,
      backgroundColor: "rgba(255,255,255,0.04)",
      fontSize: 11.5, fontVariantNumeric: "tabular-nums", color: HOME_MUTED,
    }}>
      {expr.map((tok, i) => (
        <span key={i} style={{ opacity: /^[+−]$/.test(tok) ? 0.5 : 1 }}>{tok}</span>
      ))}
      <span style={{ opacity: 0.5 }}>=</span>
      <span style={{ color: HOME_INCOME, fontWeight: 700 }}>{result}</span>
    </div>
  );
}

// Height-animated swap between an edit panel and its read-only row (#112). Both
// sides stay mounted through the transition so the panel collapses as the row
// expands, rather than one popping in after the other disappears. Uses the same
// grid-template-rows technique already established in MobileActivity.
function Collapse({ open, children }) {
  return (
    <div className="pcCollapse" data-open={open ? "true" : "false"}>
      <div className="pcCollapseInner">{children}</div>
    </div>
  );
}

// Drives one panel's idle -> saving -> saved -> collapse -> row-highlight run.
// `task` resolves to a truthy value on failure, which keeps the panel open and
// leaves the caller to render the message.
function useSaveFlow() {
  const [status, setStatus] = useState("idle");
  const [savedKey, setSavedKey] = useState(null);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };

  async function run(task, { onClose, key = true } = {}) {
    setStatus("saving");
    if (await task()) {
      setStatus("idle");
      return;
    }
    setStatus("saved");
    later(() => {
      setStatus("idle");
      onClose?.();
      setSavedKey(key);
      later(() => setSavedKey(null), COLLAPSE_MS + HIGHLIGHT_MS);
    }, SAVED_HOLD_MS);
  }

  return { status, savedKey, run };
}

function fmtDate(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function monthLabel(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function SectionLabel({ children }) {
  return (
    <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: HOME_MUTED, margin: "0 4px 8px" }}>
      {children}
    </p>
  );
}

function EmptyCTA({ message, cta, onClick }) {
  return (
    <div style={{ textAlign: "center", padding: "22px 16px", borderRadius: 16, border: `1px dashed ${HOME_DIVIDER}` }}>
      <p style={{ fontSize: 13, color: HOME_MUTED, margin: "0 0 10px" }}>{message}</p>
      <button
        onClick={onClick}
        style={{
          fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 10,
          border: `1px solid ${HOME_INCOME}`, color: HOME_INCOME,
          backgroundColor: `color-mix(in srgb, ${HOME_INCOME} 15%, transparent)`,
          cursor: "pointer",
        }}
      >
        {cta}
      </button>
    </div>
  );
}

export default function MobilePaychecks({ onSaved }) {
  const today = getToday();

  const [view, setView] = useState("list"); // "list" | "settings"

  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState([]);
  const [paychecks, setPaychecks] = useState([]);
  const [pending, setPending] = useState([]);

  const [yearFilter, setYearFilter] = useState(null);
  const [needsAmountFilter, setNeedsAmountFilter] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const scrollRef = useRef(null);

  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState({ name: "", frequency: "BIWEEKLY", start_date: getToday() });
  const [creatingSchedule, setCreatingSchedule] = useState(false);
  const scheduleSave = useSaveFlow();
  const balanceSave = useSaveFlow();
  const reserveSave = useSaveFlow();
  const [scheduleError, setScheduleError] = useState("");

  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [scheduleEditDraft, setScheduleEditDraft] = useState({ name: "", frequency: "BIWEEKLY", start_date: "" });
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [scheduleActionError, setScheduleActionError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [rowErrorId, setRowErrorId] = useState(null);

  const [balanceAnchor, setBalanceAnchorState] = useState(null);
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceDraft, setBalanceDraft] = useState({ current_balance: "", as_of_date: getToday() });
  const [balanceError, setBalanceError] = useState("");

  const [spendingReserve, setSpendingReserveState] = useState("0.00");
  const [editingReserve, setEditingReserve] = useState(false);
  const [reserveDraft, setReserveDraft] = useState("");
  const [reserveError, setReserveError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [schedulesRes, paychecksRes, balanceRes, reserveRes] = await Promise.all([
        getPaycheckSchedules(),
        getPaychecks(),
        getBalanceAnchor(),
        getSpendingReserve(),
      ]);
      setSchedules(schedulesRes.data);
      setPaychecks(paychecksRes.data.paychecks);
      setPending(paychecksRes.data.pending_paychecks);
      setBalanceAnchorState(balanceRes.data);
      if (balanceRes.data) {
        setBalanceDraft({ current_balance: String(balanceRes.data.current_balance), as_of_date: balanceRes.data.as_of_date });
      }
      setSpendingReserveState(reserveRes.data.spending_reserve);
      setReserveDraft(String(reserveRes.data.spending_reserve));
    } catch { /* best-effort load */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [yearFilter, needsAmountFilter]);

  function refreshPaychecksInBackground() {
    getPaychecks().then(r => {
      setPaychecks(r.data.paychecks);
      setPending(r.data.pending_paychecks);
    }).catch(() => {});
  }

  const filteredPaychecks = useMemo(() => {
    return paychecks.filter(p => {
      if (yearFilter != null && p.pay_date.slice(0, 4) !== String(yearFilter)) return false;
      if (needsAmountFilter && !(p.pay_date <= today && p.amount == null)) return false;
      return true;
    });
  }, [paychecks, yearFilter, needsAmountFilter, today]);

  const visiblePaychecks = filteredPaychecks.slice(0, visibleCount);
  const hasMore = visibleCount < filteredPaychecks.length;

  function handleScroll() {
    if (view !== "list" || !hasMore) return;
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      setVisibleCount(c => c + PAGE_SIZE);
    }
  }

  const yearOptions = useMemo(() => {
    if (schedules.length === 0) return [];
    const minYear = Math.min(...schedules.map(s => new Date(s.start_date + "T00:00:00").getFullYear()));
    const maxYear = new Date(today + "T00:00:00").getFullYear();
    const years = [];
    for (let y = maxYear; y >= minYear; y--) years.push(y);
    return years;
  }, [schedules, today]);

  async function handleCreateSchedule(e) {
    e.preventDefault();
    setScheduleError("");
    setCreatingSchedule(true);
    try {
      const res = await createPaycheckSchedule(scheduleDraft);
      setSchedules(prev => [...prev, res.data]);
      setScheduleDraft({ name: "", frequency: "BIWEEKLY", start_date: getToday() });
      setShowScheduleForm(false);
      onSaved?.();
      refreshPaychecksInBackground();
    } catch (err) {
      setScheduleError(err.response?.data?.detail ?? "Something went wrong");
    } finally {
      setCreatingSchedule(false);
    }
  }

  function startEditSchedule(s) {
    setEditingScheduleId(s.id);
    setScheduleEditDraft({ name: s.name, frequency: s.frequency, start_date: s.start_date });
    setDeleteConfirmId(null);
    setScheduleActionError("");
  }

  // The panel now stays open until the save resolves, so a failure just renders
  // its message in place instead of closing and reopening itself (#112). The
  // optimistic state update still lands immediately so the row underneath is
  // already correct by the time the panel collapses over it.
  function commitEditSchedule(id) {
    const previous = schedules.find(s => s.id === id);
    const draft = scheduleEditDraft;
    return scheduleSave.run(async () => {
      setScheduleActionError("");
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...draft } : s));
      try {
        const res = await updatePaycheckSchedule(id, draft);
        setSchedules(prev => prev.map(s => s.id === id ? res.data : s));
        onSaved?.();
        refreshPaychecksInBackground();
        return null;
      } catch (err) {
        setSchedules(prev => prev.map(s => s.id === id ? previous : s));
        setScheduleActionError(err.response?.data?.detail ?? "Something went wrong");
        return err;
      }
    }, { onClose: () => setEditingScheduleId(null), key: id });
  }

  async function handleDeleteSchedule(id) {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(prev => prev === id ? null : prev), 3000);
      return;
    }
    setDeleteConfirmId(null);
    setScheduleActionError("");
    const previous = schedules.find(s => s.id === id);
    setSchedules(prev => prev.filter(s => s.id !== id));
    try {
      await deletePaycheckSchedule(id);
      onSaved?.();
    } catch (err) {
      if (previous) setSchedules(prev => [...prev, previous]);
      setScheduleActionError(err.response?.data?.detail ?? "Something went wrong");
    }
  }

  function startEdit(p) {
    setEditingId(p.id);
    setEditValue(p.amount != null ? String(p.amount) : "");
  }

  async function commitEdit(id) {
    setEditingId(null);
    const n = parseFloat(editValue);
    if (isNaN(n) || n <= 0) return;
    const previous = paychecks.find(p => p.id === id);
    setPaychecks(prev => prev.map(p => p.id === id ? { ...p, amount: n } : p));
    setPending(prev => prev.filter(p => p.id !== id));
    try {
      const res = await updatePaycheckAmount(id, { amount: n });
      setPaychecks(prev => prev.map(p => p.id === id ? { ...res.data, schedule_name: p.schedule_name } : p));
      onSaved?.();
      refreshPaychecksInBackground();
    } catch {
      setPaychecks(prev => prev.map(p => p.id === id ? previous : p));
      if (previous && previous.pay_date <= today && previous.amount == null) {
        setPending(prev => [...prev, previous]);
      }
      setRowErrorId(id);
      setTimeout(() => setRowErrorId(null), 3000);
    }
  }

  function handleSaveBalance() {
    const n = parseFloat(balanceDraft.current_balance);
    if (isNaN(n)) return;
    const previous = balanceAnchor;
    return balanceSave.run(async () => {
      setBalanceError("");
      setBalanceAnchorState({ ...(previous ?? {}), current_balance: n, as_of_date: balanceDraft.as_of_date });
      try {
        const res = await setBalanceAnchor({ current_balance: n, as_of_date: balanceDraft.as_of_date });
        setBalanceAnchorState(res.data);
        onSaved?.();
        return null;
      } catch (err) {
        setBalanceAnchorState(previous);
        setBalanceError(err.response?.data?.detail ?? "Something went wrong");
        return err;
      }
    }, { onClose: () => setEditingBalance(false) });
  }

  function handleSaveReserve() {
    const n = parseFloat(reserveDraft);
    if (isNaN(n) || n < 0) return;
    const previous = spendingReserve;
    return reserveSave.run(async () => {
      setReserveError("");
      setSpendingReserveState(n.toFixed(2));
      try {
        const res = await setSpendingReserve({ spending_reserve: n });
        setSpendingReserveState(res.data.spending_reserve);
        onSaved?.();
        return null;
      } catch (err) {
        setSpendingReserveState(previous);
        setReserveError(err.response?.data?.detail ?? "Something went wrong");
        return err;
      }
    }, { onClose: () => setEditingReserve(false) });
  }

  const fieldStyle = {
    width: "100%", borderRadius: 10, padding: "9px 11px", fontSize: 14,
    border: `1px solid ${HOME_DIVIDER}`, backgroundColor: "rgba(255,255,255,0.04)", color: HOME_TEXT,
    boxSizing: "border-box", outline: "none", colorScheme: "dark",
  };
  const labelStyle = { fontSize: 11, color: HOME_MUTED, marginBottom: 4, paddingLeft: 2 };
  const cardStyle = { backgroundColor: HOME_SURFACE, borderRadius: 16, overflow: "hidden" };

  // Save stays disabled until the draft actually differs from what's stored, so
  // opening a panel and closing it via Save can't fire a pointless write (and
  // can't show a "Saved" confirmation for a no-op). Amounts compare numerically
  // because the drafts are strings off the inputs while the stored values aren't.
  const balanceDirty = !balanceAnchor
    || parseFloat(balanceDraft.current_balance) !== parseFloat(balanceAnchor.current_balance)
    || balanceDraft.as_of_date !== balanceAnchor.as_of_date;
  const reserveDirty = parseFloat(reserveDraft) !== parseFloat(spendingReserve);

  return (
    <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 22, color: HOME_TEXT }}>
      <style>{`
        .pcCollapse { display: grid; grid-template-rows: 0fr; transition: grid-template-rows ${COLLAPSE_MS}ms cubic-bezier(0.32, 0.72, 0, 1); }
        .pcCollapse[data-open="true"] { grid-template-rows: 1fr; }
        .pcCollapseInner { overflow: hidden; min-height: 0; }
        .pcSaved { transition: background-color ${HIGHLIGHT_MS}ms ease; }
        @media (prefers-reduced-motion: reduce) {
          .pcCollapse, .pcSaved { transition: none; }
        }
      `}</style>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Skel w={80} h={12} />
            <Skel w={18} h={18} style={{ borderRadius: 4 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...Array(6)].map((_, i) => (
              <Skel key={i} h={44} style={{ borderRadius: 12, opacity: 1 - i * 0.1 }} />
            ))}
          </div>
        </div>
      )}

      {!loading && (
        <>
          {/* ── Panel header ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: HOME_MUTED, margin: 0 }}>
              {view === "settings" ? "Settings" : "Paychecks"}
            </p>
            <button
              onClick={() => setView(v => v === "list" ? "settings" : "list")}
              aria-label={view === "list" ? "Open paycheck settings" : "Back to paychecks"}
              style={{ color: HOME_MUTED, background: "none", border: "none", cursor: "pointer", padding: 3, display: "inline-flex" }}
            >
              {view === "list" ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              )}
            </button>
          </div>

          {view === "settings" ? (
            <>
              {/* ── Schedules ── */}
              <div>
                <SectionLabel>Paycheck Schedule</SectionLabel>

                {schedules.length === 0 && !showScheduleForm && (
                  <EmptyCTA message="No paycheck schedule yet" cta="Schedule a Paycheck" onClick={() => setShowScheduleForm(true)} />
                )}

                {schedules.length > 0 && (
                  <div style={{ ...cardStyle, marginBottom: showScheduleForm ? 12 : 0 }}>
                    {schedules.map((s, i) => {
                    const scheduleDirty = scheduleEditDraft.name !== s.name
                      || scheduleEditDraft.frequency !== s.frequency
                      || scheduleEditDraft.start_date !== s.start_date;
                    return (
                      <div key={s.id}>
                      <Collapse open={editingScheduleId === s.id}>
                        <div style={{ position: "relative", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                          {i > 0 && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: HOME_DIVIDER }} />}
                          <input
                            type="text"
                            value={scheduleEditDraft.name}
                            onChange={e => setScheduleEditDraft(d => ({ ...d, name: e.target.value }))}
                            placeholder="e.g. Desert Mountain Club"
                            style={fieldStyle}
                          />
                          <select
                            value={scheduleEditDraft.frequency}
                            onChange={e => setScheduleEditDraft(d => ({ ...d, frequency: e.target.value }))}
                            style={fieldStyle}
                          >
                            {FREQUENCY_OPTIONS.map(({ value, label }) => (
                              <option key={value} value={value} style={{ backgroundColor: HOME_SURFACE }}>{label}</option>
                            ))}
                          </select>
                          <input
                            type="date"
                            value={scheduleEditDraft.start_date}
                            onChange={e => setScheduleEditDraft(d => ({ ...d, start_date: e.target.value }))}
                            style={fieldStyle}
                          />
                          <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                            <button type="button" onClick={() => setEditingScheduleId(null)} disabled={scheduleSave.status !== "idle"}
                              style={btnCancelStyle}
                            >Cancel</button>
                            <button type="button" onClick={() => commitEditSchedule(s.id)}
                              disabled={!scheduleEditDraft.name.trim() || !scheduleDirty || scheduleSave.status !== "idle"}
                              style={btnPrimaryStyle(!!scheduleEditDraft.name.trim() && scheduleDirty)}
                            ><SaveLabel status={scheduleSave.status} idle="Save" /></button>
                          </div>
                        </div>
                      </Collapse>
                      <Collapse open={editingScheduleId !== s.id}>
                        <div className="pcSaved" style={{
                          position: "relative", display: "flex", alignItems: "center", gap: 12,
                          padding: "10px 14px", minHeight: 60,
                          backgroundColor: scheduleSave.savedKey === s.id ? `color-mix(in srgb, ${HOME_INCOME} 16%, transparent)` : "transparent",
                        }}>
                          {i > 0 && <div style={{ position: "absolute", top: 0, left: 66, right: 0, height: 1, backgroundColor: HOME_DIVIDER }} />}
                          <div style={{ flex: "0 0 auto", width: 38, height: 38, borderRadius: 10, background: TILE_COLOR.INCOME, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)" }}>
                            <IconIncomeTile />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontWeight: 600, margin: 0, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: HOME_TEXT }}>{s.name}</p>
                            <p style={{ color: HOME_MUTED, margin: "2px 0 0", fontSize: 12.5 }}>{FREQUENCY_LABELS[s.frequency] ?? s.frequency} · since {fmtDate(s.start_date)}</p>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                            <button onClick={() => startEditSchedule(s)} aria-label="Edit schedule"
                              style={{ color: HOME_MUTED, background: "none", border: "none", cursor: "pointer", padding: 5, display: "inline-flex" }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
                              </svg>
                            </button>
                            <button onClick={() => handleDeleteSchedule(s.id)} aria-label="Delete schedule"
                              style={{ color: deleteConfirmId === s.id ? HOME_EXPENSE : HOME_MUTED, background: "none", border: "none", cursor: "pointer", padding: 5, display: "inline-flex" }}
                            >
                              {deleteConfirmId === s.id ? (
                                <span style={{ fontSize: 12, fontWeight: 600 }}>Confirm?</span>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                      </Collapse>
                      </div>
                    );
                    })}
                  </div>
                )}
                {scheduleActionError && <p style={{ fontSize: 12, color: HOME_EXPENSE, margin: "8px 4px 0" }}>{scheduleActionError}</p>}
                {schedules.length > 0 && !showScheduleForm && (
                  <button
                    onClick={() => setShowScheduleForm(true)}
                    style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: HOME_MUTED, background: "none", border: "none", cursor: "pointer", padding: "4px 4px" }}
                  >
                    + Add another schedule
                  </button>
                )}

                {showScheduleForm && (
                  <form onSubmit={handleCreateSchedule} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 16, ...cardStyle, marginTop: 12 }}>
                    <div>
                      <p style={labelStyle}>Name</p>
                      <input
                        type="text"
                        value={scheduleDraft.name}
                        onChange={e => setScheduleDraft(d => ({ ...d, name: e.target.value }))}
                        placeholder="e.g. Desert Mountain Club"
                        required
                        style={fieldStyle}
                      />
                    </div>
                    <div>
                      <p style={labelStyle}>Frequency</p>
                      <select
                        value={scheduleDraft.frequency}
                        onChange={e => setScheduleDraft(d => ({ ...d, frequency: e.target.value }))}
                        style={fieldStyle}
                      >
                        {FREQUENCY_OPTIONS.map(({ value, label }) => (
                          <option key={value} value={value} style={{ backgroundColor: HOME_SURFACE }}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p style={labelStyle}>First pay date</p>
                      <input
                        type="date"
                        value={scheduleDraft.start_date}
                        onChange={e => setScheduleDraft(d => ({ ...d, start_date: e.target.value }))}
                        required
                        style={fieldStyle}
                      />
                    </div>
                    {scheduleError && <p style={{ fontSize: 12, color: HOME_EXPENSE, margin: 0 }}>{scheduleError}</p>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => { setShowScheduleForm(false); setScheduleError(""); }}
                        style={btnCancelStyle}
                      >Cancel</button>
                      <button type="submit" disabled={creatingSchedule || !scheduleDraft.name.trim()}
                        style={btnPrimaryStyle(!creatingSchedule && !!scheduleDraft.name.trim())}
                      >{creatingSchedule ? "Creating…" : "Create"}</button>
                    </div>
                  </form>
                )}
              </div>

              {/* ── Starting balance ── */}
              <div>
                <SectionLabel>Starting Balance</SectionLabel>

                <Collapse open={editingBalance}>
                  <div style={{ ...cardStyle, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div>
                      <p style={labelStyle}>Checking balance</p>
                      <CurrencyInput
                        placeholder="0.00"
                        value={balanceDraft.current_balance}
                        onChange={v => setBalanceDraft(d => ({ ...d, current_balance: v }))}
                        style={fieldStyle}
                      />
                    </div>
                    <div>
                      <p style={labelStyle}>As of</p>
                      <input
                        type="date"
                        value={balanceDraft.as_of_date}
                        onChange={e => setBalanceDraft(d => ({ ...d, as_of_date: e.target.value }))}
                        style={fieldStyle}
                      />
                    </div>
                    {balanceError && <p style={{ fontSize: 12, color: HOME_EXPENSE, margin: 0 }}>{balanceError}</p>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" disabled={balanceSave.status !== "idle"}
                        onClick={() => {
                          setEditingBalance(false);
                          setBalanceError("");
                          // Discard the draft, matching Cancel on the reserve panel.
                          // Without this an abandoned edit survives to the next open
                          // and reads as unsaved changes.
                          if (balanceAnchor) setBalanceDraft({ current_balance: String(balanceAnchor.current_balance), as_of_date: balanceAnchor.as_of_date });
                        }}
                        style={btnCancelStyle}
                      >Cancel</button>
                      <button type="button" onClick={handleSaveBalance}
                        disabled={balanceDraft.current_balance === "" || !balanceDirty || balanceSave.status !== "idle"}
                        style={btnPrimaryStyle(balanceDraft.current_balance !== "" && balanceDirty)}
                      ><SaveLabel status={balanceSave.status} idle="Save" /></button>
                    </div>
                  </div>
                </Collapse>
                <Collapse open={!editingBalance}>
                  {balanceAnchor ? (
                  <div className="pcSaved" style={{
                    ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px",
                    backgroundColor: balanceSave.savedKey ? `color-mix(in srgb, ${HOME_INCOME} 16%, ${HOME_SURFACE})` : HOME_SURFACE,
                  }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 17, fontVariantNumeric: "tabular-nums", color: HOME_TEXT }}>{fmt(balanceAnchor.current_balance)}</span>
                      <span style={{ color: HOME_MUTED, marginLeft: 8, fontSize: 12.5 }}>as of {fmtDate(balanceAnchor.as_of_date)}</span>
                    </div>
                    <button onClick={() => setEditingBalance(true)} aria-label="Edit starting balance"
                      style={{ color: HOME_MUTED, background: "none", border: "none", cursor: "pointer", padding: 5, display: "inline-flex", flexShrink: 0 }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
                      </svg>
                    </button>
                  </div>
                  ) : (
                  <EmptyCTA message="No starting balance set" cta="Set Starting Balance" onClick={() => setEditingBalance(true)} />
                  )}
                </Collapse>
                <p style={{ fontSize: 11, color: HOME_MUTED, margin: "8px 0 0", padding: "0 2px" }}>
                  Available Cash builds forward from here using your transactions.
                </p>
                <Formula expr={["$2,400", "−", "$60", "+", "$1,800"]} result="$4,140" />
              </div>

              {/* ── Spending reserve ── */}
              <div>
                <SectionLabel>Spending Reserve</SectionLabel>

                <Collapse open={editingReserve}>
                  <div style={{ ...cardStyle, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div>
                      <p style={labelStyle}>Don't-touch floor</p>
                      <CurrencyInput
                        placeholder="0.00"
                        value={reserveDraft}
                        onChange={v => setReserveDraft(v)}
                        style={fieldStyle}
                      />
                    </div>
                    {reserveError && <p style={{ fontSize: 12, color: HOME_EXPENSE, margin: 0 }}>{reserveError}</p>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => { setEditingReserve(false); setReserveDraft(spendingReserve); setReserveError(""); }} disabled={reserveSave.status !== "idle"}
                        style={btnCancelStyle}
                      >Cancel</button>
                      <button type="button" onClick={handleSaveReserve}
                        disabled={reserveDraft === "" || !reserveDirty || reserveSave.status !== "idle"}
                        style={btnPrimaryStyle(reserveDraft !== "" && reserveDirty)}
                      ><SaveLabel status={reserveSave.status} idle="Save" /></button>
                    </div>
                  </div>
                </Collapse>
                <Collapse open={!editingReserve}>
                  <div className="pcSaved" style={{
                    ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px",
                    backgroundColor: reserveSave.savedKey ? `color-mix(in srgb, ${HOME_INCOME} 16%, ${HOME_SURFACE})` : HOME_SURFACE,
                  }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 17, fontVariantNumeric: "tabular-nums", color: HOME_TEXT }}>{fmt(spendingReserve)}</span>
                      <span style={{ color: HOME_MUTED, marginLeft: 8, fontSize: 12.5 }}>kept aside</span>
                    </div>
                    <button onClick={() => setEditingReserve(true)} aria-label="Edit spending reserve"
                      style={{ color: HOME_MUTED, background: "none", border: "none", cursor: "pointer", padding: 5, display: "inline-flex", flexShrink: 0 }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
                      </svg>
                    </button>
                  </div>
                </Collapse>
                <p style={{ fontSize: 11, color: HOME_MUTED, margin: "8px 0 0", padding: "0 2px" }}>
                  Held back from Available Cash, so it isn't counted as free to allocate.
                </p>
                <Formula expr={["$4,140", "−", "$400"]} result="$3,740" />
              </div>
            </>
          ) : (
            <>
              {schedules.length === 0 ? (
                <EmptyCTA message="No paycheck schedule yet" cta="Open Settings" onClick={() => setView("settings")} />
              ) : (
                <>
                  {/* ── Pending nudge ── */}
                  {pending.length > 0 && (
                    <div style={{
                      padding: "11px 14px", borderRadius: 14,
                      border: `1px solid color-mix(in srgb, ${GOLD} 40%, transparent)`,
                      backgroundColor: `color-mix(in srgb, ${GOLD} 12%, transparent)`,
                      fontSize: 13, color: HOME_TEXT,
                    }}>
                      {pending.length} paycheck{pending.length !== 1 ? "s" : ""} need{pending.length === 1 ? "s" : ""} an amount — tap below to fill in
                    </div>
                  )}

                  {/* ── Filters ── */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <select
                      value={yearFilter ?? ""}
                      onChange={e => setYearFilter(e.target.value === "" ? null : Number(e.target.value))}
                      style={{ ...fieldStyle, width: "auto", flex: "0 0 auto", padding: "7px 10px", fontSize: 13 }}
                    >
                      <option value="" style={{ backgroundColor: HOME_SURFACE }}>All years</option>
                      {yearOptions.map(y => <option key={y} value={y} style={{ backgroundColor: HOME_SURFACE }}>{y}</option>)}
                    </select>
                    <button
                      onClick={() => setNeedsAmountFilter(v => !v)}
                      aria-label={needsAmountFilter ? "Showing only paychecks needing an amount" : "Filter to paychecks needing an amount"}
                      title="Needs amount"
                      style={{
                        position: "relative", display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center",
                        height: 36, padding: "0 12px", borderRadius: 10, flexShrink: 0,
                        border: `1px solid ${needsAmountFilter ? GOLD : HOME_DIVIDER}`,
                        color: needsAmountFilter ? GOLD : HOME_MUTED,
                        backgroundColor: needsAmountFilter ? `color-mix(in srgb, ${GOLD} 12%, transparent)` : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                        <path d="M12 18V6" />
                      </svg>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Needs amount</span>
                      {pending.length > 0 && (
                        <span style={{
                          minWidth: 17, height: 17, borderRadius: 999,
                          backgroundColor: needsAmountFilter ? GOLD : `color-mix(in srgb, ${GOLD} 25%, transparent)`,
                          color: needsAmountFilter ? "#000" : GOLD,
                          fontSize: 10.5, fontWeight: 700, lineHeight: 1,
                          display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
                        }}>
                          {pending.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* ── Paycheck list — one grouped card per month, mirroring the Home nav/Accounts card pattern ── */}
                  {visiblePaychecks.length === 0 ? (
                    <p style={{ fontSize: 13, color: HOME_MUTED, textAlign: "center", padding: "20px 0" }}>No paychecks match this filter</p>
                  ) : (
                    (() => {
                      const monthGroups = [];
                      visiblePaychecks.forEach((p) => {
                        const month = monthLabel(p.pay_date);
                        const g = monthGroups[monthGroups.length - 1];
                        if (!g || g.month !== month) monthGroups.push({ month, items: [p] });
                        else g.items.push(p);
                      });

                      return monthGroups.map((g, gi) => (
                        <div key={g.month + gi} style={{ marginTop: gi === 0 ? 0 : 4 }}>
                          <SectionLabel>{g.month}</SectionLabel>
                          <div style={cardStyle}>
                            {g.items.map((p, i) => {
                              const isFuture = p.pay_date > today;
                              const needsAmount = !isFuture && p.amount == null;
                              const isEditing = editingId === p.id;
                              // Always label the row with the schedule's own name (#97).
                              // This used to be gated on schedules.length > 1, which meant
                              // the single-schedule case - the common one - fell back to a
                              // literal "Paycheck" and a rename never showed up here.
                              const rowLabel = p.schedule_name || "Paycheck";

                              return (
                                <div key={p.id} style={{
                                  position: "relative", display: "flex", alignItems: "center", gap: 14,
                                  padding: "9px 14px", minHeight: 60, opacity: isFuture ? 0.55 : 1,
                                }}>
                                  {i > 0 && <div style={{ position: "absolute", top: 0, left: 68, right: 0, height: 1, backgroundColor: HOME_DIVIDER }} />}
                                  <div style={{ flex: "0 0 auto", width: 40, height: 40, borderRadius: "50%", background: TILE_COLOR.INCOME, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16)" }}>
                                    <IconIncomeTile />
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                                    <span style={{ fontSize: 13.5, color: HOME_MUTED, fontWeight: 500 }}>
                                      {rowLabel}
                                    </span>
                                    <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.2px", color: HOME_TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                      {fmtDate(p.pay_date)}
                                    </span>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                    {isEditing ? (
                                      <CurrencyInput autoFocus
                                        value={editValue}
                                        onChange={v => setEditValue(v)}
                                        onBlur={() => commitEdit(p.id)}
                                        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingId(null); }}
                                        style={{ width: 90, textAlign: "right", background: "transparent", color: HOME_TEXT, border: "none", outline: "none", fontSize: 16, fontFamily: "inherit" }}
                                      />
                                    ) : isFuture ? (
                                      <span style={{ fontSize: 12, fontWeight: 600, color: HOME_MUTED, padding: "3px 10px", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)" }}>
                                        {p.estimated_amount != null ? `~${fmt(p.estimated_amount)}` : "Upcoming"}
                                      </span>
                                    ) : needsAmount ? (
                                      <button
                                        onClick={() => startEdit(p)}
                                        style={{
                                          fontSize: 12, fontWeight: 600, padding: "4px 11px", borderRadius: 999,
                                          border: `1px dashed color-mix(in srgb, ${GOLD} 60%, transparent)`,
                                          color: GOLD, backgroundColor: `color-mix(in srgb, ${GOLD} 10%, transparent)`,
                                          cursor: "pointer",
                                        }}
                                      >
                                        Add amount
                                      </button>
                                    ) : (
                                      <span
                                        onClick={() => startEdit(p)}
                                        style={{ cursor: "text", fontSize: 16, fontWeight: 600, letterSpacing: "-0.2px", fontVariantNumeric: "tabular-nums", color: HOME_INCOME }}
                                      >
                                        {fmt(p.amount)}
                                      </span>
                                    )}
                                    {rowErrorId === p.id && (
                                      <span style={{ fontSize: 11, color: HOME_EXPENSE }}>Failed</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ));
                    })()
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
