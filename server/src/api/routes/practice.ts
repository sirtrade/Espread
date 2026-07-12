import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../../lib/config.js";
import { Errors } from "../errors.js";
import {
  applyPracticeAnswer,
  countDueForPractice,
  getBankItemById,
  getBankItemByLemma,
  getDistractorPool,
  getDueForPractice,
} from "../../db/repositories/bank.js";
import { getUserById } from "../../db/repositories/users.js";
import { countRecentCalls } from "../../db/repositories/llmCalls.js";
import { buildCard, parseStoredDistractors, type CardType } from "../../domain/practice.js";
import { checkPracticeSentence } from "../../llm/sentenceCheck.js";
import { practiceAnswerSchema, practiceSentenceSchema } from "../validation.js";
import type { AppEnv } from "../context.js";

export const practiceRoutes = new Hono<AppEnv>();

practiceRoutes.use("*", requireAuth);

export interface PracticeCard {
  itemId: number;
  lemma: string;
  isPhrase: boolean;
  translation: string | null;
  /** "cloze": fill the blank in the original context; "recall": pick the word for a translation. */
  type: CardType;
  prompt: string;
  /** the option that is correct: the blanked surface form for cloze, the lemma for recall */
  answer: string;
  options: string[];
  /** the article sentence, shown as after-answer feedback */
  context: string | null;
  /** translation of the context sentence, shown as a cloze hint */
  contextTranslation: string | null;
}

practiceRoutes.get("/queue", async (c) => {
  const { userId } = c.get("session");
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 10, 1), 30);
  const now = Date.now();

  const [dueItems, due] = await Promise.all([getDueForPractice(userId, now, limit), countDueForPractice(userId, now)]);

  const cards: PracticeCard[] = [];
  for (const item of dueItems) {
    const poolLemmas = (await getDistractorPool(userId, item.id, { pos: item.pos, isPhrase: item.isPhrase })).map(
      (d) => d.lemma,
    );

    // Alternate cloze/recall for variety; the builder degrades a leaking
    // recall into a cloze and skips items it can't turn into a safe card.
    const prefer: CardType = cards.length % 2 === 0 ? "cloze" : "recall";
    const card = buildCard(
      {
        lemma: item.lemma,
        isPhrase: item.isPhrase,
        translation: item.translation,
        firstContext: item.firstContext,
        surfaceForm: item.surfaceForm,
        contextTranslation: item.contextTranslation,
        pos: item.pos,
        storedDistractors: parseStoredDistractors(item.distractors),
        poolLemmas,
      },
      prefer,
    );
    if (!card) continue;

    cards.push({
      itemId: item.id,
      lemma: item.lemma,
      isPhrase: item.isPhrase,
      translation: card.translation,
      type: card.type,
      prompt: card.prompt,
      answer: card.answer,
      options: card.options,
      context: card.context,
      contextTranslation: card.contextTranslation,
    });
  }

  return c.json({ cards, due });
});

practiceRoutes.post("/answer", async (c) => {
  const { userId } = c.get("session");
  const body = practiceAnswerSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw Errors.badRequest(body.error.issues[0]?.message ?? "Datos inválidos");

  // Práctica sends an itemId; the post-reading Quiz sends a lemma (it never
  // sees item ids). Both drive the same learning + SRS update.
  let itemId = body.data.itemId;
  if (itemId == null && body.data.lemma) {
    const item = await getBankItemByLemma(userId, body.data.lemma);
    if (!item) throw Errors.notFound("Palabra");
    itemId = item.id;
  }
  if (itemId == null) throw Errors.badRequest("Falta itemId o lemma");

  const result = await applyPracticeAnswer(userId, itemId, body.data.correct);
  if (!result) throw Errors.notFound("Palabra");
  return c.json({
    ok: true,
    practiceStage: result.practiceStage,
    nextPracticeAt: result.nextPracticeAt,
    cleanStreak: result.cleanStreak,
    status: result.status,
    streakCredited: result.streakCredited,
    becameLearned: result.becameLearned,
  });
});

practiceRoutes.post("/sentence", async (c) => {
  const { userId } = c.get("session");
  const body = practiceSentenceSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw Errors.badRequest(body.error.issues[0]?.message ?? "Datos inválidos");

  const count = await countRecentCalls(userId, "practice");
  if (count >= config.DAILY_PRACTICE_LLM_LIMIT) {
    throw Errors.rateLimited(
      `Alcanzaste el límite diario de ${config.DAILY_PRACTICE_LLM_LIMIT} correcciones. Vuelve mañana.`,
    );
  }

  const [user, item] = await Promise.all([getUserById(userId), getBankItemById(userId, body.data.itemId)]);
  if (!user) throw Errors.notFound("Usuario");
  if (!item) throw Errors.notFound("Palabra");

  // Free-writing feedback is reinforcement only: it never touches SRS state.
  const result = await checkPracticeSentence({
    userId,
    level: user.level,
    explainLang: user.explainLang,
    term: item.lemma,
    translation: item.translation,
    sentence: body.data.sentence,
  });
  return c.json(result);
});
