import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Integration coverage for the active-pool limit at the repository layer:
 * FIFO promotion out of the queue, slot freeing, the "no demotion" rule, and
 * that queued words are invisible to practice and to article weaving.
 */
describe("active-pool limit and queue promotion", () => {
  let migrate: typeof import("drizzle-orm/better-sqlite3/migrator").migrate;
  let db: typeof import("../src/db/client.js").db;
  let sqlite: typeof import("../src/db/client.js").sqlite;
  let schema: typeof import("../src/db/schema.js");
  let findOrCreateUser: typeof import("../src/db/repositories/users.js").findOrCreateUser;
  let updateUser: typeof import("../src/db/repositories/users.js").updateUser;
  let bankRepo: typeof import("../src/db/repositories/bank.js");

  beforeAll(async () => {
    ({ migrate } = await import("drizzle-orm/better-sqlite3/migrator"));
    ({ db, sqlite } = await import("../src/db/client.js"));
    migrate(db, { migrationsFolder: "./drizzle" });
    schema = await import("../src/db/schema.js");
    ({ findOrCreateUser, updateUser } = await import("../src/db/repositories/users.js"));
    bankRepo = await import("../src/db/repositories/bank.js");
  });

  afterAll(() => {
    sqlite.close();
  });

  /** Inserts a bank row with an explicit createdAt so FIFO order is deterministic. */
  function seed(userId: number, lemma: string, status: string, createdAt: number) {
    db.insert(schema.bankItems)
      .values({ userId, lemma, status: status as "active" | "queued" | "learned" | "ignored", createdAt, updatedAt: createdAt })
      .run();
  }

  it("promotes the oldest queued word first (FIFO) into a freed slot", async () => {
    const user = await findOrCreateUser(990101, "fifo");
    await updateUser(user.id, { activePoolLimit: 3 });

    // Pool full (3 active) with three queued words of increasing age.
    seed(user.id, "act1", "active", 1000);
    seed(user.id, "act2", "active", 1000);
    seed(user.id, "act3", "active", 1000);
    seed(user.id, "q_old", "queued", 100);
    seed(user.id, "q_mid", "queued", 200);
    seed(user.id, "q_new", "queued", 300);

    // No free slot yet: rebalance is a no-op.
    expect(await bankRepo.rebalanceActivePool(user.id, 3)).toEqual([]);

    // Free one slot by learning an active word.
    const act1 = await bankRepo.getBankItemByLemma(user.id, "act1");
    await bankRepo.setBankItemStatus(user.id, act1!.id, "learned");

    // setBankItemStatus itself doesn't rebalance; the route does. Do it here.
    const promoted = await bankRepo.rebalanceActivePool(user.id, 3);
    expect(promoted).toEqual(["q_old"]);
    expect((await bankRepo.getBankItemByLemma(user.id, "q_old"))?.status).toBe("active");
    expect((await bankRepo.getBankItemByLemma(user.id, "q_mid"))?.status).toBe("queued");
    expect(await bankRepo.countBankByStatus(user.id, "active")).toBe(3);
  });

  it("never demotes an over-limit pool (e.g. after 'Estudiar ahora')", async () => {
    const user = await findOrCreateUser(990102, "overlimit");
    await updateUser(user.id, { activePoolLimit: 2 });

    seed(user.id, "a", "active", 1000);
    seed(user.id, "a2", "active", 1000);
    seed(user.id, "waiting", "queued", 100);

    // The user forces the queued word into study past the cap.
    const waiting = await bankRepo.getBankItemByLemma(user.id, "waiting");
    await bankRepo.setBankItemStatus(user.id, waiting!.id, "active");
    expect(await bankRepo.countBankByStatus(user.id, "active")).toBe(3);

    // Rebalance with an over-full pool promotes nothing and demotes nothing.
    expect(await bankRepo.rebalanceActivePool(user.id, 2)).toEqual([]);
    expect(await bankRepo.countBankByStatus(user.id, "active")).toBe(3);
  });

  it("raising the limit drains the queue; lowering it leaves the pool alone", async () => {
    const user = await findOrCreateUser(990103, "resize");
    await updateUser(user.id, { activePoolLimit: 2 });

    seed(user.id, "a", "active", 1000);
    seed(user.id, "a2", "active", 1000);
    seed(user.id, "q1", "queued", 100);
    seed(user.id, "q2", "queued", 200);

    // Lowering the limit demotes nothing.
    await updateUser(user.id, { activePoolLimit: 1 });
    expect(await bankRepo.rebalanceActivePool(user.id, 1)).toEqual([]);
    expect(await bankRepo.countBankByStatus(user.id, "active")).toBe(2);

    // Raising the limit past the active count refills from the queue, oldest first.
    await updateUser(user.id, { activePoolLimit: 4 });
    expect(await bankRepo.rebalanceActivePool(user.id, 4)).toEqual(["q1", "q2"]);
    expect(await bankRepo.countBankByStatus(user.id, "queued")).toBe(0);
    expect(await bankRepo.countBankByStatus(user.id, "active")).toBe(4);
  });

  it("with no limit (0) never queues: the whole queue drains", async () => {
    const user = await findOrCreateUser(990104, "nolimit");
    seed(user.id, "q1", "queued", 100);
    seed(user.id, "q2", "queued", 200);
    expect((await bankRepo.rebalanceActivePool(user.id, 0)).sort()).toEqual(["q1", "q2"]);
    expect(await bankRepo.countBankByStatus(user.id, "queued")).toBe(0);
  });

  it("keeps queued words out of practice and article weaving", async () => {
    const user = await findOrCreateUser(990105, "hidden");
    seed(user.id, "activo", "active", 1000);
    seed(user.id, "encolado", "queued", 1000);

    const due = await bankRepo.getDueForPractice(user.id, Date.now(), 50);
    expect(due.map((d) => d.lemma)).toEqual(["activo"]);

    const forWeaving = await bankRepo.getActiveItemsForSelection(user.id);
    expect(forWeaving.map((d) => d.lemma)).toEqual(["activo"]);
  });
});
