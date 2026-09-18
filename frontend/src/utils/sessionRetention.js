import { readMeta, writeMeta } from "../api/offline/db";

// Offline auth retention (#204 phase 5).
//
// Phase 1 stopped an unreachable backend from being treated as an expired
// session - necessary, but taken alone it means a cached session is trusted
// forever with no backend ever confirming it's still valid. This puts a
// ceiling on that: once RETENTION_DAYS pass with no successful contact, the
// cached session is no longer trusted and the app forces a real login.
//
// "No successful contact" is tracked directly, not inferred - recordVerified()
// is called on every request that actually reaches the backend and gets a
// real response (see api/client.js), so the clock resets on ordinary use and
// only matters for a genuinely sustained outage.
export const RETENTION_DAYS = 7;

const LAST_VERIFIED_KEY = "lastVerifiedAt";

export async function recordVerified() {
  await writeMeta(LAST_VERIFIED_KEY, Date.now());
}

/**
 * True once too long has passed since the backend last confirmed this
 * session. Deliberately NOT true when nothing has ever been recorded -
 * that's the case for every session that existed before this feature
 * shipped, and treating "no record yet" as "expired" would force-log-out
 * every existing user the first time they happen to open the app offline,
 * rather than only after a genuine week-plus outage.
 */
export async function isSessionExpired() {
  const last = await readMeta(LAST_VERIFIED_KEY);
  if (last == null) return false;
  return Date.now() - last > RETENTION_DAYS * 24 * 60 * 60 * 1000;
}
