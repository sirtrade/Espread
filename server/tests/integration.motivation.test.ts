import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

describe("motivation activity integration", () => {
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
    const user = await findOrCreateUser(779101, "motivation");
    userId = user.id;
    await updateUser(userId, { timezone: "Europe/Moscow" });
    auth = `Bearer ${signSession({ userId, tgUserId: user.tgUserId })}`;
    app = (await import("../src/api/app.js")).createApp();
  });

  afterAll(() => sqlite.close());

  it("records reading atomically and practice idempotently, then exposes both through stats", async () => {
    const completedAt = Date.now();
    const localDay = (await import("../src/lib/timezone.js")).localDayKey(completedAt, "Europe/Moscow");
    const [article] = await db
      .insert(schema.articles)
      .values({ userId, title: "Lectura", body: "Texto.", topic: "Ciencia" })
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
      readingLemmas: [],
      localDay,
      completedAt,
    });

    const [item] = await db
      .insert(schema.bankItems)
      .values({ userId, lemma: "casa", status: "active" })
      .returning();
    const { applyPracticeAnswer } = await import("../src/db/repositories/bank.js");
    await applyPracticeAnswer(userId, item!.id, false, completedAt, false, "Europe/Moscow");
    await applyPracticeAnswer(userId, item!.id, true, completedAt, false, "Europe/Moscow");

    const activity = await db.select().from(schema.dailyActivity).where(eq(schema.dailyActivity.userId, userId));
    expect(activity).toEqual([expect.objectContaining({ localDay, reading: true, practice: true })]);
    expect(await db.query.readingSessions.findFirst({ where: eq(schema.readingSessions.id, session!.id) })).toBeUndefined();

    const response = await app.request("/api/stats", { headers: { Authorization: auth } });
    expect(response.status).toBe(200);
    const stats = (await response.json()) as {
      currentStreak: number;
      weeklyProgress: Array<{ articlesRead: number; wordsLearned: number }>;
    };
    expect(stats.currentStreak).toBe(1);
    expect(stats.weeklyProgress.at(-1)).toMatchObject({ articlesRead: 1 });
  });

  it("reset removes activity history", async () => {
    const { resetUserProgress } = await import("../src/db/repositories/reset.js");
    await resetUserProgress(userId);
    expect(await db.select().from(schema.dailyActivity).where(eq(schema.dailyActivity.userId, userId))).toHaveLength(0);
  });
});
