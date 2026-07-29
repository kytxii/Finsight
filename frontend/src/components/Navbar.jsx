import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../context/AuthContext";
import { CATEGORY_CONFIG, fmt } from "../utils/finance";
import RecurringPaymentsModal from "./RecurringPaymentsModal";
import AccountPanel from "./AccountPanel";
import PaychecksPanel from "./PaychecksPanel";

export default function Navbar({ transactions = [], onSelectTransaction, onDeleteRecurringPayment, onSaveRecurringPayment, onPaycheckSaved, onCommand }) {
  const dark = useTheme();
  const { logout, user, isDemo } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [rpSave, setRpSave] = useState({ isDirty: false, isSaving: false, onSave: null });
  const [accountOpen, setAccountOpen] = useState(false);
  const [acctSave, setAcctSave] = useState({ isDirty: false, isSaving: false, saveStatus: null, onSave: null });
  const [paychecksOpen, setPaychecksOpen] = useState(false);
  const [paychecksHovered, setPaychecksHovered] = useState(false);
  const [recurringHovered, setRecurringHovered] = useState(false);
  const [feedbackHovered, setFeedbackHovered] = useState(false);
  const [themeHovered, setThemeHovered] = useState(false);
  const [menuHovered, setMenuHovered] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  // Lock background scroll while the drawer is open - otherwise the panel and
  // the dashboard behind it both scroll (and both show a scrollbar) at once.
  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [drawerOpen]);

  const bg     = dark ? "var(--dark-surface)" : "var(--light-surface)";
  const border = dark ? "var(--dark-border)"  : "var(--light-border)";
  const text   = dark ? "var(--dark-text)"    : "var(--light-text)";
  const input  = dark ? "var(--dark-bg)"      : "var(--light-bg)";
  const muted  = `color-mix(in srgb, ${text} 50%, transparent)`;

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
      .filter((t) =>
        t.name?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q) ||
        (CATEGORY_CONFIG[t.category]?.label ?? "").toLowerCase().includes(q) ||
        String(t.amount).includes(q)
      )
      .slice(0, 5);
  }, [debouncedQuery, transactions]);

  const handleSelect = (t) => {
    setQuery("");
    setDebouncedQuery("");
    setOpen(false);
    onSelectTransaction?.(t);
  };

  function toggleTheme() {
    document.documentElement.classList.toggle("dark");
  }

  return (
    <>
      <nav
        className="border-b sticky top-0 z-10"
        style={{ backgroundColor: bg, borderColor: border, color: text }}
      >
        <div className="px-6 py-4 flex items-center gap-4">
          <span
            className="text-4xl font-bold bg-clip-text text-transparent shrink-0"
            style={{
              backgroundImage: dark
                ? "linear-gradient(to right, #ffffff, #d1d5db, #9ca3af)"
                : "linear-gradient(to right, #111827, #374151, #6b7280)",
            }}
          >
            Finsight
          </span>

          {/* Search */}
          <div className="flex-1 flex justify-center" ref={containerRef}>
            <div className="relative w-full max-w-lg">
              <input
                value={query}
                onChange={handleQueryChange}
                onKeyDown={handleKeyDown}
                onFocus={() => query && setOpen(true)}
                placeholder="Search transactions..."
                className="w-full rounded-xl px-4 py-2 text-sm border"
                style={{ backgroundColor: input, borderColor: border, color: text, outline: "none" }}
              />

              {/* Dropdown */}
              {open && suggestions.length > 0 && (
                <div
                  className="absolute top-full mt-1.5 w-full rounded-xl border shadow-lg overflow-hidden z-50"
                  style={{ backgroundColor: bg, borderColor: border }}
                >
                  {suggestions.map((t) => {
                    const catColor = `var(--category-${t.category.toLowerCase()})`;
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
                        {/* Name + category */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{t.name}</p>
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
                  })}
                </div>
              )}

              {/* No results */}
              {open && debouncedQuery.trim() && suggestions.length === 0 && (
                <div
                  className="absolute top-full mt-1.5 w-full rounded-xl border shadow-lg px-4 py-3 text-sm z-50"
                  style={{ backgroundColor: bg, borderColor: border, color: muted }}
                >
                  No transactions found
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
          onClick={() => { setDrawerOpen(false); setRecurringOpen(false); setAccountOpen(false); setPaychecksOpen(false); }}
        />
      )}

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col border-l"
        style={{
          width: recurringOpen ? "580px" : accountOpen ? "380px" : paychecksOpen ? "420px" : "288px",
          backgroundColor: bg,
          borderColor: border,
          color: text,
          transform: drawerOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 250ms ease, width 220ms ease",
        }}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between border-b shrink-0" style={{ borderColor: border }}>
          <div className="flex items-center gap-2">
            {(recurringOpen || accountOpen || paychecksOpen) && (
              <button
                onClick={() => { setRecurringOpen(false); setAccountOpen(false); setPaychecksOpen(false); setRpSave({ isDirty: false, isSaving: false, onSave: null }); }}
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
              {recurringOpen ? "Recurring Payments" : accountOpen ? "Account" : paychecksOpen ? "Paychecks" : "Menu"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {(recurringOpen || accountOpen) && (() => {
              const save = recurringOpen ? rpSave : acctSave;
              const status = save.isSaving ? "Saving…" : save.isDirty ? "Unsaved" : save.saveStatus === "saved" ? "Saved" : null;
              const statusColor = save.saveStatus === "saved" && !save.isDirty ? "var(--category-income)" : `color-mix(in srgb, ${text} 40%, transparent)`;
              return status ? <span style={{ fontSize: "11px", color: statusColor, transition: "color 0.3s" }}>{status}</span> : null;
            })()}
            {(recurringOpen || accountOpen) && (() => {
              const save = recurringOpen ? rpSave : acctSave;
              return (
                <button
                  onClick={() => save.onSave?.()}
                  disabled={!save.isDirty || save.isSaving}
                  style={{ fontSize: "12px", fontWeight: 600, padding: "4px 12px", borderRadius: "8px", border: "1px solid var(--category-income)", color: "var(--category-income)", backgroundColor: save.isDirty ? "color-mix(in srgb, var(--category-income) 18%, transparent)" : "transparent", boxShadow: save.isDirty ? "0 0 0 2px color-mix(in srgb, var(--category-income) 20%, transparent)" : "none", cursor: save.isDirty && !save.isSaving ? "pointer" : "default", opacity: save.isDirty ? (save.isSaving ? 0.6 : 1) : 0.25, transition: "all 0.2s ease" }}
                >
                  {save.isSaving ? "Saving…" : "Save"}
                </button>
              );
            })()}
          <button onClick={() => { setDrawerOpen(false); setRecurringOpen(false); setAccountOpen(false); setPaychecksOpen(false); }} className="p-1 rounded-lg cursor-pointer" aria-label="Close menu">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          </div>
        </div>

        {/* Recurring panel */}
        {recurringOpen ? (
          <RecurringPaymentsModal inline onSaveStateChange={setRpSave} onDelete={onDeleteRecurringPayment} onSaved={onSaveRecurringPayment} />
        ) : accountOpen ? (
          <AccountPanel onSaveStateChange={setAcctSave} />
        ) : paychecksOpen ? (
          <PaychecksPanel onSaved={onPaycheckSaved} />
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

            <div className="px-3 py-3 flex-1">
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer text-left border"
                style={{
                  color: text,
                  borderColor: recurringHovered
                    ? `color-mix(in srgb, ${text} 40%, transparent)`
                    : `color-mix(in srgb, ${text} 18%, transparent)`,
                  backgroundColor: recurringHovered
                    ? `color-mix(in srgb, ${text} 10%, transparent)`
                    : `color-mix(in srgb, ${text} 5%, transparent)`,
                  transition: "background-color 150ms ease, border-color 150ms ease",
                }}
                onMouseEnter={() => setRecurringHovered(true)}
                onMouseLeave={() => setRecurringHovered(false)}
                onClick={() => setRecurringOpen(true)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M12 7v5l4 2" />
                </svg>
                Recurring Payments
              </button>
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 mt-2 rounded-xl text-sm font-medium cursor-pointer text-left border"
                style={{
                  color: text,
                  borderColor: paychecksHovered
                    ? `color-mix(in srgb, ${text} 40%, transparent)`
                    : `color-mix(in srgb, ${text} 18%, transparent)`,
                  backgroundColor: paychecksHovered
                    ? `color-mix(in srgb, ${text} 10%, transparent)`
                    : `color-mix(in srgb, ${text} 5%, transparent)`,
                  transition: "background-color 150ms ease, border-color 150ms ease",
                }}
                onMouseEnter={() => setPaychecksHovered(true)}
                onMouseLeave={() => setPaychecksHovered(false)}
                onClick={() => setPaychecksOpen(true)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
                Paychecks
              </button>
            </div>

            <div className="mx-5 border-t" style={{ borderColor: border }} />

            <div className="px-3 py-3 flex flex-col gap-3">
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer text-left"
                style={{
                  color: text,
                  border: "1px solid",
                  borderColor: themeHovered ? `color-mix(in srgb, ${text} 40%, transparent)` : `color-mix(in srgb, ${text} 18%, transparent)`,
                  backgroundColor: themeHovered ? `color-mix(in srgb, ${text} 10%, transparent)` : `color-mix(in srgb, ${text} 5%, transparent)`,
                  transition: "background-color 150ms ease, border-color 150ms ease",
                }}
                onMouseEnter={() => setThemeHovered(true)}
                onMouseLeave={() => setThemeHovered(false)}
                onClick={toggleTheme}
              >
                {dark ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                  </svg>
                )}
                {dark ? "Light Mode" : "Dark Mode"}
              </button>
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
                style={{ color: "var(--category-expense)" }}
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
