import { useEffect, useRef, useState } from "react";
import { CATEGORY_CONFIG, fmt } from "../../utils/finance";
import { HOME_TEXT, HOME_MUTED, HOME_SURFACE, HOME_DIVIDER, TILE_COLOR } from "../shared/categoryVisuals";

const SEARCH_ANIM_MS = 180;


function IconPlusTopbar() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconSearchTopbar() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" />
    </svg>
  );
}

const iconBtnStyle = {
  width: 40, height: 40, borderRadius: "50%",
  background: HOME_SURFACE, border: "1px solid rgba(255,255,255,0.07)",
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "#e6e6ea", cursor: "pointer",
};

export default function MobileTopbar({
  user,
  onOpenAccount,
  onOpenAdd,
  onToggleSearch,
  searchVisible,
  searchContainerRef,
  searchToggleRef,
  query,
  debouncedQuery,
  searchOpen,
  suggestions,
  onQueryChange,
  onSearchKeyDown,
  onSelectTransaction,
}) {
  const [prevVisible, setPrevVisible] = useState(searchVisible);
  const [closing, setClosing] = useState(false);
  const inputRef = useRef(null);

  if (prevVisible !== searchVisible) {
    setPrevVisible(searchVisible);
    if (!searchVisible) setClosing(true);
  }

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => setClosing(false), SEARCH_ANIM_MS);
    return () => clearTimeout(timer);
  }, [closing]);

  useEffect(() => {
    if (searchVisible) inputRef.current?.focus();
  }, [searchVisible]);

  const showSearch = searchVisible || closing;

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0px) + 14px)",
          left: 16,
          right: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 25,
        }}
      >
        <button
          onClick={onOpenAccount}
          aria-label="Open account"
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            flexShrink: 0,
            cursor: "pointer",
            boxSizing: "border-box",
            padding: 1,
            background: "conic-gradient(from 210deg, #1de9b6, #0f766e, #1de9b6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#0a1620",
              color: "#fff",
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            {user?.avatar ? (
              <img src={user.avatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              (user?.first_name?.[0]?.toUpperCase() ?? "?")
            )}
          </div>
        </button>
        <div style={{ display: "flex", gap: 11 }}>
          <button onClick={onOpenAdd} aria-label="Add transaction" style={iconBtnStyle}>
            <IconPlusTopbar />
          </button>
          <button ref={searchToggleRef} onClick={onToggleSearch} aria-label="Search transactions" style={iconBtnStyle}>
            <IconSearchTopbar />
          </button>
        </div>
      </div>

      {showSearch && (
        <div
          ref={searchContainerRef}
          style={{
            position: "fixed",
            top: "calc(env(safe-area-inset-top, 0px) + 62px)",
            left: 16,
            right: 16,
            zIndex: 24,
            opacity: searchVisible ? 1 : 0,
            transform: `translateY(${searchVisible ? 0 : -6}px)`,
            transition: `opacity ${SEARCH_ANIM_MS}ms ease, transform ${SEARCH_ANIM_MS}ms ease`,
          }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={onQueryChange}
            onKeyDown={onSearchKeyDown}
            placeholder="Search transactions..."
            style={{
              width: "100%",
              boxSizing: "border-box",
              borderRadius: 12,
              padding: "9px 12px",
              fontSize: 14,
              border: `1px solid ${HOME_DIVIDER}`,
              backgroundColor: HOME_SURFACE,
              color: HOME_TEXT,
              outline: "none",
            }}
          />
          {searchOpen && suggestions.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: 6,
                borderRadius: 12,
                border: `1px solid ${HOME_DIVIDER}`,
                backgroundColor: HOME_SURFACE,
                overflow: "hidden",
                zIndex: 50,
              }}
            >
              {suggestions.map((t) => {
                const color = TILE_COLOR[t.category] ?? HOME_MUTED;
                const date = new Date(t.transaction_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
                return (
                  <button
                    key={t.id}
                    onMouseDown={() => onSelectTransaction(t)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 12px",
                      background: "transparent",
                      border: "none",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: HOME_TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.name}
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color }}>
                        {CATEGORY_CONFIG[t.category]?.label ?? t.category} · {date}
                      </p>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color, flexShrink: 0 }}>
                      {fmt(t.amount)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {searchOpen && debouncedQuery.trim() && suggestions.length === 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: 6,
                borderRadius: 12,
                border: `1px solid ${HOME_DIVIDER}`,
                backgroundColor: HOME_SURFACE,
                padding: "10px 12px",
                fontSize: 13,
                color: HOME_MUTED,
                zIndex: 50,
              }}
            >
              No transactions found
            </div>
          )}
        </div>
      )}
    </>
  );
}
