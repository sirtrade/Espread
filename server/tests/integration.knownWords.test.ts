import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

describe("known words: completion, API and reset", () => {
  let app: ReturnType<typeof import("../src/api/app.js").createApp>;
  let db: typeof import("../src/db/client.js").db;
  let sqlite: typeof import("../src/db/client.js").sqlite;
  let schema: typeof import("../src/db/schema.js");
  let userId: number;
  let auth: string;

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    ({ db, sqlite } = await import("../src/db/client.js"));
    migrate(db, { migrationsFolder: "./drizzle" });
    schema = await import("../src/db/schema.js");
    const { findOrCreateUser } = await import("../src/db/repositories/users.js");
    const { signSession } = await import("../src/auth/jwt.js");
    const user = await findOrCreateUser(779001, "knownwords");
    userId = user.id;
    auth = `Bearer ${signSession({ userId, tgUserId: user.tgUserId })}`;
    app = (await import("../src/api/app.js")).createApp();
  });

  afterAll(() => sqlite.close());

  async function completeEncounter() {
    const [article] = await db
      .insert(schema.articles)
      .values({ userId, title: "Lectura", body: "El hallazgo fue importante.", topic: "Ciencia", lemmas: '["hallazgo"]' })
      .returning();
    const [session] = await db
      .insert(schema.readingSessions)
      .values({ userId, articleId: article!.id, state: "reviewed", reviewResult: '{"items":[]}' })
      .returning();
    const { applyCompletion } = await import("../src/db/repositories/completion.js");
    await applyCompletion({
      userId,
      sessionId: session!.id,
      articleId: article!.id,
      marks: "[]",
      reviewResult: '{"items":[]}',
      changedItems: [],
      readingLemmas: ["hallazgo"],
    });
  }

  it("promotes an unmarked article lemma on the third completion", async () => {
    await completeEncounter();
    await completeEncounter();
    let rows = await db.select().from(schema.knownWords).where(eq(schema.knownWords.userId, userId));
    expect(rows[0]).toMatchObject({ lemma: "hallazgo", encounters: 2, source: "reading", knownSince: null });

    await completeEncounter();
    rows = await db.select().from(schema.knownWords).where(eq(schema.knownWords.userId, userId));
    expect(rows[0]?.encounters).toBe(3);
    expect(rows[0]?.knownSince).not.toBeNull();
  });

  it("serves the known-word list and summary", async () => {
    const list = await app.request("/api/known-words", { headers: { Authorization: auth } });
    expect(list.status).toBe(200);
    expect(((await list.json()) as { items: unknown[] }).items).toHaveLength(1);

    const stats = await app.request("/api/known-words/stats", { headers: { Authorization: auth } });
    expect(stats.status).toBe(200);
    expect((await stats.json()) as object).toMatchObject({
      total: 1,
      bySource: { learned: 0, reading: 1, manual: 0 },
    });
  });

  it("DELETE /me/progress clears the registry", async () => {
    const reset = await app.request("/api/me/progress", { method: "DELETE", headers: { Authorization: auth } });
    expect(reset.status).toBe(200);
    const rows = await db.select().from(schema.knownWords).where(eq(schema.knownWords.userId, userId));
    expect(rows).toHaveLength(0);
  });
});
