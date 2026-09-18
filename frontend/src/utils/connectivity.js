import axios from "axios";

// Backend reachability, tracked from real request outcomes (#204).
//
// navigator.onLine is a hint and nothing more: it reports true on a captive
// portal, true when the wifi is fine but Render is suspended, and true the
// instant an interface comes up - well before anything can actually be
// reached. So the source of truth here is what requests actually did, and
// navigator's events only prompt a re-check.
//
// Deliberately has no UI. Sync is meant to be invisible; this exists so the
// client can stop hammering a backend that isn't there, and so later phases
// (outbox drain, cached-session boot) have one signal to react to.

const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

// Short, unlike the main client's timeout. A probe is asking "is anything
// there right now" - it is not worth waiting out a cold start, because the
// real request that triggered this is already doing that.
const PROBE_TIMEOUT_MS = 8000;

let reachable = true;
const listeners = new Set();

// Dev-tools offline switch (#204/#206).
//
// Chrome's own offline throttling is per-tab, resets on reload, and doesn't
// exist on a phone - which rules it out for the case worth testing most, a
// reload while offline. This flag is persisted instead, so the app comes back
// up still believing the backend is gone, and it applies on any device with
// the dev panel open.
//
// It sits here rather than in useDevMenu because it has to be readable from
// api/client.js's interceptor, which is module-level and has no React context.
const FORCE_OFFLINE_KEY = "dev_force_offline";

function readForced() {
  try {
    return localStorage.getItem(FORCE_OFFLINE_KEY) === "true";
  } catch {
    return false;
  }
}

let forcedOffline = typeof window !== "undefined" ? readForced() : false;
if (forcedOffline) reachable = false;

export function isForcedOffline() {
  return forcedOffline;
}

/** Turning it off re-probes rather than assuming the backend is back: the
 *  answer drives the outbox drain, and guessing wrong either way is worse
 *  than one request. */
export function setForcedOffline(next) {
  forcedOffline = next;
  try {
    localStorage.setItem(FORCE_OFFLINE_KEY, String(next));
  } catch {
    // Private mode: the flag just won't survive a reload.
  }
  if (next) set(false);
  else probe();
}

function set(next) {
  if (reachable === next) return;
  reachable = next;
  listeners.forEach((fn) => {
    try {
      fn(reachable);
    } catch (err) {
      console.error("[connectivity] listener threw:", err);
    }
  });
}

export function isReachable() {
  return !forcedOffline && reachable;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function reportReachable() {
  // A response that somehow completed while forced offline must not undo the
  // switch - the point is that the app behaves as though nothing is there.
  if (forcedOffline) return;
  set(true);
}

export function reportUnreachable() {
  set(false);
}

/**
 * True when a failure means "couldn't reach the backend" rather than "the
 * backend answered and said no".
 *
 * A 5xx counts as unreachable on purpose: a suspended Render service answers
 * 502/503 through Vercel's proxy, which is functionally identical to the
 * server being gone. A 4xx does not - that is the backend working correctly
 * and rejecting the request.
 */
export function isUnreachableError(error) {
  if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") return true;
  const status = error?.response?.status;
  if (status === undefined) return true; // network error - no response at all
  return status >= 500;
}

/** Uses a bare axios instance, not our client - the client's interceptors
 *  report back into this module, and a probe routed through them would
 *  recurse. */
export async function probe() {
  if (forcedOffline) {
    set(false);
    return reachable;
  }
  try {
    await axios.get(`${BASE_URL}/health`, { timeout: PROBE_TIMEOUT_MS });
    set(true);
  } catch {
    set(false);
  }
  return reachable;
}

// Coming back online is worth an immediate re-check; going offline is not
// trustworthy enough to act on by itself, so it only marks state that the
// next real request will confirm or correct.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    probe();
  });
  window.addEventListener("offline", () => {
    set(false);
  });
}
