import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { CATEGORY_CONFIG, fmt, matchesTransaction } from "../../utils/finance";
import AccountPanel from "../shared/AccountPanel";
import NotePill from "../shared/NotePill";
import { Wordmark } from "../shared/Logo";
import { HOME_SURFACE, HOME_TEXT, HOME_MUTED, HOME_DIVIDER, ACCENT, HOME_INCOME, HOME_EXPENSE, CATEGORY_ACCENT } from "../shared/categoryVisuals";

// Menu is a pure launcher into the sidebar's own takeover pages (openTool) -
// deliberately not a second, disagreeing copy of Paychecks/Recurring with its
// own inline panels. That split used to mean the same tool rendered two
// different ways depending on which control opened it, and Installments was
// only reachable from one of the two (#134).
const TOOL_TILES = [
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
    label: "Recurring",
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
];

function ToolTile({ tool, hovered, onEnter, onLeave, onClick, text }) {
  return (
    <button
      className="flex flex-col items-center justify-center gap-2 rounded-2xl cursor-pointer border aspect-square"
      style={{
        color: text,
        borderColor: hovered ? `color-mix(in srgb, ${text} 40%, transparent)` : `color-mix(in srgb, ${text} 18%, transparent)`,
        backgroundColor: hovered ? `color-mix(in srgb, ${text} 10%, transparent)` : `color-mix(in srgb, ${text} 5%, transparent)`,
        transition: "background-color 150ms ease, border-color 150ms ease",
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {tool.icon}
      </svg>
      <span className="text-xs font-medium">{tool.label}</span>
    </button>
  );
}

export default function Navbar({ transactions = [], onSelectTransaction, onOpenTool, onCommand }) {
  const { logout, user, isDemo } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [acctSave, setAcctSave] = useState({ isDirty: false, isSaving: false, saveStatus: null, onSave: null });
  const [hoveredTile, setHoveredTile] = useState(null);
  const [feedbackHovered, setFeedbackHovered] = useState(false);
  const [menuHovered, setMenuHovered] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [drawerOpen]);

  const bg     = HOME_SURFACE;
  const border = HOME_DIVIDER;
  const text   = HOME_TEXT;
  const muted  = HOME_MUTED;

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 300);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
      setDebouncedQuery("");
    }
    if (e.key === "Enter") {
      const cmd = query.trim().toLowerCase();
      if ((cmd === "/dev true" || cmd === "/dev false") && !isDemo()) {
        onCommand?.("devtools", cmd === "/dev true");
        setQuery("✓");
        setDebouncedQuery("");
        setOpen(false);
        setTimeout(() => setQuery(""), 800);
      }
    }
  };

  useEffect(() => {
    function onMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const suggestions = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return [];
    return transactions
      .filter((t) => matchesTransaction(t, q))
      .slice(0, 5);
  }, [debouncedQuery, transactions]);

  const handleSelect = (t) => {
    setQuery("");
    setDebouncedQuery("");
    setOpen(false);
    onSelectTransaction?.(t);
  };

  return (
    <>
      <nav
        className="border-b sticky top-0 z-10"
        style={{ backgroundColor: bg, borderColor: border, color: text }}
      >
        <div className="px-6 py-4 flex items-center gap-4">
          <Wordmark size={32} textSize={26} />

          {/* Search */}
          <div className="flex-1 flex justify-center" ref={containerRef}>
            <style>{`@keyframes navSearchSlide { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            <div className="relative w-full max-w-lg">
              <svg
                xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
                fill="none" stroke={searchFocused ? ACCENT : HOME_MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: "absolute", left: 1, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", transition: "stroke 150ms ease" }}
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                value={query}
                onChange={handleQueryChange}
                onKeyDown={handleKeyDown}
                onFocus={() => { setSearchFocused(true); if (query) setOpen(true); }}
                onBlur={() => setSearchFocused(false)}
                placeholder={searchFocused ? "" : "Search transactions"}
                className="w-full py-2 text-sm"
                style={{
                  backgroundColor: "transparent",
                  border: "none",
                  borderBottom: `1px solid ${border}`,
                  color: text,
                  outline: "none",
                  paddingLeft: 24,
                  paddingRight: 4,
                  transition: "border-color 200ms ease",
                }}
              />
              {/* Accent underline, grows in from center on focus */}
              <span
                style={{
                  position: "absolute", left: 0, right: 0, bottom: -1, height: 2,
                  backgroundColor: ACCENT, borderRadius: 1,
                  transform: `scaleX(${searchFocused ? 1 : 0})`, transformOrigin: "center",
                  transition: "transform 250ms cubic-bezier(0.4, 0, 0.2, 1)",
                  pointerEvents: "none",
                }}
              />

              {/* Dropdown */}
              {open && debouncedQuery.trim() && (
                <div
                  className="absolute top-full mt-2 w-full rounded-xl shadow-lg overflow-hidden z-50"
                  style={{ backgroundColor: bg, animation: "navSearchSlide 220ms cubic-bezier(0.32, 0.72, 0, 1)" }}
                >
                  {suggestions.length > 0 ? suggestions.map((t) => {
                    const catColor = CATEGORY_ACCENT[t.category];
                    const date = new Date(t.transaction_date + "T00:00:00").toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    });
                    return (
                      <button
                        key={t.id}
                        onMouseDown={() => handleSelect(t)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:brightness-95 transition-all"
                        style={{ backgroundColor: bg, color: text }}
                      >
                        {/* Category dot */}
                        <span
                          style={{
                            width: 8, height: 8, borderRadius: "50%",
                            backgroundColor: catColor, flexShrink: 0,
                          }}
                        />
                        {/* Note pill matters here - a row can match on its note alone. */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="text-sm font-semibold truncate">{t.name}</p>
                            <NotePill note={t.note} style={{ flexShrink: 0 }} />
                          </div>
                          <p className="text-xs truncate" style={{ color: catColor }}>
                            {CATEGORY_CONFIG[t.category]?.label ?? t.category} · {date}
                          </p>
                        </div>
                        {/* Amount */}
                        <span className="text-sm font-bold shrink-0" style={{ color: catColor }}>
                          {fmt(t.amount)}
                        </span>
                      </button>
                    );
                  }) : (
                    <div className="px-4 py-3 text-sm" style={{ color: muted }}>
                      No transactions found
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Avatar */}
          <button
            onClick={() => { setDrawerOpen(true); setAccountOpen(true); }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 0 0 2px color-mix(in srgb, ${text} 35%, transparent)`; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
            className="w-8 h-8 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold cursor-pointer"
            style={{
              backgroundColor: `color-mix(in srgb, ${text} 12%, transparent)`,
              color: text,
              border: "none",
              transition: "box-shadow 150ms ease",
            }}
            aria-label="Account"
          >
            {user?.avatar
              ? <img src={user.avatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : (user?.first_name?.[0]?.toUpperCase() ?? "?")}
          </button>

          <button
            onClick={() => setDrawerOpen(true)}
            onMouseEnter={() => setMenuHovered(true)}
            onMouseLeave={() => setMenuHovered(false)}
            className="p-2 rounded-lg cursor-pointer shrink-0"
            style={{
              backgroundColor: menuHovered
                ? `color-mix(in srgb, ${text} 15%, transparent)`
                : "transparent",
              transition: "background-color 150ms ease",
            }}
            aria-label="Open menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => { setDrawerOpen(false); setAccountOpen(false); }}
        />
      )}

      {/* Drawer - floating, detached from the viewport edges (same content/
          behavior as before, just not flush top-to-bottom/right anymore). */}
      <div
        className="fixed z-50 flex flex-col border rounded-2xl shadow-2xl"
        style={{
          top: 88,
          right: 24,
          bottom: 24,
          width: accountOpen ? "380px" : "320px",
          maxWidth: "calc(100vw - 48px)",
          backgroundColor: bg,
          borderColor: border,
          color: text,
          transform: drawerOpen ? "translateX(0)" : "translateX(calc(100% + 24px))",
          opacity: drawerOpen ? 1 : 0,
          transition: "transform 250ms cubic-bezier(0.32, 0.72, 0, 1), opacity 250ms ease, width 220ms ease",
          overflowY: "auto",
          overscrollBehavior: "contain",
        }}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between border-b shrink-0" style={{ borderColor: border }}>
          <div className="flex items-center gap-2">
            {accountOpen && (
              <button
                onClick={() => setAccountOpen(false)}
                className="p-1 rounded-lg cursor-pointer"
                style={{ color: muted }}
                aria-label="Back"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}
            <span className="text-sm font-semibold" style={{ color: muted }}>
              {accountOpen ? "Account" : "Menu"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {accountOpen && (() => {
              const status = acctSave.isSaving ? "Saving…" : acctSave.isDirty ? "Unsaved" : acctSave.saveStatus === "saved" ? "Saved" : null;
              const statusColor = acctSave.saveStatus === "saved" && !acctSave.isDirty ? HOME_INCOME : `color-mix(in srgb, ${text} 40%, transparent)`;
              return status ? <span style={{ fontSize: "11px", color: statusColor, transition: "color 0.3s" }}>{status}</span> : null;
            })()}
            {accountOpen && (
              <button
                onClick={() => acctSave.onSave?.()}
                disabled={!acctSave.isDirty || acctSave.isSaving}
                className={acctSave.isDirty && !acctSave.isSaving ? "transition-transform active:scale-[0.98]" : undefined}
                onMouseEnter={(e) => {
                  if (!acctSave.isDirty || acctSave.isSaving) return;
                  e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${HOME_INCOME} 85%, black)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = acctSave.isDirty ? HOME_INCOME : `color-mix(in srgb, ${text} 8%, transparent)`;
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontSize: "12px", fontWeight: 700, padding: "5px 13px", borderRadius: "8px", border: "none",
                  color: acctSave.isDirty ? "#04120a" : muted,
                  backgroundColor: acctSave.isDirty ? HOME_INCOME : `color-mix(in srgb, ${text} 8%, transparent)`,
                  cursor: acctSave.isDirty && !acctSave.isSaving ? "pointer" : "default",
                  opacity: acctSave.isSaving ? 0.7 : 1,
                  transition: "background-color 150ms ease",
                }}
              >
                {acctSave.isDirty && !acctSave.isSaving && (
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
                {acctSave.isSaving ? "Saving…" : "Save"}
              </button>
            )}
          <button onClick={() => { setDrawerOpen(false); setAccountOpen(false); }} className="p-1 rounded-lg cursor-pointer" aria-label="Close menu">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          </div>
        </div>

        {accountOpen ? (
          <AccountPanel onSaveStateChange={setAcctSave} />
        ) : (
          <>
            <button
              className="px-5 py-5 flex items-center gap-3 w-full text-left cursor-pointer"
              style={{ background: "transparent", border: "none" }}
              onClick={() => setAccountOpen(true)}
            >
              <div
                className="w-10 h-10 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-sm font-bold"
                style={{ backgroundColor: `color-mix(in srgb, ${text} 12%, transparent)`, color: text }}
              >
                {user?.avatar
                  ? <img src={user.avatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : (user?.first_name?.[0]?.toUpperCase() ?? "?")}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{user ? `${user.first_name} ${user.last_name}` : "—"}</p>
                <p className="text-xs truncate" style={{ color: muted }}>{user?.email_address ?? "—"}</p>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: muted, flexShrink: 0 }}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>

            <div className="mx-5 border-t" style={{ borderColor: border }} />

            {/* Tool launcher - a 2-column tile grid opening the sidebar's own
            takeover pages, not a second, disagreeing set of inline panels. */}
            <div className="px-3 py-3 flex-1">
              <div className="grid grid-cols-2 gap-2.5">
                {TOOL_TILES.map((tool) => (
                  <ToolTile
                    key={tool.key}
                    tool={tool}
                    text={text}
                    hovered={hoveredTile === tool.key}
                    onEnter={() => setHoveredTile(tool.key)}
                    onLeave={() => setHoveredTile(null)}
                    onClick={() => { setDrawerOpen(false); onOpenTool?.(tool.key); }}
                  />
                ))}
              </div>
            </div>

            <div className="mx-5 border-t" style={{ borderColor: border }} />

            <div className="px-3 py-3 flex flex-col gap-3">
              {!isDemo() && (
                <a
                  href="https://forms.gle/BC6ebwbZtgYmSYBeA"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left"
                  style={{
                    color: text,
                    textDecoration: "none",
                    border: "1px solid",
                    borderColor: feedbackHovered
                      ? `color-mix(in srgb, ${text} 40%, transparent)`
                      : `color-mix(in srgb, ${text} 18%, transparent)`,
                    backgroundColor: feedbackHovered
                      ? `color-mix(in srgb, ${text} 10%, transparent)`
                      : `color-mix(in srgb, ${text} 5%, transparent)`,
                    transition: "background-color 150ms ease, border-color 150ms ease",
                  }}
                  onMouseEnter={() => setFeedbackHovered(true)}
                  onMouseLeave={() => setFeedbackHovered(false)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Feedback
                </a>
              )}
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-colors text-left"
                style={{ color: HOME_EXPENSE }}
                onClick={() => { logout(); navigate("/login"); }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Log out
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
