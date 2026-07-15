import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

describe("level suggestion integration", () => {
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
    const { findOrCreateUser, updateUser } = await import("../src/db/repositories/users.js");
    const { signSession } = await import("../src/auth/jwt.js");
    const user = await findOrCreateUser(881508, "level-suggestion");
    userId = user.id;
    await updateUser(userId, { level: "B1", timezone: "America/Los_Angeles" });
    auth = `Bearer ${signSession({ userId, tgUserId: user.tgUserId })}`;
    app = (await import("../src/api/app.js")).createApp();

    const body = Array.from({ length: 100 }, (_, i) => `palabra${String.fromCharCode(97 + (i % 26))}`).join(" ");
    for (let i = 0; i < 5; i++) {
      await db.insert(schema.articles).values({
        userId,
        title: `Lectura ${i}`,
        body,
        topic: "Ciencia",
        marks: "[]",
        readAt: Date.now() - i * 1_000,
      });
    }
  });

  afterAll(() => sqlite.close());

  it("exposes, atomically acknowledges and dismisses a current suggestion", async () => {
    const stats = await app.request("/api/stats", { headers: { Authorization: auth } });
    expect(stats.status).toBe(200);
    expect((await stats.json()) as object).toMatchObject({
      levelSuggestion: { direction: "up", targetLevel: "B2" },
    });

    const seen = await app.request("/api/me/level-suggestion", {
      method: "PATCH",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seen", direction: "up", targetLevel: "B2" }),
    });
    expect(seen.status).toBe(200);

    const suppressed = await app.request("/api/stats", { headers: { Authorization: auth } });
    expect(((await suppressed.json()) as { levelSuggestion: unknown }).levelSuggestion).toBeNull();

    const dismissed = await app.request("/api/me/level-suggestion", {
      method: "PATCH",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismissed", direction: "up", targetLevel: "B2" }),
    });
    expect(dismissed.status).toBe(200);
    const row = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
    expect(row).toMatchObject({
      levelSuggestionDirection: "up",
      levelSuggestionShownAt: expect.any(Number),
      levelSuggestionDismissedAt: expect.any(Number),
    });
  });

  it("rejects stale interactions and resets metadata on an actual level change", async () => {
    const stale = await app.request("/api/me/level-suggestion", {
      method: "PATCH",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seen", direction: "down", targetLevel: "A2" }),
    });
    expect(stale.status).toBe(409);

    const changed = await app.request("/api/me", {
      method: "PATCH",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ level: "B2" }),
    });
    expect(changed.status).toBe(200);
    const row = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
    expect(row).toMatchObject({
      level: "B2",
      levelSuggestionDirection: null,
      levelSuggestionShownAt: null,
      levelSuggestionDismissedAt: null,
    });
  });

  it("returns the newly eligible suggestion from completion immediately", async () => {
    const [article] = await db
      .insert(schema.articles)
      .values({
        userId,
        title: "Nueva lectura",
        body: "Uno dos tres cuatro cinco seis siete ocho nueve diez.",
        topic: "Ciencia",
      })
      .returning();
    await db.insert(schema.readingSessions).values({
      userId,
      articleId: article!.id,
      state: "reviewed",
      marks: "[]",
      reviewResult: '{"items":[]}',
    });

    const response = await app.request("/api/session/complete", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(200);
    expect((await response.json()) as object).toMatchObject({
      levelSuggestion: { direction: "up", targetLevel: "C1" },
    });
  });

  it("reset progress clears suggestion metadata", async () => {
    await db
      .update(schema.users)
      .set({
        levelSuggestionDirection: "up",
        levelSuggestionShownAt: Date.now(),
        levelSuggestionDismissedAt: Date.now(),
      })
      .where(eq(schema.users.id, userId));
    const response = await app.request("/api/me/progress", {
      method: "DELETE",
      headers: { Authorization: auth },
    });
    expect(response.status).toBe(200);
    const row = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
    expect(row).toMatchObject({
      levelSuggestionDirection: null,
      levelSuggestionShownAt: null,
      levelSuggestionDismissedAt: null,
    });
  });
});
