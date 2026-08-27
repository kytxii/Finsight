import { useState, useEffect, useMemo, useRef } from "react";
import { HOME_SURFACE, HOME_DIVIDER, HOME_TEXT, HOME_MUTED, HOME_INCOME, HOME_EXPENSE, CATEGORY_ACCENT } from "../shared/categoryVisuals";
import { fmt } from "../../utils/finance";
import { getToday } from "../../utils/time";
import CurrencyInput from "../shared/CurrencyInput";
import Skel from "../shared/Skel";
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
} from "../../api/paychecks";

const FREQUENCY_OPTIONS = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Biweekly" },
  { value: "SEMI_MONTHLY", label: "Semi-monthly" },
  { value: "MONTHLY", label: "Monthly" },
];

const FREQUENCY_LABELS = Object.fromEntries(FREQUENCY_OPTIONS.map(({ value, label }) => [value, label]));

const PAGE_SIZE = 15;

function fmtDate(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function monthLabel(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function StatCard({ label, value, caption, color, surface, muted, text }) {
  return (
    <div className="rounded-2xl px-5 py-4" style={{ backgroundColor: surface }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: muted, margin: 0 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color: color ?? text, margin: "4px 0 0", fontVariantNumeric: "tabular-nums" }}>{value}</p>
      {caption && <p style={{ fontSize: 11.5, color: muted, margin: "3px 0 0" }}>{caption}</p>}
    </div>
  );
}

export default function PaychecksPanel({ mobile = false, desktop = false, onSaved }) {
  const bg     = HOME_SURFACE;
  const border = HOME_DIVIDER;
  const text   = HOME_TEXT;
  const muted  = HOME_MUTED;
  const faint  = `color-mix(in srgb, ${text} 5%, ${bg})`;
  const nudge  = CATEGORY_ACCENT.SAVINGS;
  const income = HOME_INCOME;
  const today  = getToday();

  const [view, setView] = useState("list"); // "list" | "settings"

  const [loading, setLoading]           = useState(true);
  const [schedules, setSchedules]       = useState([]);
  const [paychecks, setPaychecks]       = useState([]);
  const [pending, setPending]           = useState([]);

  const [yearFilter, setYearFilter]         = useState(null); // null = all years
  const [needsAmountFilter, setNeedsAmountFilter] = useState(false);
  const [visibleCount, setVisibleCount]     = useState(PAGE_SIZE);
  const scrollRef = useRef(null);

  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleDraft, setScheduleDraft]         = useState({ name: "", frequency: "BIWEEKLY", start_date: getToday() });
  const [creatingSchedule, setCreatingSchedule]   = useState(false);
  const [scheduleError, setScheduleError]         = useState("");

  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [scheduleEditDraft, setScheduleEditDraft] = useState({ name: "", frequency: "BIWEEKLY", start_date: "" });
  const [deleteConfirmId, setDeleteConfirmId]     = useState(null);
  const [scheduleActionError, setScheduleActionError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [rowErrorId, setRowErrorId] = useState(null);

  const [balanceAnchor, setBalanceAnchorState] = useState(null);
  const [editingBalance, setEditingBalance]   = useState(false);
  const [balanceDraft, setBalanceDraft]       = useState({ current_balance: "", as_of_date: getToday() });
  const [balanceError, setBalanceError]       = useState("");

  const [spendingReserve, setSpendingReserveState] = useState("0.00");
  const [editingReserve, setEditingReserve]         = useState(false);
  const [reserveDraft, setReserveDraft]             = useState("");
  const [reserveError, setReserveError]             = useState("");

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
        setBalanceDraft({ current_balance: String(balanceRes.data.current_balance), as_of_date: getToday() });
      }
      setSpendingReserveState(reserveRes.data.spending_reserve);
      setReserveDraft(String(reserveRes.data.spending_reserve));
    } catch {
      // The loading/empty states below already cover the failure case.
    } finally { setLoading(false); }
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

  const nextPaycheck = useMemo(() => {
    return paychecks
      .filter(p => p.pay_date >= today)
      .sort((a, b) => a.pay_date.localeCompare(b.pay_date))[0] ?? null;
  }, [paychecks, today]);

  function handleScroll() {
    if (!desktop && view !== "list") return;
    if (!hasMore) return;
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
      refreshPaychecksInBackground(); // new schedule needs its first paycheck backfilled server-side
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

  async function commitEditSchedule(id) {
    const previous = schedules.find(s => s.id === id);
    const draft = scheduleEditDraft;
    setScheduleActionError("");

    // Reflects the edit immediately, syncs with the server in the background.
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...draft } : s));
    setEditingScheduleId(null);

    try {
      const res = await updatePaycheckSchedule(id, draft);
      setSchedules(prev => prev.map(s => s.id === id ? res.data : s));
      onSaved?.();
      refreshPaychecksInBackground(); // name/frequency/date changes regenerate paychecks server-side
    } catch (err) {
      setSchedules(prev => prev.map(s => s.id === id ? previous : s));
      setScheduleActionError(err.response?.data?.detail ?? "Something went wrong");
    }
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
    // Drops it from the active list immediately.
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
    // Shows the new amount immediately, syncs with the server in the background.
    setPaychecks(prev => prev.map(p => p.id === id ? { ...p, amount: n } : p));
    setPending(prev => prev.filter(p => p.id !== id));

    try {
      const res = await updatePaycheckAmount(id, { amount: n });
      setPaychecks(prev => prev.map(p => p.id === id ? { ...res.data, schedule_name: p.schedule_name } : p));
      onSaved?.();
      refreshPaychecksInBackground(); // recompute the Upcoming row's guessed amount too
    } catch {
      setPaychecks(prev => prev.map(p => p.id === id ? previous : p));
      if (previous && previous.pay_date <= today && previous.amount == null) {
        setPending(prev => [...prev, previous]);
      }
      setRowErrorId(id);
      setTimeout(() => setRowErrorId(null), 3000);
    }
  }

  async function handleSaveBalance() {
    const n = parseFloat(balanceDraft.current_balance);
    if (isNaN(n)) return;
    setBalanceError("");

    const previous = balanceAnchor;
    // Shows the new balance immediately, syncs with the server in the background.
    setBalanceAnchorState({ ...(previous ?? {}), current_balance: n, as_of_date: balanceDraft.as_of_date });
    setEditingBalance(false);

    try {
      const res = await setBalanceAnchor({ current_balance: n, as_of_date: balanceDraft.as_of_date });
      setBalanceAnchorState(res.data);
      onSaved?.();
    } catch (err) {
      setBalanceAnchorState(previous);
      setEditingBalance(true);
      setBalanceError(err.response?.data?.detail ?? "Something went wrong");
    }
  }

  async function handleSaveReserve() {
    const n = parseFloat(reserveDraft);
    if (isNaN(n) || n < 0) return;
    setReserveError("");

    const previous = spendingReserve;
    // Shows the new reserve immediately, syncs with the server in the background.
    setSpendingReserveState(n.toFixed(2));
    setEditingReserve(false);

    try {
      const res = await setSpendingReserve({ spending_reserve: n });
      setSpendingReserveState(res.data.spending_reserve);
      onSaved?.();
    } catch (err) {
      setSpendingReserveState(previous);
      setEditingReserve(true);
      setReserveError(err.response?.data?.detail ?? "Something went wrong");
    }
  }

  const fieldStyle = {
    width: "100%", borderRadius: 8, padding: "7px 9px", fontSize: mobile ? 14 : 13,
    border: `1px solid ${border}`, backgroundColor: bg, color: text,
    boxSizing: "border-box", outline: "none",
  };
  const labelStyle = { fontSize: 10, color: muted, marginBottom: 3, paddingLeft: 2 };
  const sectionLabelStyle = { ...labelStyle, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 };


  const scheduleSection = (
    <div>
      <p style={sectionLabelStyle}>Paycheck Schedule</p>

      {schedules.length === 0 && !showScheduleForm && (
        <div style={{ textAlign: "center", padding: "20px 12px", border: `1px dashed ${border}`, borderRadius: 12 }}>
          <p style={{ fontSize: 13, color: muted, marginBottom: 10 }}>No paycheck schedule yet</p>
          <button
            onClick={() => setShowScheduleForm(true)}
            style={{
              fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 8,
              border: `1px solid ${income}`, color: income,
              backgroundColor: `color-mix(in srgb, ${income} 12%, transparent)`,
              cursor: "pointer",
            }}
          >
            Schedule a Paycheck
          </button>
        </div>
      )}

      {schedules.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: showScheduleForm ? 12 : 0 }}>
          {schedules.map(s => (
            editingScheduleId === s.id ? (
              <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px", borderRadius: 10, border: `1px solid ${border}`, backgroundColor: faint }}>
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
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={scheduleEditDraft.start_date}
                  onChange={e => setScheduleEditDraft(d => ({ ...d, start_date: e.target.value }))}
                  style={{ ...fieldStyle, colorScheme: "dark" }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => setEditingScheduleId(null)}
                    style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1px solid ${border}`, background: "transparent", color: muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >Cancel</button>
                  <button type="button" onClick={() => commitEditSchedule(s.id)} disabled={!scheduleEditDraft.name.trim()}
                    style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1px solid ${income}`, backgroundColor: `color-mix(in srgb, ${income} 15%, transparent)`, color: income, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: scheduleEditDraft.name.trim() ? 1 : 0.5 }}
                  >Save</button>
                </div>
              </div>
            ) : (
              <div key={s.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                padding: "8px 12px", borderRadius: 10, border: `1px solid ${border}`, backgroundColor: faint,
                fontSize: mobile ? 13 : 12,
              }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</p>
                  <p style={{ color: muted, margin: "2px 0 0" }}>{FREQUENCY_LABELS[s.frequency] ?? s.frequency} · since {fmtDate(s.start_date)}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => startEditSchedule(s)} aria-label="Edit schedule"
                    style={{ color: muted, background: "none", border: "none", cursor: "pointer", padding: 3, display: "inline-flex" }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
                    </svg>
                  </button>
                  <button onClick={() => handleDeleteSchedule(s.id)} aria-label="Delete schedule"
                    style={{ color: deleteConfirmId === s.id ? HOME_EXPENSE : muted, background: "none", border: "none", cursor: "pointer", padding: 3, display: "inline-flex" }}
                  >
                    {deleteConfirmId === s.id ? (
                      <span style={{ fontSize: 11, fontWeight: 600 }}>Confirm?</span>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )
          ))}
          {scheduleActionError && <p style={{ fontSize: 11, color: HOME_EXPENSE }}>{scheduleActionError}</p>}
          {!showScheduleForm && (
            <button
              onClick={() => setShowScheduleForm(true)}
              style={{ alignSelf: "flex-start", fontSize: 12, color: muted, background: "none", border: "none", cursor: "pointer", padding: "4px 2px" }}
            >
              + Add another schedule
            </button>
          )}
        </div>
      )}

      {showScheduleForm && (
        <form onSubmit={handleCreateSchedule} style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px", borderRadius: 12, border: `1px solid ${border}`, backgroundColor: faint }}>
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
                <option key={value} value={value}>{label}</option>
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
              style={{ ...fieldStyle, colorScheme: "dark" }}
            />
          </div>
          {scheduleError && <p style={{ fontSize: 11, color: HOME_EXPENSE }}>{scheduleError}</p>}
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => { setShowScheduleForm(false); setScheduleError(""); }}
              style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1px solid ${border}`, background: "transparent", color: muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >Cancel</button>
            <button type="submit" disabled={creatingSchedule || !scheduleDraft.name.trim()}
              style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1px solid ${income}`, backgroundColor: `color-mix(in srgb, ${income} 15%, transparent)`, color: income, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: creatingSchedule || !scheduleDraft.name.trim() ? 0.6 : 1 }}
            >{creatingSchedule ? "Creating…" : "Create"}</button>
          </div>
        </form>
      )}
    </div>
  );

  const balanceSection = (
    <div>
      <p style={sectionLabelStyle}>Starting Balance</p>

      {editingBalance ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px", borderRadius: 10, border: `1px solid ${border}`, backgroundColor: faint }}>
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
              style={{ ...fieldStyle, colorScheme: "dark" }}
            />
          </div>
          {balanceError && <p style={{ fontSize: 11, color: HOME_EXPENSE }}>{balanceError}</p>}
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => { setEditingBalance(false); setBalanceError(""); }}
              style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1px solid ${border}`, background: "transparent", color: muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >Cancel</button>
            <button type="button" onClick={handleSaveBalance} disabled={balanceDraft.current_balance === ""}
              style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1px solid ${income}`, backgroundColor: `color-mix(in srgb, ${income} 15%, transparent)`, color: income, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >Save</button>
          </div>
        </div>
      ) : balanceAnchor ? (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", borderRadius: 10, border: `1px solid ${border}`, backgroundColor: faint,
          fontSize: mobile ? 13 : 12,
        }}>
          <div>
            <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(balanceAnchor.current_balance)}</span>
            <span style={{ color: muted, marginLeft: 8 }}>as of {fmtDate(balanceAnchor.as_of_date)}</span>
          </div>
          <button onClick={() => setEditingBalance(true)} aria-label="Edit starting balance"
            style={{ color: muted, background: "none", border: "none", cursor: "pointer", padding: 3, display: "inline-flex", flexShrink: 0 }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
            </svg>
          </button>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "16px 12px", border: `1px dashed ${border}`, borderRadius: 12 }}>
          <p style={{ fontSize: 13, color: muted, marginBottom: 10 }}>No starting balance set</p>
          <button
            onClick={() => setEditingBalance(true)}
            style={{
              fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 8,
              border: `1px solid ${income}`, color: income,
              backgroundColor: `color-mix(in srgb, ${income} 12%, transparent)`,
              cursor: "pointer",
            }}
          >
            Set Starting Balance
          </button>
        </div>
      )}
      <p style={{ fontSize: 10, color: muted, marginTop: 6 }}>
        Available Cash on the dashboard builds forward from this using your actual transactions.
      </p>
    </div>
  );

  const reserveSection = (
    <div>
      <p style={sectionLabelStyle}>Spending Reserve</p>
      {editingReserve ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px", borderRadius: 10, border: `1px solid ${border}`, backgroundColor: faint }}>
          <div>
            <p style={labelStyle}>Don't-touch floor</p>
            <CurrencyInput
              placeholder="0.00"
              value={reserveDraft}
              onChange={v => setReserveDraft(v)}
              style={fieldStyle}
            />
          </div>
          {reserveError && <p style={{ fontSize: 11, color: HOME_EXPENSE }}>{reserveError}</p>}
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => { setEditingReserve(false); setReserveDraft(spendingReserve); setReserveError(""); }}
              style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1px solid ${border}`, background: "transparent", color: muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >Cancel</button>
            <button type="button" onClick={handleSaveReserve} disabled={reserveDraft === ""}
              style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1px solid ${income}`, backgroundColor: `color-mix(in srgb, ${income} 15%, transparent)`, color: income, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >Save</button>
          </div>
        </div>
      ) : (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", borderRadius: 10, border: `1px solid ${border}`, backgroundColor: faint,
          fontSize: mobile ? 13 : 12,
        }}>
          <div>
            <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(spendingReserve)}</span>
            <span style={{ color: muted, marginLeft: 8 }}>set aside for groceries/gas/eating out</span>
          </div>
          <button onClick={() => setEditingReserve(true)} aria-label="Edit spending reserve"
            style={{ color: muted, background: "none", border: "none", cursor: "pointer", padding: 3, display: "inline-flex", flexShrink: 0 }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
            </svg>
          </button>
        </div>
      )}
      <p style={{ fontSize: 10, color: muted, marginTop: 6 }}>
        Subtracted from Available Cash to get what's actually free to allocate.
      </p>
    </div>
  );

  let lastMonth = null;
  const listSection = schedules.length === 0 ? (
    <div style={{ textAlign: "center", padding: "20px 12px", border: `1px dashed ${border}`, borderRadius: 12 }}>
      <p style={{ fontSize: 13, color: muted, marginBottom: 10 }}>No paycheck schedule yet</p>
      {!desktop && (
        <button
          onClick={() => setView("settings")}
          style={{
            fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 8,
            border: `1px solid ${income}`, color: income,
            backgroundColor: `color-mix(in srgb, ${income} 12%, transparent)`,
            cursor: "pointer",
          }}
        >
          Open Settings
        </button>
      )}
    </div>
  ) : (
    <>
      {pending.length > 0 && (
        <div style={{
          padding: "10px 12px", borderRadius: 10,
          border: `1px solid color-mix(in srgb, ${nudge} 40%, transparent)`,
          backgroundColor: `color-mix(in srgb, ${nudge} 12%, transparent)`,
          fontSize: 12, color: text, marginBottom: 16,
        }}>
          {pending.length} paycheck{pending.length !== 1 ? "s" : ""} need{pending.length === 1 ? "s" : ""} an amount — click below to fill in
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <select
          value={yearFilter ?? ""}
          onChange={e => setYearFilter(e.target.value === "" ? null : Number(e.target.value))}
          style={{ ...fieldStyle, width: "auto", flex: "0 0 auto", padding: "6px 8px", fontSize: 12 }}
        >
          <option value="">All years</option>
          {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button
          onClick={() => setNeedsAmountFilter(v => !v)}
          aria-label={needsAmountFilter ? "Showing only paychecks needing an amount" : "Filter to paychecks needing an amount"}
          title="Needs amount"
          style={{
            position: "relative", display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center",
            height: 32, padding: "0 10px", borderRadius: 8, flexShrink: 0,
            border: `1px solid ${needsAmountFilter ? nudge : border}`,
            color: needsAmountFilter ? nudge : muted,
            backgroundColor: needsAmountFilter ? `color-mix(in srgb, ${nudge} 12%, transparent)` : "transparent",
            cursor: "pointer",
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
            <path d="M12 18V6" />
          </svg>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Needs amount</span>
          {pending.length > 0 && (
            <span style={{
              minWidth: 16, height: 16, borderRadius: 999,
              backgroundColor: needsAmountFilter ? nudge : `color-mix(in srgb, ${nudge} 25%, transparent)`,
              color: needsAmountFilter ? "#000" : nudge,
              fontSize: 10, fontWeight: 700, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
            }}>
              {pending.length}
            </span>
          )}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {visiblePaychecks.map(p => {
          const isFuture = p.pay_date > today;
          const needsAmount = !isFuture && p.amount == null;
          const isEditing = editingId === p.id;
          const month = monthLabel(p.pay_date);
          const showDivider = month !== lastMonth;
          lastMonth = month;

          return (
            <div key={p.id}>
              {showDivider && (
                <p style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                  color: muted, margin: "10px 2px 4px",
                }}>
                  {month}
                </p>
              )}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", borderRadius: 10, border: `1px solid ${border}`,
                backgroundColor: isFuture ? "transparent" : faint,
                opacity: isFuture ? 0.6 : 1,
              }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: mobile ? 13 : 12, fontWeight: 500 }}>{fmtDate(p.pay_date)}</span>
                  {schedules.length > 1 && p.schedule_name && (
                    <span style={{ display: "block", fontSize: 10, color: muted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.schedule_name}
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {isEditing ? (
                  <CurrencyInput autoFocus
                    value={editValue}
                    onChange={v => setEditValue(v)}
                    onBlur={() => commitEdit(p.id)}
                    onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingId(null); }}
                    style={{ width: 90, textAlign: "right", background: "transparent", color: text, border: "none", outline: "none", fontSize: mobile ? 14 : 13, fontFamily: "inherit" }}
                  />
                ) : isFuture ? (
                  <span style={{ fontSize: 11, fontWeight: 600, color: muted, padding: "2px 8px", borderRadius: 999, backgroundColor: `color-mix(in srgb, ${text} 8%, transparent)` }}>
                    {p.estimated_amount != null ? `~${fmt(p.estimated_amount)}` : "Upcoming"}
                  </span>
                ) : needsAmount ? (
                  <button
                    onClick={() => startEdit(p)}
                    style={{
                      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
                      border: `1px dashed color-mix(in srgb, ${nudge} 60%, transparent)`,
                      color: nudge, backgroundColor: `color-mix(in srgb, ${nudge} 10%, transparent)`,
                      cursor: "pointer",
                    }}
                  >
                    Add amount
                  </button>
                ) : (
                  <span
                    onClick={() => startEdit(p)}
                    style={{ cursor: "text", fontSize: mobile ? 14 : 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                  >
                    {fmt(p.amount)}
                  </span>
                )}

                {rowErrorId === p.id && (
                  <span style={{ fontSize: 10, color: HOME_EXPENSE }}>Failed</span>
                )}
                </div>
              </div>
            </div>
          );
        })}

        {visiblePaychecks.length === 0 && (
          <p style={{ fontSize: 12, color: muted, textAlign: "center", padding: "16px 0" }}>No paychecks match this filter</p>
        )}
      </div>
    </>
  );

  // Desktop: stat header + permanent two-column layout
  if (desktop) {
    const activeSchedule = schedules[0];
    return (
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 24, color: text }}>
        {loading ? (
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-2xl px-5 py-4" style={{ backgroundColor: bg }}>
                <Skel w="60%" h={11} />
                <Skel w="50%" h={22} style={{ marginTop: 8 }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            <StatCard
              label="STARTING BALANCE" muted={muted} text={text} surface={bg}
              value={balanceAnchor ? fmt(balanceAnchor.current_balance) : "Not set"}
              caption={balanceAnchor ? `as of ${fmtDate(balanceAnchor.as_of_date)}` : "Set it below"}
            />
            <StatCard
              label="SPENDING RESERVE" muted={muted} text={text} surface={bg}
              value={fmt(spendingReserve)}
              caption="Groceries/gas/eating out"
            />
            <StatCard
              label="NEXT PAYCHECK" muted={muted} text={text} surface={bg}
              color={income}
              value={nextPaycheck ? (nextPaycheck.amount != null ? fmt(nextPaycheck.amount) : nextPaycheck.estimated_amount != null ? `~${fmt(nextPaycheck.estimated_amount)}` : "—") : "—"}
              caption={nextPaycheck ? fmtDate(nextPaycheck.pay_date) : "No schedule yet"}
            />
            <StatCard
              label="SCHEDULE" muted={muted} text={text} surface={bg}
              value={activeSchedule ? (FREQUENCY_LABELS[activeSchedule.frequency] ?? activeSchedule.frequency) : "None"}
              caption={activeSchedule ? activeSchedule.name : "Add one below"}
            />
          </div>
        )}

        {loading ? (
          <div className="grid" style={{ gridTemplateColumns: "1fr 360px", gap: 24 }}>
            <Skel h={400} style={{ borderRadius: 16 }} />
            <Skel h={400} style={{ borderRadius: 16 }} />
          </div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: "1fr 360px", gap: 24, alignItems: "start" }}>
            <div className="rounded-2xl px-6 py-5" style={{ backgroundColor: bg, display: "flex", flexDirection: "column" }}>
              <p style={sectionLabelStyle}>Paycheck History</p>
              <div ref={scrollRef} onScroll={handleScroll} style={{ maxHeight: 640, overflowY: "auto", overscrollBehavior: "contain" }}>
                {listSection}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="rounded-2xl px-6 py-5" style={{ backgroundColor: bg }}>{scheduleSection}</div>
              <div className="rounded-2xl px-6 py-5" style={{ backgroundColor: bg }}>{balanceSection}</div>
              <div className="rounded-2xl px-6 py-5" style={{ backgroundColor: bg }}>{reserveSection}</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Sidebar/mobile: toggled list vs settings, unchanged from before
  return (
    <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "16px 20px 32px", display: "flex", flexDirection: "column", gap: "24px", color: text }}>

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Skel w={70} h={11} />
            <Skel w={16} h={16} style={{ borderRadius: 4 }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Skel w={76} h={30} style={{ borderRadius: 8 }} />
            <Skel w={120} h={30} style={{ borderRadius: 8 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Skel w={100} h={9} style={{ marginBottom: 2 }} />
            {[...Array(6)].map((_, i) => (
              <Skel key={i} h={38} style={{ borderRadius: 10, opacity: 1 - i * 0.1 }} />
            ))}
          </div>
        </div>
      )}

      {!loading && (
        <>
          {/* Panel header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ ...labelStyle, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 0 }}>
              {view === "settings" ? "Settings" : "Paychecks"}
            </p>
            <button
              onClick={() => setView(v => v === "list" ? "settings" : "list")}
              aria-label={view === "list" ? "Open paycheck settings" : "Back to paychecks"}
              style={{ color: muted, background: "none", border: "none", cursor: "pointer", padding: 3, display: "inline-flex" }}
            >
              {view === "list" ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              )}
            </button>
          </div>

          {view === "settings" ? (
            <>
              {scheduleSection}
              {balanceSection}
              {reserveSection}
            </>
          ) : listSection}
        </>
      )}
    </div>
  );
}
