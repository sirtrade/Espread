import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { containsLeakTerm } from "../src/domain/practice.js";

describe("practice interleaving + anti-leak (route level)", () => {
  let app: ReturnType<typeof import("../src/api/app.js").createApp>;
  let db: typeof import("../src/db/client.js").db;
  let sqlite: typeof import("../src/db/client.js").sqlite;
  let schema: typeof import("../src/db/schema.js");
  let getDueForPractice: typeof import("../src/db/repositories/bank.js").getDueForPractice;
  let auth: string;
  let userId: number;

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    ({ db, sqlite } = await import("../src/db/client.js"));
    migrate(db, { migrationsFolder: "./drizzle" });
    schema = await import("../src/db/schema.js");
    ({ getDueForPractice } = await import("../src/db/repositories/bank.js"));
    const { findOrCreateUser } = await import("../src/db/repositories/users.js");
    const { signSession } = await import("../src/auth/jwt.js");
    app = (await import("../src/api/app.js")).createApp();

    const user = await findOrCreateUser(779001, "interleaving");
    userId = user.id;
    auth = `Bearer ${signSession({ userId, tgUserId: user.tgUserId })}`;

    const rows = [
      ["gato", "cat", "El gato observa el árbol.", "gato"],
      ["árbol", "tree", "El gato observa el árbol.", "árbol"],
      ["puerta", "door", "La puerta está abierta.", "puerta"],
      ["camino", "road", "El camino cruza el valle.", "camino"],
      ["nube", "cloud", "Una nube cubre el cielo.", "nube"],
      ["río", "river", "El río llega al mar.", "río"],
    ] as const;
    for (const [i, [lemma, translation, firstContext, surfaceForm]] of rows.entries()) {
      await db.insert(schema.bankItems).values({
        userId,
        lemma,
        translation,
        firstContext,
        surfaceForm,
        pos: "noun",
        status: "active",
        srsStage: 0,
        nextDueAt: i + 1,
      });
    }
  });

  afterAll(() => sqlite.close());

  it("fetches a three-times oversampled, due-ordered candidate pool", async () => {
    const candidates = await getDueForPractice(userId, Date.now(), 2);
    expect(candidates).toHaveLength(6);
    expect(candidates.map((item) => item.nextDueAt)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("returns at most the requested limit with no cross-card visible leak", async () => {
    const response = await app.request("/api/practice/queue?limit=2", {
      headers: { Authorization: auth },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      cards: Array<{
        lemma: string | null;
        answer: string;
        prompt: string;
        context: string | null;
        contextHint: string | null;
      }>;
    };
    expect(body.cards).toHaveLength(2);

    for (const [index, card] of body.cards.entries()) {
      const visible = [card.prompt, card.context, card.contextHint].filter(
        (text): text is string => typeof text === "string",
      );
      for (const [otherIndex, other] of body.cards.entries()) {
        if (index === otherIndex) continue;
        for (const term of [other.answer, other.lemma].filter(
          (value): value is string => typeof value === "string" && value.length > 0,
        )) {
          expect(visible.some((text) => containsLeakTerm(text, term))).toBe(false);
        }
      }
    }
  });
});
