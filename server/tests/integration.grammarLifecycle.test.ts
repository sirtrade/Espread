import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

const BODY_1 = "Cuando tengamos tiempo, iremos al museo de la ciudad. El resto del texto sigue aquí.";
const BODY_2 = "El guía dijo: cuando tengamos entradas, entraremos a la sala grande del palacio.";

function storedCandidate(sentence: string, form: string, answer: string) {
  return {
    canonicalKey: "cuando+subjuntivo-presente",
    pattern: "cuando + presente de subjuntivo",
    category: "mood",
    explanation: "Futuro tras «cuando» pide subjuntivo.",
    sourceForm: form,
    sourceSentence: sentence,
    sourceSentenceTranslation: "Перевод предложения.",
    exercise: {
      cloze: sentence.replace(answer, "___"),
      acceptedAnswers: [answer],
      options: ["tenemos", "tendremos", "teníamos"],
    },
  };
}

describe("grammar lifecycle: completion, pool, reset (F-12)", () => {
  let db: typeof import("../src/db/client.js").db;
  let sqlite: typeof import("../src/db/client.js").sqlite;
  let schema: typeof import("../src/db/schema.js");
  let completeSession: typeof import("../src/services/sessionService.js").completeSession;
  let userId: number;

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    ({ db, sqlite } = await import("../src/db/client.js"));
    migrate(db, { migrationsFolder: "./drizzle" });
    schema = await import("../src/db/schema.js");
    const { findOrCreateUser } = await import("../src/db/repositories/users.js");
    userId = (await findOrCreateUser(779004, "grammarlife")).id;
    ({ completeSession } = await import("../src/services/sessionService.js"));
  });

  afterAll(() => sqlite.close());

  async function insertReviewedSession(body: string, candidates: unknown[]) {
    const [article] = await db
      .insert(schema.articles)
      .values({ userId, title: "Lectura", body, topic: "Ciencia", lemmas: '["museo"]' })
      .returning();
    await db.insert(schema.readingSessions).values({
      userId,
      articleId: article!.id,
      state: "reviewed",
      reviewResult: JSON.stringify({ items: [], grammarCandidates: candidates }),
    });
    return article!;
  }

  async function grammarRows() {
    return db.select().from(schema.grammarItems).where(eq(schema.grammarItems.userId, userId));
  }

  it("saves only explicitly accepted candidates as active bottom-rung units", async () => {
    await insertReviewedSession(BODY_1, [
      storedCandidate(BODY_1.split(". ")[0]! + ".", "Cuando tengamos", "tengamos"),
    ]);
    // No grammarAccepted -> nothing saved (old-client behavior).
    await completeSession(userId);
    expect(await grammarRows()).toHaveLength(0);

    const article = await insertReviewedSession(BODY_1, [
      storedCandidate(BODY_1.split(". ")[0]! + ".", "Cuando tengamos", "tengamos"),
    ]);
    await completeSession(userId, { grammarAccepted: ["cuando+subjuntivo-presente"] });

    const rows = await grammarRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      canonicalKey: "cuando+subjuntivo-presente",
      category: "mood",
      status: "active",
      srsStage: 0,
      lastCreditAt: null,
    });
    const contexts = JSON.parse(rows[0]!.contexts) as Array<{ articleId: number }>;
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.articleId).toBe(article.id);
  });

  it("repeat acceptance of the same key adds a context without touching status or SRS", async () => {
    // Simulate practice progress so we can verify reading doesn't move it.
    await db
      .update(schema.grammarItems)
      .set({ status: "learned", srsStage: 4, nextDueAt: 12345, lastCreditAt: 111 })
      .where(and(eq(schema.grammarItems.userId, userId), eq(schema.grammarItems.canonicalKey, "cuando+subjuntivo-presente")));

    await insertReviewedSession(BODY_2, [
      storedCandidate("El guía dijo: cuando tengamos entradas, entraremos a la sala grande del palacio.", "cuando tengamos", "tengamos"),
    ]);
    await completeSession(userId, { grammarAccepted: ["cuando+subjuntivo-presente"] });

    const rows = await grammarRows();
    expect(rows).toHaveLength(1);
    // Learned stays learned; the SRS schedule is untouched by reading.
    expect(rows[0]).toMatchObject({ status: "learned", srsStage: 4, nextDueAt: 12345, lastCreditAt: 111 });
    const contexts = JSON.parse(rows[0]!.contexts) as unknown[];
    expect(contexts).toHaveLength(2);
  });

  it("queues past the grammar pool limit and promotes FIFO when the limit rises", async () => {
    const { updateUser } = await import("../src/db/repositories/users.js");
    await updateUser(userId, { grammarActivePoolLimit: 1 });
    // One learned unit exists; active pool is empty, limit 1.
    const sentence = "El guía dijo: cuando tengamos entradas, entraremos a la sala grande del palacio.";
    await insertReviewedSession(BODY_2, [
      { ...storedCandidate(sentence, "cuando tengamos", "tengamos"), canonicalKey: "patron-a+uno" },
      { ...storedCandidate(sentence, "cuando tengamos", "tengamos"), canonicalKey: "patron-b+dos" },
    ]);
    await completeSession(userId, { grammarAccepted: ["patron-a+uno", "patron-b+dos"] });

    const rows = await grammarRows();
    const byKey = new Map(rows.map((row) => [row.canonicalKey, row.status]));
    expect(byKey.get("patron-a+uno")).toBe("active");
    expect(byKey.get("patron-b+dos")).toBe("queued");

    // Raising the limit promotes the queued unit (FIFO), independent of the
    // lexical pool.
    const { rebalanceGrammarPool } = await import("../src/db/repositories/grammar.js");
    const promoted = await rebalanceGrammarPool(userId, 5);
    expect(promoted).toEqual(["patron-b+dos"]);
  });

  it("reset wipes grammar items transactionally", async () => {
    const { resetUserProgress } = await import("../src/db/repositories/reset.js");
    await resetUserProgress(userId);
    expect(await grammarRows()).toHaveLength(0);
  });
});
