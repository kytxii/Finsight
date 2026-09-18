import { describe, it, expect, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";

// db.js caches its open promise at module scope for the page's lifetime, so
// each case here resets the module registry to get a genuinely fresh
// connect() rather than the one a previous test already resolved.
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("durable storage", () => {
  it("asks the browser to keep this origin's storage", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", { ...navigator, storage: { persist } });

    const { connect } = await import("./db");
    await connect();

    expect(persist).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("opens the database anyway when the browser refuses", async () => {
    // Safari without a home-screen install, or a private window: a denial is
    // not an error and must not block the database or surface as an
    // unhandled rejection.
    const persist = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { ...navigator, storage: { persist } });

    const { connect } = await import("./db");
    const db = await connect();

    expect(persist).toHaveBeenCalled();
    expect(db.objectStoreNames.contains("responses")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("opens the database on an engine with no StorageManager at all", async () => {
    vi.stubGlobal("navigator", { ...navigator, storage: undefined });

    const { connect } = await import("./db");
    const db = await connect();

    expect(db.objectStoreNames.contains("outbox")).toBe(true);
    vi.unstubAllGlobals();
  });
});
