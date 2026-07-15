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
import {
  applyGrammarPracticeAnswer,
  countDueGrammarForPractice,
  getDueGrammarForPractice,
  getGrammarItemById,
} from "../../db/repositories/grammar.js";
import { buildGrammarQueueCard, parseGrammarExercise } from "../../domain/grammarPractice.js";
import { GRAMMAR_GAP } from "../../domain/grammar.js";
import { getUserById } from "../../db/repositories/users.js";
import { countRecentCalls } from "../../db/repositories/llmCalls.js";
import {
  buildQueueCard,
  parseStoredDistractors,
  protectCrossCardLeaks,
  shufflePracticeCandidates,
  type CardType,
  type QueueCardType,
} from "../../domain/practice.js";
import { contextByAddedAt, parseContexts, pickContext, type BankContext } from "../../domain/contexts.js";
import type { BankItemRow } from "../../db/repositories/bank.js";
import { clampPracticeSize } from "../../domain/practiceSize.js";
import { gradeTypedAnswer, type TypedVerdict } from "../../domain/typedQuiz.js";
import { checkPracticeSentence } from "../../llm/sentenceCheck.js";
import { practiceAnswerSchema, practiceSentenceSchema } from "../validation.js";
import type { AppEnv } from "../context.js";

export const practiceRoutes = new Hono<AppEnv>();

practiceRoutes.use("*", requireAuth);

export interface PracticeCard {
  /** lexical bank item; null for grammar cards */
  itemId: number | null;
  /** grammar unit; null for word cards */
  grammarItemId?: number | null;
  /** what the card drills; "word" when absent (older payload consumers) */
  kind: "word" | "grammar";
  /** grammar cards: closed category + hint material (leak-safe, may be null) */
  category?: string | null;
  pattern?: string | null;
  explanation?: string | null;
  /** Hidden for typed cards until the server grades the answer. */
  lemma: string | null;
  isPhrase: boolean;
  /** SRS ladder rung of the word, so the client can surface the free-writing
   *  exercise more prominently on the upper rungs (see webapp Práctica). */
  srsStage: number;
  translation: string | null;
  /** "cloze"/"recall" are multiple-choice; "typed" asks the user to type the
   *  word (graded on the server, so `answer` is empty and `options` is `[]`). */
  type: QueueCardType;
  prompt: string;
  /** the option that is correct: the blanked surface form for cloze, the lemma for recall; empty for typed */
  answer: string;
  options: string[];
  /** article sentence; null for typed cards to keep accepted forms server-side */
  context: string | null;
  /** translation of the context sentence, shown as a cloze hint */
  contextTranslation: string | null;
  /** typed cards: the blanked sentence shown as a hint while answering (null for MC) */
  contextHint: string | null;
  /** Opaque selector returned with typed answers to preserve chosen feedback. */
  contextAddedAt: number | null;
}

export function pickPracticeContext(item: BankItemRow, random: () => number = Math.random): BankContext | null {
  return pickContext(parseContexts(item.contexts, item), random);
}

practiceRoutes.get("/queue", async (c) => {
  const { userId } = c.get("session");
  const limit = clampPracticeSize(Number(c.req.query("limit")));
  const now = Date.now();

  const [dueItems, due, dueGrammar, grammarDueCount] = await Promise.all([
    getDueForPractice(userId, now, limit),
    countDueForPractice(userId, now),
    getDueGrammarForPractice(userId, now, limit),
    countDueGrammarForPractice(userId, now),
  ]);

  const candidates: Array<PracticeCard & { leakAnswers: string[] }> = [];
  for (const item of shufflePracticeCandidates(dueItems)) {
    const selectedContext = pickPracticeContext(item);
    const poolLemmas = (await getDistractorPool(userId, item.id, { pos: item.pos, isPhrase: item.isPhrase })).map(
      (d) => d.lemma,
    );

    // Words from TYPED_QUIZ_MIN_STAGE up are asked as typed recall; below that
    // (or when a safe typed card can't be built) fall back to multiple choice,
    // alternating cloze/recall for variety. The builder degrades a leaking
    // recall into a cloze and skips items it can't turn into a safe card.
    const prefer: CardType = candidates.length % 2 === 0 ? "cloze" : "recall";
    const card = buildQueueCard(
      {
        lemma: item.lemma,
        isPhrase: item.isPhrase,
        translation: item.translation,
        firstContext: selectedContext?.sentence ?? item.firstContext,
        surfaceForm: selectedContext?.surfaceForm ?? item.surfaceForm,
        contextTranslation: selectedContext?.translation ?? item.contextTranslation,
        pos: item.pos,
        storedDistractors: parseStoredDistractors(item.distractors),
        poolLemmas,
        srsStage: item.srsStage,
      },
      prefer,
    );
    if (!card) continue;

    candidates.push({
      itemId: item.id,
      grammarItemId: null,
      kind: "word",
      // A typed card is keyed by itemId and graded server-side. Sending its
      // lemma would disclose an accepted answer before the user types it.
      lemma: card.type === "typed" ? null : item.lemma,
      isPhrase: item.isPhrase,
      srsStage: item.srsStage,
      translation: card.translation,
      type: card.type,
      prompt: card.prompt,
      answer: card.answer,
      options: card.options,
      // Typed context contains an accepted surface form, so reveal it only in
      // the answer response, never in the pre-answer queue payload.
      context: card.type === "typed" ? null : card.context,
      contextTranslation: card.contextTranslation,
      contextHint: card.contextHint,
      contextAddedAt: selectedContext?.addedAt ?? null,
      leakAnswers: [item.lemma, selectedContext?.surfaceForm, item.surfaceForm, card.answer].filter(
        (term): term is string => typeof term === "string" && term.length > 0,
      ),
    });
  }

  // Grammar cards mix into the same session (design §8): MC cloze on the low
  // rungs, server-graded typed cloze from GRAMMAR_TYPED_MIN_STAGE up. The
  // builder skips anything that can't produce a leak-free card.
  for (const item of shufflePracticeCandidates(dueGrammar)) {
    const card = buildGrammarQueueCard({
      id: item.id,
      pattern: item.pattern,
      category: item.category,
      explanation: item.explanation,
      exercise: item.exercise,
      srsStage: item.srsStage,
    });
    if (!card) continue;
    candidates.push({
      itemId: null,
      grammarItemId: card.grammarItemId,
      kind: "grammar",
      category: card.category,
      pattern: card.pattern,
      explanation: card.explanation,
      lemma: null,
      isPhrase: false,
      srsStage: item.srsStage,
      translation: null,
      type: card.type,
      prompt: card.prompt,
      answer: card.answer,
      options: card.options,
      context: card.context,
      contextTranslation: null,
      contextHint: null,
      contextAddedAt: null,
      leakAnswers: card.leakAnswers,
    });
  }

  const mixed = shufflePracticeCandidates(candidates);
  const cards = protectCrossCardLeaks(mixed, limit).map(({ leakAnswers: _leakAnswers, ...card }) => card);
  return c.json({ cards, due: due + grammarDueCount });
});

practiceRoutes.post("/answer", async (c) => {
  const { userId } = c.get("session");
  const body = practiceAnswerSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw Errors.badRequest(body.error.issues[0]?.message ?? "Datos inválidos");

  // Grammar cards route by grammarItemId onto their own SRS ladder. Typed
  // grammar answers are graded server-side against the stored acceptedAnswers;
  // client retries never reach this endpoint (first attempt only).
  if (body.data.grammarItemId != null) {
    const item = await getGrammarItemById(userId, body.data.grammarItemId);
    if (!item) throw Errors.notFound("Construcción");

    let correct: boolean;
    let verdict: TypedVerdict | undefined;
    let answer: string | undefined;
    let feedbackContext: string | null = null;
    if (body.data.typedAnswer != null) {
      const exercise = parseGrammarExercise(item.exercise);
      if (!exercise) throw Errors.notFound("Construcción");
      const grade = gradeTypedAnswer(body.data.typedAnswer, exercise.acceptedAnswers);
      correct = grade.correct;
      verdict = grade.verdict;
      answer = grade.matched ?? exercise.acceptedAnswers[0];
      feedbackContext = exercise.cloze.replace(GRAMMAR_GAP, answer!);
    } else {
      correct = body.data.correct ?? false;
    }

    const user = await getUserById(userId);
    const result = await applyGrammarPracticeAnswer(
      userId,
      item.id,
      correct,
      Date.now(),
      body.data.usedHint ?? false,
      user?.timezone ?? "UTC",
    );
    if (!result) throw Errors.notFound("Construcción");
    return c.json({
      ok: true,
      srsStage: result.srsStage,
      nextDueAt: result.nextDueAt,
      status: result.status,
      advanced: result.advanced,
      // After-answer feedback: the display pattern is safe to reveal now.
      pattern: item.pattern,
      explanation: item.explanation,
      ...(verdict ? { verdict, correct, answer, context: feedbackContext, contextTranslation: null } : {}),
    });
  }

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
  let feedbackContext: string | null | undefined;
  let feedbackContextTranslation: string | null | undefined;
  if (body.data.typedAnswer != null) {
    const item = await getBankItemById(userId, itemId);
    if (!item) throw Errors.notFound("Palabra");
    const contexts = parseContexts(item.contexts, item);
    const selectedContext = contextByAddedAt(contexts, body.data.contextAddedAt) ?? contexts[0] ?? null;
    const accepted = [selectedContext?.surfaceForm, item.surfaceForm, item.lemma].filter(
      (f): f is string => typeof f === "string" && f.length > 0,
    );
    const grade = gradeTypedAnswer(body.data.typedAnswer, accepted);
    correct = grade.correct;
    verdict = grade.verdict;
    answer = grade.matched;
    feedbackContext = selectedContext?.sentence ?? item.firstContext;
    feedbackContextTranslation = selectedContext?.translation ?? item.contextTranslation;
  } else {
    correct = body.data.correct ?? false;
  }

  // The anti-farm daily cap counts days in the reader's timezone (see srs.ts).
  const user = await getUserById(userId);
  const result = await applyPracticeAnswer(
    userId,
    itemId,
    correct,
    Date.now(),
    body.data.usedHint ?? false,
    user?.timezone ?? "UTC",
    {
      cardType: body.data.typedAnswer != null ? "typed" : (body.data.cardType ?? "recall"),
      latencyMs: body.data.latencyMs,
    },
  );
  if (!result) throw Errors.notFound("Palabra");
  return c.json({
    ok: true,
    srsStage: result.srsStage,
    nextDueAt: result.nextDueAt,
    status: result.status,
    advanced: result.advanced,
    // Present only for typed answers: the grading verdict and the correct form.
    ...(verdict
      ? {
          verdict,
          correct,
          answer,
          context: feedbackContext ?? null,
          contextTranslation: feedbackContextTranslation ?? null,
        }
      : {}),
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
