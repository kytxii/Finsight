import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isUnreachableError,
  isReachable,
  reportReachable,
  reportUnreachable,
  subscribe,
} from "./connectivity";

describe("isUnreachableError", () => {
  it("treats a network error with no response as unreachable", () => {
    expect(isUnreachableError({ message: "Network Error" })).toBe(true);
  });

  it("treats an axios timeout as unreachable", () => {
    expect(isUnreachableError({ code: "ECONNABORTED" })).toBe(true);
  });

  // A suspended Render service answers 502/503 through Vercel's proxy, which
  // is functionally identical to it being gone - the distinction that matters
  // is whether the backend made a decision, not whether bytes came back.
  it.each([500, 502, 503, 504])("treats %i as unreachable", (status) => {
    expect(isUnreachableError({ response: { status } })).toBe(true);
  });

  // These are the backend working correctly and saying no. Treating them as
  // unreachable would keep a genuinely dead session alive forever.
  it.each([400, 401, 403, 404, 422, 429])(
    "treats %i as reachable",
    (status) => {
      expect(isUnreachableError({ response: { status } })).toBe(false);
    },
  );

  it("handles a null error without throwing", () => {
    expect(isUnreachableError(null)).toBe(true);
  });
});

describe("reachability state", () => {
  beforeEach(() => {
    reportReachable();
  });

  it("notifies subscribers only on change", () => {
    const seen = vi.fn();
    const unsubscribe = subscribe(seen);

    reportReachable(); // already reachable - no notification
    expect(seen).not.toHaveBeenCalled();

    reportUnreachable();
    expect(seen).toHaveBeenCalledExactlyOnceWith(false);

    reportUnreachable(); // still unreachable - no second notification
    expect(seen).toHaveBeenCalledOnce();

    reportReachable();
    expect(seen).toHaveBeenLastCalledWith(true);

    unsubscribe();
    reportUnreachable();
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("reflects the last reported outcome", () => {
    reportUnreachable();
    expect(isReachable()).toBe(false);
    reportReachable();
    expect(isReachable()).toBe(true);
  });

  // One listener throwing must not stop the others from being told, or a
  // single bad subscriber silently freezes every consumer of this state.
  it("keeps notifying after a listener throws", () => {
    const thrower = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    const stop1 = subscribe(thrower);
    const stop2 = subscribe(good);

    vi.spyOn(console, "error").mockImplementation(() => {});
    reportUnreachable();

    expect(thrower).toHaveBeenCalled();
    expect(good).toHaveBeenCalledWith(false);
    stop1();
    stop2();
  });
});

describe("forced offline (dev tools)", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("reports unreachable while forced, whatever the tracker believes", async () => {
    const c = await import("./connectivity");
    c.reportReachable();
    expect(c.isReachable()).toBe(true);

    c.setForcedOffline(true);

    expect(c.isForcedOffline()).toBe(true);
    expect(c.isReachable()).toBe(false);
  });

  it("ignores a success that lands while forced", async () => {
    const c = await import("./connectivity");
    c.setForcedOffline(true);

    // A request that somehow completed must not quietly undo the switch.
    c.reportReachable();

    expect(c.isReachable()).toBe(false);
  });

  it("survives a reload", async () => {
    const first = await import("./connectivity");
    first.setForcedOffline(true);

    // A fresh module registry is what a page reload amounts to here.
    vi.resetModules();
    const afterReload = await import("./connectivity");

    expect(afterReload.isForcedOffline()).toBe(true);
    expect(afterReload.isReachable()).toBe(false);
  });

  it("notifies subscribers when it flips on", async () => {
    const c = await import("./connectivity");
    c.reportReachable();
    const seen = [];
    c.subscribe((v) => seen.push(v));

    c.setForcedOffline(true);

    expect(seen).toEqual([false]);
  });

  it("does not leave the flag set once switched back off", async () => {
    const c = await import("./connectivity");
    c.setForcedOffline(true);
    c.setForcedOffline(false);

    expect(c.isForcedOffline()).toBe(false);
    expect(localStorage.getItem("dev_force_offline")).toBe("false");
  });
});
