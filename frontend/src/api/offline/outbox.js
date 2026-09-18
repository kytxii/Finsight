import client from "../client";
import { OUTBOX, connect } from "./db";
import { isUnreachableError, isReachable, subscribe } from "../../utils/connectivity";

// Write sync for offline mutations (#204).
//
// A create made while offline needs a real, final id the moment it's made -
// every backend model's primary key already defaults to uuid4, so the
// browser mints the same kind of id the server would have, via
// crypto.randomUUID(). The backend's idempotent-create support (see
// app/services/sync_utils.py) means replaying that same create later, if the
// first attempt's response never arrived, lands once, not twice.
//
// Single-device, last-write-wins (#204 decision): queued ops replay strictly
// in order, oldest first, one at a time. No conflict detection, no merge -
// this app is not built for two devices editing the same row in the same
// offline window.

export function generateId() {
  return crypto.randomUUID();
}

/**
 * Queue a write and return immediately. The caller already has what it needs
 * (the id, for a create) without waiting on the network.
 *
 * Takes a plain description of the HTTP call to make later - method, url,
 * body - not a closure, because closures can't survive being written to
 * IndexedDB and read back after a page reload.
 */
export async function enqueue({ method, url, body }) {
  const db = await connect();
  await db.add(OUTBOX, {
    method,
    url,
    body,
    attempts: 0,
    createdAt: Date.now(),
  });
  scheduleDrain();
}

export async function outboxDepth() {
  const db = await connect();
  return db.count(OUTBOX);
}

export async function deadLetters() {
  const db = await connect();
  const all = await db.getAll(OUTBOX);
  return all.filter((op) => op.deadLetter);
}

export async function clearDeadLetter(seq) {
  const db = await connect();
  await db.delete(OUTBOX, seq);
}

const drainListeners = new Set();
export function subscribeToOutbox(fn) {
  drainListeners.add(fn);
  return () => drainListeners.delete(fn);
}
async function notifyDrainListeners() {
  const depth = await outboxDepth();
  drainListeners.forEach((fn) => {
    try {
      fn(depth);
    } catch (err) {
      console.error("[outbox] listener threw:", err);
    }
  });
}

// A 4xx means the server looked at this request and said no - retrying it
// unchanged will never succeed, so it's dead-lettered rather than retried
// forever. A 5xx or network failure says nothing about the request itself.
function isPermanentRejection(error) {
  const status = error?.response?.status;
  return status !== undefined && status >= 400 && status < 500;
}

let draining = false;
let drainTimer = null;

/** Debounced rather than immediate: enqueue() calls this on every write, and
 *  a burst of edits (e.g. batch add) shouldn't start a fresh drain attempt
 *  per row. */
function scheduleDrain(delay = 300) {
  if (drainTimer) clearTimeout(drainTimer);
  drainTimer = setTimeout(() => {
    drainTimer = null;
    drain();
  }, delay);
}

/**
 * Replay queued writes in order, oldest first, stopping at the first one
 * that isn't ready to retry yet or that fails for a reason other than a
 * permanent rejection. Ordering matters: an update queued after its own
 * create must not run first.
 *
 * Reads the whole queue up front rather than holding a cursor open across
 * the loop: an IndexedDB transaction auto-commits once it has no pending
 * request outstanding, and a network call awaited between cursor steps -
 * exactly what happens here, and can take up to client.js's 60s timeout -
 * would let the cursor's transaction close underneath it, throwing
 * TransactionInactiveError on the next continue(). getAll() is naturally in
 * ascending key order for an autoIncrement store, which preserves ordering
 * without needing a live cursor.
 */
export async function drain() {
  if (draining || !isReachable()) return;

  // The `draining` flag above is module state, so it only guards this tab.
  // Two tabs open on the same device share one outbox, and without a
  // cross-tab lock both would replay the same ops concurrently (#204).
  // Idempotent creates and deletes make that survivable rather than
  // corrupting, but it still means duplicate requests and a racing delete
  // of the same queue row. navigator.locks serialises it properly;
  // ifAvailable means a tab that finds the lock held gives up rather than
  // queueing behind a drain that may run to a 60s timeout.
  if (navigator.locks?.request) {
    await navigator.locks.request("finsight-outbox-drain", { ifAvailable: true }, async (lock) => {
      if (lock) await drainLocked();
    });
    return;
  }

  await drainLocked();
}

async function drainLocked() {
  if (draining) return;
  draining = true;

  try {
    const db = await connect();
    const ops = await db.getAll(OUTBOX);

    for (const op of ops) {
      if (op.deadLetter) continue;
      if (op.nextAttemptAt && op.nextAttemptAt > Date.now()) continue;

      try {
        await client.request({ method: op.method, url: op.url, data: op.body });
        await (await connect()).delete(OUTBOX, op.seq);
      } catch (err) {
        if (isUnreachableError(err)) {
          // Stop entirely rather than skip past this one - later ops may
          // depend on this one having applied, and connectivity almost
          // certainly means the same fate awaits the rest of the queue too.
          break;
        }

        // No key arg to put(): OUTBOX has an inline keyPath ("seq"), and
        // IndexedDB throws DataError if both a keyed value and an explicit
        // key are given.
        if (isPermanentRejection(err)) {
          await (await connect()).put(OUTBOX, { ...op, deadLetter: true, error: describeError(err) });
        } else {
          const attempts = op.attempts + 1;
          const backoffMs = Math.min(30000, 1000 * 2 ** attempts);
          await (await connect()).put(OUTBOX, {
            ...op,
            attempts,
            nextAttemptAt: Date.now() + backoffMs,
            error: describeError(err),
          });
        }
      }
    }
  } finally {
    draining = false;
    notifyDrainListeners();
  }
}

function describeError(err) {
  return err?.response?.data?.detail ?? err?.message ?? "Unknown error";
}

// Drain whenever the tracker flips to reachable, and once on load in case
// the app booted already-online with a queue left over from a previous
// session.
if (typeof window !== "undefined") {
  subscribe((reachable) => {
    if (reachable) scheduleDrain(0);
  });
  scheduleDrain(1000);
}
