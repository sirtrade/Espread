import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const EXERCISE = JSON.stringify({
  cloze: "Cuando ___ tiempo, iremos al museo.",
  acceptedAnswers: ["tengamos"],
  options: ["tenemos", "tendremos", "teníamos"],
});

describe("grammar practice: queue mixing, grading and SRS (F-14)", () => {
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
    const user = await findOrCreateUser(779007, "grammarpractice");
    userId = user.id;
    auth = `Bearer ${signSession({ userId, tgUserId: user.tgUserId })}`;
    app = (await import("../src/api/app.js")).createApp();
  });

  afterAll(() => sqlite.close());

  async function insertGrammarItem(key: string, srsStage: number, nextDueAt: number | null = null) {
    const [row] = await db
      .insert(schema.grammarItems)
      .values({
        userId,
        canonicalKey: key,
        pattern: "cuando + presente de subjuntivo",
        category: "mood",
        explanation: "Futuro tras «cuando» pide subjuntivo.",
        status: "active",
        contexts: "[]",
        exercise: EXERCISE,
        srsStage,
        nextDueAt,
      })
      .returning();
    return row!;
  }

  async function answer(body: Record<string, unknown>) {
    return app.request("/api/practice/answer", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function grammarRow(id: number) {
    const [row] = await db.select().from(schema.grammarItems).where(eq(schema.grammarItems.id, id));
    return row!;
  }

  it("mixes due grammar cards into the practice queue with safe payloads", async () => {
    const mc = await insertGrammarItem("patron+mc", 0);
    const typed = await insertGrammarItem("patron+typed", 3);
    // A due lexical word rides along in the same session.
    await db.insert(schema.bankItems).values({
      userId,
      lemma: "hallazgo",
      translation: "discovery",
      firstContext: "Los científicos anunciaron un hallazgo relevante.",
      surfaceForm: "hallazgo",
      pos: "noun",
      distractors: JSON.stringify(["esfuerzo", "acuerdo", "nivel"]),
    });

    const res = await app.request("/api/practice/queue?limit=10", { headers: { Authorization: auth } });
    expect(res.status).toBe(200);
    const { cards, due } = (await res.json()) as { cards: Array<Record<string, unknown>>; due: number };
    expect(due).toBe(3);

    const mcCard = cards.find((card) => card.grammarItemId === mc.id)!;
    expect(mcCard).toMatchObject({ kind: "grammar", type: "cloze", itemId: null, category: "mood" });
    expect(mcCard.options).toHaveLength(4);
    expect(mcCard.prompt).toContain("___");

    const typedCard = cards.find((card) => card.grammarItemId === typed.id)!;
    expect(typedCard).toMatchObject({ kind: "grammar", type: "typed", answer: "", context: null });
    expect(typedCard.options).toEqual([]);
    // Typed payload must not disclose an accepted form anywhere.
    expect(JSON.stringify(typedCard)).not.toContain("tengamos");

    const wordCard = cards.find((card) => card.kind === "word")!;
    expect(wordCard.itemId).not.toBeNull();
  });

  it("advances on a first-try correct MC answer, at most once per local day", async () => {
    const [item] = await db.query.grammarItems.findMany({
      where: (t, { and, eq: eqf }) => and(eqf(t.userId, userId), eqf(t.canonicalKey, "patron+mc")),
    });

    const first = await answer({ grammarItemId: item!.id, correct: true, cardType: "cloze", latencyMs: 500 });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { advanced: boolean; srsStage: number; pattern: string };
    expect(firstBody.advanced).toBe(true);
    expect(firstBody.srsStage).toBe(1);
    expect(firstBody.pattern).toContain("cuando");

    // Same local day: correct again -> no second credit.
    const again = await answer({ grammarItemId: item!.id, correct: true, cardType: "cloze", latencyMs: 500 });
    const againBody = (await again.json()) as { advanced: boolean; srsStage: number };
    expect(againBody.advanced).toBe(false);
    expect(againBody.srsStage).toBe(1);
  });

  it("grades typed answers on the server (accent tolerance) and reveals feedback", async () => {
    const [item] = await db.query.grammarItems.findMany({
      where: (t, { and, eq: eqf }) => and(eqf(t.userId, userId), eqf(t.canonicalKey, "patron+typed")),
    });

    const res = await answer({ grammarItemId: item!.id, typedAnswer: "tengamos", cardType: "typed", latencyMs: 700 });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.correct).toBe(true);
    expect(body.verdict).toBe("exact");
    expect(body.answer).toBe("tengamos");
    expect(body.context).toBe("Cuando tengamos tiempo, iremos al museo.");
    expect(body.advanced).toBe(true);
  });

  it("gives no credit for a hinted answer and soft-lapses on a wrong one", async () => {
    const hinted = await insertGrammarItem("patron+hint", 1);
    const hintRes = await answer({ grammarItemId: hinted.id, correct: true, usedHint: true, cardType: "cloze", latencyMs: 400 });
    expect(((await hintRes.json()) as { advanced: boolean }).advanced).toBe(false);
    expect((await grammarRow(hinted.id)).srsStage).toBe(1);

    const lapsing = await insertGrammarItem("patron+lapse", 4);
    await answer({ grammarItemId: lapsing.id, correct: false, cardType: "cloze", latencyMs: 400 });
    const lapsed = await grammarRow(lapsing.id);
    expect(lapsed.srsStage).toBe(2);
    expect(lapsed.status).toBe("active");
  });

  it("graduates to learned on a top-rung success", async () => {
    const top = await insertGrammarItem("patron+top", 7);
    const res = await answer({ grammarItemId: top.id, correct: true, cardType: "cloze", latencyMs: 400 });
    const body = (await res.json()) as { status: string; advanced: boolean };
    expect(body.status).toBe("learned");
    expect(body.advanced).toBe(true);
  });

  it("404s a foreign grammar item", async () => {
    const { findOrCreateUser } = await import("../src/db/repositories/users.js");
    const { signSession } = await import("../src/auth/jwt.js");
    const other = await findOrCreateUser(779008, "grammarpractice2");
    const otherAuth = `Bearer ${signSession({ userId: other.id, tgUserId: other.tgUserId })}`;
    const [item] = await db.query.grammarItems.findMany({ where: (t, { eq: eqf }) => eqf(t.userId, userId) });

    const res = await app.request("/api/practice/answer", {
      method: "POST",
      headers: { Authorization: otherAuth, "Content-Type": "application/json" },
      body: JSON.stringify({ grammarItemId: item!.id, correct: true, cardType: "cloze", latencyMs: 100 }),
    });
    expect(res.status).toBe(404);
  });
});
