import client from "../client";
import { enqueue, generateId } from "./outbox";
import { readCached, writeCached } from "./db";
import { isUnreachableError } from "../../utils/connectivity";

// Offline-capable mutation helper (#204). Transactions is the pilot resource
// this is wired into - see api/transactions.js. The other GET-cached
// resources (recurring payments, paychecks, tip deposits, installments,
// credit cards) still write straight to the network; they need the same
// three functions below applied, following this module's pattern, as
// separate follow-up work.
//
// The shared idea: try the network first regardless of what the connectivity
// tracker currently believes, since that belief can be stale (nothing has
// failed yet to update it). Only fall back to queuing when the attempt
// itself fails for an unreachable reason. A rejection the server actually
// made (validation, 404, ...) is never caught here - it propagates to the
// caller exactly as it does today.

async function applyOptimistic(cacheKey, updater) {
  const entry = await readCached(cacheKey);
  const current = entry?.value ?? [];
  await writeCached(cacheKey, updater(current));
}

/**
 * Create a row. Always mints the id client-side via crypto.randomUUID(),
 * online or offline - every backend model's primary key already defaults to
 * the same kind of value, so there's no special "offline id" to reconcile
 * later. The backend's idempotent-create support means a queued create that
 * lands after this call already succeeded (network flaky, not fully down)
 * would just be redundant, not duplicated.
 */
export async function offlineCreate({ url, cacheKey, data, toListItem = (d) => d }) {
  const id = data.id ?? generateId();
  const body = { ...data, id };

  try {
    return await client.post(url, body);
  } catch (err) {
    if (!isUnreachableError(err)) throw err;

    await enqueue({ method: "POST", url, body });
    const optimistic = toListItem(body);
    await applyOptimistic(cacheKey, (list) => [optimistic, ...list]);
    return { data: optimistic, offline: true };
  }
}

/**
 * `deriveMerge` overrides the default flat `{...item, ...data}` merge for
 * resources where a server-computed field depends on the edited ones - e.g.
 * installments.js recomputing monthly_payment when total_amount or
 * period_months changes. Without it, that field would sit stale (or blank,
 * if the item doesn't have one yet from an offline create) until the queued
 * update actually reaches the server.
 */
export async function offlineUpdate({ url, cacheKey, id, data, deriveMerge = (item, data) => ({ ...item, ...data }) }) {
  try {
    return await client.patch(url, data);
  } catch (err) {
    if (!isUnreachableError(err)) throw err;

    await enqueue({ method: "PATCH", url, body: data });
    await applyOptimistic(cacheKey, (list) =>
      list.map((item) => (item.id === id ? deriveMerge(item, data) : item)),
    );
    return { data: deriveMerge({ id }, data), offline: true };
  }
}

export async function offlineDelete({ url, cacheKey, id }) {
  try {
    return await client.delete(url);
  } catch (err) {
    if (!isUnreachableError(err)) throw err;

    await enqueue({ method: "DELETE", url, body: undefined });
    await applyOptimistic(cacheKey, (list) => list.filter((item) => item.id !== id));
    return { data: null, offline: true };
  }
}
