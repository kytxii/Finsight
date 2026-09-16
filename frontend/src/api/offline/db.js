import { openDB } from "idb";

// Durable local store for offline-first reads (#204).
//
// IndexedDB rather than localStorage, deliberately: this holds real financial
// history, and localStorage is synchronous (janks the UI on every write),
// caps around 5MB, and stores strings only. demoStore.js stays on
// localStorage and stays demo-only - it was written as a disposable fake
// backend, not as somewhere data lives.
//
// Phase 2 uses this as a read cache. The `outbox` store is created here but
// unused until phase 3, because adding an object store later means a version
// bump and a migration - cheaper to declare it now.

const DB_NAME = "finsight";
const DB_VERSION = 1;

// One store per cached endpoint. Keyed by a plain string, holding whatever the
// endpoint returned - these are response caches, not a normalised schema. A
// relational local model would have to reimplement the server's joins, and
// nothing here queries across resources.
export const RESPONSES = "responses";
export const OUTBOX = "outbox";
export const META = "meta";

let dbPromise = null;

/**
 * The one place that owns opening this database. outbox.js shares this
 * rather than calling openDB() itself (#204 fix): idb only registers an
 * upgrade handler on the openDB() call that passes an `upgrade` option, and
 * IndexedDB only fires upgradeneeded on a version increase - so whichever
 * module's bare, upgrade-less open() call happened to run first would
 * silently create the database with zero object stores, forever, since no
 * later open() at the same version gets a second chance to create them.
 */
export function connect() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(RESPONSES)) {
          db.createObjectStore(RESPONSES);
        }
        if (!db.objectStoreNames.contains(OUTBOX)) {
          // autoIncrement gives the ordering phase 3's drain depends on: a
          // create must replay before the update that follows it.
          db.createObjectStore(OUTBOX, {
            keyPath: "seq",
            autoIncrement: true,
          });
        }
        if (!db.objectStoreNames.contains(META)) {
          db.createObjectStore(META);
        }
      },
      blocked() {
        console.warn("[offline] upgrade blocked by another open tab");
      },
    });
  }
  return dbPromise;
}

// Every helper swallows IndexedDB failures rather than propagating them. The
// cache is an optimisation; a browser in private mode, out of quota, or with
// storage disabled must degrade to plain network behaviour, never break the
// app. Failures are logged, not thrown.
async function safely(operation, fallback = undefined) {
  try {
    return await operation(await connect());
  } catch (err) {
    console.warn("[offline] IndexedDB unavailable:", err?.message ?? err);
    return fallback;
  }
}

export async function readCached(key) {
  return safely((db) => db.get(RESPONSES, key));
}

export async function writeCached(key, value) {
  return safely((db) =>
    db.put(RESPONSES, { value, cachedAt: Date.now() }, key),
  );
}

export async function clearCachedKey(key) {
  return safely((db) => db.delete(RESPONSES, key));
}

/**
 * Wipes every cached response and all metadata.
 *
 * Called on logout and on account switch. The equivalent bug for the in-memory
 * pageCache is documented in utils/pageCache.js - the same mistake here would
 * be worse, since IndexedDB survives the tab closing and would seed the next
 * account's session with the previous user's financial data on a shared
 * device.
 *
 * Leaves the outbox alone: phase 3 decides what happens to unsent writes at
 * logout, and silently discarding them here would lose data.
 */
export async function clearAllCached() {
  return safely(async (db) => {
    await db.clear(RESPONSES);
    await db.clear(META);
  });
}

/**
 * Drops every cached response, leaving metadata and the outbox intact.
 *
 * Called from client.js after any successful mutation. Deliberately blunt: a
 * new transaction moves spendable surplus, estimated savings, running balance
 * and cash on hand, all of which are separate cached endpoints - tracking
 * which keys a given write invalidates would be a dependency graph that gets
 * silently wrong the first time someone adds an endpoint. Everything
 * repopulates on the next read, and the store is small.
 */
export async function clearResponses() {
  return safely((db) => db.clear(RESPONSES));
}

export async function readMeta(key) {
  return safely((db) => db.get(META, key));
}

export async function writeMeta(key, value) {
  return safely((db) => db.put(META, value, key));
}
