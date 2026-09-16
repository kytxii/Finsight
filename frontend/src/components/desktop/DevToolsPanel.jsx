import { useState, useEffect } from "react";
import {
  DevMenuSection,
  DevMenuInfo,
  DevMenuButton,
  DevMenuRow,
} from "./DevMenuControls";
import { HOME_EXPENSE } from "../shared/categoryVisuals";
import { isReachable, subscribe, probe } from "../../utils/connectivity";
import { outboxDepth, deadLetters, subscribeToOutbox, drain } from "../../api/offline/outbox";
import {
  NETWORK_DELAYS,
  formatDelay,
  tokenExpiry,
  tokenExpiresIn,
  buildInfo,
  localStorageSize,
} from "../../utils/devTools";

const TABS = [
  { key: "state", label: "State" },
  { key: "data", label: "Data" },
  { key: "sync", label: "Sync" },
  { key: "session", label: "Session" },
  { key: "build", label: "Build" },
];

/**
 * Desktop dev tools (#206). Previously ~220 lines inline in Dashboard.jsx as a
 * 280px corner box with every section stacked in one scroll - lifted out and
 * split into tabs so sections can be added without the panel growing taller
 * than the viewport.
 *
 * `stats` is passed in rather than derived here: the Data tab reports whatever
 * the host page considers interesting (desktop's sort column, mobile's nav
 * tab), and this component has no business knowing about either. Mobile renders
 * its own panel but feeds the same shape - see utils/devTools.js.
 *
 * Admin gating is the caller's job. This renders whatever it's given.
 */
export default function DevToolsPanel({
  onClose,
  devMenu,
  loading,
  setLoading,
  onRefetch,
  stats = [],
  user,
  theme,
}) {
  const [tab, setTab] = useState("state");
  // No user-facing sync UI by design (#204) - but a write that fails silently
  // is money quietly vanishing, so backend state is at least observable here.
  const [reachable, setReachable] = useState(isReachable());
  useEffect(() => subscribe(setReachable), []);
  // No user-facing sync UI by design (#204) - a queued write that permanently
  // fails would otherwise vanish with no trace, so it's surfaced here instead.
  const [pending, setPending] = useState(0);
  const [letters, setLetters] = useState([]);
  useEffect(() => {
    outboxDepth().then(setPending);
    deadLetters().then(setLetters);
    return subscribeToOutbox((depth) => {
      setPending(depth);
      deadLetters().then(setLetters);
    });
  }, []);
  const { surface, border, text, muted } = theme;
  const {
    forceEmpty,
    setForceEmpty,
    forceError,
    toggleForceError,
    delay,
    setDelay,
    lastFetch,
  } = devMenu;

  const build = buildInfo();
  const info = (label, value) => (
    <DevMenuInfo
      key={label}
      label={label}
      value={value}
      muted={muted}
      text={text}
    />
  );

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        width: 420,
        borderRadius: 14,
        backgroundColor: surface,
        border: `1px solid ${border}`,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        maxHeight: "80vh",
      }}
    >
      <div
        style={{
          padding: "10px 14px 9px",
          borderBottom: `1px solid ${border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: HOME_EXPENSE,
          }}
        >
          DEV TOOLS
        </span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: muted,
            display: "flex",
            padding: 2,
          }}
          aria-label="Close dev tools"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "8px 10px",
          borderBottom: `1px solid ${border}`,
          flexShrink: 0,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1,
              padding: "5px 0",
              borderRadius: 7,
              border: `1px solid ${tab === t.key ? HOME_EXPENSE : "transparent"}`,
              backgroundColor:
                tab === t.key
                  ? `color-mix(in srgb, ${HOME_EXPENSE} 12%, transparent)`
                  : "transparent",
              color: tab === t.key ? HOME_EXPENSE : muted,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background-color 150ms ease, color 150ms ease",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ overflowY: "auto", padding: "6px 0 10px" }}>
        {tab === "state" && (
          <>
            <DevMenuSection label="LOADING" border={border} muted={muted} />
            <DevMenuRow
              label="Skeletons"
              active={loading}
              onToggle={() => setLoading((v) => !v)}
              muted={muted}
              text={text}
              border={border}
            />
            <DevMenuRow
              label="Force empty"
              active={forceEmpty}
              onToggle={() => setForceEmpty((v) => !v)}
              muted={muted}
              text={text}
              border={border}
            />
            <DevMenuRow
              label="Force next error"
              active={forceError}
              onToggle={toggleForceError}
              muted={muted}
              text={text}
              border={border}
            />
            <DevMenuButton
              label="Re-fetch"
              description="Reload transactions"
              onClick={() => {
                setLoading(true);
                onRefetch();
                setTimeout(() => setLoading(false), delay + 200);
              }}
              muted={muted}
              text={text}
              border={border}
            />

            <DevMenuSection label="NETWORK" border={border} muted={muted} />
            <div
              style={{
                padding: "4px 14px 6px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 11, color: muted }}>Slow network</span>
              <div style={{ display: "flex", gap: 4 }}>
                {NETWORK_DELAYS.map((ms) => (
                  <button
                    key={ms}
                    onClick={() => setDelay(ms)}
                    style={{
                      flex: 1,
                      padding: "3px 0",
                      borderRadius: 6,
                      border: `1px solid ${delay === ms ? HOME_EXPENSE : border}`,
                      backgroundColor:
                        delay === ms
                          ? `color-mix(in srgb, ${HOME_EXPENSE} 12%, transparent)`
                          : "transparent",
                      color: delay === ms ? HOME_EXPENSE : muted,
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {formatDelay(ms)}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "data" && (
          <>
            <DevMenuSection label="DATA" border={border} muted={muted} />
            {stats.map((s) => info(s.label, s.value))}
            {info("Last fetch", lastFetch ? lastFetch.toLocaleTimeString() : "—")}
          </>
        )}

        {tab === "sync" && (
          <>
            <DevMenuSection label="OUTBOX" border={border} muted={muted} />
            {info("Pending", pending)}
            {info("Dead-lettered", letters.length)}
            <DevMenuButton
              label="Drain now"
              description="Retry queued writes"
              onClick={() => drain()}
              muted={muted}
              text={text}
              border={border}
            />
            {letters.length > 0 && (
              <>
                <DevMenuSection label="FAILED WRITES" border={border} muted={muted} />
                {letters.map((op) => (
                  <DevMenuInfo
                    key={op.seq}
                    label={`${op.method} ${op.url}`}
                    value={op.error}
                    muted={muted}
                    text={HOME_EXPENSE}
                  />
                ))}
              </>
            )}
          </>
        )}

        {tab === "session" && (
          <>
            <DevMenuSection label="ACCOUNT" border={border} muted={muted} />
            {info(
              "User",
              user ? `${user.first_name} ${user.last_name}` : "—",
            )}
            {info("Email", user?.email_address ?? "—")}
            {info("Admin", user?.is_admin ? "yes" : "no")}

            <DevMenuSection label="TOKEN" border={border} muted={muted} />
            {info("Expires", tokenExpiry())}
            {info("Expires in", tokenExpiresIn())}

            <DevMenuSection label="STORAGE" border={border} muted={muted} />
            {info("localStorage", localStorageSize())}
            <DevMenuButton
              label="Clear localStorage"
              description="Wipes all local data + reloads"
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              muted={muted}
              text={HOME_EXPENSE}
              border={border}
              danger
            />
          </>
        )}

        {tab === "build" && (
          <>
            <DevMenuSection label="BUILD" border={border} muted={muted} />
            {info("Mode", build.mode)}
            {info("API base", build.apiBase)}
            {info("Origin", build.origin)}
            {info("Viewport", build.viewport)}

            <DevMenuSection label="BACKEND" border={border} muted={muted} />
            {info("Reachable", reachable ? "yes" : "no")}
            <DevMenuButton
              label="Probe /health"
              description="Re-check now"
              onClick={() => probe()}
              muted={muted}
              text={text}
              border={border}
            />
          </>
        )}
      </div>
    </div>
  );
}
