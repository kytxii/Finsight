// Lightweight per-key in-memory cache (#119). MobileScreen (see #46) fully
// unmounts its children on close, so a panel that fetches on mount refetches
// from zero - and flashes its skeleton - every single reopen, even seconds
// after closing with nothing changed. This lets a panel seed its state from
// the last-known result on mount (no skeleton) while a normal load still
// runs in the background to catch whatever changed while it was closed.
//
// Module-level, not component state, so it survives the unmount/remount.
// Deliberately NOT persisted anywhere durable (sessionStorage, etc.) - it's
// only meant to smooth a same-session reopen, not to survive a page reload.
const store = new Map();

export function getCached(key) {
  return store.get(key);
}

export function hasCached(key) {
  return store.has(key);
}

export function setCached(key, value) {
  store.set(key, value);
}

export function clearCached(key) {
  store.delete(key);
}
