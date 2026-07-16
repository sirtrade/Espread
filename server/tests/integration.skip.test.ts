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

const FILLER_SENTENCE =
  "Por su parte, muchos grupos siguen la situación muy cerca y comparten sus opiniones con gran interés cada semana.";

function padBody(core: string): string {
  return [core, ...Array(13).fill(FILLER_SENTENCE)].join(" ");
}

function mockSearchAndWrite(title: string, body: string) {
  createMock
    .mockResolvedValueOnce(
      fakeMessage({
        facts: "Un equipo publicó un estudio sobre el tema en la región este mes.",
        source_name: "Diario de Prueba",
        source_url: "https://example.com/noticia",
      }),
    )
    .mockResolvedValueOnce(fakeMessage({ title, body: padBody(body), lemmas: ["situación"] }))
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

describe("skip article with questionnaire (F-17)", () => {
  let app: ReturnType<typeof import("../src/api/app.js").createApp>;
  let db: typeof import("../src/db/client.js").db;
  let sqlite: typeof import("../src/db/client.js").sqlite;
  let schema: typeof import("../src/db/schema.js");
  let startReading: typeof import("../src/services/articleService.js").startReading;
  let reviewSession: typeof import("../src/services/sessionService.js").reviewSession;
  let skipSession: typeof import("../src/services/sessionService.js").skipSession;
  let findOrCreateUser: typeof import("../src/db/repositories/users.js").findOrCreateUser;
  let setUserTopics: typeof import("../src/db/repositories/topics.js").setUserTopics;
  let updateSessionMarks: typeof import("../src/db/repositories/sessions.js").updateSessionMarks;
  let getActiveSession: typeof import("../src/db/repositories/sessions.js").getActiveSession;
  let getArticleById: typeof import("../src/db/repositories/articles.js").getArticleById;
  let getRecentTopics: typeof import("../src/db/repositories/articles.js").getRecentTopics;
  let listReadArticles: typeof import("../src/db/repositories/articles.js").listReadArticles;
  let getBankItems: typeof import("../src/db/repositories/bank.js").getBankItems;
  let getUserStats: typeof import("../src/db/repositories/stats.js").getUserStats;
  let signSession: typeof import("../src/auth/jwt.js").signSession;

  beforeAll(async () => {
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    ({ db, sqlite } = await import("../src/db/client.js"));
    migrate(db, { migrationsFolder: "./drizzle" });
    schema = await import("../src/db/schema.js");

    ({ startReading } = await import("../src/services/articleService.js"));
    ({ reviewSession, skipSession } = await import("../src/services/sessionService.js"));
    ({ findOrCreateUser } = await import("../src/db/repositories/users.js"));
    ({ setUserTopics } = await import("../src/db/repositories/topics.js"));
    ({ updateSessionMarks, getActiveSession } = await import("../src/db/repositories/sessions.js"));
    ({ getArticleById, getRecentTopics, listReadArticles } = await import("../src/db/repositories/articles.js"));
    ({ getBankItems } = await import("../src/db/repositories/bank.js"));
    ({ getUserStats } = await import("../src/db/repositories/stats.js"));
    ({ signSession } = await import("../src/auth/jwt.js"));
    app = (await import("../src/api/app.js")).createApp();
  });

  afterAll(() => sqlite.close());

  async function newUser(tgId: number, name: string) {
    const user = await findOrCreateUser(tgId, name);
    await setUserTopics(user.id, ["Ciencia", "Tecnología"]);
    const auth = `Bearer ${signSession({ userId: user.id, tgUserId: user.tgUserId })}`;
    return { userId: user.id, auth };
  }

  it("skips via the API: session deleted, skip stamped on the article, no progress credited", async () => {
    const { userId, auth } = await newUser(888001, "skiptest");

    mockSearchAndWrite("Noticia repetida", "El lanzamiento fue anunciado por la empresa esta semana.");
    const { article, session } = await startReading(userId);

    // Marks made before skipping must be discarded, not credited anywhere.
    const marks: Mark[] = [
      { text: "lanzamiento", sentence: "El lanzamiento fue anunciado por la empresa esta semana.", kind: "word" },
    ];
    await updateSessionMarks(session.id, marks);

    const res = await app.request("/api/session/skip", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "other", comment: "Ya vi esta noticia tres veces" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // The session is gone; the article carries the skip record and no read stamp.
    expect(await getActiveSession(userId)).toBeUndefined();
    const skipped = await getArticleById(article.id);
    expect(skipped?.skippedAt).not.toBeNull();
    expect(skipped?.skipReason).toBe("other");
    expect(skipped?.skipComment).toBe("Ya vi esta noticia tres veces");
    expect(skipped?.readAt).toBeNull();
    // The session's marks were dropped, not archived onto the article.
    expect(JSON.parse(skipped!.marks)).toEqual([]);

    // No progress metric moved: stats counter, reading history, daily
    // activity (streak), bank/SRS, passive known-words encounters.
    expect((await getUserStats(userId))?.articlesRead ?? 0).toBe(0);
    expect((await listReadArticles(userId, 10, 0)).total).toBe(0);
    expect(await db.query.dailyActivity.findFirst({ where: eq(schema.dailyActivity.userId, userId) })).toBeUndefined();
    expect(await getBankItems(userId)).toHaveLength(0);
    expect(await db.query.knownWords.findFirst({ where: eq(schema.knownWords.userId, userId) })).toBeUndefined();

    // The skipped article's topic still counts in rotation (createdAt-based).
    expect(await getRecentTopics(userId, 2)).toContain(article.topic);

    // Without an active session a repeat skip is a 404.
    const repeat = await app.request("/api/session/skip", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(repeat.status).toBe(404);
  });

  it("skips without a reason (empty body) and allows a new reading within the daily limit", async () => {
    const { userId, auth } = await newUser(888002, "skipnoreason");

    mockSearchAndWrite("Tema aburrido", "El congreso debatió una norma técnica durante horas.");
    const { article: first } = await startReading(userId);

    const res = await app.request("/api/session/skip", {
      method: "POST",
      headers: { Authorization: auth },
    });
    expect(res.status).toBe(200);

    const skipped = await getArticleById(first.id);
    expect(skipped?.skippedAt).not.toBeNull();
    expect(skipped?.skipReason).toBeNull();
    expect(skipped?.skipComment).toBeNull();

    // The generate spent on the skipped article is NOT refunded; the next
    // reading is a normal startReading under DAILY_ARTICLE_LIMIT.
    mockSearchAndWrite("Otra noticia", "La universidad presentó un proyecto de energía solar.");
    const { article: second } = await startReading(userId);
    expect(second.id).not.toBe(first.id);
    expect(await getActiveSession(userId)).toBeDefined();
  });

  it("returns 429 on the next reading once the daily generate limit is exhausted", async () => {
    const { userId, auth } = await newUser(888003, "skiplimit");
    const { config } = await import("../src/lib/config.js");

    mockSearchAndWrite("Última del día", "El museo anunció una exposición nueva para el verano.");
    await startReading(userId);

    // Backfill today's generate calls up to the limit (the one above included).
    const missing = config.DAILY_ARTICLE_LIMIT - 1;
    for (let i = 0; i < missing; i++) {
      await db.insert(schema.llmCalls).values({ userId, kind: "generate", model: "test", ok: true });
    }

    const res = await app.request("/api/session/skip", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "not_interested" }),
    });
    expect(res.status).toBe(200);

    await expect(startReading(userId)).rejects.toMatchObject({ status: 429 });
  });

  it("rejects a comment with a preset reason, an overlong comment, and skipping a reviewed session", async () => {
    const { userId, auth } = await newUser(888004, "skipvalidation");

    mockSearchAndWrite("Noticia analizada", "El hallazgo sorprendió a la comunidad científica local.");
    const { session } = await startReading(userId);

    // Comment is only accepted with reason "other" (owner decision).
    const withPreset = await app.request("/api/session/skip", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "repeat", comment: "duplicada" }),
    });
    expect(withPreset.status).toBe(400);

    const tooLong = await app.request("/api/session/skip", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "other", comment: "x".repeat(201) }),
    });
    expect(tooLong.status).toBe(400);

    // Once the review ran (LLM already paid), the skip window is closed.
    await updateSessionMarks(session.id, []);
    createMock.mockResolvedValueOnce(fakeMessage({ items: [] }));
    await reviewSession(userId);

    await expect(skipSession(userId, { reason: "not_interested" })).rejects.toMatchObject({ status: 404 });
    const reviewed = await app.request("/api/session/skip", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(reviewed.status).toBe(404);
    // The reviewed session survived the rejected skip attempts.
    expect((await getActiveSession(userId))?.state).toBe("reviewed");
  });
});
