import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { META, connect } from "../api/offline/db";
import { recordVerified, isSessionExpired, RETENTION_DAYS } from "./sessionRetention";

beforeEach(async () => {
  await (await connect()).clear(META);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const DAY_MS = 24 * 60 * 60 * 1000;

// Date.now() is mocked directly rather than vi.useFakeTimers() - fake timers
// hijack the setTimeout-based scheduling fake-indexeddb uses internally to
// resolve its own promises, which just hangs every IndexedDB operation.
function setNow(ms) {
  vi.spyOn(Date, "now").mockReturnValue(ms);
}

describe("isSessionExpired", () => {
  // Every session that existed before this feature shipped has no recorded
  // verification yet - treating that as "expired" would force-log-out every
  // existing user the first time they happen to open the app offline.
  it("is not expired when nothing has ever been recorded", async () => {
    expect(await isSessionExpired()).toBe(false);
  });

  it("is not expired immediately after recording", async () => {
    await recordVerified();
    expect(await isSessionExpired()).toBe(false);
  });

  it("is not expired just under the retention window", async () => {
    setNow(1_000_000);
    await recordVerified();
    setNow(1_000_000 + RETENTION_DAYS * DAY_MS - DAY_MS);
    expect(await isSessionExpired()).toBe(false);
  });

  it("is expired once the retention window has fully passed", async () => {
    setNow(1_000_000);
    await recordVerified();
    setNow(1_000_000 + RETENTION_DAYS * DAY_MS + DAY_MS);
    expect(await isSessionExpired()).toBe(true);
  });

  it("resets the clock on a later successful contact", async () => {
    setNow(1_000_000);
    await recordVerified();
    setNow(1_000_000 + RETENTION_DAYS * DAY_MS - DAY_MS);
    await recordVerified(); // ordinary use during the window
    setNow(1_000_000 + (RETENTION_DAYS * DAY_MS - DAY_MS) + RETENTION_DAYS * DAY_MS - DAY_MS);
    expect(await isSessionExpired()).toBe(false); // still within window of the 2nd contact
  });
});
