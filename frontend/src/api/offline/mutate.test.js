import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";

vi.mock("../client", () => ({
  default: { post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock("./outbox", () => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
  generateId: () => "generated-id",
}));

import client from "../client";
import { enqueue } from "./outbox";
import { offlineCreate, offlineUpdate, offlineDelete } from "./mutate";
import { RESPONSES, connect, clearAllCached } from "./db";

beforeEach(async () => {
  await (await connect()).clear(RESPONSES);
  vi.clearAllMocks();
});

describe("offlineCreate", () => {
  it("returns the network response and never queues when online", async () => {
    client.post.mockResolvedValue({ data: { id: "server-id", name: "Coffee" } });

    const res = await offlineCreate({
      url: "/transactions/",
      cacheKey: "transactions",
      data: { name: "Coffee" },
    });

    expect(res.data.id).toBe("server-id");
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("mints a client id, queues, and applies optimistically when unreachable", async () => {
    client.post.mockRejectedValue({ message: "Network Error" }); // no response = unreachable
    await (await connect()).put(RESPONSES, { value: [{ id: "existing" }] }, "transactions");

    const res = await offlineCreate({
      url: "/transactions/",
      cacheKey: "transactions",
      data: { name: "Coffee" },
    });

    expect(res.offline).toBe(true);
    expect(res.data.id).toBe("generated-id");
    expect(enqueue).toHaveBeenCalledWith({
      method: "POST",
      url: "/transactions/",
      body: { name: "Coffee", id: "generated-id" },
    });

    const cached = await (await connect()).get(RESPONSES, "transactions");
    expect(cached.value).toEqual([{ name: "Coffee", id: "generated-id" }, { id: "existing" }]);
  });

  it("propagates a real rejection (bad request) without queuing", async () => {
    client.post.mockRejectedValue({ response: { status: 422, data: { detail: "bad category" } } });

    await expect(
      offlineCreate({ url: "/transactions/", cacheKey: "transactions", data: { name: "x" } }),
    ).rejects.toMatchObject({ response: { status: 422 } });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("reuses a client-supplied id rather than generating a new one", async () => {
    client.post.mockRejectedValue({ message: "Network Error" });

    const res = await offlineCreate({
      url: "/transactions/",
      cacheKey: "transactions",
      data: { id: "already-set", name: "Coffee" },
    });

    expect(res.data.id).toBe("already-set");
  });
});

describe("offlineUpdate", () => {
  it("merges the patch into the cached list entry when unreachable", async () => {
    client.patch.mockRejectedValue({ message: "Network Error" });
    await (await connect()).put(
      RESPONSES,
      { value: [{ id: "1", name: "Old", amount: "5.00" }] },
      "transactions",
    );

    await offlineUpdate({
      url: "/transactions/1",
      cacheKey: "transactions",
      id: "1",
      data: { name: "New" },
    });

    const cached = await (await connect()).get(RESPONSES, "transactions");
    expect(cached.value).toEqual([{ id: "1", name: "New", amount: "5.00" }]);
    expect(enqueue).toHaveBeenCalledWith({ method: "PATCH", url: "/transactions/1", body: { name: "New" } });
  });
});

describe("offlineDelete", () => {
  it("removes the row from the cached list when unreachable", async () => {
    client.delete.mockRejectedValue({ message: "Network Error" });
    await (await connect()).put(
      RESPONSES,
      { value: [{ id: "1" }, { id: "2" }] },
      "transactions",
    );

    await offlineDelete({ url: "/transactions/1", cacheKey: "transactions", id: "1" });

    const cached = await (await connect()).get(RESPONSES, "transactions");
    expect(cached.value).toEqual([{ id: "2" }]);
    expect(enqueue).toHaveBeenCalledWith({ method: "DELETE", url: "/transactions/1", body: undefined });
  });
});

// Not exercised above but relevant: clearAllCached (called on login/logout)
// must not throw even when nothing has ever been cached.
it("clearAllCached is a no-op-safe on an empty database", async () => {
  await expect(clearAllCached()).resolves.not.toThrow();
});
