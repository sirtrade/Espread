import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Route-level coverage for typed recall in the webapp practice queue (F-1):
 *  - GET /practice/queue serves a "typed" card for a word at stage >= 2 and a
 *    multiple-choice card for a fresher word;
 *  - POST /practice/answer grades the typed answer on the server (the client's
 *    correctness is never trusted), forgiving accents/typos with a "spelling"
 *    verdict and lapsing a wrong answer.
 */
describe("practice queue + typed answer (route level)", () => {
  let app: ReturnType<typeof import("../src/api/app.js").createApp>;
  let db: typeof import("../src/db/client.js").db;
  let sqlite: typeof import("../src/db/client.js").sqlite;
  let schema: typeof import("../src/db/schema.js");
  let signSession: typeof import("../src/auth/jwt.js").signSession;
  let getBankItemById: typeof import("../src/db/repositories/bank.js").getBankItemById;
  let findOrCreateUser: typeof import("../src/db/repositories/users.js").findOrCreateUser;
  let userId: number;
  let auth: string;

  async function seedItem(fields: Partial<typeof schema.bankItems.$inferInsert> = {}): Promise<number> {
    const [row] = await db
      .insert(schema.bankItems)
      .values({
        userId,
        lemma: "abarcar",
        translation: "охватывать",
        firstContext: "Los planes abarcan varios sectores.",
        surfaceForm: "abarcan",
        pos: "verb",
        status: "active",
        srsStage: 0,
        ...fields,
      })
      .returning();
    return row!.id;
  }

  async function queue() {
    const res = await app.request("/api/practice/queue?limit=30", { headers: { Authorization: auth } });
    expect(res.status).toBe(200);
    return (await res.json()) as { cards: Array<Record<string, unknown>>; due: number };
  }

  async function answer(body: Record<string, unknown>) {
    const res = await app.request("/api/practice/answer", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    ({ db, sqlite } = await import("../src/db/client.js"));
    migrate(db, { migrationsFolder: "./drizzle" });
    schema = await import("../src/db/schema.js");
    ({ signSession } = await import("../src/auth/jwt.js"));
    app = (await import("../src/api/app.js")).createApp();
    ({ getBankItemById } = await import("../src/db/repositories/bank.js"));
    ({ findOrCreateUser } = await import("../src/db/repositories/users.js"));

    const user = await findOrCreateUser(777001, "typedqueue");
    userId = user.id;
    auth = `Bearer ${signSession({ userId, tgUserId: user.tgUserId })}`;
  });

  afterAll(() => sqlite.close());

  it("serves a typed card for a stage-2 word", async () => {
    const id = await seedItem({ lemma: "abarcar", srsStage: 2 });
    const { cards } = await queue();
    const card = cards.find((c) => c.itemId === id)!;
    expect(card.type).toBe("typed");
    expect(card.lemma).toBeNull(); // accepted forms stay server-side until grading
    expect(card.answer).toBe(""); // graded on the server, never sent to the client
    expect(card.options).toEqual([]);
    expect(card.prompt).toBe("охватывать");
    expect(card.contextHint).toBe("Los planes _____ varios sectores.");
    expect(card.context).toBeNull(); // accepted surface is not in the queue payload
  });

  it("keeps multiple choice for a stage-0 word", async () => {
    await seedItem({ lemma: "generar", translation: "генерировать", srsStage: 0, surfaceForm: "genera", firstContext: "La empresa genera empleo." });
    const { cards } = await queue();
    const card = cards.find((c) => c.lemma === "generar")!;
    expect(["cloze", "recall"]).toContain(card.type);
    expect((card.options as string[]).length).toBeGreaterThanOrEqual(3);
  });

  it("exposes the SRS rung on each card (webapp surfaces free-writing on upper rungs)", async () => {
    const id = await seedItem({ lemma: "reforzar", translation: "укреплять", srsStage: 5, surfaceForm: "refuerza", firstContext: "El plan refuerza la seguridad." });
    const { cards } = await queue();
    const card = cards.find((c) => c.itemId === id)!;
    expect(card.srsStage).toBe(5);
  });

  it("grades an exact typed answer on the server and climbs the ladder", async () => {
    const id = await seedItem({ lemma: "consolidar", translation: "укреплять", surfaceForm: "consolida", firstContext: "El equipo consolida su posición.", srsStage: 3 });
    // The client sends the raw text; a bogus `correct:true` must be ignored.
    const { status, body } = await answer({
      itemId: id,
      typedAnswer: "consolida",
      correct: false,
      cardType: "recall",
      latencyMs: 2_345,
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      verdict: "exact",
      correct: true,
      advanced: true,
      srsStage: 4,
      context: "El equipo consolida su posición.",
    });
    expect((await getBankItemById(userId, id))?.srsStage).toBe(4);
    const rows = await db.select().from(schema.practiceAnswers).where(eq(schema.practiceAnswers.itemId, id));
    expect(rows).toEqual([
      expect.objectContaining({
        userId,
        itemId: id,
        cardType: "typed",
        correct: true,
        usedHint: false,
        latencyMs: 2_345,
        srsStageBefore: 3,
        srsStageAfter: 4,
      }),
    ]);
  });

  it("grades and returns feedback from the context selected by the queue", async () => {
    const id = await seedItem({
      lemma: "fortalecer",
      translation: "укреплять",
      surfaceForm: "fortalece",
      firstContext: "El equipo fortalece su posición.",
      srsStage: 3,
      contexts: JSON.stringify([
        {
          sentence: "El equipo fortalece su posición.",
          translation: "Команда укрепляет свои позиции.",
          surfaceForm: "fortalece",
          articleId: 1,
          addedAt: 101,
        },
        {
          sentence: "Las empresas fortalecieron el acuerdo.",
          translation: null,
          surfaceForm: "fortalecieron",
          articleId: 2,
          addedAt: 202,
        },
      ]),
    });
    const { body } = await answer({ itemId: id, typedAnswer: "fortalecieron", contextAddedAt: 202 });
    expect(body).toMatchObject({
      verdict: "exact",
      correct: true,
      answer: "fortalecieron",
      context: "Las empresas fortalecieron el acuerdo.",
      contextTranslation: null,
    });
  });

  it("forgives a missing accent with a spelling verdict (still correct)", async () => {
    const id = await seedItem({ lemma: "género", translation: "жанр", surfaceForm: "género", firstContext: "El género musical crece.", srsStage: 2 });
    const { body } = await answer({ itemId: id, typedAnswer: "genero" });
    expect(body).toMatchObject({ verdict: "spelling", correct: true, advanced: true });
    expect(body.answer).toBe("género");
  });

  it("lapses a wrong typed answer and reports the correct form", async () => {
    const id = await seedItem({ lemma: "abordar", translation: "рассматривать", surfaceForm: "aborda", firstContext: "El informe aborda el tema.", srsStage: 5 });
    const { body } = await answer({ itemId: id, typedAnswer: "establecer" });
    expect(body).toMatchObject({ verdict: "wrong", correct: false, advanced: false });
    // Soft lapse: two rungs down (5 - 2), not a full reset.
    expect(body.srsStage).toBe(3);
    expect(body.answer).toBe("aborda");
  });

  it("rejects an answer with neither correct nor typedAnswer", async () => {
    const id = await seedItem({ lemma: "impulsar", srsStage: 2 });
    const { status } = await answer({ itemId: id });
    expect(status).toBe(400);
  });

  it("rejects latency outside the 0..600000 ms API range", async () => {
    const id = await seedItem({ lemma: "demora" });
    expect((await answer({ itemId: id, correct: true, cardType: "cloze", latencyMs: -1 })).status).toBe(400);
    expect((await answer({ itemId: id, correct: true, cardType: "cloze", latencyMs: 600_001 })).status).toBe(400);
    expect(await db.select().from(schema.practiceAnswers).where(eq(schema.practiceAnswers.itemId, id))).toHaveLength(0);
  });
});
