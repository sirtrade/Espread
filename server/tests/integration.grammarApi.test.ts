import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("grammar API: list and manual status changes (F-13)", () => {
  let app: ReturnType<typeof import("../src/api/app.js").createApp>;
  let db: typeof import("../src/db/client.js").db;
  let sqlite: typeof import("../src/db/client.js").sqlite;
  let schema: typeof import("../src/db/schema.js");
  let userId: number;
  let auth: string;
  let otherAuth: string;

  const EXERCISE = JSON.stringify({
    cloze: "Cuando ___ tiempo, iremos al museo.",
    acceptedAnswers: ["tengamos"],
    options: ["tenemos", "tendremos", "teníamos"],
  });

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    ({ db, sqlite } = await import("../src/db/client.js"));
    migrate(db, { migrationsFolder: "./drizzle" });
    schema = await import("../src/db/schema.js");
    const { findOrCreateUser, updateUser } = await import("../src/db/repositories/users.js");
    const { signSession } = await import("../src/auth/jwt.js");
    const user = await findOrCreateUser(779005, "grammarapi");
    userId = user.id;
    await updateUser(userId, { grammarActivePoolLimit: 1 });
    auth = `Bearer ${signSession({ userId, tgUserId: user.tgUserId })}`;
    const other = await findOrCreateUser(779006, "grammarapi2");
    otherAuth = `Bearer ${signSession({ userId: other.id, tgUserId: other.tgUserId })}`;
    app = (await import("../src/api/app.js")).createApp();
  });

  afterAll(() => sqlite.close());

  async function insertItem(key: string, status: "active" | "queued" | "learned" | "ignored", createdAt: number) {
    const [row] = await db
      .insert(schema.grammarItems)
      .values({
        userId,
        canonicalKey: key,
        pattern: `patrón ${key}`,
        category: "mood",
        explanation: "Explicación breve.",
        status,
        contexts: "[]",
        exercise: EXERCISE,
        srsStage: 2,
        nextDueAt: 999,
        lastCreditAt: 555,
        createdAt,
      })
      .returning();
    return row!;
  }

  it("lists items with an optional status filter", async () => {
    await insertItem("patron+activo", "active", 1000);
    await insertItem("patron+cola-1", "queued", 2000);
    await insertItem("patron+cola-2", "queued", 3000);

    const all = await app.request("/api/grammar", { headers: { Authorization: auth } });
    expect(all.status).toBe(200);
    expect(((await all.json()) as { items: unknown[] }).items).toHaveLength(3);

    const queued = await app.request("/api/grammar?status=queued", { headers: { Authorization: auth } });
    const body = (await queued.json()) as { items: Array<{ canonicalKey: string; exercise: { cloze: string } }> };
    expect(body.items.map((item) => item.canonicalKey)).toEqual(["patron+cola-1", "patron+cola-2"]);
    expect(body.items[0]!.exercise.cloze).toContain("___");
  });

  it("changes status with a full SRS reset and FIFO-promotes the freed slot", async () => {
    const [active] = await db.query.grammarItems.findMany({
      where: (t, { and, eq }) => and(eq(t.userId, userId), eq(t.status, "active")),
    });

    const res = await app.request(`/api/grammar/${active!.id}`, {
      method: "PATCH",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "learned" }),
    });
    expect(res.status).toBe(200);
    const { item } = (await res.json()) as { item: { status: string; srsStage: number } };
    expect(item.status).toBe("learned");
    expect(item.srsStage).toBe(0);

    // The freed slot pulls the OLDEST queued unit into the pool (limit 1).
    const rows = await db.query.grammarItems.findMany({
      where: (t, { eq }) => eq(t.userId, userId),
    });
    const byKey = new Map(rows.map((row) => [row.canonicalKey, row.status]));
    expect(byKey.get("patron+cola-1")).toBe("active");
    expect(byKey.get("patron+cola-2")).toBe("queued");
  });

  it("rejects a foreign item and an invalid status", async () => {
    const rows = await db.query.grammarItems.findMany({ where: (t, { eq }) => eq(t.userId, userId) });
    const foreign = await app.request(`/api/grammar/${rows[0]!.id}`, {
      method: "PATCH",
      headers: { Authorization: otherAuth, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "learned" }),
    });
    expect(foreign.status).toBe(404);

    const invalid = await app.request(`/api/grammar/${rows[0]!.id}`, {
      method: "PATCH",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    expect(invalid.status).toBe(400);
  });
});
