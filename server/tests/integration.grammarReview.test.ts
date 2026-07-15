import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import type { Mark } from "../src/domain/marks.js";

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

const BODY =
  "Cuando tengamos tiempo, iremos al museo de la ciudad. El equipo anunció sus planes esta semana.";

const SENTENCE = "Cuando tengamos tiempo, iremos al museo de la ciudad.";

function reviewItem() {
  return {
    surface: "tengamos",
    lemma: "tener",
    pos: "verb",
    gender: null,
    translation: "иметь",
    note: null,
    contextTranslation: "Когда у нас будет время, мы пойдём в музей.",
    freqBand: "top1000",
    distractors: ["dar", "poner", "salir"],
  };
}

function grammarCandidate(overrides: Record<string, unknown> = {}) {
  return {
    canonicalKey: "cuando+subjuntivo-presente",
    pattern: "cuando + presente de subjuntivo",
    category: "mood",
    explanation: "После «cuando» о будущем используется субхунтив.",
    sourceForm: "Cuando tengamos",
    sourceSentence: SENTENCE,
    sourceSentenceTranslation: "Когда у нас будет время, мы пойдём в музей.",
    exercise: {
      cloze: "Cuando ___ tiempo, iremos al museo de la ciudad.",
      acceptedAnswers: ["tengamos"],
      options: ["tenemos", "tendremos", "teníamos"],
    },
    ...overrides,
  };
}

describe("review contract: grammar candidates (F-11)", () => {
  let db: typeof import("../src/db/client.js").db;
  let sqlite: typeof import("../src/db/client.js").sqlite;
  let schema: typeof import("../src/db/schema.js");
  let reviewSession: typeof import("../src/services/sessionService.js").reviewSession;
  let completeSession: typeof import("../src/services/sessionService.js").completeSession;
  let userId: number;

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    ({ db, sqlite } = await import("../src/db/client.js"));
    migrate(db, { migrationsFolder: "./drizzle" });
    schema = await import("../src/db/schema.js");
    const { findOrCreateUser } = await import("../src/db/repositories/users.js");
    userId = (await findOrCreateUser(779003, "grammarreview")).id;
    ({ reviewSession, completeSession } = await import("../src/services/sessionService.js"));
  });

  afterAll(() => sqlite.close());

  async function insertSessionWithMarks(marks: Mark[]) {
    const [article] = await db
      .insert(schema.articles)
      .values({ userId, title: "Lectura", body: BODY, topic: "Ciencia", lemmas: '["museo"]' })
      .returning();
    await db
      .insert(schema.readingSessions)
      .values({ userId, articleId: article!.id, marks: JSON.stringify(marks) });
    return article!;
  }

  it("keeps only server-validated candidates from a sentence mark and archives them", async () => {
    await insertSessionWithMarks([{ text: SENTENCE, sentence: SENTENCE, kind: "sentence" }]);
    createMock.mockResolvedValueOnce(
      fakeMessage({
        items: [reviewItem()],
        grammarCandidates: [
          grammarCandidate(),
          // Fails server validation: this sentence is not in the article.
          grammarCandidate({
            canonicalKey: "otro-patron+distinto",
            sourceSentence: "Cuando tengamos dinero, iremos al teatro.",
          }),
          "garbage",
        ],
      }),
    );

    const view = await reviewSession(userId);
    expect(view.items).toHaveLength(1);

    // The grammar prompt contract was requested (sentence mark present).
    const systemPrompt = (createMock.mock.calls[0]?.[0] as { system: string }).system;
    expect(systemPrompt).toContain("grammarCandidates");

    const [session] = await db
      .select()
      .from(schema.readingSessions)
      .where(eq(schema.readingSessions.userId, userId));
    const archived = JSON.parse(session!.reviewResult!) as { grammarCandidates: unknown[] };
    expect(archived.grammarCandidates).toHaveLength(1);
    expect(archived.grammarCandidates[0]).toMatchObject({
      canonicalKey: "cuando+subjuntivo-presente",
      category: "mood",
    });

    // Completion parses the extended archive without any grammar handling yet.
    await completeSession(userId);
  });

  it("never asks for nor returns grammar candidates for single-word marks", async () => {
    createMock.mockClear();
    await insertSessionWithMarks([{ text: "tengamos", sentence: SENTENCE, kind: "word" }]);
    createMock.mockResolvedValueOnce(
      fakeMessage({
        items: [reviewItem()],
        // Even if the model volunteers one, the server discards it.
        grammarCandidates: [grammarCandidate()],
      }),
    );

    await reviewSession(userId);

    const systemPrompt = (createMock.mock.calls[0]?.[0] as { system: string }).system;
    expect(systemPrompt).not.toContain("grammarCandidates");

    const [session] = await db
      .select()
      .from(schema.readingSessions)
      .where(eq(schema.readingSessions.userId, userId));
    const archived = JSON.parse(session!.reviewResult!) as { grammarCandidates: unknown[] };
    expect(archived.grammarCandidates).toEqual([]);
    await completeSession(userId);
  });
});
