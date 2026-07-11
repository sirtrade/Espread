import { describe, expect, it } from "vitest";
import { withUserLock } from "../src/lib/locks.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("withUserLock", () => {
  it("serializes work under the same key", async () => {
    const order: string[] = [];
    await Promise.all([
      withUserLock("u1", async () => {
        order.push("a-start");
        await sleep(20);
        order.push("a-end");
      }),
      withUserLock("u1", async () => {
        order.push("b-start");
        await sleep(5);
        order.push("b-end");
      }),
    ]);
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });

  it("does not block different keys", async () => {
    const order: string[] = [];
    await Promise.all([
      withUserLock("u1", async () => {
        await sleep(20);
        order.push("slow");
      }),
      withUserLock("u2", async () => {
        order.push("fast");
      }),
    ]);
    expect(order).toEqual(["fast", "slow"]);
  });

  it("keeps the chain alive after a rejection", async () => {
    await expect(
      withUserLock("u1", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(withUserLock("u1", async () => "ok")).resolves.toBe("ok");
  });

  it("propagates return values", async () => {
    await expect(withUserLock("u1", async () => 42)).resolves.toBe(42);
  });
});
