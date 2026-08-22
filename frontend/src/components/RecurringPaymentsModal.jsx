import { useState, useEffect, useRef } from "react";
import { CATEGORY_CONFIG, fmt } from "../utils/finance";
import { HOME_SURFACE, HOME_DIVIDER, HOME_TEXT, HOME_MUTED, HOME_INCOME, HOME_EXPENSE, CATEGORY_ACCENT } from "./categoryVisuals";
import CurrencyInput from "./CurrencyInput";
import Skel from "./Skel";
import {
  getRecurringPayments,
  createRecurringPayment,
  updateRecurringPayment,
  deleteRecurringPayment,
} from "../api/recurringPayments";

const EMPTY_DRAFT = { name: "", amount: "", day_of_month: "", category: "SUBSCRIPTION", is_estimate: false };

const SKELETON_WIDTHS = [
  ["68%", "58%", "60%", "55%"],
  ["52%", "70%", "60%", "65%"],
  ["78%", "52%", "60%", "55%"],
];

function ordinal(n) {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : (["th", "st", "nd", "rd"][v % 10] ?? "th");
  return `${n}${suffix}`;
}

function isDraftValid(d) {
  return d.name.trim() !== "" &&
    parseFloat(d.amount) > 0 &&
    (d.is_estimate || (parseInt(d.day_of_month, 10) >= 1 && parseInt(d.day_of_month, 10) <= 31));
}

let _lid = 0;
const newDraft = () => ({ _lid: ++_lid, ...EMPTY_DRAFT });

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Recurring payments repeat on the same day_of_month every month, so this is
// the same for any month shown - only which days exist (daysInMonth) and
// which weekday they land on changes.
function buildMonthGrid(rows, date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sunday

  const byDay = {};
  rows.forEach(r => {
    const d = r.day_of_month;
    if (d == null || d > daysInMonth) return;
    (byDay[d] ??= { bill: false, sub: false, names: [] });
    if (r.category === "BILL") byDay[d].bill = true;
    if (r.category === "SUBSCRIPTION") byDay[d].sub = true;
    byDay[d].names.push(r.name);
  });

  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  return { cells, byDay, numRows: Math.ceil(cells.length / 7) };
}

// One month's square-cell grid - shared by the focused (main) calendar and
// the smaller previous/next previews on either side of it. `today` is only
// passed for the real current month, so the today-ring never shows up on a
// preview that isn't actually today's month. Sizing/dimming is entirely the
// caller's job now (MonthDueCalendar owns opacity on the wrapper so a month
// can fade in/out as it moves between roles) - this just renders at full
// opacity and transitions its own font-size/gap/radius smoothly whenever
// those props change under it, so a month growing into focus visibly grows
// its numbers and spacing instead of snapping.
function MiniMonthGrid({ rows, date, today, cellFont, gap, radius, faint, text, muted, showLabel = false }) {
  const { cells, byDay, numRows } = buildMonthGrid(rows, date);
  const billColor = CATEGORY_ACCENT.BILL;
  const subColor = CATEGORY_ACCENT.SUBSCRIPTION;
  const gridTransition = "gap 420ms cubic-bezier(0.32,0.72,0,1)";

  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: muted, textAlign: "center", margin: "0 0 8px", opacity: showLabel ? 1 : 0, transition: "opacity 420ms ease" }}>
        {date.toLocaleDateString("en-US", { month: "short" })}
      </p>
      <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap, marginBottom: gap, transition: gridTransition }}>
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 700, color: muted }}>{w}</div>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", gridTemplateRows: `repeat(${numRows}, 1fr)`, gap, transition: gridTransition }}>
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />;
          const info = byDay[d];
          const both = info?.bill && info?.sub;
          const background = both
            ? `linear-gradient(135deg, ${billColor} 50%, ${subColor} 50%)`
            : info?.bill ? billColor
            : info?.sub ? subColor
            : faint;
          const isToday = d === today;
          return (
            <div
              key={i}
              title={info ? `${ordinal(d)}: ${info.names.join(", ")}` : ordinal(d)}
              style={{
                aspectRatio: "1", borderRadius: radius, background,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: cellFont, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                color: info ? "#fff" : muted,
                boxShadow: isToday ? `inset 0 0 0 2px ${text}` : "none",
                transition: "font-size 420ms cubic-bezier(0.32,0.72,0,1), border-radius 420ms cubic-bezier(0.32,0.72,0,1), box-shadow 200ms ease",
              }}
            >
              {d}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Percentage geometry for the carousel: how far from center (50%) each role
// sits, and how wide each role's card is. The two "buffer" slots are kept
// mounted but invisible further out past the visible prev/next cards -
// that's what lets a new month slide in "from the abyss" instead of
// appearing out of nowhere the moment it becomes the new prev/next.
const FOCUSED_WIDTH = 21;
const SIDE_WIDTH = 18;
const SIDE_SPACING = 22;
const BUFFER_SPACING = 46;
const CAROUSEL_TRANSITION = "left 440ms cubic-bezier(0.32,0.72,0,1), width 440ms cubic-bezier(0.32,0.72,0,1), padding 440ms cubic-bezier(0.32,0.72,0,1), opacity 440ms ease, background-color 440ms ease, border-color 440ms ease";

// Desktop-only, month-calendar shaped but GitHub-activity-styled: a small
// filled square per day instead of a number list, colored by what's due that
// day. Only rows with a fixed day_of_month show up here - estimates (no due
// day) have nothing to plot. Shows the focused month full-size flanked by
// the previous/next month for context; the title+arrows above step the
// focused month back and forth (same header treatment as the dashboard's
// own month navigator, just local to this calendar - nothing above it
// changes).
//
// Every month within 2 steps of center stays mounted at all times, each
// keyed by its own year-month so React never remounts one just because its
// role changed - it only gets new position/size/opacity props, which the
// CSS transitions above animate. That's what turns a page into a real
// carousel move instead of a crossfade: the old focused month visibly
// shrinks and slides out to the side it's heading toward, the old side
// month on that side grows and slides into focus, and the next one back
// slides in from its hidden buffer slot to take the vacated side spot.
function MonthDueCalendar({ rows, bg, faint, border, text, muted }) {
  const [offset, setOffset] = useState(0);
  const now = new Date();
  const focused = new Date(now.getFullYear(), now.getMonth() + offset, 1);

  const billColor = CATEGORY_ACCENT.BILL;
  const subColor = CATEGORY_ACCENT.SUBSCRIPTION;

  const slots = [-2, -1, 0, 1, 2];

  return (
    <div>
      <div className="flex items-center justify-center gap-3" style={{ marginBottom: 16 }}>
        <button
          onClick={() => setOffset(o => o - 1)}
          aria-label="Previous month"
          className="rounded-lg cursor-pointer transition-colors"
          style={{ padding: 6, color: muted }}
          onMouseEnter={e => e.currentTarget.style.color = text}
          onMouseLeave={e => e.currentTarget.style.color = muted}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h3 className="text-xl font-bold tracking-tight" style={{ color: text, minWidth: "11ch", textAlign: "center" }}>
          {focused.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </h3>
        <button
          onClick={() => setOffset(o => o + 1)}
          aria-label="Next month"
          className="rounded-lg cursor-pointer transition-colors"
          style={{ padding: 6, color: muted }}
          onMouseEnter={e => e.currentTarget.style.color = text}
          onMouseLeave={e => e.currentTarget.style.color = muted}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>

      <div style={{ position: "relative", overflow: "hidden" }}>
        {/* Invisible spacer, sized like the focused card, so this relative
            wrapper has a real height to lay the absolutely-positioned slots
            over - those slots don't otherwise contribute any height of
            their own. Keeps the carousel's footprint correct at any screen
            width without a guessed pixel height. overflow:hidden clips the
            buffer slots sitting off past the visible edges (their whole
            point is to stay out of view until they slide in) so they don't
            expand this box into a scroll container. */}
        <div aria-hidden style={{ visibility: "hidden", width: `${FOCUSED_WIDTH}%`, margin: "0 auto", padding: "14px 16px" }}>
          <MiniMonthGrid rows={rows} date={focused} cellFont={18} gap={4} radius={6} faint={faint} text={text} muted={muted} />
        </div>

        {slots.map(slot => {
          const monthDate = new Date(now.getFullYear(), now.getMonth() + offset + slot, 1);
          const key = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;
          const isFocused = slot === 0;
          const isSide = Math.abs(slot) === 1;
          const width = isFocused ? FOCUSED_WIDTH : SIDE_WIDTH;
          const spacing = isSide ? SIDE_SPACING : BUFFER_SPACING;
          const center = slot === 0 ? 50 : 50 + Math.sign(slot) * spacing;
          const left = center - width / 2;
          const opacity = isFocused ? 1 : isSide ? 0.55 : 0;
          const todayInMonth = isFocused && offset === 0 ? now.getDate() : undefined;

          return (
            <div
              key={key}
              className="rounded-2xl"
              style={{
                position: "absolute", top: 0, left: `${left}%`, width: `${width}%`,
                padding: isFocused ? "14px 16px" : "12px 14px",
                backgroundColor: isFocused ? bg : "transparent",
                border: `1px solid ${isFocused ? "transparent" : border}`,
                opacity, zIndex: isFocused ? 2 : 1,
                pointerEvents: isFocused ? "auto" : "none",
                transition: CAROUSEL_TRANSITION,
              }}
            >
              <MiniMonthGrid
                rows={rows} date={monthDate} today={todayInMonth}
                cellFont={isFocused ? 18 : 14} gap={isFocused ? 4 : 3} radius={isFocused ? 6 : 4}
                faint={faint} text={text} muted={muted} showLabel={!isFocused}
              />
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, fontSize: 12.5, color: muted, marginTop: 14, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: billColor, display: "inline-block" }} /> Bill
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: subColor, display: "inline-block" }} /> Subscription
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: `linear-gradient(135deg, ${billColor} 50%, ${subColor} 50%)`, display: "inline-block" }} /> Both
        </span>
      </div>
    </div>
  );
}

// inline=true   → renders as a flush panel inside the drawer (no modal chrome)
// desktop=true  → full main-content-page layout: stat header + roomier table
// neither/false → renders as a centred modal overlay
export default function RecurringPaymentsModal({ onClose, inline = false, desktop = false, addSignal, onSaveStateChange, mobile = false, onDelete, onSaved }) {
  const bg     = HOME_SURFACE;
  const border = HOME_DIVIDER;
  const text   = HOME_TEXT;
  const muted  = HOME_MUTED;
  const faint  = `color-mix(in srgb, ${text} 5%, ${bg})`;

  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [editCell, setEditCell]     = useState(null);
  const [editValue, setEditValue]   = useState("");
  const [drafts, setDrafts]         = useState([]);
  const [isSaving, setIsSaving]     = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [deleted, setDeleted]       = useState(new Set());
  const [deleteError, setDeleteError] = useState(false);
  const [hoverRow, setHoverRow]     = useState(null);
  const originalRowsRef             = useRef([]);
  const rowsRef                     = useRef([]);
  rowsRef.current = rows; // always current — no stale-closure risk in async handlers

  // Desktop card grid's detail modal (clicking a card opens it instead of a
  // per-card edit button; delete lives in here now too). Stores just the id,
  // not the row object - deriving the row fresh from `rows` on every render
  // keeps it showing live edits instead of a stale snapshot from whenever it
  // was opened.
  const [detailRowId, setDetailRowId] = useState(null);
  const [detailDeleteConfirm, setDetailDeleteConfirm] = useState(false);
  const detailRow = rows.find(r => r.id === detailRowId) ?? null;
  function openDetail(row) { setDetailRowId(row.id); setDetailDeleteConfirm(false); }
  function closeDetail() { setDetailRowId(null); setDetailDeleteConfirm(false); }
  function handleDetailDelete() {
    if (!detailDeleteConfirm) {
      setDetailDeleteConfirm(true);
      setTimeout(() => setDetailDeleteConfirm(false), 3000);
      return;
    }
    const id = detailRowId;
    closeDetail();
    handleDelete(id);
  }

  // Same "bump a counter, watch it" signal MobileDashboard already uses for
  // its own Recurring "+" button - Dashboard.jsx's page-level header lives
  // outside this component, so this is how its click reaches in here.
  const prevAddSignal = useRef(addSignal);
  useEffect(() => {
    if (addSignal !== prevAddSignal.current) {
      prevAddSignal.current = addSignal;
      setDrafts(prev => [...prev, newDraft()]);
    }
  }, [addSignal]);

  useEffect(() => {
    getRecurringPayments()
      .then(r => { setRows(r.data); originalRowsRef.current = r.data; })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Inline edit ───────────────────────────────────────────────────────────

  const startEdit = (id, field, value) => {
    setEditCell({ id, field });
    setEditValue(String(value));
  };

  const commitEdit = (id, field) => {
    setEditCell(null);
    const row = rowsRef.current.find(r => r.id === id);
    if (!row) return;

    let parsed = editValue.trim();
    if (field === "amount") {
      const n = parseFloat(parsed);
      if (isNaN(n) || n <= 0) return;
      parsed = n;
    } else if (field === "day_of_month") {
      if (parsed === "") {
        if (!row.is_estimate) return; // day_of_month required unless estimate
        parsed = null;
      } else {
        const n = parseInt(parsed, 10);
        if (isNaN(n) || n < 1 || n > 31) return;
        parsed = n;
      }
    } else {
      if (!parsed) return;
    }

    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: parsed } : r));
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (id) => {
    setDeleted(s => new Set(s).add(id));
    setTimeout(() => {
      setRows(prev => prev.filter(r => r.id !== id));
      setDeleted(s => { const n = new Set(s); n.delete(id); return n; });
    }, 700);
    try {
      await deleteRecurringPayment(id);
      onDelete?.();
    } catch {
      setDeleted(s => { const n = new Set(s); n.delete(id); return n; });
      setRows(prev => {
        if (prev.some(r => r.id === id)) return prev;
        const orig = originalRowsRef.current.find(r => r.id === id);
        return orig ? [...prev, orig] : prev;
      });
      setDeleteError(true);
      setTimeout(() => setDeleteError(false), 3000);
    }
  };

  // ── Toggle category ───────────────────────────────────────────────────────

  const toggleCategory = (id) => {
    setRows(prev => prev.map(r =>
      r.id === id ? { ...r, category: r.category === "SUBSCRIPTION" ? "BILL" : "SUBSCRIPTION" } : r
    ));
  };

  // ── Toggle estimate ──────────────────────────────────────────────────────

  const toggleEstimate = (id) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, is_estimate: !r.is_estimate } : r));
  };

  // ── Dirty check ───────────────────────────────────────────────────────────

  const anyDraftValid = drafts.some(isDraftValid);

  const isDirty = drafts.length > 0 || rows.some(row => {
    const orig = originalRowsRef.current.find(r => r.id === row.id);
    if (!orig) return false;
    if (row.name !== orig.name ||
      Math.abs(parseFloat(row.amount) - parseFloat(orig.amount)) > 0.001 ||
      row.day_of_month !== orig.day_of_month ||
      row.category !== orig.category ||
      row.is_estimate !== orig.is_estimate) return true;
    if (editCell?.id === row.id) {
      const f = editCell.field;
      if (f === "name") return editValue.trim() !== String(orig.name);
      if (f === "amount") { const n = parseFloat(editValue); return !isNaN(n) && Math.abs(n - parseFloat(orig.amount)) > 0.001; }
      if (f === "day_of_month") { const n = parseInt(editValue, 10); return !isNaN(n) && n !== orig.day_of_month; }
    }
    return false;
  });

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (isSaving || !isDirty) return;
    setIsSaving(true);
    try {
      // POST all valid drafts in parallel
      if (anyDraftValid) {
        const validDrafts = drafts.filter(isDraftValid);
        const results = await Promise.all(
          validDrafts.map(d => createRecurringPayment({
            name: d.name.trim(),
            amount: parseFloat(d.amount),
            day_of_month: d.day_of_month === "" ? null : parseInt(d.day_of_month, 10),
            category: d.category,
            is_estimate: d.is_estimate,
          }))
        );
        const newRows = results.map(r => r.data);
        setRows(prev => [...prev, ...newRows]);
        originalRowsRef.current = [...originalRowsRef.current, ...newRows];
        setDrafts(prev => prev.filter(d => !isDraftValid(d)));
      }

      // PATCH dirty rows — read from rowsRef so we always have the latest state
      const currentRows = rowsRef.current;
      const dirtyRows = currentRows.filter(row => {
        const orig = originalRowsRef.current.find(r => r.id === row.id);
        if (!orig) return false;
        return row.name !== orig.name ||
          Math.abs(parseFloat(row.amount) - parseFloat(orig.amount)) > 0.001 ||
          row.day_of_month !== orig.day_of_month ||
          row.category !== orig.category ||
          row.is_estimate !== orig.is_estimate;
      });

      await Promise.all(dirtyRows.map(row => {
        const orig = originalRowsRef.current.find(r => r.id === row.id);
        const changes = {};
        if (row.name !== orig.name) changes.name = row.name;
        if (Math.abs(parseFloat(row.amount) - parseFloat(orig.amount)) > 0.001) changes.amount = parseFloat(row.amount);
        if (row.day_of_month !== orig.day_of_month) changes.day_of_month = row.day_of_month;
        if (row.category !== orig.category) changes.category = row.category;
        if (row.is_estimate !== orig.is_estimate) changes.is_estimate = row.is_estimate;
        return updateRecurringPayment(row.id, changes);
      }));

      // Update originalRowsRef row-by-row so we don't clobber anything
      dirtyRows.forEach(row => {
        const idx = originalRowsRef.current.findIndex(r => r.id === row.id);
        if (idx !== -1) originalRowsRef.current[idx] = { ...row };
      });

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
      onSaved?.();
    } catch {}
    finally { setIsSaving(false); }
  };

  useEffect(() => {
    onSaveStateChange?.({ isDirty, isSaving, saveStatus, onSave: handleSave });
  }, [isDirty, isSaving, saveStatus, drafts]);

  // ── Cell renderers ────────────────────────────────────────────────────────

  const renderDisplay = (row, field) => {
    if (field === "amount") {
      return (
        <span style={{ fontVariantNumeric: "tabular-nums", color: row.is_estimate ? muted : undefined }}>
          {row.is_estimate ? "~" : ""}{fmt(row.amount)}
        </span>
      );
    }
    if (field === "day_of_month") {
      if (row.day_of_month == null) return <span style={{ color: muted }}>—</span>;
      return <span>every {ordinal(row.day_of_month)}</span>;
    }
    return <span style={{ fontWeight: 500 }}>{row[field]}</span>;
  };

  const estimateToggle = (active, onClick) => (
    <button
      onClick={onClick}
      title="Estimate (no fixed due date)"
      style={{
        flexShrink: 0,
        fontSize: "10px",
        fontWeight: 700,
        width: "16px",
        height: "16px",
        borderRadius: "4px",
        border: `1px solid ${active ? CATEGORY_ACCENT.SAVINGS : "transparent"}`,
        color: active ? CATEGORY_ACCENT.SAVINGS : muted,
        backgroundColor: active ? `color-mix(in srgb, ${CATEGORY_ACCENT.SAVINGS} 15%, transparent)` : "transparent",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      ~
    </button>
  );

  const renderCell = (row, field) => {
    const isEditing = editCell?.id === row.id && editCell?.field === field;

    if (field === "category") {
      const color = CATEGORY_ACCENT[row.category];
      return (
        <button
          key={row.category}
          onClick={() => toggleCategory(row.id)}
          style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: "999px",
            fontSize: mobile ? "13px" : "11px",
            fontWeight: 600,
            color,
            backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
            border: "none",
            cursor: "pointer",
            animation: "rp-pill-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
            transformOrigin: "center",
          }}
        >
          {CATEGORY_CONFIG[row.category]?.label ?? row.category}
        </button>
      );
    }

    let content;
    if (isEditing) {
      content = (
        field === "amount" ? (
        <CurrencyInput autoFocus
          value={editValue}
          onChange={v => setEditValue(v)}
          onBlur={() => commitEdit(row.id, field)}
          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditCell(null); }}
          style={{
            width: "100%", background: "transparent", color: text,
            border: "none", outline: "none", fontSize: mobile ? "15px" : "13px", fontFamily: "inherit",
          }}
        />
        ) : (
        <input autoFocus
          type={field === "day_of_month" ? "number" : "text"}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => commitEdit(row.id, field)}
          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditCell(null); }}
          min={field === "day_of_month" ? 1 : undefined}
          max={field === "day_of_month" ? 31 : undefined}
          style={{
            width: "100%", background: "transparent", color: text,
            border: "none", outline: "none", fontSize: mobile ? "15px" : "13px", fontFamily: "inherit",
          }}
        />
        )
      );
    } else {
      content = (
        <div onClick={() => startEdit(row.id, field, row[field] ?? "")}
          style={{ cursor: "text", minHeight: "20px" }}
        >
          {renderDisplay(row, field)}
        </div>
      );
    }

    if (field === "day_of_month") {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>{content}</div>
          {estimateToggle(row.is_estimate, () => toggleEstimate(row.id))}
        </div>
      );
    }

    return content;
  };

  // ── Column config ─────────────────────────────────────────────────────────

  const COLS = [
    { field: "name",         label: "Name",   width: "33%" },
    { field: "amount",       label: "Amount", width: "20%" },
    { field: "day_of_month", label: "Recurs", width: "22%" },
    { field: "category",     label: "Type",   width: "20%" },
  ];

  const tdStyle = (last = false, first = false) => ({
    padding: "8px 10px",
    paddingLeft: first ? "16px" : "10px",
    borderRight: last ? undefined : `1px solid ${border}`,
    verticalAlign: "middle",
  });

  // Show + when there are no drafts, or when the last draft is fully filled out
  const showAddRow = !loading && (drafts.length === 0 || isDraftValid(drafts[drafts.length - 1]));

  // Desktop-only stat header - bills vs. subscriptions split, since those are
  // the two categories this list actually uses (toggleCategory only flips
  // between them).
  const bills = rows.filter(r => r.category === "BILL");
  const subscriptions = rows.filter(r => r.category === "SUBSCRIPTION");
  const sumOf = (list) => list.reduce((s, r) => s + parseFloat(r.amount), 0);

  // Desktop-only card grid, split into a Bills section and a Subscriptions
  // section (the two categories this list actually uses) instead of one
  // flat mixed grid. Same renderCell/drafts/handlers as the table underneath,
  // just laid out as cards.
  //
  // Each card: a category-colored dot + name up top, a divider, then the
  // amount/day on the left with the category pill (still the only control
  // that moves a row between sections) bottom-right - gives the card real
  // internal structure instead of three lines stacked with no separation.
  // Read-only now - clicking the card opens the detail modal (openDetail)
  // instead of editing a field in place, and there's no per-card delete
  // button any more (moved into that modal too).
  function renderCard(row) {
    const catColor = CATEGORY_ACCENT[row.category];
    return (
      <div
        key={row.id}
        className="rounded-2xl p-5"
        onClick={() => openDetail(row)}
        style={{
          backgroundColor: bg, cursor: "pointer",
          opacity: deleted.has(row.id) ? 0.35 : 1, transition: "opacity 0.2s ease", pointerEvents: deleted.has(row.id) ? "none" : "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: catColor, flexShrink: 0 }} />
          <div style={{ fontSize: 15, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</div>
        </div>
        <div style={{ borderTop: `1px solid ${border}`, marginTop: 12, paddingTop: 12, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{renderDisplay(row, "amount")}</div>
            <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>{renderDisplay(row, "day_of_month")}</div>
          </div>
          <span style={{
            flexShrink: 0, display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
            color: catColor, backgroundColor: `color-mix(in srgb, ${catColor} 15%, transparent)`,
          }}>
            {CATEGORY_CONFIG[row.category]?.label ?? row.category}
          </span>
        </div>
      </div>
    );
  }

  function renderDraftCard(d, idx) {
    const isLast = idx === drafts.length - 1;
    const color = CATEGORY_ACCENT[d.category];
    return (
      <div key={d._lid} className="rounded-2xl p-5" style={{ backgroundColor: faint, animation: "rp-row-in 0.2s ease-out" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <input
            autoFocus={isLast}
            type="text"
            value={d.name}
            placeholder="e.g. Netflix"
            onChange={e => setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, name: e.target.value } : x))}
            onKeyDown={e => { if (e.key === "Escape") setDrafts(prev => prev.filter((_, xi) => xi !== idx)); }}
            style={{ flex: 1, minWidth: 0, background: "transparent", color: text, border: "none", outline: "none", fontSize: 15, fontWeight: 700, fontFamily: "inherit" }}
          />
          <button
            onClick={() => setDrafts(prev => prev.filter((_, xi) => xi !== idx))}
            title="Cancel"
            style={{ color: muted, cursor: "pointer", background: "none", border: "none", padding: 3, display: "inline-flex", flexShrink: 0 }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div style={{ borderTop: `1px solid ${border}`, marginTop: 12, paddingTop: 12 }}>
          <CurrencyInput
            value={d.amount}
            placeholder="0.00"
            onChange={v => setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, amount: v } : x))}
            style={{ fontSize: 20, fontWeight: 700, background: "transparent", color: text, border: "none", outline: "none", fontFamily: "inherit", padding: 0 }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="number"
                value={d.day_of_month}
                placeholder={d.is_estimate ? "optional" : "1–31"}
                min={1} max={31}
                onChange={e => setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, day_of_month: e.target.value } : x))}
                style={{ width: 60, background: "transparent", color: muted, border: "none", outline: "none", fontSize: 12, fontFamily: "inherit" }}
              />
              {estimateToggle(d.is_estimate, () => setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, is_estimate: !x.is_estimate } : x)))}
            </div>
            <button
              onClick={() => setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, category: x.category === "SUBSCRIPTION" ? "BILL" : "SUBSCRIPTION" } : x))}
              style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, color, backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, border: "none", cursor: "pointer", flexShrink: 0 }}
            >
              {CATEGORY_CONFIG[d.category]?.label ?? d.category}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const draftsWithIndex = drafts.map((d, idx) => ({ d, idx }));

  function categorySection(categoryKey, label, sectionRows) {
    const sectionDrafts = draftsWithIndex.filter(({ d }) => d.category === categoryKey);
    const color = CATEGORY_ACCENT[categoryKey];
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <p style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.2px", color: text, margin: 0 }}>{label}</p>
          <span style={{
            fontSize: 12.5, fontWeight: 700, color, fontVariantNumeric: "tabular-nums",
            padding: "3px 10px", borderRadius: 999, backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
          }}>
            {fmt(sumOf(sectionRows))}/mo
          </span>
        </div>
        {sectionRows.length === 0 && sectionDrafts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px 16px", border: `1px dashed ${border}`, borderRadius: 16 }}>
            <p style={{ fontSize: 12.5, color: muted, margin: 0 }}>No {label.toLowerCase()} yet</p>
          </div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
            {sectionRows.map(row => renderCard(row))}
            {sectionDrafts.map(({ d, idx }) => renderDraftCard(d, idx))}
          </div>
        )}
      </div>
    );
  }

  // Shared by both layouts below (table/sidebar and this desktop card grid) -
  // previously defined only inside tableContent's own <style>, so a draft
  // card added here on desktop (which renders desktopCardsContent, never
  // tableContent) referenced these keyframe names but they were never
  // actually in the DOM - the animation was a silent no-op (#123 follow-up).
  const keyframesStyle = (
    <style>{`
        @keyframes rp-bar-sweep {
          0%   { transform: scaleX(0); opacity: 0.9; }
          55%  { transform: scaleX(1); opacity: 0.9; }
          100% { transform: scaleX(1); opacity: 0;   }
        }
        @keyframes rp-row-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes rp-pill-pop {
          0%   { transform: scale(0.88); opacity: 0.6; }
          100% { transform: scale(1);    opacity: 1;   }
        }
    `}</style>
  );

  const desktopCardsContent = (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {keyframesStyle}
      {rows.length === 0 && drafts.length === 0 && !loading ? (
        <div style={{ textAlign: "center", padding: "28px 16px", border: `1px dashed ${border}`, borderRadius: 16 }}>
          <p style={{ fontSize: 13, color: muted, margin: 0 }}>No recurring payments yet</p>
        </div>
      ) : (
        <>
          {categorySection("BILL", "Bills", bills)}
          <div style={{ borderTop: `1px solid ${border}` }} />
          {categorySection("SUBSCRIPTION", "Subscriptions", subscriptions)}
        </>
      )}
      {rows.length > 0 && (
        <MonthDueCalendar rows={rows} bg={bg} faint={faint} border={border} text={text} muted={muted} />
      )}
    </div>
  );

  // ── Table content ─────────────────────────────────────────────────────────

  const tableContent = (
    <>
      {keyframesStyle}

      <div style={{
        overflowX: "auto",
        overflowY: "auto",
        flex: 1,
        ...(inline || desktop ? {} : { minHeight: "380px", maxHeight: "60vh" }),
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: mobile ? "15px" : "13px", tableLayout: "fixed" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${border}`, backgroundColor: faint, position: "sticky", top: 0 }}>
              {COLS.map(({ label, width }, i) => (
                <th key={i} style={{
                  ...tdStyle(i === COLS.length - 1, i === 0),
                  fontWeight: 600,
                  fontSize: mobile ? "12px" : "10px",
                  color: muted,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  width,
                  textAlign: "left",
                  backgroundColor: faint,
                }}>
                  {label}
                </th>
              ))}
              <th style={{ width: "36px", backgroundColor: faint }} />
            </tr>
          </thead>

          <tbody>
            {/* Skeletons */}
            {loading && SKELETON_WIDTHS.map((widths, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${border}` }}>
                {widths.map((w, j) => (
                  <td key={j} style={tdStyle(j === widths.length - 1, j === 0)}>
                    <Skel h="11px" w={w} style={{ borderRadius: 4 }} />
                  </td>
                ))}
                <td style={tdStyle(true)} />
              </tr>
            ))}

            {/* Empty state */}
            {!loading && rows.length === 0 && drafts.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "48px 16px", textAlign: "center", color: muted }}>
                  <div style={{ fontSize: "13px", fontWeight: 500 }}>No recurring payments yet</div>
                  <div style={{ fontSize: "12px", marginTop: "4px" }}>Click + to get started</div>
                </td>
              </tr>
            )}

            {/* Existing rows */}
            {!loading && rows.map(row => (
              <tr key={row.id}
                onMouseEnter={() => !deleted.has(row.id) && setHoverRow(row.id)}
                onMouseLeave={() => setHoverRow(null)}
                style={{
                  borderBottom: `1px solid ${border}`,
                  backgroundColor: hoverRow === row.id && !deleted.has(row.id) ? faint : undefined,
                  pointerEvents: deleted.has(row.id) ? "none" : undefined,
                }}
              >
                {deleted.has(row.id) ? (
                  <td colSpan={5} style={{ padding: 0, position: "relative", overflow: "hidden", height: "37px" }}>
                    <div style={{
                      position: "absolute",
                      inset: 0,
                      backgroundColor: `color-mix(in srgb, ${HOME_EXPENSE} 18%, ${bg})`,
                      transformOrigin: "right center",
                      animation: "rp-bar-sweep 0.7s ease-out forwards",
                    }} />
                  </td>
                ) : (
                  <>
                    {COLS.map(({ field }, i) => (
                      <td key={field} style={{
                        ...tdStyle(i === COLS.length - 1, i === 0),
                        backgroundColor: editCell?.id === row.id && editCell?.field === field
                          ? `color-mix(in srgb, ${text} 5%, ${bg})` : undefined,
                      }}>
                        {renderCell(row, field)}
                      </td>
                    ))}
                    <td style={{ padding: "8px 6px", textAlign: "center", width: "52px" }}>
                      <button
                        onClick={() => handleDelete(row.id)}
                        style={{
                          color: muted,
                          opacity: hoverRow === row.id ? 1 : 0,
                          transition: "opacity 0.15s, color 0.15s",
                          cursor: "pointer", background: "none", border: "none",
                          padding: "1px", display: "inline-flex", alignItems: "center",
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = HOME_EXPENSE}
                        onMouseLeave={e => e.currentTarget.style.color = muted}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
                        </svg>
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}

            {/* Draft rows */}
            {drafts.map((d, idx) => {
              const isLast = idx === drafts.length - 1;
              const color  = CATEGORY_ACCENT[d.category];
              return (
                <tr key={d._lid} style={{ borderBottom: `1px solid ${border}`, backgroundColor: faint, animation: "rp-row-in 0.2s ease-out" }}>
                  {[
                    { field: "name",         type: "text",   placeholder: "e.g. Netflix" },
                    { field: "amount",       type: "number", placeholder: "0.00"         },
                    { field: "day_of_month", type: "number", placeholder: d.is_estimate ? "optional" : "1–31" },
                  ].map(({ field, type, placeholder }, i) => (
                    <td key={field} style={tdStyle(false, i === 0)}>
                      <div style={{ display: "flex", alignItems: "center", gap: field === "day_of_month" ? 6 : 0 }}>
                      {field === "amount" ? (
                      <CurrencyInput
                        value={d[field]}
                        placeholder={placeholder}
                        onChange={v => setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, [field]: v } : x))}
                        onKeyDown={e => { if (e.key === "Escape") setDrafts(prev => prev.filter((_, xi) => xi !== idx)); }}
                        style={{
                          width: "100%", background: "transparent", color: text,
                          border: "none", outline: "none", fontSize: mobile ? "15px" : "13px", fontFamily: "inherit",
                        }}
                      />
                      ) : (
                      <input
                        autoFocus={i === 0 && isLast}
                        type={type}
                        value={d[field]}
                        placeholder={placeholder}
                        onChange={e => setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, [field]: e.target.value } : x))}
                        onKeyDown={e => { if (e.key === "Escape") setDrafts(prev => prev.filter((_, xi) => xi !== idx)); }}
                        min={field === "day_of_month" ? 1 : undefined}
                        max={field === "day_of_month" ? 31 : undefined}
                        style={{
                          width: "100%", background: "transparent", color: text,
                          border: "none", outline: "none", fontSize: mobile ? "15px" : "13px", fontFamily: "inherit",
                        }}
                      />
                      )}
                      {field === "day_of_month" && estimateToggle(d.is_estimate, () => setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, is_estimate: !x.is_estimate } : x)))}
                      </div>
                    </td>
                  ))}
                  <td style={tdStyle(true)}>
                    <button
                      key={d.category}
                      onClick={() => setDrafts(prev => prev.map((x, xi) => xi === idx ? { ...x, category: x.category === "SUBSCRIPTION" ? "BILL" : "SUBSCRIPTION" } : x))}
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "999px",
                        fontSize: mobile ? "13px" : "11px",
                        fontWeight: 600,
                        color,
                        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
                        border: "none",
                        cursor: "pointer",
                        animation: "rp-pill-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
                        transformOrigin: "center",
                      }}
                    >
                      {CATEGORY_CONFIG[d.category]?.label ?? d.category}
                    </button>
                  </td>
                  <td style={{ padding: "8px 12px 8px 6px", width: "52px" }}>
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                      <button
                        onClick={() => setDrafts(prev => prev.filter((_, xi) => xi !== idx))}
                        title="Cancel"
                        style={{ color: muted, cursor: "pointer", background: "none", border: "none", padding: "2px", display: "inline-flex" }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* Add row — always shown when no drafts, shown again once last draft is complete */}
            {showAddRow && (
              <tr
                onClick={() => setDrafts(prev => [...prev, newDraft()])}
                style={{ cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.querySelector("span").style.color = text}
                onMouseLeave={e => e.currentTarget.querySelector("span").style.color = muted}
              >
                <td colSpan={5} style={{ padding: "10px 16px", textAlign: "center", borderTop: `1px solid ${border}` }}>
                  <span style={{ fontSize: "18px", color: muted, lineHeight: 1, transition: "color 0.15s" }}>+</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{
        padding: "8px 16px",
        borderTop: `1px solid ${border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        flexShrink: 0,
      }}>
        {deleteError && (
          <span style={{ fontSize: mobile ? "13px" : "11px", color: HOME_EXPENSE }}>
            Failed to delete — try again
          </span>
        )}
        <span style={{ fontSize: mobile ? "13px" : "11px", color: muted }}>
          {rows.length} {rows.length === 1 ? "payment" : "payments"}
        </span>
      </div>
    </>
  );

  // ── Save button (modal mode only) ─────────────────────────────────────────

  const saveButton = (
    <button
      onClick={handleSave}
      disabled={!isDirty || isSaving}
      style={{
        fontSize: "12px",
        fontWeight: 600,
        padding: "4px 12px",
        borderRadius: "8px",
        border: `1px solid ${isDirty ? HOME_INCOME : border}`,
        color: isDirty ? HOME_INCOME : muted,
        backgroundColor: isDirty
          ? `color-mix(in srgb, ${HOME_INCOME} 12%, transparent)`
          : "transparent",
        cursor: isDirty && !isSaving ? "pointer" : "default",
        opacity: isSaving ? 0.6 : 1,
        transition: "all 0.2s ease",
      }}
    >
      {isSaving ? "Saving…" : "Save"}
    </button>
  );

  // ── Desktop mode ──────────────────────────────────────────────────────────

  if (desktop) {
    return (
      <div style={{ padding: "24px 28px 5px", display: "flex", flexDirection: "column", gap: 24, color: text }}>
        {loading ? (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
            {[...Array(4)].map((_, i) => <Skel key={i} h={128} style={{ borderRadius: 16, opacity: 1 - i * 0.12 }} />)}
          </div>
        ) : desktopCardsContent}

        {/* Detail/edit modal - clicking any card opens this instead of an
            in-card edit; delete now lives in here instead of on the card.
            Reuses the exact same click-to-edit cells (renderCell/editCell)
            the table version uses, just relocated. */}
        {detailRow && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={e => { if (e.target === e.currentTarget) closeDetail(); }}
          >
            <div className="w-full max-w-sm rounded-2xl p-5" style={{ backgroundColor: bg }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: CATEGORY_ACCENT[detailRow.category], flexShrink: 0 }} />
                  <p style={{ fontSize: 16, fontWeight: 700, color: text, margin: 0 }}>Recurring Payment</p>
                </div>
                <button onClick={closeDetail} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: muted, display: "flex", padding: 2 }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <p style={{ fontSize: 10, color: muted, marginBottom: 3, paddingLeft: 2 }}>Name</p>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{renderCell(detailRow, "name")}</div>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 10, color: muted, marginBottom: 3, paddingLeft: 2 }}>Amount</p>
                    <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{renderCell(detailRow, "amount")}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 10, color: muted, marginBottom: 3, paddingLeft: 2 }}>Recurs</p>
                    <div style={{ fontSize: 14 }}>{renderCell(detailRow, "day_of_month")}</div>
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: 10, color: muted, marginBottom: 3, paddingLeft: 2 }}>Type</p>
                  {renderCell(detailRow, "category")}
                </div>
              </div>
              <button
                onClick={handleDetailDelete}
                style={{
                  marginTop: 16, paddingTop: 14, width: "100%", borderTop: `1px solid ${border}`, borderRadius: 0,
                  background: "transparent", color: detailDeleteConfirm ? HOME_EXPENSE : muted,
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                {detailDeleteConfirm ? "Tap again to confirm delete" : "Delete recurring payment"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Inline mode ───────────────────────────────────────────────────────────

  if (inline) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", color: text,
        borderTop: `1px solid ${border}`,
      }}>
        {tableContent}
      </div>
    );
  }

  // ── Modal mode ────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden"
        style={{ backgroundColor: bg, borderColor: border, color: text, display: "flex", flexDirection: "column" }}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: border }}>
          <div>
            <h2 className="text-base font-semibold">Recurring Payments</h2>
            <p className="text-xs mt-0.5" style={{ color: muted }}>Click any cell to edit · Enter to confirm · Esc to cancel</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {saveButton}
            <button onClick={onClose} className="cursor-pointer" style={{ color: muted }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {tableContent}
      </div>
    </div>
  );
}
