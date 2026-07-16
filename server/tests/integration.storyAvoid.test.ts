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

const FILLER_SENTENCE =
  "Por su parte, muchos grupos siguen la situación muy cerca y comparten sus opiniones con gran interés cada semana.";

function mockSearchAndWrite(title: string, body: string) {
  createMock
    .mockResolvedValueOnce(
      fakeMessage({
        facts: "Un equipo publicó un estudio sobre el tema en la región este mes.",
        source_name: "Diario de Prueba",
        source_url: "https://example.com/noticia",
      }),
    )
    .mockResolvedValueOnce(
      fakeMessage({ title, body: [body, ...Array(13).fill(FILLER_SENTENCE)].join(" "), lemmas: ["situación"] }),
    )
    .mockResolvedValueOnce(
      fakeMessage({
        estimatedLevel: "B1",
        naturalness: 5,
        cefrFit: 5,
        readability: 5,
        factualGrounding: 5,
        issues: [],
      }),
    );
}

type SearchCallArgs = { messages: Array<{ content: string }> };

describe("story-avoidance list in the search prompt (F-18)", () => {
  let db: typeof import("../src/db/client.js").db;
  let sqlite: typeof import("../src/db/client.js").sqlite;
  let schema: typeof import("../src/db/schema.js");
  let startReading: typeof import("../src/services/articleService.js").startReading;
  let findOrCreateUser: typeof import("../src/db/repositories/users.js").findOrCreateUser;
  let setUserTopics: typeof import("../src/db/repositories/topics.js").setUserTopics;

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    ({ db, sqlite } = await import("../src/db/client.js"));
    migrate(db, { migrationsFolder: "./drizzle" });
    schema = await import("../src/db/schema.js");
    ({ startReading } = await import("../src/services/articleService.js"));
    ({ findOrCreateUser } = await import("../src/db/repositories/users.js"));
    ({ setUserTopics } = await import("../src/db/repositories/topics.js"));
  });

  afterAll(() => sqlite.close());

  async function insertFinishedArticle(
    userId: number,
    title: string,
    stamps: { readAt?: number; skippedAt?: number; skipReason?: "repeat" | "not_interested" },
  ) {
    await db.insert(schema.articles).values({
      userId,
      title,
      body: "Cuerpo archivado.",
      topic: "Tecnología",
      readAt: stamps.readAt ?? null,
      skippedAt: stamps.skippedAt ?? null,
      skipReason: stamps.skipReason ?? null,
    });
  }

  it("bans recent read and repeat-skipped stories, and omits stale ones", async () => {
    const user = await findOrCreateUser(887001, "avoidtest");
    await setUserTopics(user.id, ["Tecnología"]);
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    await insertFinishedArticle(user.id, "WhatsApp lanza una función nueva", { readAt: now - day });
    await insertFinishedArticle(user.id, "WhatsApp presenta novedades otra vez", {
      skippedAt: now - 2 * day,
      skipReason: "repeat",
    });
    await insertFinishedArticle(user.id, "Una noticia del mes pasado", { readAt: now - 20 * day });

    mockSearchAndWrite("Robots en la fábrica", "La fábrica presentó un robot que ayuda en la línea de montaje.");
    await startReading(user.id);

    const searchArgs = createMock.mock.calls[0]?.[0] as SearchCallArgs;
    const prompt = searchArgs.messages[0]!.content;
    expect(prompt).toContain("Tema: Tecnología");
    expect(prompt).toContain("YA leyó u omitió");
    expect(prompt).toContain("WhatsApp lanza una función nueva");
    expect(prompt).toContain("WhatsApp presenta novedades otra vez");
    // Outside the 14-day window: not part of the ban.
    expect(prompt).not.toContain("Una noticia del mes pasado");
    // The article being read right now (no readAt/skippedAt) can't ban itself.
    expect(prompt).not.toContain("Robots en la fábrica");
  });

  it("adds no avoidance block for a reader with an empty history", async () => {
    const user = await findOrCreateUser(887002, "avoidempty");
    await setUserTopics(user.id, ["Ciencia"]);

    mockSearchAndWrite("Primera lectura", "Los científicos describieron un fenómeno curioso del océano.");
    await startReading(user.id);

    const searchArgs = createMock.mock.calls.at(-3)?.[0] as SearchCallArgs;
    const prompt = searchArgs.messages[0]!.content;
    expect(prompt).toBe("Tema: Ciencia");
  });
});
