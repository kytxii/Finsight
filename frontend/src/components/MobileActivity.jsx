import { useState, useRef, useEffect, useMemo } from "react";
import SwipeableRow from "./SwipeableRow";
import AmountSortButton from "./AmountSortButton";
import { CATEGORIES, CATEGORY_CONFIG, INCOME_TYPES, fmt } from "../utils/finance";
import { relativeDate } from "../utils/mobileFormat";
import {
  HOME_TEXT, HOME_MUTED, HOME_SURFACE, HOME_DIVIDER, HOME_INCOME, HOME_ACCENT,
  TILE_COLOR, CATEGORY_ICON,
} from "./categoryVisuals";

// Pure transaction browser replacing the old desktop-derived Analytics tab
// (#29): category click-through + 3 sort toggles + an all-time, month-grouped
// list. No date-range filtering - history browsing only, not analysis
// (charts live in the parent MobileAnalytics). Local state
// (category/sort/scroll) is intentionally NOT lifted to MobileDashboard -
// this tab always starts unfiltered on tab switch.

const PAGE_SIZE = 20; // fixed-count pagination, used only when an explicit sort is active (no months to page by)
const MONTHS_PER_PAGE = 1; // default (date-desc, grouped) view pages by whole months instead

function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

// Distinct month keys in the order they appear, most recent first - `arr`
// must already be date-descending so each month's rows are contiguous.
function distinctMonthsDesc(arr) {
  const out = [];
  for (const t of arr) {
    const mk = monthKey(t.transaction_date);
    if (out[out.length - 1] !== mk) out.push(mk);
  }
  return out;
}

// Category click-through button has a fixed width so its label changing
// length (e.g. "Debt" -> "Subscriptions") doesn't reflow the row above the
// list and cascade into a scroll-position jump (#29). Filled, borderless
// style to match AmountSortButton's redesign - solid `color` when active.
function CategoryButton({ label, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: 34, width: 140, borderRadius: 10, flexShrink: 0, border: "none",
        color: active ? "#fff" : HOME_MUTED,
        backgroundColor: active ? color : "rgba(255,255,255,0.06)",
        fontSize: 13, fontWeight: 600, cursor: "pointer",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}
    >
      {label}
    </button>
  );
}

function monthLabel(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function IconSearch() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={HOME_MUTED} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" />
    </svg>
  );
}

// Sort-button icons - Amount/Date show these instead of text to save width
// in the single-line control row (#29); Name shows "A–Z"/"Z–A" text instead,
// which already conveys direction on its own.
function IconDollar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M17 5.5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

function Skel({ w = "100%", h = 16, style: extra = {} }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 6, flexShrink: 0,
      background: "linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.11) 50%, rgba(255,255,255,0.05) 75%)",
      backgroundSize: "200% 100%", animation: "skel-shimmer 1.4s ease-in-out infinite", ...extra,
    }} />
  );
}

function SectionLabel({ children }) {
  return (
    <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: HOME_MUTED, margin: "0 4px 8px" }}>
      {children}
    </p>
  );
}

// `jump`: { id, token } set by MobileDashboard when a transaction is picked
// from Home's search dropdown - `token` changes on every pick (even the same
// transaction twice) so the effect below always re-fires.
export default function MobileActivity({ transactions, loading, onEditTransaction, onDeleteTransaction, jump }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [sortField, setSortField] = useState(null); // null | "amount" | "name" | "date"
  const [sortDir, setSortDir] = useState(null); // null | "asc" | "desc"
  // Two pagination cursors: the default (date-desc, grouped) view pages by
  // whole months so a scroll never lands mid-month; any explicit sort has no
  // month structure to page by, so it falls back to a fixed row count.
  const [visibleMonthCount, setVisibleMonthCount] = useState(MONTHS_PER_PAGE);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState(null);
  const [highlightId, setHighlightId] = useState(null);

  const rowRefs = useRef({});
  const sentinelRef = useRef(null);

  // Reset pagination inline inside the filter/sort change handlers, not via a
  // watching effect - an effect watching [category, query, sortField, sortDir]
  // would race the jump-to-transaction effect below on the same render and
  // clobber whatever pagination it just set (#29).
  function resetPagination() { setVisibleMonthCount(MONTHS_PER_PAGE); setVisibleCount(PAGE_SIZE); }
  function updateQuery(v) { setQuery(v); resetPagination(); }
  function updateCategory(c) { setCategory(c); resetPagination(); }
  function advanceCategory() {
    const idx = CATEGORIES.indexOf(category);
    updateCategory(CATEGORIES[(idx + 1) % CATEGORIES.length]);
  }
  // Three separate toggles, one active field at a time: tapping a different
  // field switches to it starting at that field's default direction (Name
  // starts A-Z/ascending - the expected default for alphabetical sort; Amount
  // and Date keep starting at descending, matching the original single
  // AmountSortButton's behavior). Tapping the active field's own button flips
  // to the other direction, then off (#29).
  function toggleFieldSort(field) {
    const startDir = field === "name" ? "asc" : "desc";
    if (sortField !== field) { setSortField(field); setSortDir(startDir); }
    else if (sortDir === startDir) setSortDir(startDir === "asc" ? "desc" : "asc");
    else { setSortField(null); setSortDir(null); }
    resetPagination();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((t) => {
      if (category !== "ALL" && t.category !== category) return false;
      if (!q) return true;
      return (
        t.name?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q) ||
        (CATEGORY_CONFIG[t.category]?.label ?? "").toLowerCase().includes(q) ||
        String(t.amount).includes(q)
      );
    });
  }, [transactions, query, category]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortField === "amount") {
      arr.sort((a, b) => sortDir === "asc" ? parseFloat(a.amount) - parseFloat(b.amount) : parseFloat(b.amount) - parseFloat(a.amount));
    } else if (sortField === "name") {
      arr.sort((a, b) => {
        const cmp = (a.name ?? "").localeCompare(b.name ?? "");
        return sortDir === "asc" ? cmp : -cmp;
      });
    } else if (sortField === "date") {
      arr.sort((a, b) => sortDir === "asc" ? new Date(a.transaction_date) - new Date(b.transaction_date) : new Date(b.transaction_date) - new Date(a.transaction_date));
    } else {
      arr.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
    }
    return arr;
  }, [filtered, sortField, sortDir]);

  // Default view (no explicit sort): page by whole months, not a row count,
  // so a scroll load never cuts a month off partway through. Explicit sorts
  // have no month structure to page by (amount/name order has nothing to do
  // with chronology), so those fall back to a fixed row count instead.
  const isGrouped = !sortField;
  const allMonths = useMemo(() => isGrouped ? distinctMonthsDesc(sorted) : [], [sorted, isGrouped]);
  const visibleMonths = useMemo(() => allMonths.slice(0, visibleMonthCount), [allMonths, visibleMonthCount]);

  const visible = isGrouped
    ? sorted.filter((t) => visibleMonths.includes(monthKey(t.transaction_date)))
    : sorted.slice(0, visibleCount);
  const hasMore = isGrouped ? visibleMonthCount < allMonths.length : visibleCount < sorted.length;

  // Infinite scroll via IntersectionObserver - this list lives in
  // MobileDashboard's shared <main> scroll container rather than owning one
  // itself (unlike MobilePaychecks), so a scrollTop/clientHeight check isn't
  // available here; watch a sentinel instead.
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (isGrouped) setVisibleMonthCount((c) => c + MONTHS_PER_PAGE);
        else setVisibleCount((c) => c + PAGE_SIZE);
      },
      { rootMargin: "60px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, isGrouped]);

  // Jump-to-transaction from Home's search dropdown: reset filters, compute
  // the target's index against a fresh date-desc sort (so it's correct even
  // if a different sort was active), grow pagination to include it, scroll it
  // into view, briefly highlight.
  useEffect(() => {
    if (!jump) return;
    setQuery("");
    setCategory("ALL");
    setSortField(null);
    setSortDir(null);
    // Jump always lands in the default grouped view (filters just got reset
    // above), so pagination here means "how many months", not "how many
    // rows" - find which month the target falls in and make sure it's loaded.
    const allSorted = [...transactions].sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
    const jumpMonths = distinctMonthsDesc(allSorted);
    const targetTxn = transactions.find((t) => t.id === jump.id);
    const monthIdx = targetTxn ? jumpMonths.indexOf(monthKey(targetTxn.transaction_date)) : -1;
    if (monthIdx !== -1) setVisibleMonthCount((c) => Math.max(c, MONTHS_PER_PAGE, monthIdx + 1));
    setHighlightId(jump.id);
    const clearHighlight = setTimeout(() => setHighlightId(null), 2500);
    const scrollTimer = setTimeout(() => {
      rowRefs.current[jump.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    return () => { clearTimeout(clearHighlight); clearTimeout(scrollTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on a new jump request, not every transactions change
  }, [jump]);

  // Grouped by month when browsing chronologically (the default sort); flat
  // once any explicit sort field is chosen, since a sorted list has no
  // meaningful month boundaries (#29, mirrors MobileCategory's own
  // sort-flattens-grouping behavior).
  const groups = useMemo(() => {
    if (sortField) return null;
    const out = [];
    visible.forEach((t) => {
      const month = monthLabel(t.transaction_date);
      const g = out[out.length - 1];
      if (!g || g.month !== month) out.push({ month, items: [t] });
      else g.items.push(t);
    });
    return out;
  }, [visible, sortField]);

  const cardStyle = { backgroundColor: HOME_SURFACE, borderRadius: 18, overflow: "hidden" };

  function Row({ t, first }) {
    const Icon = CATEGORY_ICON[t.category];
    const tileColor = TILE_COLOR[t.category] ?? HOME_MUTED;
    const isIncome = INCOME_TYPES.has(t.category);
    // SwipeableRow doesn't forward a ref, so the scroll-into-view target for
    // jump-to-transaction wraps it in a plain div instead (#29).
    return (
      <div ref={(el) => { rowRefs.current[t.id] = el; }}>
        <SwipeableRow
          id={t.id}
          openId={openId}
          setOpenId={setOpenId}
          onEdit={() => onEditTransaction(t)}
          onDelete={() => onDeleteTransaction(t.id)}
          border={first ? "transparent" : HOME_DIVIDER}
          surface={HOME_SURFACE}
          text={HOME_TEXT}
          editBg={HOME_ACCENT}
          editColor="#fff"
          deleteBg={TILE_COLOR.EXPENSE}
          deleteColor="#fff"
        >
          <div style={{
            display: "flex", alignItems: "center", gap: 14, padding: "11px 14px",
            backgroundColor: highlightId === t.id ? `color-mix(in srgb, ${HOME_ACCENT} 18%, ${HOME_SURFACE})` : HOME_SURFACE,
            transition: "background-color 0.4s ease",
          }}>
            <div style={{
              flex: "0 0 auto", width: 40, height: 40, borderRadius: "50%", background: tileColor,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16)",
            }}>
              <Icon />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.2px", color: HOME_TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t.name}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 500, color: HOME_MUTED }}>
                {relativeDate(t.transaction_date)}
              </p>
            </div>
            <span style={{ flex: "0 0 auto", marginLeft: 10, fontSize: 16, fontWeight: 600, letterSpacing: "-0.2px", fontVariantNumeric: "tabular-nums", color: isIncome ? HOME_INCOME : HOME_TEXT }}>
              {isIncome ? "+" : "−"}{fmt(t.amount)}
            </span>
          </div>
        </SwipeableRow>
      </div>
    );
  }

  return (
    <>
      <style>{`@keyframes activityFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* Search — always visible, filters in place, no dropdown */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        borderRadius: 14, backgroundColor: HOME_SURFACE, margin: "4px 2px 14px",
      }}>
        <IconSearch />
        <input
          type="text"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          placeholder="Search transactions"
          style={{
            flex: 1, border: "none", outline: "none", background: "transparent",
            color: HOME_TEXT, fontSize: 15, minWidth: 0,
          }}
        />
        {query && (
          <button
            onClick={() => updateQuery("")}
            aria-label="Clear search"
            style={{ color: HOME_MUTED, background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Category click-through + 3 sort toggles, one line (#29). Horizontally
          scrollable rather than wrapping so the row never breaks onto a
          second line - right padding is generous so the last button (Date)
          has breathing room at full scroll instead of sitting flush against
          the edge. Amount/Date are icon-only and Category is narrower than
          before, so this should now fit without scrolling on most phones,
          but stays scrollable as a safety net on the narrowest ones. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, overflowX: "auto", padding: "0 4px 12px", scrollbarWidth: "none" }}>
        <CategoryButton
          label={category === "ALL" ? "Category" : (CATEGORY_CONFIG[category]?.label ?? category)}
          active={category !== "ALL"}
          color={category === "ALL" ? HOME_ACCENT : (TILE_COLOR[category] ?? HOME_MUTED)}
          onClick={advanceCategory}
        />
        <div style={{ width: 1, height: 18, backgroundColor: HOME_DIVIDER, flexShrink: 0 }} />
        {/* flex:1 + space-between spreads the 3 buttons across whatever width
            remains, so the last one (Date) lands at the row's right edge on
            screens wide enough to fit everything - falls back to the row's
            own overflowX:auto scroll on narrower phones instead of squeezing. */}
        <div style={{ display: "flex", flex: 1, justifyContent: "space-between", gap: 6 }}>
          <AmountSortButton
            label={sortField === "name" && sortDir === "desc" ? "Z–A" : "A–Z"}
            hideArrow
            minWidth={72}
            sort={sortField === "name" ? sortDir : null}
            onToggle={() => toggleFieldSort("name")}
            color={HOME_ACCENT}
          />
          <AmountSortButton label="Amount" icon={<IconDollar />} minWidth={72} sort={sortField === "amount" ? sortDir : null} onToggle={() => toggleFieldSort("amount")} color={HOME_ACCENT} />
          <AmountSortButton label="Date" icon={<IconCalendar />} minWidth={72} sort={sortField === "date" ? sortDir : null} onToggle={() => toggleFieldSort("date")} color={HOME_ACCENT} />
        </div>
      </div>

      {/* Full-screen tap-catcher to close an open swipe row */}
      {openId !== null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 5 }} onTouchStart={() => setOpenId(null)} onClick={() => setOpenId(null)} />
      )}

      {loading ? (
        <div style={cardStyle}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 14px", borderTop: i > 0 ? `1px solid ${HOME_DIVIDER}` : "none" }}>
              <Skel h={40} w={40} style={{ borderRadius: "50%" }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <Skel h={16} w="55%" />
                <Skel h={13} w="30%" />
              </div>
              <Skel h={16} w={60} />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p style={{ fontSize: 13, color: HOME_MUTED, textAlign: "center", padding: "30px 0" }}>No transactions found</p>
      ) : groups ? (
        groups.map((g, gi) => (
          <div key={g.month + gi} style={{ marginBottom: 18, animation: "activityFadeIn 0.3s ease" }}>
            <SectionLabel>{g.month}</SectionLabel>
            <div style={cardStyle}>
              {g.items.map((t, i) => <Row key={t.id} t={t} first={i === 0} />)}
            </div>
          </div>
        ))
      ) : (
        <div style={cardStyle}>
          {visible.map((t, i) => <Row key={t.id} t={t} first={i === 0} />)}
        </div>
      )}

      {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
    </>
  );
}
