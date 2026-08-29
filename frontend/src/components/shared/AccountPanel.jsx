import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { updateUser, deleteUser, getConnections, startLinkProvider, unlinkProvider } from "../../api/users";
import client from "../../api/client";
import {
  HOME_SURFACE,
  HOME_DIVIDER,
  HOME_TEXT,
  HOME_MUTED,
  HOME_EXPENSE,
  HOME_INCOME,
} from "./categoryVisuals";
import { errorMessage } from "../../utils/errors";

const CONFIRM_PHRASE = "DELETE MY ACCOUNT";
const PROVIDERS = [
  { key: "google", label: "Google" },
  { key: "github", label: "GitHub" },
];

function GoogleLogo({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.581C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}

function GitHubLogo({ size = 16, color = "#fff" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function ProviderLogo({ provider, size, textColor }) {
  return provider === "google" ? <GoogleLogo size={size} /> : <GitHubLogo size={size} color={textColor} />;
}

// Module scope, not component state - AccountPanel unmounts every time the
// drawer/panel closes, so component state alone re-loses this on every
// close+reopen and the row flashes "Not connected" until the fetch resolves
// again. Caching here survives that remount, keyed by user id so switching
// accounts within one session can't paint a stale user's connections.
const connectionsCache = {};

function resizeImage(file, size = 400) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.95));
    };
    img.src = url;
  });
}

export default function AccountPanel({ onSaveStateChange }) {
  const { user, setUser, logout, isDemo } = useAuth();
  const navigate = useNavigate();

  const bg = "rgba(255,255,255,0.04)";
  const border = HOME_DIVIDER;
  const text = HOME_TEXT;
  const muted = HOME_MUTED;
  const danger = HOME_EXPENSE;

  const [form, setForm] = useState({
    first_name: user?.first_name ?? "",
    last_name: user?.last_name ?? "",
    avatar: user?.avatar ?? null,
  });
  const [avatarHovered, setAvatarHovered] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [error, setError] = useState("");

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Connections (#25). Seeded from the cross-mount cache so a reopened panel
  // paints the last-known state instantly instead of a "loading" flash - the
  // fetch below still runs every time to catch changes made elsewhere.
  const [connections, setConnections] = useState(() => connectionsCache[user?.id] ?? null);
  const [connectionsError, setConnectionsError] = useState("");
  const [linkingProvider, setLinkingProvider] = useState(null);

  useEffect(() => {
    if (isDemo()) return;
    getConnections()
      .then((res) => {
        connectionsCache[user?.id] = res.data;
        setConnections(res.data);
      })
      .catch(() => setConnections((prev) => prev ?? []));
  }, []);

  async function handleConnect(provider) {
    if (isDemo() || linkingProvider) return;
    setConnectionsError("");
    setLinkingProvider(provider);
    // Opened synchronously, within the click gesture, as a blank tab - if
    // this waited for startLinkProvider below first, browsers would treat
    // the later navigation as a script-initiated popup and block it. The
    // real URL goes in once the linking session cookie is confirmed.
    const tab = window.open("", "_blank");
    try {
      await startLinkProvider(provider);
      // Same-origin XHR above, not the navigation itself - the session
      // cookie it sets rides along so /auth/{provider}/callback knows which
      // logged-in account initiated this (see app/routes/users.py), without
      // ever leaving the account page in this tab.
      const url = `${client.defaults.baseURL}/auth/${provider}/login`;
      if (tab) tab.location.href = url;
      else window.location.href = url; // popup blocked - fall back to this tab
    } catch (err) {
      if (tab) tab.close();
      setConnectionsError(errorMessage(err));
      setLinkingProvider(null);
    }
  }

  // While a provider link is in flight in the other tab, catch up on return
  // - re-check connections whenever this tab regains focus, and clear the
  // "busy" state once the new provider shows up (or leave it for the user to
  // retry if it never does; no infinite polling while the tab sits unfocused).
  useEffect(() => {
    if (!linkingProvider) return;
    function onFocus() {
      getConnections()
        .then((res) => {
          connectionsCache[user?.id] = res.data;
          setConnections(res.data);
          if (res.data.includes(linkingProvider)) setLinkingProvider(null);
        })
        .catch(() => {});
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [linkingProvider]);

  async function handleDisconnect(provider) {
    if (isDemo() || linkingProvider) return;
    setConnectionsError("");
    setLinkingProvider(provider);
    try {
      await unlinkProvider(provider);
      setConnections((prev) => {
        const next = (prev ?? []).filter((p) => p !== provider);
        connectionsCache[user?.id] = next;
        return next;
      });
    } catch (err) {
      setConnectionsError(errorMessage(err));
    } finally {
      setLinkingProvider(null);
    }
  }

  const isDirty =
    form.first_name.trim() !== (user?.first_name ?? "") ||
    form.last_name.trim() !== (user?.last_name ?? "") ||
    form.avatar !== (user?.avatar ?? null);

  useEffect(() => {
    onSaveStateChange?.({
      isDirty,
      isSaving: saving,
      saveStatus,
      onSave: handleSave,
    });
  }, [isDirty, saving, saveStatus]);

  useEffect(() => {
    if (deleteOpen) {
      setDeletePhrase("");
      setDeleteError("");
      setTimeout(() => deleteInputRef.current?.focus(), 50);
    }
  }, [deleteOpen]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await resizeImage(file);
    setForm((f) => ({ ...f, avatar: dataUrl }));
    e.target.value = "";
    setError("");
    if (isDemo()) {
      const updated = { ...(user ?? {}), avatar: dataUrl };
      setUser(updated);
      localStorage.setItem("user", JSON.stringify(updated));
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(null), 3000);
      return;
    }
    setSaving(true);
    try {
      const res = await updateUser({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        avatar: dataUrl,
      });
      const updated = res.data;
      setUser(updated);
      localStorage.setItem("user", JSON.stringify(updated));
      setForm({
        first_name: updated.first_name,
        last_name: updated.last_name,
        avatar: updated.avatar ?? null,
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!isDirty || saving) return;
    setError("");
    setSaving(true);
    try {
      const res = await updateUser({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        avatar: form.avatar,
      });
      const updated = res.data;
      setUser(updated);
      localStorage.setItem("user", JSON.stringify(updated));
      setForm({
        first_name: updated.first_name,
        last_name: updated.last_name,
        avatar: updated.avatar ?? null,
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deletePhrase !== CONFIRM_PHRASE || deleting) return;
    if (isDemo()) {
      setDeleteError("Account deletion is not available in demo mode.");
      return;
    }
    setDeleteError("");
    setDeleting(true);
    try {
      await deleteUser();
      logout();
      navigate("/login");
    } catch (err) {
      setDeleteError(errorMessage(err));
      setDeleting(false);
    }
  }

  const createdAt = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const inputStyle = {
    width: "100%",
    borderRadius: "10px",
    padding: "8px 12px",
    fontSize: "13.5px",
    border: `1px solid ${border}`,
    backgroundColor: bg,
    color: text,
    outline: "none",
    boxSizing: "border-box",
  };

  const disabledInputStyle = {
    ...inputStyle,
    opacity: 0.6,
    cursor: "not-allowed",
  };

  const labelStyle = {
    display: "block",
    fontSize: "11px",
    fontWeight: 500,
    marginBottom: "4px",
    color: muted,
  };

  const confirmReady = deletePhrase === CONFIRM_PHRASE;

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "14px 20px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "18px",
      }}
    >
      <style>{`@keyframes acct-bounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.35; } 40% { transform: translateY(-4px); opacity: 1; } }`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <div
          style={{ position: "relative", width: 60, height: 60, flexShrink: 0 }}
        >
          <button
            onClick={() => fileInputRef.current?.click()}
            onMouseEnter={() => setAvatarHovered(true)}
            onMouseLeave={() => setAvatarHovered(false)}
            style={{
              position: "relative",
              width: 60,
              height: 60,
              borderRadius: "50%",
              overflow: "hidden",
              border: "none",
              padding: 0,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {form.avatar ? (
              <img
                src={form.avatar}
                alt="avatar"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  backgroundColor: "rgba(255,255,255,0.1)",
                  color: text,
                }}
              >
                {form.first_name?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            {/* Hover overlay */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(0,0,0,0.45)",
                opacity: avatarHovered ? 1 : 0,
                transition: "opacity 150ms ease",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
          </button>
          {/* Camera badge */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              width: 18,
              height: 18,
              borderRadius: "50%",
              backgroundColor: HOME_SURFACE,
              border: `1.5px solid ${border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              stroke={muted}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: text,
              margin: 0,
            }}
          >
            {form.first_name || user?.first_name}{" "}
            {form.last_name || user?.last_name}
          </p>
          {createdAt && (
            <p
              style={{
                fontSize: "10.5px",
                color: muted,
                margin: "2px 0 0",
                opacity: 0.8,
              }}
            >
              Joined {createdAt}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", gap: "10px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={labelStyle}>First Name</label>
            <input
              type="text"
              value={form.first_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, first_name: e.target.value }))
              }
              disabled={isDemo()}
              maxLength={20}
              style={isDemo() ? disabledInputStyle : inputStyle}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={labelStyle}>Last Name</label>
            <input
              type="text"
              value={form.last_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, last_name: e.target.value }))
              }
              disabled={isDemo()}
              maxLength={20}
              style={isDemo() ? disabledInputStyle : inputStyle}
            />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <div style={disabledInputStyle}>{user?.email_address ?? "—"}</div>
        </div>

        {error && (
          <p style={{ fontSize: "13px", color: danger, margin: 0 }}>{error}</p>
        )}
      </div>

      {/* Connections (#25) */}
      <div>
        <p style={{ ...labelStyle, marginBottom: 8 }}>Connections</p>
        {isDemo() ? (
          <p style={{ fontSize: 11.5, color: muted, margin: 0 }}>Not available in demo mode.</p>
        ) : (
          <div style={{ borderRadius: 10, border: `1px solid ${border}`, backgroundColor: bg, overflow: "hidden" }}>
            {PROVIDERS.map(({ key, label }, i) => {
              const connected = connections?.includes(key);
              const busy = linkingProvider === key;
              return (
                <div
                  key={key}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 12px",
                    borderTop: i === 0 ? "none" : `1px solid ${border}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                    <span style={{ width: 16, height: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ProviderLogo provider={key} size={16} textColor={text} />
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: text }}>{label}</span>
                    {connected && (
                      <span
                        role="img" aria-label="Connected"
                        style={{
                          width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          backgroundColor: `color-mix(in srgb, ${HOME_INCOME} 18%, transparent)`,
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={HOME_INCOME} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={connections === null || !!linkingProvider}
                    onClick={() => (connected ? handleDisconnect(key) : handleConnect(key))}
                    className={connected ? undefined : "transition-transform active:scale-[0.98]"}
                    onMouseEnter={(e) => {
                      if (linkingProvider) return;
                      e.currentTarget.style.backgroundColor = connected
                        ? `color-mix(in srgb, ${text} 8%, transparent)`
                        : `color-mix(in srgb, ${HOME_INCOME} 85%, black)`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = connected ? "transparent" : HOME_INCOME;
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      fontSize: 11.5, fontWeight: 700, padding: connected ? "5px 12px" : "6px 13px", borderRadius: 8, cursor: "pointer",
                      border: connected ? `1px solid ${border}` : "none",
                      color: connected ? muted : "#04120a",
                      backgroundColor: connected ? "transparent" : HOME_INCOME,
                      opacity: linkingProvider && !busy ? 0.5 : 1,
                      transition: "background-color 150ms ease",
                    }}
                  >
                    {busy ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 3, height: 12, padding: "0 2px" }}>
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            style={{
                              width: 4, height: 4, borderRadius: "50%", backgroundColor: "currentColor",
                              animation: `acct-bounce 1s ${i * 0.15}s ease-in-out infinite`,
                            }}
                          />
                        ))}
                      </span>
                    ) : connected ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m18.84 12.25 1.72-1.71a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
                          <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
                          <line x1="8" x2="8" y1="2" y2="5" />
                          <line x1="2" x2="5" y1="8" y2="8" />
                          <line x1="16" x2="16" y1="19" y2="22" />
                          <line x1="19" x2="22" y1="16" y2="16" />
                        </svg>
                        Disconnect
                      </>
                    ) : (
                      <>
                        {/* Opens in a new tab - external-link glyph says so before the click. */}
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        Connect
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {connectionsError && (
          <p style={{ fontSize: 11.5, color: danger, margin: "6px 0 0" }}>{connectionsError}</p>
        )}
      </div>

      {/* Advanced - tucked away since Delete Account is the only thing in
          here and doesn't need to sit permanently visible as a big red box
          at the bottom of every visit to this panel. */}
      <div style={{ marginTop: "auto" }}>
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
            padding: "8px 2px", background: "none", border: "none", cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Advanced
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: advancedOpen ? "rotate(180deg)" : "none", transition: "transform 200ms ease" }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {/* Always mounted so this animates open/shut instead of popping. */}
        <div style={{ display: "grid", gridTemplateRows: advancedOpen ? "1fr" : "0fr", transition: "grid-template-rows 220ms ease" }}>
          <div style={{ overflow: "hidden", minHeight: 0 }}>
            <div style={{ paddingTop: 10 }}>
        <div
          style={{
            borderRadius: "12px",
            border: `1px solid color-mix(in srgb, ${danger} 35%, transparent)`,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              borderBottom: deleteOpen
                ? `1px solid color-mix(in srgb, ${danger} 20%, transparent)`
                : "none",
            }}
          >
            {!deleteOpen && (
              <>
                <p style={{ fontSize: "12.5px", fontWeight: 600, color: text, margin: "0 0 3px" }}>
                  Delete Account
                </p>
                <p style={{ fontSize: "11px", color: muted, margin: "0 0 10px" }}>
                  Permanently deletes your account. This cannot be undone.
                </p>
                <button
                  onClick={() => setDeleteOpen(true)}
                  className="transition-transform active:scale-[0.98]"
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${danger} 85%, black)`)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = danger)
                  }
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    fontSize: "12px", fontWeight: 700, padding: "7px 14px", borderRadius: "8px",
                    border: "none", color: "#1a0505", backgroundColor: danger, cursor: "pointer",
                    transition: "background-color 150ms ease",
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
                  </svg>
                  Delete account
                </button>
              </>
            )}
          </div>

          {deleteOpen && (
            <div
              style={{
                padding: "14px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                backgroundColor: `color-mix(in srgb, ${danger} 4%, transparent)`,
              }}
            >
              <p style={{ fontSize: "11.5px", color: text, margin: 0 }}>
                To confirm, type{" "}
                <span
                  style={{
                    fontFamily: "monospace",
                    fontWeight: 600,
                    color: danger,
                  }}
                >
                  {CONFIRM_PHRASE}
                </span>{" "}
                below:
              </p>
              <input
                ref={deleteInputRef}
                type="text"
                value={deletePhrase}
                onChange={(e) => setDeletePhrase(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && confirmReady && handleDelete()
                }
                placeholder={CONFIRM_PHRASE}
                autoComplete="off"
                style={{
                  ...inputStyle,
                  borderColor: confirmReady
                    ? `color-mix(in srgb, ${danger} 60%, transparent)`
                    : border,
                }}
              />
              {deleteError && (
                <p style={{ fontSize: "11.5px", color: danger, margin: 0 }}>
                  {deleteError}
                </p>
              )}
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setDeleteOpen(false)}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${text} 8%, transparent)`)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                  style={{
                    flex: 1,
                    fontSize: "12.5px",
                    fontWeight: 500,
                    padding: "7px",
                    borderRadius: "10px",
                    border: `1px solid ${border}`,
                    color: muted,
                    backgroundColor: "transparent",
                    cursor: "pointer",
                    transition: "background-color 150ms ease",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={!confirmReady || deleting}
                  onMouseEnter={(e) => {
                    if (confirmReady && !deleting)
                      e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${danger} 22%, transparent)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = confirmReady
                      ? `color-mix(in srgb, ${danger} 12%, transparent)`
                      : "transparent";
                  }}
                  style={{
                    flex: 1,
                    fontSize: "12.5px",
                    fontWeight: 600,
                    padding: "7px",
                    borderRadius: "10px",
                    border: `1px solid color-mix(in srgb, ${danger} 60%, transparent)`,
                    color: danger,
                    backgroundColor: confirmReady
                      ? `color-mix(in srgb, ${danger} 12%, transparent)`
                      : "transparent",
                    opacity: confirmReady ? 1 : 0.4,
                    cursor: confirmReady && !deleting ? "pointer" : "default",
                    transition:
                      "background-color 150ms ease, opacity 150ms ease",
                  }}
                >
                  {deleting ? "Deleting…" : "I understand, delete my account"}
                </button>
              </div>
            </div>
          )}
        </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
