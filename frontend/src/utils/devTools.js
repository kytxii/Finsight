// Shared dev-tools readouts (#206). Desktop and mobile render their own
// panels - a phone shouldn't show a floating corner box - but what those
// panels *report* lives here, so the two can't drift into showing different
// things. Rendering is platform-specific; the numbers are not.

export const NETWORK_DELAYS = [0, 500, 2000, 5000];

export const DEV_TABS = ["state", "data", "session", "build"];

export function formatDelay(ms) {
  if (ms === 0) return "Off";
  return ms < 1000 ? `${ms}ms` : `${ms / 1000}s`;
}

// Both panels previously decoded the JWT inline, and disagreed on format -
// desktop printed a full locale string, mobile time-only. One implementation,
// callers pick the format.
export function tokenExpiry({ timeOnly = false } = {}) {
  try {
    const token = localStorage.getItem("token");
    if (!token) return "None";
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (!payload.exp) return "No exp";
    const date = new Date(payload.exp * 1000);
    return timeOnly ? date.toLocaleTimeString() : date.toLocaleString();
  } catch {
    // A demo-mode "token" is the literal string "demo" and won't decode.
    return "Invalid";
  }
}

export function tokenExpiresIn() {
  try {
    const token = localStorage.getItem("token");
    if (!token) return "—";
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (!payload.exp) return "—";
    const seconds = Math.round(payload.exp - Date.now() / 1000);
    if (seconds <= 0) return "Expired";
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  } catch {
    return "—";
  }
}

export function buildInfo() {
  return {
    mode: import.meta.env.MODE,
    apiBase: import.meta.env.VITE_API_URL ?? "/api (proxied)",
    origin: window.location.origin,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
  };
}

// Rough localStorage footprint. Not exact - it counts UTF-16 code units, not
// bytes on disk - but enough to notice the demo seed or a cache getting fat.
export function localStorageSize() {
  let chars = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    chars += key.length + (localStorage.getItem(key)?.length ?? 0);
  }
  const kb = (chars * 2) / 1024;
  return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(2)} MB`;
}
