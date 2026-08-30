import { useState, useRef, useEffect, useMemo } from "react";
import SwipeableRow from "./SwipeableRow";
import AmountSortButton from "./AmountSortButton";
import ListRowSkeleton from "../skeletons/shared/ListRowSkeleton";
import NotePill from "../shared/NotePill";
import { CATEGORIES, CATEGORY_CONFIG, INCOME_TYPES, fmt, matchesTransaction } from "../../utils/finance";
import { relativeDate } from "../../utils/mobileFormat";
import {
  HOME_TEXT, HOME_MUTED, HOME_SURFACE, HOME_DIVIDER, HOME_INCOME, HOME_ACCENT,
  TILE_COLOR, CATEGORY_ICON, TIPS_DEPOSITED,
} from "../shared/categoryVisuals";


const PAGE_SIZE = 20; // fixed-count pagination, used only when an explicit sort is active (no months to page by)
const MONTHS_PER_PAGE = 1; // default (date-desc, grouped) view pages by whole months instead

function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

// Distinct months, most recent first. `arr` must already be date-descending.
function distinctMonthsDesc(arr) {
  const out = [];
  for (const t of arr) {
    const mk = monthKey(t.transaction_date);
    if (out[out.length - 1] !== mk) out.push(mk);
  }
  return out;
}

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

function IconChevronDown({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function IconBank({ color, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" />
      <path d="M12 3 3 8h18z" />
      <path d="M5 8v10M9.5 8v10M14.5 8v10M19 8v10" />
    </svg>
  );
}

function ActivityRow({ t, first, last, openId, setOpenId, onEditTransaction, onDeleteTransaction, onEditDeposit, onDeleteDeposit, highlightId, setRowRef }) {
  const isDeposit = t.kind === "deposit";
  const Icon = CATEGORY_ICON[t.category];
  const tileColor = TILE_COLOR[t.category] ?? HOME_MUTED;
  const isIncome = isDeposit || INCOME_TYPES.has(t.category);
  const amountColor = isDeposit ? TIPS_DEPOSITED : (isIncome ? HOME_INCOME : HOME_TEXT);
  return (
    <div ref={(el) => setRowRef(t.id, el)}>
      <SwipeableRow
        id={t.id}
        openId={openId}
        setOpenId={setOpenId}
        onEdit={() => isDeposit ? onEditDeposit(t.__raw) : onEditTransaction(t)}
        onDelete={() => isDeposit ? onDeleteDeposit(t.id) : onDeleteTransaction(t.id)}
        border={first ? "transparent" : HOME_DIVIDER}
        roundTop={first}
        roundBottom={last}
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
            flex: "0 0 auto", width: 40, height: 40, borderRadius: "50%",
            background: isDeposit ? "transparent" : tileColor,
            border: isDeposit ? `1.5px solid ${TIPS_DEPOSITED}` : "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: isDeposit ? "none" : "inset 0 1px 0 rgba(255,255,255,0.16)",
          }}>
            {isDeposit ? <IconBank color={TIPS_DEPOSITED} /> : <Icon />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <p style={{ margin: 0, flex: "0 1 auto", minWidth: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.2px", color: HOME_TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t.name}
              </p>
              <NotePill note={t.note} style={{ flexShrink: 0 }} />
            </div>
            <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 500, color: HOME_MUTED }}>
              {relativeDate(t.transaction_date)}
            </p>
          </div>
          <span style={{ flex: "0 0 auto", marginLeft: 10, fontSize: 16, fontWeight: 600, letterSpacing: "-0.2px", fontVariantNumeric: "tabular-nums", color: amountColor }}>
            {isIncome ? "+" : "−"}{fmt(t.amount)}
          </span>
        </div>
      </SwipeableRow>
    </div>
  );
}

export default function MobileActivity({ transactions, deposits = [], loading, onEditTransaction, onDeleteTransaction, onEditDeposit, onDeleteDeposit, jump }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [sortField, setSortField] = useState(null); // null | "amount" | "name" | "date"
  const [sortDir, setSortDir] = useState(null); // null | "asc" | "desc"
  const [visibleMonthCount, setVisibleMonthCount] = useState(MONTHS_PER_PAGE);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [collapsedMonths, setCollapsedMonths] = useState(() => new Set());

  const rowRefs = useRef({});
  const sentinelRef = useRef(null);
  function setRowRef(id, el) { rowRefs.current[id] = el; }

  function resetPagination() { setVisibleMonthCount(MONTHS_PER_PAGE); setVisibleCount(PAGE_SIZE); }
  function toggleMonth(month) {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  }
  function updateQuery(v) { setQuery(v); resetPagination(); }
  function updateCategory(c) { setCategory(c); resetPagination(); }
  function advanceCategory() {
    const idx = CATEGORIES.indexOf(category);
    updateCategory(CATEGORIES[(idx + 1) % CATEGORIES.length]);
  }
  function toggleFieldSort(field) {
    const startDir = field === "name" ? "asc" : "desc";
    if (sortField !== field) { setSortField(field); setSortDir(startDir); }
    else if (sortDir === startDir) setSortDir(startDir === "asc" ? "desc" : "asc");
    else { setSortField(null); setSortDir(null); }
    resetPagination();
  }

  const merged = useMemo(() => {
    const depositItems = deposits.map((d) => ({
      id: d.id,
      kind: "deposit",
      amount: d.amount,
      transaction_date: d.deposit_date,
      name: "Deposit",
      category: null,
      __raw: d,
    }));
    return [...transactions, ...depositItems];
  }, [transactions, deposits]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return merged.filter((t) => {
      if (category !== "ALL" && t.category !== category) return false;
      return matchesTransaction(t, q);
    });
  }, [merged, query, category]);

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

  const isGrouped = !sortField;
  const allMonths = useMemo(() => isGrouped ? distinctMonthsDesc(sorted) : [], [sorted, isGrouped]);
  const visibleMonths = useMemo(() => allMonths.slice(0, visibleMonthCount), [allMonths, visibleMonthCount]);

  const visible = isGrouped
    ? sorted.filter((t) => visibleMonths.includes(monthKey(t.transaction_date)))
    : sorted.slice(0, visibleCount);
  const hasMore = isGrouped ? visibleMonthCount < allMonths.length : visibleCount < sorted.length;

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

  useEffect(() => {
    if (!jump) return;
    setQuery("");
    setCategory("ALL");
    setSortField(null);
    setSortDir(null);
    const allSorted = [...transactions].sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
    const jumpMonths = distinctMonthsDesc(allSorted);
    const targetTxn = transactions.find((t) => t.id === jump.id);
    const monthIdx = targetTxn ? jumpMonths.indexOf(monthKey(targetTxn.transaction_date)) : -1;
    if (monthIdx !== -1) setVisibleMonthCount((c) => Math.max(c, MONTHS_PER_PAGE, monthIdx + 1));
    // Expands the target's month if it's collapsed, or the scroll below fails.
    if (targetTxn) {
      const jumpMonth = monthLabel(targetTxn.transaction_date);
      setCollapsedMonths((prev) => {
        if (!prev.has(jumpMonth)) return prev;
        const next = new Set(prev);
        next.delete(jumpMonth);
        return next;
      });
    }
    setHighlightId(jump.id);
    const clearHighlight = setTimeout(() => setHighlightId(null), 2500);
    const scrollTimer = setTimeout(() => {
      rowRefs.current[jump.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    return () => { clearTimeout(clearHighlight); clearTimeout(scrollTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on a new jump request, not every transactions change
  }, [jump]);

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

  return (
    <>
      <style>{`@keyframes activityFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* Search filters in place - no dropdown */}
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

      {/* Category filter and sort toggles, one scrollable line (#29). */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, overflowX: "auto", padding: "0 4px 12px", scrollbarWidth: "none" }}>
        <CategoryButton
          label={category === "ALL" ? "Category" : (CATEGORY_CONFIG[category]?.label ?? category)}
          active={category !== "ALL"}
          color={category === "ALL" ? HOME_ACCENT : (TILE_COLOR[category] ?? HOME_MUTED)}
          onClick={advanceCategory}
        />
        <div style={{ width: 1, height: 18, backgroundColor: HOME_DIVIDER, flexShrink: 0 }} />
        {/* Each button grows to share the row's width, falling back to scroll on narrow phones. */}
        <div style={{ display: "flex", flex: 1, gap: 6 }}>
          <AmountSortButton
            label={sortField === "name" && sortDir === "desc" ? "Z–A" : "A–Z"}
            hideArrow
            minWidth={72}
            grow
            sort={sortField === "name" ? sortDir : null}
            onToggle={() => toggleFieldSort("name")}
            color={HOME_ACCENT}
          />
          <AmountSortButton label="Amount" icon={<IconDollar />} minWidth={72} grow sort={sortField === "amount" ? sortDir : null} onToggle={() => toggleFieldSort("amount")} color={HOME_ACCENT} />
          <AmountSortButton label="Date" icon={<IconCalendar />} minWidth={72} grow sort={sortField === "date" ? sortDir : null} onToggle={() => toggleFieldSort("date")} color={HOME_ACCENT} />
        </div>
      </div>

      {/* Tapping anywhere closes an open swipe row */}
      {openId !== null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 5 }} onTouchStart={() => setOpenId(null)} onClick={() => setOpenId(null)} />
      )}

      <div style={{ minHeight: 260 }}>
        {loading ? (
          <div style={cardStyle}>
            <ListRowSkeleton count={5} trailing />
          </div>
        ) : sorted.length === 0 ? (
          <p style={{ fontSize: 13, color: HOME_MUTED, textAlign: "center", padding: "30px 0" }}>No transactions found</p>
        ) : groups ? (
          groups.map((g, gi) => {
            const collapsed = collapsedMonths.has(g.month);
            const groupHasOpenRow = openId != null && g.items.some((t) => t.id === openId);
            return (
              <div key={g.month + gi} style={{ marginBottom: 18, animation: "activityFadeIn 0.3s ease" }}>
                <button
                  onClick={() => toggleMonth(g.month)}
                  aria-expanded={!collapsed}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                    background: "none", border: "none", padding: "0 4px 8px", margin: 0, cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: HOME_MUTED }}>
                    {g.month}
                  </span>
                  <span style={{
                    color: HOME_MUTED, display: "flex",
                    transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s ease",
                  }}>
                    <IconChevronDown />
                  </span>
                </button>
                <div style={{
                  display: "grid", gridTemplateRows: collapsed ? "0fr" : "1fr",
                  transition: "grid-template-rows 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  contain: "layout paint", willChange: "grid-template-rows",
                  position: "relative", zIndex: groupHasOpenRow ? 6 : "auto",
                }}>
                  <div style={{ overflow: "hidden" }}>
                    <div style={cardStyle}>
                      {g.items.map((t, i) => (
                        <ActivityRow
                          key={t.id} t={t} first={i === 0} last={i === g.items.length - 1}
                          openId={openId} setOpenId={setOpenId}
                          onEditTransaction={onEditTransaction} onDeleteTransaction={onDeleteTransaction}
                          onEditDeposit={onEditDeposit} onDeleteDeposit={onDeleteDeposit}
                          highlightId={highlightId} setRowRef={setRowRef}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div style={cardStyle}>
            {visible.map((t, i) => (
              <ActivityRow
                key={t.id} t={t} first={i === 0} last={i === visible.length - 1}
                openId={openId} setOpenId={setOpenId}
                onEditTransaction={onEditTransaction} onDeleteTransaction={onDeleteTransaction}
                onEditDeposit={onEditDeposit} onDeleteDeposit={onDeleteDeposit}
                highlightId={highlightId} setRowRef={setRowRef}
              />
            ))}
          </div>
        )}
      </div>

      {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
    </>
  );
}
