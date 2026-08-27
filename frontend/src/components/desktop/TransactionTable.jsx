import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { CATEGORY_CONFIG, INCOME_TYPES, fmt } from "../../utils/finance";
import { HOME_SURFACE, HOME_DIVIDER, HOME_TEXT, HOME_MUTED, HOME_INCOME, HOME_EXPENSE, CATEGORY_ACCENT, ACCENT, ACCENT_TEXT } from "../shared/categoryVisuals";

function SortIcon({ active, dir, activeColor, muted }) {
  if (active && dir === "asc") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={activeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
        <polyline points="17 6 23 6 23 12"/>
      </svg>
    );
  }
  if (active && dir === "desc") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={activeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
        <polyline points="17 18 23 18 23 12"/>
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" opacity="0.4"/>
      <path d="M12 5v14M5 12l7 7 7-7" opacity="0.4"/>
    </svg>
  );
}

const MIN_TABLE_ROWS = 10;
// Matches a real row's height, same 60px the delete-sweep cell already uses.
const ROW_HEIGHT = 60;

export default function TransactionTable({ rows, onAdd, onEdit, onDelete, activeColor, page, perPage, total, onPageChange, onPerPageChange, highlightId, typeFilter, onTypeFilterChange, sortColumn, sortDir, onSort, query = "", onQueryChange }) {
  const [addHovered, setAddHovered] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [hoveredBtn, setHoveredBtn] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [deleting, setDeleting] = useState(new Set());

  const handleDelete = (t) => {
    setOpenMenuId(null);
    setDeleting(s => new Set(s).add(t.id));
    setTimeout(() => onDelete?.(t), 700);
  };

  useEffect(() => {
    function onMouseDown() { setOpenMenuId(null); }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const heightWrapRef = useRef(null);
  const heightInnerRef = useRef(null);
  const capturedHeightRef = useRef(null);
  const heightResetTimerRef = useRef(null);
  const HEIGHT_TRANSITION_MS = 320;

  function capturePaginationHeight() {
    if (heightWrapRef.current) {
      capturedHeightRef.current = heightWrapRef.current.getBoundingClientRect().height;
    }
  }

  useLayoutEffect(() => {
    const wrap = heightWrapRef.current;
    const inner = heightInnerRef.current;
    const before = capturedHeightRef.current;
    capturedHeightRef.current = null; // consume - only animate captured (pagination-triggered) changes
    if (!wrap || !inner || before == null) return;

    const after = inner.getBoundingClientRect().height;
    if (Math.abs(after - before) < 1) return;

    clearTimeout(heightResetTimerRef.current);
    wrap.style.transition = "none";
    wrap.style.overflow = "hidden";
    wrap.style.height = `${before}px`;
    wrap.getBoundingClientRect(); // force reflow so the line above actually paints before animating
    requestAnimationFrame(() => {
      wrap.style.transition = `height ${HEIGHT_TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      wrap.style.height = `${after}px`;
    });
    heightResetTimerRef.current = setTimeout(() => {
      wrap.style.transition = "none";
      wrap.style.overflow = "visible";
      wrap.style.height = "auto";
    }, HEIGHT_TRANSITION_MS + 30);
  }, [rows]);

  useEffect(() => () => clearTimeout(heightResetTimerRef.current), []);

  const tbodyRef = useRef(null);
  const pendingSlideRef = useRef(0); // 0 = none, 1 = next (slide in from right), -1 = prev (from left)
  const SLIDE_MS = 260;

  function markPageSlide(dir) {
    pendingSlideRef.current = dir;
  }

  useLayoutEffect(() => {
    const dir = pendingSlideRef.current;
    pendingSlideRef.current = 0;
    const el = tbodyRef.current;
    if (!dir || !el) return;
    el.style.setProperty("--tx-slide-from", dir > 0 ? "24px" : "-24px");
    el.style.animation = "none";
    el.getBoundingClientRect(); // force reflow so re-triggering the same animation name on consecutive clicks actually restarts it
    el.style.animation = `tx-page-slide ${SLIDE_MS}ms ease`;
  }, [rows]);

  const bg    = HOME_SURFACE;
  const border = HOME_DIVIDER;
  const text   = HOME_TEXT;
  const muted  = HOME_MUTED;

  const colBtn = (col, label, align = "left") => {
    if (!onSort) return <span>{label}</span>;
    const active = sortColumn === col;
    return (
      <button
        onClick={() => onSort(col)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          background: "none", border: "none", cursor: "pointer", padding: 0,
          color: active ? activeColor : muted,
          fontWeight: 500, fontSize: "inherit",
          flexDirection: align === "right" ? "row-reverse" : "row",
        }}
      >
        {label}
        <SortIcon active={active} dir={sortDir} activeColor={activeColor} muted={muted} />
      </button>
    );
  };

  return (
    <div className="rounded-2xl h-full" style={{ backgroundColor: bg, color: text }}>
      <style>{`
        @keyframes tx-bar-sweep {
          0%   { transform: scaleX(0); opacity: 0.9; }
          55%  { transform: scaleX(1); opacity: 0.9; }
          100% { transform: scaleX(1); opacity: 0;   }
        }
        @keyframes tx-page-slide {
          from { opacity: 0; transform: translateX(var(--tx-slide-from, 0)); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap" style={{ borderColor: border }}>
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-xl font-semibold shrink-0">Transactions</h3>
          {onQueryChange && (
            <div
              className="flex items-center gap-2 rounded-lg"
              style={{
                padding: "5px 10px", minWidth: 0,
                backgroundColor: "rgba(255,255,255,0.05)",
                border: `1px solid ${searchFocused ? `color-mix(in srgb, ${activeColor ?? text} 55%, transparent)` : "transparent"}`,
                transition: "border-color 150ms ease",
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ color: muted, flexShrink: 0 }}>
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={(e) => { if (e.key === "Escape") { onQueryChange(""); e.currentTarget.blur(); } }}
                placeholder="Search this month"
                aria-label="Search transactions in view"
                style={{
                  width: 150, minWidth: 0, background: "none", border: "none", outline: "none",
                  color: text, fontSize: 13, fontWeight: 500,
                }}
              />
              {query && (
                <button
                  onClick={() => onQueryChange("")}
                  aria-label="Clear search"
                  className="cursor-pointer"
                  style={{ background: "none", border: "none", padding: 0, color: muted, display: "flex", flexShrink: 0 }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex items-center gap-2 text-xs" style={{ color: muted }}>
            <span>Rows per page</span>
            <div className="flex items-center" style={{ gap: 2, padding: 3, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)" }}>
              {[10, 20, 50].map((n) => {
                const active = perPage === n;
                const hov = hoveredBtn === `pp-${n}`;
                return (
                  <button
                    key={n}
                    onClick={() => { capturePaginationHeight(); onPerPageChange(n); }}
                    onMouseEnter={() => setHoveredBtn(`pp-${n}`)}
                    onMouseLeave={() => setHoveredBtn(null)}
                    className="rounded-full text-xs font-bold cursor-pointer transition-colors"
                    style={{
                      padding: "5px 12px",
                      color: active ? ACCENT_TEXT : hov ? ACCENT : muted,
                      backgroundColor: active
                        ? (hov ? `color-mix(in srgb, ${ACCENT} 85%, black)` : ACCENT)
                        : hov ? `color-mix(in srgb, ${ACCENT} 16%, transparent)` : "transparent",
                      transition: "color 150ms ease, background-color 150ms ease",
                    }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs" style={{ color: muted }}>
            <span>
              {total === 0 ? "0" : `${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)}`} of {total}
            </span>
            <div className="flex items-center">
              {[
                { key: "prev", disabled: page === 1, onClick: () => onPageChange(page - 1), d: "M15 18l-6-6 6-6", dir: -1 },
                { key: "next", disabled: page * perPage >= total, onClick: () => onPageChange(page + 1), d: "M9 18l6-6-6-6", dir: 1 },
              ].map(({ key, disabled, onClick, d, dir }) => (
                <button
                  key={key}
                  onClick={() => { if (disabled) return; capturePaginationHeight(); markPageSlide(dir); onClick(); }}
                  disabled={disabled}
                  className="rounded-lg cursor-pointer transition-colors disabled:cursor-default disabled:opacity-30"
                  style={{ padding: 6, color: muted }}
                  onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = text; }}
                  onMouseLeave={e => { e.currentTarget.style.color = muted; }}
                  aria-label={key === "prev" ? "Previous page" : "Next page"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={d} />
                  </svg>
                </button>
              ))}
            </div>
          </div>

          {onAdd && (
            <button
              onClick={onAdd}
              onMouseEnter={() => setAddHovered(true)}
              onMouseLeave={() => setAddHovered(false)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-95"
              style={{
                color: activeColor,
                borderColor: activeColor,
                backgroundColor: `color-mix(in srgb, ${activeColor} ${addHovered ? "20%" : "12%"}, transparent)`,
                boxShadow: `0 0 0 2px color-mix(in srgb, ${activeColor} 20%, transparent)`,
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5v14" />
              </svg>
              Add
            </button>
          )}
        </div>
      </div>

      <div ref={heightWrapRef}>
      <div ref={heightInnerRef}>
      <table className="w-full" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col />
          <col style={{ width: "160px" }} />
          <col style={{ width: "150px" }} />
          <col style={{ width: "96px" }} />
        </colgroup>
        <thead>
          <tr className="text-left text-base" style={{ color: muted }}>
            <th className="px-6 py-3 font-medium">
              {onSort ? (() => {
                const active = sortColumn === "name";
                return (
                  <button
                    onClick={() => onSort("name")}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      background: "none", border: "none", cursor: "pointer", padding: 0,
                      color: active ? activeColor : muted,
                      fontWeight: 500, fontSize: "inherit",
                    }}
                  >
                    Name
                    {active ? (
                      <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.03em", lineHeight: 1 }}>
                        {sortDir === "desc" ? "Z→A" : "A→Z"}
                      </span>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
                        <path d="M12 5v14m0 0 7-7m-7 7-7-7"/>
                      </svg>
                    )}
                  </button>
                );
              })() : <span>Name</span>}
            </th>
            <th className="px-6 py-3 font-medium text-right" style={{ paddingRight: "24px" }}>
              {onSort ? (() => {
                const active = sortColumn === "amount";
                return (
                  <button
                    onClick={() => onSort("amount")}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      background: "none", border: "none", cursor: "pointer", padding: 0,
                      color: active ? activeColor : muted,
                      fontWeight: 500, fontSize: "inherit",
                    }}
                  >
                    Amount
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 1 : 0.35 }}>
                      {active && sortDir === "asc"
                        ? <path d="M12 19V5m0 0-7 7m7-7 7 7"/>
                        : <path d="M12 5v14m0 0 7-7m-7 7-7-7"/>
                      }
                    </svg>
                  </button>
                );
              })() : <span>Amount</span>}
            </th>
            <th className="px-6 py-3 font-medium">
              {onSort ? (() => {
                const active = sortColumn === "date";
                return (
                  <button
                    onClick={() => onSort("date")}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      background: "none", border: "none", cursor: "pointer", padding: 0,
                      color: active ? activeColor : muted,
                      fontWeight: 500, fontSize: "inherit",
                    }}
                  >
                    Date
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 1 : 0.45 }}>
                      {sortDir === "asc" && active
                        ? <path d="M12 19V5m0 0-7 7m7-7 7 7"/>
                        : <path d="M12 5v14m0 0 7-7m-7 7-7-7"/>
                      }
                    </svg>
                  </button>
                );
              })() : <span>Date</span>}
            </th>
            <th className="py-3"></th>
          </tr>
        </thead>
        <tbody ref={tbodyRef}>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                className="px-6 text-center text-base"
                style={{ color: muted, height: MIN_TABLE_ROWS * ROW_HEIGHT }}
              >
                No transactions
              </td>
            </tr>
          ) : (
            rows.map((t) => (
              <tr
                key={t.id}
                className="border-t"
                style={{
                  borderColor: border,
                  backgroundColor: t.id === highlightId && !deleting.has(t.id)
                    ? `color-mix(in srgb, ${CATEGORY_ACCENT[t.category]} 12%, transparent)`
                    : undefined,
                  transition: "background-color 0.6s ease",
                  pointerEvents: deleting.has(t.id) ? "none" : undefined,
                }}
              >
                {deleting.has(t.id) ? (
                  <td colSpan={4} style={{ padding: 0, position: "relative", overflow: "hidden", height: "60px" }}>
                    <div style={{
                      position: "absolute", inset: 0,
                      backgroundColor: `color-mix(in srgb, ${HOME_EXPENSE} 18%, ${bg})`,
                      transformOrigin: "right center",
                      animation: "tx-bar-sweep 0.7s ease-out forwards",
                    }} />
                  </td>
                ) : (<>
                  <td className="px-6 py-4 text-lg font-medium">
                    <div className="flex items-center gap-3">
                      <span
                        title={CATEGORY_CONFIG[t.category]?.label ?? t.category}
                        style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: CATEGORY_ACCENT[t.category], flexShrink: 0 }}
                      />
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.name}
                        {t.note && (
                          <span
                            className="ml-2 px-2 py-0.5 rounded-full text-sm font-semibold align-middle"
                            style={{ color: muted, backgroundColor: "rgba(128,128,128,0.12)" }}
                          >
                            {t.note}
                          </span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right text-lg font-bold" style={{ paddingRight: "24px", color: INCOME_TYPES.has(t.category) ? HOME_INCOME : HOME_EXPENSE }}>
                    {INCOME_TYPES.has(t.category) ? "+" : "-"}{fmt(t.amount)}
                  </td>
                  <td className="px-6 py-4 text-base whitespace-nowrap" style={{ color: muted }}>
                    {new Date(t.transaction_date + "T00:00:00").toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </td>
                  <td className="py-4 text-center" style={{ width: "96px", minWidth: "96px" }}>
                    <div
                      style={{ position: "relative", width: "96px", height: "20px" }}
                      onMouseDown={e => e.stopPropagation()}
                    >
                      <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        opacity: openMenuId === t.id ? 0 : 1,
                        transform: openMenuId === t.id ? "rotate(90deg) scale(0.5)" : "rotate(0deg) scale(1)",
                        transition: "opacity 200ms ease, transform 200ms ease",
                        pointerEvents: openMenuId === t.id ? "none" : "auto",
                      }}>
                        <button
                          onClick={() => setOpenMenuId(t.id)}
                          className="cursor-pointer rounded-lg p-1"
                          style={{ color: muted }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="5" cy="12" r="2" />
                            <circle cx="12" cy="12" r="2" />
                            <circle cx="19" cy="12" r="2" />
                          </svg>
                        </button>
                      </div>
                      <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
                        opacity: openMenuId === t.id ? 1 : 0,
                        transform: openMenuId === t.id ? "scale(1)" : "scale(0.6)",
                        transition: "opacity 200ms ease, transform 200ms ease",
                        pointerEvents: openMenuId === t.id ? "auto" : "none",
                      }}>
                        <button
                          onClick={() => { setOpenMenuId(null); onEdit?.(t); }}
                          className="cursor-pointer rounded-lg"
                          style={{ color: muted, padding: "0 6px" }}
                          onMouseEnter={e => e.currentTarget.style.color = text}
                          onMouseLeave={e => e.currentTarget.style.color = muted}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(t)}
                          className="cursor-pointer rounded-lg"
                          style={{ color: muted, padding: "0 6px" }}
                          onMouseEnter={e => e.currentTarget.style.color = HOME_EXPENSE}
                          onMouseLeave={e => e.currentTarget.style.color = muted}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </td>
                </>)}
              </tr>
            ))
          )}
          {rows.length > 0 && rows.length < MIN_TABLE_ROWS && (
            Array.from({ length: MIN_TABLE_ROWS - rows.length }, (_, i) => (
              <tr key={`filler-${i}`} aria-hidden="true">
                <td colSpan={4} style={{ height: ROW_HEIGHT }} />
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
      </div>
    </div>
  );
}
