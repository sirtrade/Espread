import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const DAY = 24 * 60 * 60 * 1000;

describe("applyPracticeAnswer: practice feeds the learning pipeline", () => {
  let db: typeof import("../src/db/client.js").db;
  let sqlite: typeof import("../src/db/client.js").sqlite;
  let schema: typeof import("../src/db/schema.js");
  let applyPracticeAnswer: typeof import("../src/db/repositories/bank.js").applyPracticeAnswer;
  let getBankItemById: typeof import("../src/db/repositories/bank.js").getBankItemById;
  let findOrCreateUser: typeof import("../src/db/repositories/users.js").findOrCreateUser;
  let getUserStats: typeof import("../src/db/repositories/stats.js").getUserStats;
  let userId: number;

  async function seedItem(fields: Partial<typeof schema.bankItems.$inferInsert> = {}): Promise<number> {
    const [row] = await db
      .insert(schema.bankItems)
      .values({
        userId,
        lemma: fields.lemma ?? "casa",
        translation: "house",
        firstContext: "La casa es grande.",
        surfaceForm: "casa",
        pos: "noun",
        status: "active",
        cleanStreak: 0,
        ...fields,
      })
      .returning();
    return row!.id;
  }

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    ({ db, sqlite } = await import("../src/db/client.js"));
    migrate(db, { migrationsFolder: "./drizzle" });
    schema = await import("../src/db/schema.js");
    ({ applyPracticeAnswer, getBankItemById } = await import("../src/db/repositories/bank.js"));
    ({ findOrCreateUser } = await import("../src/db/repositories/users.js"));
    ({ getUserStats } = await import("../src/db/repositories/stats.js"));

    const user = await findOrCreateUser(555001, "practicetest");
    userId = user.id;
  });

  afterAll(() => sqlite.close());

  it("credits a clean encounter on a correct answer and advances the SRS ladder", async () => {
    const id = await seedItem({ lemma: "correcta1" });
    const now = Date.UTC(2026, 0, 10, 9, 0, 0);
    const res = await applyPracticeAnswer(userId, id, true, now);
    expect(res).toMatchObject({ cleanStreak: 1, streakCredited: true, practiceStage: 1 });
    const item = await getBankItemById(userId, id);
    expect(item?.cleanStreak).toBe(1);
    expect(item?.nextPracticeAt).toBe(now + 1 * DAY);
  });

  it("promotes to learned on the 3rd credited answer and bumps itemsLearned", async () => {
    const id = await seedItem({ lemma: "aprendida", cleanStreak: 2 });
    const before = await getUserStats(userId);
    const now = Date.UTC(2026, 0, 12, 9, 0, 0);
    const res = await applyPracticeAnswer(userId, id, true, now);
    expect(res).toMatchObject({ cleanStreak: 3, status: "learned", becameLearned: true });
    const item = await getBankItemById(userId, id);
    expect(item?.status).toBe("learned");
    const after = await getUserStats(userId);
    expect((after?.itemsLearned ?? 0) - (before?.itemsLearned ?? 0)).toBe(1);
  });

  it("resets the streak to 0 on a wrong answer", async () => {
    const id = await seedItem({ lemma: "fallada", cleanStreak: 2 });
    const res = await applyPracticeAnswer(userId, id, false, Date.UTC(2026, 0, 12, 9, 0, 0));
    expect(res).toMatchObject({ cleanStreak: 0, streakCredited: false });
    const item = await getBankItemById(userId, id);
    expect(item?.cleanStreak).toBe(0);
  });

  it("does not move the streak on a second correct answer the same day, but still moves the SRS", async () => {
    const id = await seedItem({ lemma: "mismodia" });
    const morning = Date.UTC(2026, 0, 15, 8, 0, 0);
    const evening = Date.UTC(2026, 0, 15, 21, 0, 0);

    const first = await applyPracticeAnswer(userId, id, true, morning);
    expect(first).toMatchObject({ cleanStreak: 1, streakCredited: true, practiceStage: 1 });

    const second = await applyPracticeAnswer(userId, id, true, evening);
    expect(second).toMatchObject({ cleanStreak: 1, streakCredited: false, practiceStage: 2 });

    const item = await getBankItemById(userId, id);
    // Streak held at 1, but the SRS timer advanced to stage 2 (3-day interval).
    expect(item?.cleanStreak).toBe(1);
    expect(item?.nextPracticeAt).toBe(evening + 3 * DAY);
  });
});
