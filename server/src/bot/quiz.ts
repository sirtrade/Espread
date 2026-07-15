import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import { logger } from "../lib/logger.js";
import { buildCard, parseStoredDistractors } from "../domain/practice.js";
import { contextByAddedAt, parseContexts, pickContext, type BankContext } from "../domain/contexts.js";
import {
  buildTypedQuizCard,
  gradeTypedAnswer,
  PENDING_QUIZ_TTL_MS,
  TYPED_QUIZ_MIN_STAGE,
} from "../domain/typedQuiz.js";
import {
  applyPracticeAnswer,
  getBankItemById,
  getDistractorPool,
  getRandomDueItem,
  type BankItemRow,
} from "../db/repositories/bank.js";
import { clearPendingQuiz, findUserByTgId, setPendingQuiz, type UserRow } from "../db/repositories/users.js";
import type { PracticeCardType } from "../domain/practiceAnswer.js";

const CHOICE_CALLBACK_RE = /^pq:(\d+):(?:([cr]):)?(\d+):(\d+)$/;

export interface ChoiceCallbackData {
  itemId: number;
  cardType: Exclude<PracticeCardType, "typed">;
  chosenIdx: number;
  correctIdx: number;
}

export function encodeChoiceCallback(data: ChoiceCallbackData): string {
  const typeCode = data.cardType === "cloze" ? "c" : "r";
  return `pq:${data.itemId}:${typeCode}:${data.chosenIdx}:${data.correctIdx}`;
}

/** Legacy callbacks without a type are treated as recall for compatibility. */
export function parseChoiceCallback(data: string): ChoiceCallbackData | null {
  const match = CHOICE_CALLBACK_RE.exec(data);
  if (!match) return null;
  return {
    itemId: Number(match[1]),
    cardType: match[2] === "c" ? "cloze" : "recall",
    chosenIdx: Number(match[3]),
    correctIdx: Number(match[4]),
  };
}

/**
 * Sends one vocabulary quiz to the user's chat. Words still low on the SRS
 * ladder get a multiple-choice card (recognition — low effort, fits a word
 * that was only just met); words at stage >= TYPED_QUIZ_MIN_STAGE get a
 * typed-recall question instead — the user must produce the Spanish word from
 * the translation, which is a far stronger retrieval exercise than picking it
 * out of four buttons. Returns false when the user has nothing due to
 * practice (caller then skips the lastBotQuizAt update so the next tick tries
 * again).
 */
export async function sendBotQuiz(bot: Bot, user: UserRow, random: () => number = Math.random): Promise<boolean> {
  const item = await getRandomDueItem(user.id, Date.now());
  if (!item) return false;
  const selectedContext = pickContext(parseContexts(item.contexts, item), random);

  if (item.srsStage >= TYPED_QUIZ_MIN_STAGE) {
    const sent = await sendTypedQuiz(bot, user, item, selectedContext);
    if (sent) return true;
    // No safe typed card (e.g. missing translation) — fall back to buttons.
  }

  return sendChoiceQuiz(bot, user, item, selectedContext, random);
}

/** Typed-recall quiz: translation shown, the Spanish word must be typed back. */
async function sendTypedQuiz(bot: Bot, user: UserRow, item: BankItemRow, context: BankContext | null): Promise<boolean> {
  const card = buildTypedQuizCard({
    lemma: item.lemma,
    translation: item.translation,
    firstContext: context?.sentence ?? item.firstContext,
    surfaceForm: context?.surfaceForm ?? item.surfaceForm,
  });
  if (!card) return false;

  const hint = card.contextHint ? `\n\n${card.contextHint}` : "";
  const question = `✍️ Escribe en español:\n\n«${card.prompt}»${hint}`;

  // No parse_mode: article sentences may contain characters Markdown chokes on.
  await bot.api.sendMessage(user.tgUserId, question, {
    reply_markup: { force_reply: true, input_field_placeholder: "Tu respuesta..." },
  });
  await setPendingQuiz(user.id, item.id, Date.now(), context?.addedAt ?? null);
  return true;
}

/** Multiple-choice quiz (cloze or recall) over inline keyboard buttons. */
async function sendChoiceQuiz(
  bot: Bot,
  user: UserRow,
  item: BankItemRow,
  context: BankContext | null,
  random: () => number,
): Promise<boolean> {
  const poolLemmas = (await getDistractorPool(user.id, item.id, { pos: item.pos, isPhrase: item.isPhrase })).map(
    (d) => d.lemma,
  );

  const card = buildCard({
    lemma: item.lemma,
    isPhrase: item.isPhrase,
    translation: item.translation,
    firstContext: context?.sentence ?? item.firstContext,
    surfaceForm: context?.surfaceForm ?? item.surfaceForm,
    contextTranslation: context?.translation ?? item.contextTranslation,
    pos: item.pos,
    storedDistractors: parseStoredDistractors(item.distractors),
    poolLemmas,
  }, "cloze", random);
  // Nothing safely quizzable (no context/translation or too few distractors):
  // skip so the caller retries with another item on the next tick.
  if (!card) return false;

  const correctIdx = card.options.indexOf(card.answer);

  const question =
    card.type === "cloze"
      ? `🧠 Completa la frase:\n\n${card.prompt}`
      : `🧠 ¿Cómo se dice en español?\n\n«${card.prompt}»`;

  const kb = new InlineKeyboard();
  card.options.forEach((opt, idx) => {
    // Persist the server-built MC type in callback_data (well under Telegram's
    // 64-byte limit); never infer it from user-controlled button text.
    kb.text(
      opt,
      encodeChoiceCallback({ itemId: item.id, cardType: card.type, chosenIdx: idx, correctIdx }),
    ).row();
  });

  await bot.api.sendMessage(user.tgUserId, question, { reply_markup: kb });
  return true;
}

/** "lemma — translation" feedback line shown after any answer. */
function answerLineFor(item: BankItemRow, form = item.lemma): string {
  return item.translation ? `${form} — ${item.translation}` : form;
}

export function registerQuizHandlers(bot: Bot): void {
  // The optional type segment keeps already-sent legacy buttons valid.
  bot.callbackQuery(CHOICE_CALLBACK_RE, async (ctx) => {
    const callback = parseChoiceCallback(ctx.callbackQuery.data)!;
    const { itemId, cardType } = callback;
    const correct = callback.chosenIdx === callback.correctIdx;

    const user = ctx.from ? await findUserByTgId(ctx.from.id) : undefined;
    if (!user) {
      await ctx.answerCallbackQuery({ text: "Usuario no encontrado" });
      return;
    }

    const item = await getBankItemById(user.id, itemId);
    await applyPracticeAnswer(user.id, itemId, correct, Date.now(), false, user.timezone, {
      cardType,
      latencyMs: null,
    });

    await ctx.answerCallbackQuery({ text: correct ? "✅ ¡Correcto!" : "❌ Casi..." });

    const answerLine = item ? answerLineFor(item) : "";
    const original = ctx.callbackQuery.message?.text ?? "";
    const verdict = correct ? "✅ ¡Correcto!" : "❌ La respuesta correcta era:";
    // Replace the keyboard with the outcome so the quiz can't be answered twice.
    await ctx
      .editMessageText(`${original}\n\n${verdict}\n${answerLine}`.trim())
      .catch((err) => logger.warn({ err }, "Failed to edit quiz message"));
  });

  // Free-text answers to typed quizzes. Anything that isn't one — commands,
  // texts with no pending quiz, expired pendings — is passed down the
  // middleware chain untouched.
  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return next();

    const user = ctx.from ? await findUserByTgId(ctx.from.id) : undefined;
    if (!user?.pendingQuizItemId || !user.pendingQuizSentAt) return next();

    if (Date.now() - user.pendingQuizSentAt > PENDING_QUIZ_TTL_MS) {
      await clearPendingQuiz(user.id);
      return next();
    }

    const item = await getBankItemById(user.id, user.pendingQuizItemId);
    await clearPendingQuiz(user.id);
    if (!item) return next();

    const contexts = parseContexts(item.contexts, item);
    const selectedContext = contextByAddedAt(contexts, user.pendingQuizContextAddedAt) ?? contexts[0] ?? null;
    const accepted = [selectedContext?.surfaceForm, item.surfaceForm, item.lemma].filter((f): f is string => !!f);
    const grade = gradeTypedAnswer(text, accepted);
    await applyPracticeAnswer(user.id, item.id, grade.correct, Date.now(), false, user.timezone, {
      cardType: "typed",
      latencyMs: null,
    });

    const answerLine = answerLineFor(item, grade.matched);
    const feedbackContext = selectedContext?.sentence ?? item.firstContext;
    const contextLine = feedbackContext ? `\n\n${feedbackContext}` : "";
    let verdict: string;
    if (grade.verdict === "exact") {
      verdict = "✅ ¡Correcto!";
    } else if (grade.verdict === "spelling") {
      verdict = `✅ ¡Correcto! Ojo con la ortografía: «${grade.matched}»`;
    } else {
      verdict = "❌ La respuesta correcta era:";
    }
    await ctx.reply(`${verdict}\n${answerLine}${contextLine}`);
  });
}
