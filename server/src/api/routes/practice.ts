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
import { buildQueueCard, parseStoredDistractors, type CardType, type QueueCardType } from "../../domain/practice.js";
import { gradeTypedAnswer, type TypedVerdict } from "../../domain/typedQuiz.js";
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
  /** "cloze"/"recall" are multiple-choice; "typed" asks the user to type the
   *  word (graded on the server, so `answer` is empty and `options` is `[]`). */
  type: QueueCardType;
  prompt: string;
  /** the option that is correct: the blanked surface form for cloze, the lemma for recall; empty for typed */
  answer: string;
  options: string[];
  /** the article sentence, shown as after-answer feedback */
  context: string | null;
  /** translation of the context sentence, shown as a cloze hint */
  contextTranslation: string | null;
  /** typed cards: the blanked sentence shown as a hint while answering (null for MC) */
  contextHint: string | null;
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

    // Words from TYPED_QUIZ_MIN_STAGE up are asked as typed recall; below that
    // (or when a safe typed card can't be built) fall back to multiple choice,
    // alternating cloze/recall for variety. The builder degrades a leaking
    // recall into a cloze and skips items it can't turn into a safe card.
    const prefer: CardType = cards.length % 2 === 0 ? "cloze" : "recall";
    const card = buildQueueCard(
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
        srsStage: item.srsStage,
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
      contextHint: card.contextHint,
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

  // Typed-recall answers are graded on the server so the client can't be
  // trusted to report its own correctness. The verdict + the proper form are
  // returned so the client can show accent/typo feedback.
  let correct: boolean;
  let verdict: TypedVerdict | undefined;
  let answer: string | undefined;
  if (body.data.typedAnswer != null) {
    const item = await getBankItemById(userId, itemId);
    if (!item) throw Errors.notFound("Palabra");
    const accepted = [item.surfaceForm, item.lemma].filter((f): f is string => typeof f === "string" && f.length > 0);
    const grade = gradeTypedAnswer(body.data.typedAnswer, accepted);
    correct = grade.correct;
    verdict = grade.verdict;
    answer = grade.matched;
  } else {
    correct = body.data.correct ?? false;
  }

  const user = await getUserById(userId);
  const result = await applyPracticeAnswer(
    userId,
    itemId,
    correct,
    Date.now(),
    body.data.usedHint ?? false,
    user?.timezone ?? "UTC",
  );
  if (!result) throw Errors.notFound("Palabra");
  return c.json({
    ok: true,
    srsStage: result.srsStage,
    nextDueAt: result.nextDueAt,
    status: result.status,
    advanced: result.advanced,
    // Present only for typed answers: the grading verdict and the correct form.
    ...(verdict ? { verdict, correct, answer } : {}),
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
