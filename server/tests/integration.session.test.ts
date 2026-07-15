import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
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

// Neutral filler used to pad the tiny test bodies past the pipeline's minimum
// word count so the deterministic length check doesn't force a rewrite. Chosen
// to avoid stem-collisions with any woven term asserted in these tests.
const FILLER_SENTENCE =
  "Por su parte, muchos grupos siguen la situación muy cerca y comparten sus opiniones con gran interés cada semana.";

function padBody(core: string): string {
  return [core, ...Array(13).fill(FILLER_SENTENCE)].join(" ");
}

/** A quality verdict that passes cleanly, so no rewrite is triggered. */
function passingVerdict() {
  return {
    estimatedLevel: "B1",
    naturalness: 5,
    cefrFit: 5,
    readability: 5,
    factualGrounding: 5,
    issues: [],
  };
}

// Each article generation now makes three LLM calls: search, write, and an
// independent quality audit. The audit is mocked to pass so the pipeline keeps
// the written draft unchanged.
function mockSearchAndWrite(title: string, body: string) {
  createMock
    .mockResolvedValueOnce(
      fakeMessage({
        facts: "Un equipo publicó un estudio sobre el tema en la región este mes.",
        source_name: "Diario de Prueba",
        source_url: "https://example.com/noticia",
      }),
    )
    .mockResolvedValueOnce(fakeMessage({ title, body: padBody(body) }))
    .mockResolvedValueOnce(fakeMessage(passingVerdict()));
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
  let updateUser: typeof import("../src/db/repositories/users.js").updateUser;
  let setUserTopics: typeof import("../src/db/repositories/topics.js").setUserTopics;
  let updateSessionMarks: typeof import("../src/db/repositories/sessions.js").updateSessionMarks;
  let getBankItems: typeof import("../src/db/repositories/bank.js").getBankItems;
  let setBankItemStatus: typeof import("../src/db/repositories/bank.js").setBankItemStatus;
  let rebalanceActivePool: typeof import("../src/db/repositories/bank.js").rebalanceActivePool;
  let getArticleById: typeof import("../src/db/repositories/articles.js").getArticleById;
  let listReadArticles: typeof import("../src/db/repositories/articles.js").listReadArticles;

  beforeAll(async () => {
    ({ migrate } = await import("drizzle-orm/better-sqlite3/migrator"));
    ({ db, sqlite } = await import("../src/db/client.js"));
    migrate(db, { migrationsFolder: "./drizzle" });

    ({ startReading } = await import("../src/services/articleService.js"));
    ({ reviewSession, completeSession } = await import("../src/services/sessionService.js"));
    ({ findOrCreateUser, updateUser } = await import("../src/db/repositories/users.js"));
    ({ setUserTopics } = await import("../src/db/repositories/topics.js"));
    ({ updateSessionMarks } = await import("../src/db/repositories/sessions.js"));
    ({ getBankItems, setBankItemStatus, rebalanceActivePool } = await import("../src/db/repositories/bank.js"));
    ({ getArticleById, listReadArticles } = await import("../src/db/repositories/articles.js"));

    const user = await findOrCreateUser(999001, "smoketest");
    userId = user.id;
    await setUserTopics(userId, ["Ciencia", "Tecnología"]);
  });

  afterAll(() => {
    sqlite.close();
  });

  it("weaves a marked word into a later article and climbs its SRS ladder on a clean exposure", async () => {
    // --- Cycle 1: generate an article, mark a word + a span, review, complete ---
    mockSearchAndWrite(
      "Un descubrimiento importante",
      "Los científicos anunciaron un hallazgo relevante. El equipo trabajó durante meses.",
    );

    const { article: article1, session: session1 } = await startReading(userId);
    expect(article1.title).toBe("Un descubrimiento importante");
    expect(session1.state).toBe("reading");

    createMock.mockResolvedValueOnce(
      fakeMessage({
        items: [
          {
            surface: "hallazgo",
            lemma: "hallazgo",
            pos: "noun",
            gender: "m",
            translation: "discovery",
            note: null,
            contextTranslation: "The scientists announced a relevant discovery.",
            freqBand: "top3000",
            distractors: ["esfuerzo", "acuerdo", "nivel"],
          },
          {
            surface: "durante meses",
            lemma: "durante meses",
            pos: "phrase",
            gender: null,
            translation: "for months",
            note: "duración continuada",
            contextTranslation: "The team worked for months.",
            freqBand: "top3000",
            distractors: ["sin parar", "a menudo", "de repente"],
          },
        ],
      }),
    );
    const marks: Mark[] = [
      { text: "hallazgo", sentence: "Los científicos anunciaron un hallazgo relevante.", kind: "word" },
      {
        text: "trabajó durante meses",
        sentence: "El equipo trabajó durante meses.",
        kind: "span",
        pos: { p: 0, s: 1, t: [2, 5] },
      },
    ];
    await updateSessionMarks(session1.id, marks);
    const review1 = await reviewSession(userId);
    expect(review1.items.map((i) => i.lemma).sort()).toEqual(["durante meses", "hallazgo"]);

    await completeSession(userId);

    const activeAfterCycle1 = await getBankItems(userId, "active");
    const lemmas = activeAfterCycle1.map((i) => i.lemma).sort();
    expect(lemmas).toEqual(["durante meses", "hallazgo"]);
    const firstHallazgoContexts = JSON.parse(
      activeAfterCycle1.find((item) => item.lemma === "hallazgo")!.contexts!,
    ) as Array<Record<string, unknown>>;
    expect(firstHallazgoContexts).toHaveLength(1);
    expect(firstHallazgoContexts[0]).toMatchObject({
      sentence: "Los científicos anunciaron un hallazgo relevante.",
      translation: "The scientists announced a relevant discovery.",
      surfaceForm: "hallazgo",
      articleId: article1.id,
    });

    // Completion archives the session's marks and review onto the article
    // (reading history), even though the session row itself is deleted.
    const archived = await getArticleById(article1.id);
    expect(archived?.readAt).not.toBeNull();
    expect(JSON.parse(archived!.marks)).toEqual(marks);
    expect(archived!.reviewResult).not.toBeNull();

    const history1 = await listReadArticles(userId, 10, 0);
    expect(history1.total).toBe(1);
    expect(history1.items[0]?.id).toBe(article1.id);
    expect(history1.items[0]?.title).toBe("Un descubrimiento importante");

    // --- Cycle 2: the next generation prompt must include the marked lemma (recirculation) ---
    mockSearchAndWrite(
      "Segunda lectura",
      "Un texto que menciona el hallazgo otra vez, con más contexto y detalles sobre el estudio.",
    );

    const { session: session2 } = await startReading(userId);
    // calls: 0=cycle1 search, 1=cycle1 write, 2=cycle1 audit, 3=cycle1 review,
    //        4=cycle2 search, 5=cycle2 write, 6=cycle2 audit
    const writeCallArgs = createMock.mock.calls[5]?.[0] as { system: string };
    expect(writeCallArgs.system).toContain("hallazgo");
    // Woven lemmas may be inflected; the exact-form requirement is gone.
    expect(writeCallArgs.system).toContain("cualquier forma flexionada");

    // Only "hallazgo" actually appears in the generated body, so only it is
    // stored as a woven term (the phrase wasn't used and stays due).
    const article2 = await getArticleById(session2.articleId);
    expect(JSON.parse(article2!.targetTerms)).toEqual(["hallazgo"]);

    // Nothing marked this time -> "hallazgo" earns a clean exposure and climbs
    // one rung of the SRS ladder (auto-"learned" only happens at the top rung).
    await updateSessionMarks(session2.id, []);
    await reviewSession(userId);
    await completeSession(userId);

    const active2 = await getBankItems(userId, "active");
    const hallazgo2 = active2.find((i) => i.lemma === "hallazgo");
    expect(hallazgo2?.srsStage).toBe(1);
    expect(hallazgo2?.nextDueAt).not.toBeNull();
    const hallazgoContexts = JSON.parse(hallazgo2!.contexts!) as Array<Record<string, unknown>>;
    expect(hallazgoContexts).toHaveLength(2);
    expect(hallazgoContexts[1]).toMatchObject({
      sentence: expect.stringContaining("hallazgo otra vez"),
      translation: null,
      surfaceForm: "hallazgo",
      articleId: article2!.id,
    });
    // The phrase was never woven in, so it stayed at the bottom rung, due now.
    const phrase2 = active2.find((i) => i.lemma === "durante meses");
    expect(phrase2?.srsStage).toBe(0);
    // Far from the top rung: the "learned" bucket is still empty.
    expect(await getBankItems(userId, "learned")).toHaveLength(0);
  });

  it("stored the structured card: translation, marked sentence as firstContext, and quiz fields", async () => {
    const active = await getBankItems(userId, "active");
    const hallazgo = active.find((i) => i.lemma === "hallazgo");
    expect(hallazgo?.translation).toBe("discovery");
    expect(hallazgo?.surfaceForm).toBe("hallazgo");
    expect(hallazgo?.pos).toBe("noun");
    expect(hallazgo?.gender).toBe("m");
    expect(hallazgo?.firstContext).toBe("Los científicos anunciaron un hallazgo relevante.");
    expect(hallazgo?.contextTranslation).toBe("The scientists announced a relevant discovery.");
    expect(hallazgo?.freqBand).toBe("top3000");
    expect(JSON.parse(hallazgo!.distractors!)).toEqual(["esfuerzo", "acuerdo", "nivel"]);
  });

  it("lets the owner (and only the owner) change a bank item's status manually", async () => {
    const active = await getBankItems(userId, "active");
    const item = active.find((i) => i.lemma === "hallazgo")!;

    const foreign = await setBankItemStatus(userId + 1, item.id, "ignored");
    expect(foreign).toBeUndefined();

    const updated = await setBankItemStatus(userId, item.id, "learned");
    expect(updated?.status).toBe("learned");
    // A manual status change restarts the schedule.
    expect(updated?.srsStage).toBe(0);
  });

  it("merges 'se' + 'llama' marked in one sentence into a single llamarse card", async () => {
    const user = await findOrCreateUser(999002, "cliticstest");
    await setUserTopics(user.id, ["Sociedad"]);

    const sentence = "Mi vecino se llama Andrés y trabaja en el puerto.";
    mockSearchAndWrite("Historias del puerto", `${sentence} Cada mañana saluda a todos.`);
    const { session } = await startReading(user.id);

    createMock.mockResolvedValueOnce(
      fakeMessage({
        items: [
          {
            surface: "se llama",
            lemma: "llamarse",
            pos: "verb",
            gender: null,
            translation: "зваться, называться",
            note: "verbo pronominal: llamarse + nombre",
            contextTranslation: "Моего соседа зовут Андрес, он работает в порту.",
            freqBand: "top1000",
            distractors: ["quedarse", "ponerse", "irse"],
          },
        ],
      }),
    );
    await updateSessionMarks(session.id, [
      { text: "se", sentence, kind: "word" },
      { text: "llama", sentence, kind: "word" },
    ]);
    const review = await reviewSession(user.id);
    expect(review.items).toHaveLength(1);

    await completeSession(user.id);

    const bank = await getBankItems(user.id);
    expect(bank).toHaveLength(1);
    expect(bank[0]).toMatchObject({
      lemma: "llamarse",
      pos: "verb",
      surfaceForm: "se llama",
      translation: "зваться, называться",
      contextTranslation: "Моего соседа зовут Андрес, он работает в порту.",
      firstContext: sentence,
      status: "active",
    });
  });

  it("stores lemma=lanzamiento / noun / m / surfaceForm=lanzamientos for a marked plural", async () => {
    const user = await findOrCreateUser(999003, "lemmatest");
    await setUserTopics(user.id, ["Tecnología"]);

    const sentence = "Los lanzamientos de la empresa fueron un éxito rotundo.";
    mockSearchAndWrite("Novedades de la empresa", `${sentence} Los clientes esperan más productos.`);
    const { session } = await startReading(user.id);

    createMock.mockResolvedValueOnce(
      fakeMessage({
        items: [
          {
            surface: "lanzamientos",
            lemma: "lanzamiento",
            pos: "noun",
            gender: "m",
            translation: "запуск, выпуск",
            note: null,
            contextTranslation: "Запуски продуктов компании прошли с большим успехом.",
            freqBand: "top5000",
            distractors: ["desarrollo", "acuerdo", "crecimiento"],
          },
        ],
      }),
    );
    await updateSessionMarks(session.id, [{ text: "lanzamientos", sentence, kind: "word" }]);
    await reviewSession(user.id);
    await completeSession(user.id);

    const bank = await getBankItems(user.id);
    const card = bank.find((i) => i.lemma === "lanzamiento");
    expect(card).toMatchObject({
      lemma: "lanzamiento",
      pos: "noun",
      gender: "m",
      surfaceForm: "lanzamientos",
      firstContext: sentence,
      status: "active",
    });
  });

  it("keeps a rejected word out of the active bank even if frequent", async () => {
    const user = await findOrCreateUser(999005, "rejecttest");
    await setUserTopics(user.id, ["Sociedad"]);

    const sentence = "El acuerdo entre las partes fue firmado ayer.";
    mockSearchAndWrite("Noticias del día", `${sentence} La reunión duró horas.`);
    const { session } = await startReading(user.id);

    createMock.mockResolvedValueOnce(
      fakeMessage({
        items: [
          {
            surface: "acuerdo",
            lemma: "acuerdo",
            pos: "noun",
            gender: "m",
            translation: "соглашение",
            note: null,
            contextTranslation: "Соглашение между сторонами было подписано вчера.",
            freqBand: "top1000",
            distractors: ["desacuerdo", "conflicto", "debate"],
          },
        ],
      }),
    );
    await updateSessionMarks(session.id, [{ text: "acuerdo", sentence, kind: "word" }]);
    await reviewSession(user.id);
    // The reader flipped this frequent word to "skip" on the review screen.
    await completeSession(user.id, { rejected: ["acuerdo"] });

    const active = await getBankItems(user.id, "active");
    expect(active).toHaveLength(0);
    const ignored = await getBankItems(user.id, "ignored");
    expect(ignored.map((i) => i.lemma)).toEqual(["acuerdo"]);
  });

  it("puts an accepted rare word into the active bank despite the freq verdict", async () => {
    const user = await findOrCreateUser(999006, "accepttest");
    await setUserTopics(user.id, ["Ciencia"]);

    const sentence = "El biólogo describió el fenómeno de la bioluminiscencia.";
    mockSearchAndWrite("Vida marina", `${sentence} El hallazgo sorprendió a todos.`);
    const { session } = await startReading(user.id);

    createMock.mockResolvedValueOnce(
      fakeMessage({
        items: [
          {
            surface: "bioluminiscencia",
            lemma: "bioluminiscencia",
            pos: "noun",
            gender: "f",
            translation: "биолюминесценция",
            note: "término científico",
            contextTranslation: "Биолог описал явление биолюминесценции.",
            freqBand: "rare",
            distractors: ["fotosíntesis", "gravedad", "electricidad"],
          },
        ],
      }),
    );
    await updateSessionMarks(session.id, [{ text: "bioluminiscencia", sentence, kind: "word" }]);
    await reviewSession(user.id);
    // The reader flipped this rare word to "save" on the review screen.
    await completeSession(user.id, { accepted: ["bioluminiscencia"] });

    const active = await getBankItems(user.id, "active");
    expect(active.map((i) => i.lemma)).toEqual(["bioluminiscencia"]);
    const ignored = await getBankItems(user.id, "ignored");
    expect(ignored).toHaveLength(0);
  });

  it("queues accepted words past the active-pool limit and reports them", async () => {
    const user = await findOrCreateUser(999008, "pooltest");
    await setUserTopics(user.id, ["Sociedad"]);
    await updateUser(user.id, { activePoolLimit: 1 });

    const sentence = "El gobierno anunció una reforma tras un largo debate.";
    mockSearchAndWrite("Política al día", `${sentence} Las reacciones no se hicieron esperar.`);
    const { session } = await startReading(user.id);

    createMock.mockResolvedValueOnce(
      fakeMessage({
        items: [
          {
            surface: "reforma",
            lemma: "reforma",
            pos: "noun",
            gender: "f",
            translation: "reform",
            note: null,
            contextTranslation: "The government announced a reform.",
            freqBand: "top1000",
            distractors: ["ley", "norma", "medida"],
          },
          {
            surface: "debate",
            lemma: "debate",
            pos: "noun",
            gender: "m",
            translation: "debate",
            note: null,
            contextTranslation: "after a long debate",
            freqBand: "top1000",
            distractors: ["charla", "discurso", "acuerdo"],
          },
        ],
      }),
    );
    await updateSessionMarks(session.id, [
      { text: "reforma", sentence, kind: "word" },
      { text: "debate", sentence, kind: "word" },
    ]);
    await reviewSession(user.id);
    const result = await completeSession(user.id);

    // Limit 1: the first accepted word (reviewed order) takes the slot, the
    // second is parked in the queue and surfaced in the result.
    expect(result.queued).toEqual(["debate"]);
    const active = await getBankItems(user.id, "active");
    expect(active.map((i) => i.lemma)).toEqual(["reforma"]);
    const queued = await getBankItems(user.id, "queued");
    expect(queued.map((i) => i.lemma)).toEqual(["debate"]);
  });

  it("promotes the queued word once the active one is learned or discarded", async () => {
    const user = await findOrCreateUser(999009, "promotetest");
    await setUserTopics(user.id, ["Sociedad"]);
    await updateUser(user.id, { activePoolLimit: 1 });

    const sentence = "La empresa lanzó un producto y ganó un premio importante.";
    mockSearchAndWrite("Negocios", `${sentence} El mercado respondió bien.`);
    const { session } = await startReading(user.id);
    createMock.mockResolvedValueOnce(
      fakeMessage({
        items: [
          {
            surface: "producto",
            lemma: "producto",
            pos: "noun",
            gender: "m",
            translation: "product",
            note: null,
            contextTranslation: "launched a product",
            freqBand: "top1000",
            distractors: ["servicio", "objeto", "bien"],
          },
          {
            surface: "premio",
            lemma: "premio",
            pos: "noun",
            gender: "m",
            translation: "prize",
            note: null,
            contextTranslation: "won a prize",
            freqBand: "top1000",
            distractors: ["regalo", "trofeo", "honor"],
          },
        ],
      }),
    );
    await updateSessionMarks(session.id, [
      { text: "producto", sentence, kind: "word" },
      { text: "premio", sentence, kind: "word" },
    ]);
    await reviewSession(user.id);
    await completeSession(user.id);
    expect((await getBankItems(user.id, "queued")).map((i) => i.lemma)).toEqual(["premio"]);

    // Discard the active word manually — the queue should refill on rebalance.
    const producto = (await getBankItems(user.id, "active")).find((i) => i.lemma === "producto")!;
    await setBankItemStatus(user.id, producto.id, "ignored");
    const promoted = await rebalanceActivePool(user.id, 1);
    expect(promoted).toEqual(["premio"]);
    expect((await getBankItems(user.id, "active")).map((i) => i.lemma)).toEqual(["premio"]);
    expect(await getBankItems(user.id, "queued")).toHaveLength(0);
  });

  it("reports woven-word progress: clean streak untouched, re-marked word flagged", async () => {
    const user = await findOrCreateUser(999007, "woventest");
    await setUserTopics(user.id, ["Tecnología"]);

    // Cycle 1: seed two active words in the bank.
    const seed = "La innovación impulsa la economía y genera empleo.";
    mockSearchAndWrite("Economía digital", `${seed} Las empresas invierten más.`);
    const { session: s1 } = await startReading(user.id);
    createMock.mockResolvedValueOnce(
      fakeMessage({
        items: [
          {
            surface: "innovación",
            lemma: "innovación",
            pos: "noun",
            gender: "f",
            translation: "инновация",
            note: null,
            contextTranslation: "Инновации двигают экономику.",
            freqBand: "top3000",
            distractors: ["tradición", "rutina", "costumbre"],
          },
          {
            surface: "empleo",
            lemma: "empleo",
            pos: "noun",
            gender: "m",
            translation: "работа",
            note: null,
            contextTranslation: "Инновации создают рабочие места.",
            freqBand: "top3000",
            distractors: ["descanso", "paro", "ocio"],
          },
        ],
      }),
    );
    await updateSessionMarks(s1.id, [
      { text: "innovación", sentence: seed, kind: "word" },
      { text: "empleo", sentence: seed, kind: "word" },
    ]);
    await reviewSession(user.id);
    await completeSession(user.id);

    // Cycle 2: both are woven in (targetTerms). Re-mark only "innovación".
    const sentence = "La innovación cambió el sector por completo.";
    mockSearchAndWrite("Más tecnología", `${sentence} El empleo creció con ella.`);
    const { session: s2, article } = await startReading(user.id);
    expect(JSON.parse(article.targetTerms).sort()).toEqual(["empleo", "innovación"]);

    createMock.mockResolvedValueOnce(
      fakeMessage({
        items: [
          {
            surface: "innovación",
            lemma: "innovación",
            pos: "noun",
            gender: "f",
            translation: "инновация",
            note: null,
            contextTranslation: "Инновация изменила сектор.",
            freqBand: "top3000",
            distractors: ["tradición", "rutina", "costumbre"],
          },
        ],
      }),
    );
    await updateSessionMarks(s2.id, [{ text: "innovación", sentence, kind: "word" }]);
    const view = await reviewSession(user.id);

    const woven = new Map(view.wovenTerms.map((w) => [w.lemma, w]));
    expect(woven.get("innovación")?.markedAgain).toBe(true);
    expect(woven.get("empleo")?.markedAgain).toBe(false);
    // Both carry their current SRS rung (0) before completion.
    expect(woven.get("empleo")?.srsStage).toBe(0);

    // The review item also carries the marked sentence for the card.
    expect(view.items[0]?.contextSentence).toBe(sentence);
  });

  it("saves the rewritten version when the audit fails, keeping source metadata and re-verifying woven terms", async () => {
    const user = await findOrCreateUser(999010, "rewritetest");
    await setUserTopics(user.id, ["Arte"]);

    // Cycle 1: seed "escultura" into the active bank so cycle 2 offers it for weaving.
    const seedSentence = "La escultura del parque atrajo a muchos visitantes.";
    mockSearchAndWrite("Arte urbano", `${seedSentence} La ciudad planea más obras.`);
    const { session: seedSession } = await startReading(user.id);
    createMock.mockResolvedValueOnce(
      fakeMessage({
        items: [
          {
            surface: "escultura",
            lemma: "escultura",
            pos: "noun",
            gender: "f",
            translation: "скульптура",
            note: null,
            contextTranslation: "Скульптура в парке привлекла много посетителей.",
            freqBand: "top5000",
            distractors: ["pintura", "estatura", "fachada"],
          },
        ],
      }),
    );
    await updateSessionMarks(seedSession.id, [{ text: "escultura", sentence: seedSentence, kind: "word" }]);
    await reviewSession(user.id);
    await completeSession(user.id);

    // Cycle 2: the draft does NOT contain the target word and fails the audit;
    // the rewrite weaves it in and passes. The draft body must not survive.
    const draftBody = padBody("El museo abrió una sala nueva con obras clásicas de gran valor.");
    const rewrittenBody = padBody("El museo abrió una sala nueva y presentó una escultura moderna al público.");
    createMock
      .mockResolvedValueOnce(
        fakeMessage({
          facts: "Un museo de la región inauguró una sala nueva este mes.",
          source_name: "Diario de Prueba",
          source_url: "https://example.com/noticia",
        }),
      )
      .mockResolvedValueOnce(fakeMessage({ title: "Sala nueva", body: draftBody, usedTerms: [], lemmas: ["museo"] }))
      .mockResolvedValueOnce(
        fakeMessage({
          estimatedLevel: "B2",
          naturalness: 2,
          cefrFit: 3,
          readability: 4,
          factualGrounding: 5,
          issues: [
            {
              category: "collocation",
              severity: "major",
              excerpt: "obras clásicas de gran valor",
              suggestion: "suena a cliché vacío; reformula con naturalidad",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        fakeMessage({ title: "Sala nueva", body: rewrittenBody, usedTerms: ["escultura"], lemmas: ["museo", "escultura", "el"] }),
      )
      .mockResolvedValueOnce(fakeMessage(passingVerdict()));

    const { article } = await startReading(user.id);

    // The final (rewritten) version is what got persisted, not the draft.
    expect(article.body).toBe(rewrittenBody);
    expect(article.title).toBe("Sala nueva");
    // Source metadata comes from the search step and survives the rewrite.
    expect(article.sourceName).toBe("Diario de Prueba");
    expect(article.sourceUrl).toBe("https://example.com/noticia");
    // Woven-term verification ran against the FINAL body: the draft lacked the
    // word, the rewrite added it, so it counts as woven.
    expect(JSON.parse(article.targetTerms)).toEqual(["escultura"]);
    // Lemmas come from the winning rewritten version, then server-side cleanup
    // filters service words and verifies each candidate against that final body.
    expect(JSON.parse(article.lemmas)).toEqual(["museo", "escultura"]);

    // The rewrite prompt carried the auditor's concrete complaint to the editor.
    const calls = createMock.mock.calls;
    const rewriteCall = calls[calls.length - 2]?.[0] as { system: string; messages: { content: string }[] };
    expect(rewriteCall.system).toContain("CORRIGE");
    expect(rewriteCall.messages[0]?.content).toContain("obras clásicas de gran valor");
  });

  it("sends a rare word to ignored instead of the active bank", async () => {
    const user = await findOrCreateUser(999004, "raretest");
    await setUserTopics(user.id, ["Ciencia"]);

    const sentence = "El espectrómetro de masas confirmó el resultado.";
    mockSearchAndWrite("Instrumentos de laboratorio", `${sentence} El estudio continúa.`);
    const { session } = await startReading(user.id);

    createMock.mockResolvedValueOnce(
      fakeMessage({
        items: [
          {
            surface: "espectrómetro",
            lemma: "espectrómetro",
            pos: "noun",
            gender: "m",
            translation: "спектрометр",
            note: "término técnico de laboratorio",
            contextTranslation: "Масс-спектрометр подтвердил результат.",
            freqBand: "rare",
            distractors: ["telescopio", "microscopio", "termómetro"],
          },
        ],
      }),
    );
    await updateSessionMarks(session.id, [{ text: "espectrómetro", sentence, kind: "word" }]);
    await reviewSession(user.id);
    await completeSession(user.id);

    const ignored = await getBankItems(user.id, "ignored");
    expect(ignored.map((i) => i.lemma)).toEqual(["espectrómetro"]);
    const active = await getBankItems(user.id, "active");
    expect(active).toHaveLength(0);
  });
});
