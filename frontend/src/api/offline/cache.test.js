import { describe, it, expect, beforeEach, vi } from "vitest";

// The IndexedDB layer is mocked rather than polyfilled: what's worth testing
// here is the stale-while-revalidate contract, not idb itself.
vi.mock("./db", () => {
  const store = new Map();
  return {
    readCached: vi.fn(async (key) => store.get(key)),
    writeCached: vi.fn(async (key, value) =>
      store.set(key, { value, cachedAt: Date.now() }),
    ),
    __store: store,
  };
});

import { cachedGet, freshGet, subscribeToKey } from "./cache";
import { readCached, writeCached, __store } from "./db";

const ok = (data) => ({ data });

beforeEach(() => {
  __store.clear();
  vi.clearAllMocks();
});

describe("cachedGet", () => {
  it("goes to the network when nothing is cached, and writes through", async () => {
    const network = vi.fn().mockResolvedValue(ok([{ id: 1 }]));

    const res = await cachedGet("transactions", network);

    expect(network).toHaveBeenCalledOnce();
    expect(res.data).toEqual([{ id: 1 }]);
    expect(writeCached).toHaveBeenCalledWith("transactions", [{ id: 1 }]);
  });

  // The cold-start case: Render takes ~50s to wake, so the cached value has to
  // come back without waiting on the network call at all.
  it("returns cached data without awaiting the network", async () => {
    __store.set("transactions", { value: [{ id: "old" }], cachedAt: 0 });
    let resolveNetwork;
    const network = vi.fn(
      () => new Promise((resolve) => (resolveNetwork = resolve)),
    );

    const res = await cachedGet("transactions", network);

    expect(res.data).toEqual([{ id: "old" }]);
    expect(res.fromCache).toBe(true);
    expect(network).toHaveBeenCalledOnce(); // fired, but not awaited
    resolveNetwork(ok([{ id: "new" }]));
  });

  it("notifies subscribers when the revalidation differs", async () => {
    __store.set("transactions", { value: [{ id: "old" }], cachedAt: 0 });
    const network = vi.fn().mockResolvedValue(ok([{ id: "new" }]));
    const seen = vi.fn();
    const stop = subscribeToKey("transactions", seen);

    await cachedGet("transactions", network);
    await vi.waitFor(() => expect(seen).toHaveBeenCalledWith([{ id: "new" }]));

    stop();
  });

  // Waking a subscriber for identical data would re-render the dashboard for
  // nothing on every single read.
  it("stays quiet when the revalidation matches what was served", async () => {
    __store.set("transactions", { value: [{ id: 1 }], cachedAt: 0 });
    const network = vi.fn().mockResolvedValue(ok([{ id: 1 }]));
    const seen = vi.fn();
    const stop = subscribeToKey("transactions", seen);

    await cachedGet("transactions", network);
    await vi.waitFor(() => expect(writeCached).toHaveBeenCalled());
    expect(seen).not.toHaveBeenCalled();

    stop();
  });

  // The caller already has usable data - a failed refresh behind it is not an
  // error anyone should see.
  it("swallows a failed revalidation", async () => {
    __store.set("transactions", { value: [{ id: "old" }], cachedAt: 0 });
    const network = vi.fn().mockRejectedValue(new Error("Network Error"));

    const seen = vi.fn();
    const stop = subscribeToKey("transactions", seen);

    const res = await cachedGet("transactions", network);

    expect(res.data).toEqual([{ id: "old" }]);
    await vi.waitFor(() => expect(network).toHaveBeenCalledOnce());
    // Nothing thrown, nothing surfaced - the rejection is absorbed inside
    // revalidate() rather than escaping as an unhandled promise rejection.
    expect(seen).not.toHaveBeenCalled();

    stop();
  });

  it("propagates a network failure when there is no cache to fall back on", async () => {
    const network = vi.fn().mockRejectedValue(new Error("Network Error"));

    await expect(cachedGet("transactions", network)).rejects.toThrow(
      "Network Error",
    );
  });
});

describe("freshGet", () => {
  it("prefers the network and writes through", async () => {
    __store.set("balance", { value: 10, cachedAt: 0 });
    const network = vi.fn().mockResolvedValue(ok(42));

    const res = await freshGet("balance", network);

    expect(res.data).toBe(42);
    expect(writeCached).toHaveBeenCalledWith("balance", 42);
  });

  it("falls back to cache when the network fails", async () => {
    __store.set("balance", { value: 10, cachedAt: 0 });
    const network = vi.fn().mockRejectedValue(new Error("502"));

    const res = await freshGet("balance", network);

    expect(res.data).toBe(10);
    expect(res.fromCache).toBe(true);
  });

  it("rethrows when the network fails and nothing is cached", async () => {
    const network = vi.fn().mockRejectedValue(new Error("502"));

    await expect(freshGet("balance", network)).rejects.toThrow("502");
    expect(readCached).toHaveBeenCalledWith("balance");
  });
});
