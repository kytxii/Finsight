import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";

// Real IndexedDB semantics matter for this module specifically - the bug
// this suite exists to catch (holding a cursor's transaction open across an
// awaited network call) only reproduces against the actual auto-commit
// behaviour, not a mock.

vi.mock("../client", () => ({
  default: { request: vi.fn() },
}));

import client from "../client";
import { enqueue, drain, outboxDepth, deadLetters } from "./outbox";
import { OUTBOX, connect } from "./db";
import * as connectivity from "../../utils/connectivity";

beforeEach(async () => {
  // db.js caches its connection at module scope for the lifetime of the
  // page, matching production - so between tests this clears the store's
  // rows rather than swapping out indexedDB itself, which would leave that
  // cached connection pointing at a database that no longer exists.
  await (await connect()).clear(OUTBOX);
  vi.clearAllMocks();
  vi.spyOn(connectivity, "isReachable").mockReturnValue(true);
});

const op = (overrides = {}) => ({
  method: "POST",
  url: "/transactions/",
  body: { id: "abc", name: "Coffee" },
  ...overrides,
});

describe("enqueue + drain", () => {
  it("removes an op from the queue once it succeeds", async () => {
    client.request.mockResolvedValue({ data: {} });

    await enqueue(op());
    expect(await outboxDepth()).toBe(1);

    await drain();
    expect(await outboxDepth()).toBe(0);
  });

  // This is the scenario that broke the first version of drain(): a slow
  // network call awaited mid-loop let the cursor's IndexedDB transaction
  // auto-commit, and the next cursor.continue() threw TransactionInactiveError.
  it("survives a slow network call without throwing", async () => {
    client.request.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: {} }), 50)),
    );

    await enqueue(op());
    await expect(drain()).resolves.not.toThrow();
    expect(await outboxDepth()).toBe(0);
  });

  it("replays multiple ops in the order they were queued", async () => {
    const order = [];
    client.request.mockImplementation(async (req) => {
      order.push(req.url);
      return { data: {} };
    });

    await enqueue(op({ url: "/transactions/1" }));
    await enqueue(op({ url: "/transactions/2" }));
    await enqueue(op({ url: "/transactions/3" }));
    await drain();

    expect(order).toEqual(["/transactions/1", "/transactions/2", "/transactions/3"]);
  });

  it("stops draining on the first unreachable failure, leaving later ops queued", async () => {
    client.request
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce({ message: "Network Error" }); // no response = unreachable

    await enqueue(op({ url: "/transactions/1" }));
    await enqueue(op({ url: "/transactions/2" }));
    await enqueue(op({ url: "/transactions/3" }));
    await drain();

    expect(client.request).toHaveBeenCalledTimes(2); // 1 succeeded, 2 failed, 3 never attempted
    expect(await outboxDepth()).toBe(2); // 2 and 3 remain
  });

  it("dead-letters a permanent 4xx rejection instead of retrying it forever", async () => {
    client.request.mockRejectedValue({ response: { status: 422, data: { detail: "bad category" } } });

    await enqueue(op());
    await drain();

    expect(await outboxDepth()).toBe(1); // still in the store, but...
    const letters = await deadLetters();
    expect(letters).toHaveLength(1);
    expect(letters[0].error).toBe("bad category");
  });

  it("does not dead-letter a 5xx - it's retried with backoff instead", async () => {
    client.request.mockRejectedValue({ response: { status: 503 } });

    await enqueue(op());
    await drain();

    const letters = await deadLetters();
    expect(letters).toHaveLength(0);
    expect(await outboxDepth()).toBe(1);
  });

  it("does nothing when the tracker already believes the backend is unreachable", async () => {
    vi.spyOn(connectivity, "isReachable").mockReturnValue(false);
    await enqueue(op());

    await drain();

    expect(client.request).not.toHaveBeenCalled();
    expect(await outboxDepth()).toBe(1);
  });

  it("does not start a second drain while one is already running", async () => {
    let resolveFirst;
    client.request.mockImplementation(
      () => new Promise((resolve) => (resolveFirst = resolve)),
    );

    await enqueue(op());
    const first = drain();
    const second = drain(); // should short-circuit immediately, not double-process

    // first's connect()/getAll() awaits are real async IndexedDB I/O, not
    // synchronous - give them room to actually reach the client.request()
    // call before resolving it.
    await vi.waitFor(() => expect(resolveFirst).toBeDefined());
    resolveFirst({ data: {} });
    await Promise.all([first, second]);

    expect(client.request).toHaveBeenCalledOnce();
  });
});
