import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("../src/llm/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/llm/client.js")>();
  return {
    ...actual,
    anthropic: { messages: { create: createMock } },
  };
});

function fakeMessage(body: unknown): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    content: [{ type: "text", text: JSON.stringify(body), citations: [] } as Anthropic.TextBlock],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
    },
  } as Anthropic.Message;
}

describe("lazy lemmatization of legacy articles on completion", () => {
  let db: typeof import("../src/db/client.js").db;
  let sqlite: typeof import("../src/db/client.js").sqlite;
  let schema: typeof import("../src/db/schema.js");
  let completeSession: typeof import("../src/services/sessionService.js").completeSession;
  let userId: number;

  const BODY = "El científico observó un fenómeno raro durante la noche estrellada.";

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    ({ db, sqlite } = await import("../src/db/client.js"));
    migrate(db, { migrationsFolder: "./drizzle" });
    schema = await import("../src/db/schema.js");
    const { findOrCreateUser } = await import("../src/db/repositories/users.js");
    userId = (await findOrCreateUser(779002, "lazylemmas")).id;
    ({ completeSession } = await import("../src/services/sessionService.js"));
  });

  afterAll(() => sqlite.close());

  async function insertReviewedSession(lemmas: string) {
    const [article] = await db
      .insert(schema.articles)
      .values({ userId, title: "Lectura", body: BODY, topic: "Ciencia", lemmas })
      .returning();
    await db
      .insert(schema.readingSessions)
      .values({ userId, articleId: article!.id, state: "reviewed", reviewResult: '{"items":[]}' });
    return article!;
  }

  it("recovers lemmas with one LLM call, persists them and counts encounters", async () => {
    const article = await insertReviewedSession("[]");
    createMock.mockResolvedValueOnce(
      fakeMessage({ lemmas: ["científico", "observar", "fenómeno", "raro", "noche"] }),
    );

    await completeSession(userId);

    expect(createMock).toHaveBeenCalledTimes(1);
    const [updated] = await db.select().from(schema.articles).where(eq(schema.articles.id, article.id));
    expect(JSON.parse(updated!.lemmas)).toEqual(["científico", "observar", "fenómeno", "raro", "noche"]);

    const rows = await db.select().from(schema.knownWords).where(eq(schema.knownWords.userId, userId));
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.encounters === 1 && row.knownSince === null)).toBe(true);
  });

  it("skips the LLM entirely when the article already has lemmas", async () => {
    createMock.mockClear();
    await insertReviewedSession('["estrellado"]');

    await completeSession(userId);

    expect(createMock).not.toHaveBeenCalled();
    const rows = await db.select().from(schema.knownWords).where(eq(schema.knownWords.userId, userId));
    expect(rows.find((row) => row.lemma === "estrellado")?.encounters).toBe(1);
  });

  it("degrades to zero passive encounters when lemmatization fails", async () => {
    createMock.mockClear();
    const article = await insertReviewedSession("[]");
    createMock.mockRejectedValue(new Error("LLM down"));

    await completeSession(userId);

    // Completion survived; the legacy article stays lemma-less for a later read.
    const [updated] = await db.select().from(schema.articles).where(eq(schema.articles.id, article.id));
    expect(updated!.readAt).not.toBeNull();
    expect(JSON.parse(updated!.lemmas)).toEqual([]);
    const rows = await db.select().from(schema.knownWords).where(eq(schema.knownWords.userId, userId));
    expect(rows.every((row) => row.encounters === 1)).toBe(true);
  });
});
