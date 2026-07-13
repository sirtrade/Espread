import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DAY = 24 * 60 * 60 * 1000;

describe("applyPracticeAnswer: practice drives the shared SRS schedule", () => {
  let db: typeof import("../src/db/client.js").db;
  let sqlite: typeof import("../src/db/client.js").sqlite;
  let schema: typeof import("../src/db/schema.js");
  let applyPracticeAnswer: typeof import("../src/db/repositories/bank.js").applyPracticeAnswer;
  let getBankItemById: typeof import("../src/db/repositories/bank.js").getBankItemById;
  let findOrCreateUser: typeof import("../src/db/repositories/users.js").findOrCreateUser;
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
        srsStage: 0,
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

    const user = await findOrCreateUser(555001, "practicetest");
    userId = user.id;
  });

  afterAll(() => sqlite.close());

  it("climbs the ladder on a correct answer and schedules the next review", async () => {
    const id = await seedItem({ lemma: "correcta1" });
    const now = Date.UTC(2026, 0, 10, 9, 0, 0);
    const res = await applyPracticeAnswer(userId, id, true, now);
    expect(res).toMatchObject({ advanced: true, srsStage: 1 });
    const item = await getBankItemById(userId, id);
    expect(item?.srsStage).toBe(1);
    expect(item?.nextDueAt).toBe(now + 1 * DAY);
    expect(item?.lastCreditAt).toBe(now);
  });

  it("soft-lapses a couple rungs with a short retry on a wrong answer", async () => {
    const id = await seedItem({ lemma: "fallada", srsStage: 3 });
    const now = Date.UTC(2026, 0, 12, 9, 0, 0);
    const res = await applyPracticeAnswer(userId, id, false, now);
    // stage 3 - LAPSE_STAGE_DROP(2) = 1, not a full reset to 0.
    expect(res).toMatchObject({ advanced: false, srsStage: 1 });
    const item = await getBankItemById(userId, id);
    expect(item?.srsStage).toBe(1);
    expect(item?.nextDueAt).toBeGreaterThan(now);
    expect(item?.nextDueAt!).toBeLessThan(now + DAY);
  });

  it("floors the lapse at stage 0 for a low-stage wrong answer", async () => {
    const id = await seedItem({ lemma: "baja", srsStage: 1 });
    const now = Date.UTC(2026, 0, 12, 10, 0, 0);
    const res = await applyPracticeAnswer(userId, id, false, now);
    expect(res).toMatchObject({ advanced: false, srsStage: 0 });
  });

  it("does not climb twice the same day, but still advances the next day", async () => {
    const id = await seedItem({ lemma: "mismodia" });
    const morning = Date.UTC(2026, 0, 15, 8, 0, 0);
    const evening = Date.UTC(2026, 0, 15, 21, 0, 0);
    const nextDay = Date.UTC(2026, 0, 16, 8, 0, 0);

    const first = await applyPracticeAnswer(userId, id, true, morning);
    expect(first).toMatchObject({ advanced: true, srsStage: 1 });

    // Same calendar day: the schedule is left untouched.
    const second = await applyPracticeAnswer(userId, id, true, evening);
    expect(second).toMatchObject({ advanced: false, srsStage: 1 });
    let item = await getBankItemById(userId, id);
    expect(item?.nextDueAt).toBe(morning + 1 * DAY);

    // Next calendar day: it climbs again.
    const third = await applyPracticeAnswer(userId, id, true, nextDay);
    expect(third).toMatchObject({ advanced: true, srsStage: 2 });
    item = await getBankItemById(userId, id);
    expect(item?.nextDueAt).toBe(nextDay + 3 * DAY);
  });

  it("does not climb twice within one LOCAL day even across UTC midnight", async () => {
    const id = await seedItem({ lemma: "localdia" });
    // Both moments are 2026-01-10 in Europe/Moscow (UTC+3) but different UTC days:
    // 02:00 local = 2026-01-09 23:00 UTC, 23:00 local = 2026-01-10 20:00 UTC.
    const earlyLocal = Date.UTC(2026, 0, 9, 23, 0, 0);
    const lateLocal = Date.UTC(2026, 0, 10, 20, 0, 0);

    const first = await applyPracticeAnswer(userId, id, true, earlyLocal, false, "Europe/Moscow");
    expect(first).toMatchObject({ advanced: true, srsStage: 1 });

    // Same local day: no second credit, schedule untouched.
    const second = await applyPracticeAnswer(userId, id, true, lateLocal, false, "Europe/Moscow");
    expect(second).toMatchObject({ advanced: false, srsStage: 1 });
    const item = await getBankItemById(userId, id);
    expect(item?.nextDueAt).toBe(earlyLocal + 1 * DAY);
    expect(item?.lastCreditAt).toBe(earlyLocal);
  });

  it("graduates a top-rung word to learned on a correct answer", async () => {
    const { SRS_MAX_STAGE } = await import("../src/domain/srs.js");
    const id = await seedItem({ lemma: "graduada", srsStage: SRS_MAX_STAGE });
    const now = Date.UTC(2026, 0, 20, 9, 0, 0);
    const res = await applyPracticeAnswer(userId, id, true, now);
    expect(res).toMatchObject({ advanced: true, status: "learned" });
    const item = await getBankItemById(userId, id);
    expect(item?.status).toBe("learned");
  });

  it("soft-lapses a top-rung word instead of graduating it on a wrong answer", async () => {
    const { SRS_MAX_STAGE } = await import("../src/domain/srs.js");
    const id = await seedItem({ lemma: "casigraduada", srsStage: SRS_MAX_STAGE });
    const now = Date.UTC(2026, 0, 21, 9, 0, 0);
    const res = await applyPracticeAnswer(userId, id, false, now);
    // Drops two rungs (SRS_MAX_STAGE - 2), stays active, not reset to 0.
    expect(res).toMatchObject({ advanced: false, srsStage: SRS_MAX_STAGE - 2, status: "active" });
  });

  it("does not credit a correct answer given after revealing the hint", async () => {
    const id = await seedItem({ lemma: "conpista", srsStage: 2, nextDueAt: 1000 });
    const now = Date.UTC(2026, 0, 22, 9, 0, 0);
    const res = await applyPracticeAnswer(userId, id, true, now, true);
    // No advance: the schedule (stage/nextDueAt/lastCreditAt) is left untouched
    // so the word stays due for an unaided retrieval later.
    expect(res).toMatchObject({ advanced: false, srsStage: 2 });
    const item = await getBankItemById(userId, id);
    expect(item?.srsStage).toBe(2);
    expect(item?.nextDueAt).toBe(1000);
    expect(item?.lastCreditAt).toBeNull();
  });

  it("still lapses on a wrong answer even when the hint was used", async () => {
    const id = await seedItem({ lemma: "pistafallada", srsStage: 4 });
    const now = Date.UTC(2026, 0, 23, 9, 0, 0);
    const res = await applyPracticeAnswer(userId, id, false, now, true);
    // A wrong answer lapses regardless of the hint: stage 4 - 2 = 2.
    expect(res).toMatchObject({ advanced: false, srsStage: 2 });
  });
});
