import { readCached, writeCached } from "./db";
import { isReachable } from "../../utils/connectivity";

// Stale-while-revalidate for GET endpoints (#204).
//
// The point is the cold start. Free-tier Render sleeps after ~15 min idle and
// takes ~50s to wake, so a network-first read leaves the dashboard on
// skeletons for the better part of a minute on the first visit of the day.
// Serving the last-known response immediately and refreshing underneath makes
// that invisible - and falls back to the same cache when the backend is
// unreachable entirely.
//
// The server stays authoritative: cached data is only ever a head start, and
// every revalidation overwrites it.

const listeners = new Map();

/**
 * Notified when a background revalidation returns data that differs from what
 * the caller was already handed. Callers that don't subscribe simply keep
 * showing cached data until their next fetch - the same trade-off the
 * in-memory pageCache already makes (see utils/pageCache.js).
 */
export function subscribeToKey(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key)?.delete(fn);
}

function notify(key, data) {
  listeners.get(key)?.forEach((fn) => {
    try {
      fn(data);
    } catch (err) {
      console.error(`[offline] listener for "${key}" threw:`, err);
    }
  });
}

// Cheap structural comparison, only to avoid waking subscribers when a
// revalidation returned exactly what they already have. Responses here are
// plain JSON from the API, so serialisation is safe; key order is stable
// because it comes from the same serialiser every time.
function changed(a, b) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

async function revalidate(key, networkFn, previous) {
  try {
    const res = await networkFn();
    await writeCached(key, res.data);
    if (changed(previous, res.data)) notify(key, res.data);
    return res.data;
  } catch {
    // Silent by design. The caller already has usable data; a failed refresh
    // is not an error worth surfacing, and connectivity state is already
    // updated by the axios interceptor in api/client.js.
    return undefined;
  }
}

/**
 * Read an endpoint through the cache.
 *
 * Returns an axios-shaped `{ data }` so call sites are unchanged - every
 * consumer in the app reads `res.data`.
 */
export async function cachedGet(key, networkFn) {
  const entry = await readCached(key);

  if (entry !== undefined) {
    // Refresh underneath, but don't await it - returning instantly is the
    // entire point.
    revalidate(key, networkFn, entry.value);
    return { data: entry.value, fromCache: true };
  }

  // Nothing cached: the network is the only option, even if we believe it's
  // unreachable - being wrong about that would mean failing a request that
  // would have worked.
  const res = await networkFn();
  await writeCached(key, res.data);
  return res;
}

/**
 * Force a network read, falling back to cache if it fails.
 *
 * For explicit user-triggered refreshes, where showing stale data first would
 * be wrong. Still writes through, and still degrades to cache rather than
 * erroring when the backend is gone.
 */
export async function freshGet(key, networkFn) {
  try {
    const res = await networkFn();
    await writeCached(key, res.data);
    return res;
  } catch (err) {
    const entry = await readCached(key);
    if (entry !== undefined) return { data: entry.value, fromCache: true };
    throw err;
  }
}

/** Whether a read would currently be served from cache without hitting the
 *  network - used by the dev tools Build tab, not by app logic. */
export async function isCached(key) {
  return (await readCached(key)) !== undefined;
}

export function backendReachable() {
  return isReachable();
}
