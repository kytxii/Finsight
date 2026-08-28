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
} from "./categoryVisuals";
import { errorMessage } from "../../utils/errors";

const CONFIRM_PHRASE = "DELETE MY ACCOUNT";
const PROVIDERS = [
  { key: "google", label: "Google" },
  { key: "github", label: "GitHub" },
];

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

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Connections (#25).
  const [connections, setConnections] = useState(null); // null while loading
  const [connectionsError, setConnectionsError] = useState("");
  const [linkingProvider, setLinkingProvider] = useState(null);

  useEffect(() => {
    if (isDemo()) return;
    getConnections()
      .then((res) => setConnections(res.data))
      .catch(() => setConnections([]));
  }, []);

  async function handleConnect(provider) {
    if (isDemo() || linkingProvider) return;
    setConnectionsError("");
    setLinkingProvider(provider);
    try {
      await startLinkProvider(provider);
      // Full navigation, not an XHR - the session cookie set by the call
      // above rides along so /auth/{provider}/callback knows which
      // logged-in account initiated this (see app/routes/users.py).
      window.location.href = `${client.defaults.baseURL}/auth/${provider}/login`;
    } catch (err) {
      setConnectionsError(errorMessage(err));
      setLinkingProvider(null);
    }
  }

  async function handleDisconnect(provider) {
    if (isDemo() || linkingProvider) return;
    setConnectionsError("");
    setLinkingProvider(provider);
    try {
      await unlinkProvider(provider);
      setConnections((prev) => (prev ?? []).filter((p) => p !== provider));
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
          <p style={{ fontSize: "12px", color: muted, margin: "2px 0 0" }}>
            {user?.email_address ?? "—"}
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
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PROVIDERS.map(({ key, label }) => {
              const connected = connections?.includes(key);
              const busy = linkingProvider === key;
              return (
                <div
                  key={key}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", borderRadius: 10, border: `1px solid ${border}`, backgroundColor: bg,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                      backgroundColor: connected ? "#52b757" : muted,
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: text }}>{label}</span>
                    <span style={{ fontSize: 11, color: muted }}>{connected ? "Connected" : "Not connected"}</span>
                  </div>
                  <button
                    type="button"
                    disabled={connections === null || !!linkingProvider}
                    onClick={() => (connected ? handleDisconnect(key) : handleConnect(key))}
                    style={{
                      fontSize: 11.5, fontWeight: 600, padding: "5px 12px", borderRadius: 8, cursor: "pointer",
                      border: `1px solid ${connected ? border : "#52b757"}`,
                      color: connected ? muted : "#52b757",
                      backgroundColor: connected ? "transparent" : "color-mix(in srgb, #52b757 12%, transparent)",
                      opacity: linkingProvider && !busy ? 0.5 : 1,
                    }}
                  >
                    {busy ? "…" : connected ? "Disconnect" : "Connect"}
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

      {/* Danger zone */}
      <div style={{ marginTop: "auto" }}>
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
            <p
              style={{
                fontSize: "12.5px",
                fontWeight: 600,
                color: danger,
                margin: "0 0 3px",
              }}
            >
              Delete Account
            </p>
            {!deleteOpen && (
              <p style={{ fontSize: "11px", color: muted, margin: "0 0 10px" }}>
                Permanently deletes your account. This cannot be undone.
              </p>
            )}
            {!deleteOpen && (
              <button
                onClick={() => setDeleteOpen(true)}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${danger} 16%, transparent)`)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${danger} 8%, transparent)`)
                }
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  padding: "6px 14px",
                  borderRadius: "8px",
                  border: `1px solid color-mix(in srgb, ${danger} 50%, transparent)`,
                  color: danger,
                  backgroundColor: `color-mix(in srgb, ${danger} 8%, transparent)`,
                  cursor: "pointer",
                  transition: "background-color 150ms ease",
                }}
              >
                Delete account
              </button>
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
  );
}
