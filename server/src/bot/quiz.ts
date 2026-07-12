import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import { logger } from "../lib/logger.js";
import { buildClozeCard, buildOptions, parseStoredDistractors } from "../domain/practice.js";
import {
  applyPracticeAnswer,
  getBankItemById,
  getDistractorPool,
  getRandomDueItem,
} from "../db/repositories/bank.js";
import { findUserByTgId, type UserRow } from "../db/repositories/users.js";

/**
 * Sends one multiple-choice vocabulary quiz to the user's chat. Returns
 * false when the user has nothing due to practice (caller then skips the
 * lastBotQuizAt update so the next tick tries again).
 */
export async function sendBotQuiz(bot: Bot, user: UserRow): Promise<boolean> {
  const item = await getRandomDueItem(user.id, Date.now());
  if (!item) return false;

  const pool = [
    ...parseStoredDistractors(item.distractors),
    ...(await getDistractorPool(user.id, item.id)).map((d) => d.lemma),
  ];

  const cloze = buildClozeCard(item.firstContext, item.lemma, item.surfaceForm);
  const answer = cloze ? cloze.answer : item.lemma;
  const options = buildOptions(answer, pool);
  const correctIdx = options.findIndex((o) => o === answer);

  const question = cloze
    ? `🧠 Completa la frase:\n\n${cloze.prompt}`
    : `🧠 ¿Cómo se dice en español?\n\n«${item.translation ?? item.lemma}»`;

  const kb = new InlineKeyboard();
  options.forEach((opt, idx) => {
    // Answers carry only ids/indexes: callback_data is limited to 64 bytes.
    kb.text(opt, `pq:${item.id}:${idx}:${correctIdx}`).row();
  });

  await bot.api.sendMessage(user.tgUserId, question, { reply_markup: kb });
  return true;
}

export function registerQuizHandlers(bot: Bot): void {
  bot.callbackQuery(/^pq:(\d+):(\d+):(\d+)$/, async (ctx) => {
    const [, itemIdStr, chosenStr, correctStr] = ctx.match!;
    const itemId = Number(itemIdStr);
    const correct = chosenStr === correctStr;

    const user = ctx.from ? await findUserByTgId(ctx.from.id) : undefined;
    if (!user) {
      await ctx.answerCallbackQuery({ text: "Usuario no encontrado" });
      return;
    }

    const item = await getBankItemById(user.id, itemId);
    await applyPracticeAnswer(user.id, itemId, correct);

    await ctx.answerCallbackQuery({ text: correct ? "✅ ¡Correcto!" : "❌ Casi..." });

    const answerLine = item
      ? `${item.lemma}${item.translation ? ` — ${item.translation}` : ""}`
      : "";
    const original = ctx.callbackQuery.message?.text ?? "";
    const verdict = correct ? "✅ ¡Correcto!" : "❌ La respuesta correcta era:";
    // Replace the keyboard with the outcome so the quiz can't be answered twice.
    await ctx
      .editMessageText(`${original}\n\n${verdict}\n${answerLine}`.trim())
      .catch((err) => logger.warn({ err }, "Failed to edit quiz message"));
  });
}
