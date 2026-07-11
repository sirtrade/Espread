import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";

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

describe("generate -> review -> complete cycle (mocked LLM)", () => {
  let userId: number;
  let migrate: typeof import("drizzle-orm/better-sqlite3/migrator").migrate;
  let db: typeof import("../src/db/client.js").db;
  let sqlite: typeof import("../src/db/client.js").sqlite;
  let startReading: typeof import("../src/services/articleService.js").startReading;
  let reviewSession: typeof import("../src/services/sessionService.js").reviewSession;
  let completeSession: typeof import("../src/services/sessionService.js").completeSession;
  let findOrCreateUser: typeof import("../src/db/repositories/users.js").findOrCreateUser;
  let setUserTopics: typeof import("../src/db/repositories/topics.js").setUserTopics;
  let updateSessionMarks: typeof import("../src/db/repositories/sessions.js").updateSessionMarks;
  let getBankItems: typeof import("../src/db/repositories/bank.js").getBankItems;
  let setBankItemStatus: typeof import("../src/db/repositories/bank.js").setBankItemStatus;

  beforeAll(async () => {
    ({ migrate } = await import("drizzle-orm/better-sqlite3/migrator"));
    ({ db, sqlite } = await import("../src/db/client.js"));
    migrate(db, { migrationsFolder: "./drizzle" });

    ({ startReading } = await import("../src/services/articleService.js"));
    ({ reviewSession, completeSession } = await import("../src/services/sessionService.js"));
    ({ findOrCreateUser } = await import("../src/db/repositories/users.js"));
    ({ setUserTopics } = await import("../src/db/repositories/topics.js"));
    ({ updateSessionMarks } = await import("../src/db/repositories/sessions.js"));
    ({ getBankItems, setBankItemStatus } = await import("../src/db/repositories/bank.js"));

    const user = await findOrCreateUser(999001, "smoketest");
    userId = user.id;
    await setUserTopics(userId, ["Ciencia", "Tecnología"]);
  });

  afterAll(() => {
    sqlite.close();
  });

  it("weaves a marked word into a later article and promotes it to learned after 3 clean exposures", async () => {
    // --- Cycle 1: generate an article, mark a word + a phrase, review, complete ---
    createMock
      .mockResolvedValueOnce(
        fakeMessage({
          facts: "Un equipo de científicos publicó un estudio sobre el clima en la región.",
          source_name: "Diario de Prueba",
          source_url: "https://example.com/noticia",
        }),
      )
      .mockResolvedValueOnce(
        fakeMessage({
          title: "Un descubrimiento importante",
          body: "Los científicos anunciaron un hallazgo relevante. El equipo trabajó durante meses.",
        }),
      );

    const { article: article1, session: session1 } = await startReading(userId);
    expect(article1.title).toBe("Un descubrimiento importante");
    expect(session1.state).toBe("reading");

    createMock.mockResolvedValueOnce(
      fakeMessage({
        words: [{ term: "hallazgo", translation: "discovery", frequency: "alta" }],
        phrases: [{ term: "trabajó durante meses", explanation: "worked for months", clave: "durante meses" }],
      }),
    );
    await updateSessionMarks(session1.id, ["hallazgo"], ["trabajó durante meses"]);
    const review1 = await reviewSession(userId);
    expect(review1.words[0]?.term).toBe("hallazgo");
    expect(review1.phrases[0]?.clave).toBe("durante meses");

    const complete1 = await completeSession(userId);
    expect(complete1.newlyLearned).toEqual([]);

    const activeAfterCycle1 = await getBankItems(userId, "active");
    const terms = activeAfterCycle1.map((i) => i.term).sort();
    expect(terms).toEqual(["durante meses", "hallazgo"]);

    // --- Cycle 2: the next generation prompt must include the marked word (recirculation) ---
    createMock
      .mockResolvedValueOnce(fakeMessage({ facts: "Otro estudio reciente.", source_name: "Fuente", source_url: "https://example.com/2" }))
      .mockResolvedValueOnce(
        fakeMessage({
          title: "Segunda lectura",
          body: "Un texto que menciona el hallazgo otra vez, con más contexto y detalles sobre el estudio.",
        }),
      );

    const { session: session2 } = await startReading(userId);
    // calls: 0=cycle1 search, 1=cycle1 write, 2=cycle1 review, 3=cycle2 search, 4=cycle2 write
    const writeCallArgs = createMock.mock.calls[4]?.[0] as { system: string };
    expect(writeCallArgs.system).toContain("hallazgo");

    // Nothing marked this time -> reviewMarkedItems short-circuits without an LLM
    // call (llm/review.ts), and both bank items get a clean exposure.
    await updateSessionMarks(session2.id, [], []);
    await reviewSession(userId);
    const complete2 = await completeSession(userId);
    expect(complete2.newlyLearned).toEqual([]);

    // --- Cycle 3: second clean exposure ---
    createMock
      .mockResolvedValueOnce(
        fakeMessage({ facts: "Un tercer estudio confirma los resultados anteriores.", source_name: "Fuente", source_url: "https://example.com/3" }),
      )
      .mockResolvedValueOnce(
        fakeMessage({
          title: "Tercera lectura",
          body: "Más noticias sobre el hallazgo, con nuevos detalles publicados por el equipo de investigación.",
        }),
      );
    const { session: session3 } = await startReading(userId);
    await updateSessionMarks(session3.id, [], []);
    await reviewSession(userId);
    await completeSession(userId);

    // --- Cycle 4: third clean exposure -> "hallazgo" and the phrase both become learned ---
    createMock
      .mockResolvedValueOnce(
        fakeMessage({ facts: "Un cuarto estudio amplía los hallazgos previos del equipo.", source_name: "Fuente", source_url: "https://example.com/4" }),
      )
      .mockResolvedValueOnce(
        fakeMessage({
          title: "Cuarta lectura",
          body: "Última mención del hallazgo, cerrando la serie de artículos sobre este estudio científico.",
        }),
      );
    const { session: session4 } = await startReading(userId);
    await updateSessionMarks(session4.id, [], []);
    await reviewSession(userId);
    const complete4 = await completeSession(userId);

    expect(complete4.newlyLearned.sort()).toEqual(["durante meses", "hallazgo"]);

    const activeAfterLearning = await getBankItems(userId, "active");
    expect(activeAfterLearning).toHaveLength(0);
    const learned = await getBankItems(userId, "learned");
    expect(learned.map((i) => i.term).sort()).toEqual(["durante meses", "hallazgo"]);
  });

  it("stored the translation and the sentence containing the term as firstContext", async () => {
    const learned = await getBankItems(userId, "learned");
    const hallazgo = learned.find((i) => i.term === "hallazgo");
    expect(hallazgo?.translation).toBe("discovery");
    expect(hallazgo?.firstContext).toBe("Los científicos anunciaron un hallazgo relevante.");
  });

  it("lets the owner (and only the owner) change a bank item's status manually", async () => {
    const learned = await getBankItems(userId, "learned");
    const item = learned.find((i) => i.term === "hallazgo")!;

    const foreign = await setBankItemStatus(userId + 1, item.id, "ignored");
    expect(foreign).toBeUndefined();

    const updated = await setBankItemStatus(userId, item.id, "active");
    expect(updated?.status).toBe("active");
    expect(updated?.cleanStreak).toBe(0);
  });
});
