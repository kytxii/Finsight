import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";

// The switch is only worth anything if requests genuinely fail - flipping the
// connectivity flag alone wouldn't stop a write, because every write tries the
// network first regardless of what that flag says (see api/offline/mutate.js).

const adapter = vi.fn();

vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual.default,
      create: (config) => actual.default.create({ ...config, adapter }),
      post: vi.fn(),
      get: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("forced offline", () => {
  it("rejects before the request reaches the network", async () => {
    const { setForcedOffline } = await import("../utils/connectivity");
    setForcedOffline(true);
    const { default: client } = await import("./client");

    await expect(client.get("/transactions/")).rejects.toMatchObject({
      code: "ERR_NETWORK",
    });
    expect(adapter).not.toHaveBeenCalled();
  });

  it("rejects in the shape the offline layer reads as unreachable", async () => {
    const { setForcedOffline, isUnreachableError } = await import("../utils/connectivity");
    setForcedOffline(true);
    const { default: client } = await import("./client");

    const err = await client.post("/transactions/", {}).catch((e) => e);

    // No `response` at all - the same thing a dead network produces, which is
    // what routes the write into the outbox rather than to the caller.
    expect(err.response).toBeUndefined();
    expect(isUnreachableError(err)).toBe(true);
  });

  it("lets requests through once the switch is off", async () => {
    const { setForcedOffline } = await import("../utils/connectivity");
    setForcedOffline(false);
    const { default: client } = await import("./client");
    adapter.mockResolvedValue({ data: [], status: 200, statusText: "OK", headers: {}, config: {} });

    await client.get("/transactions/");

    expect(adapter).toHaveBeenCalled();
  });
});
