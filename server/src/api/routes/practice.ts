import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../../lib/config.js";
import { Errors } from "../errors.js";
import {
  applyPracticeAnswer,
  countDueForPractice,
  getBankItemById,
  getDistractorPool,
  getDueForPractice,
} from "../../db/repositories/bank.js";
import { getUserById } from "../../db/repositories/users.js";
import { countRecentCalls } from "../../db/repositories/llmCalls.js";
import { buildCloze, buildOptions } from "../../domain/practice.js";
import { checkPracticeSentence } from "../../llm/sentenceCheck.js";
import { practiceAnswerSchema, practiceSentenceSchema } from "../validation.js";
import type { AppEnv } from "../context.js";

export const practiceRoutes = new Hono<AppEnv>();

practiceRoutes.use("*", requireAuth);

export interface PracticeCard {
  itemId: number;
  term: string;
  isPhrase: boolean;
  translation: string | null;
  /** "cloze": fill the blank in the original context; "recall": pick the term for a translation. */
  type: "cloze" | "recall";
  prompt: string;
  options: string[];
}

practiceRoutes.get("/queue", async (c) => {
  const { userId } = c.get("session");
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 10, 1), 30);
  const now = Date.now();

  const [dueItems, due] = await Promise.all([getDueForPractice(userId, now, limit), countDueForPractice(userId, now)]);

  const cards: PracticeCard[] = [];
  for (const item of dueItems) {
    // Options are always Spanish terms (recall direction), so distractors
    // work regardless of the user's explanation language.
    const pool = (await getDistractorPool(userId, item.id)).map((d) => d.term);
    const options = buildOptions(item.term, pool);

    const cloze = item.firstContext ? buildCloze(item.firstContext, item.term) : null;
    if (cloze) {
      cards.push({
        itemId: item.id,
        term: item.term,
        isPhrase: item.isPhrase,
        translation: item.translation,
        type: "cloze",
        prompt: cloze,
        options,
      });
    } else if (item.translation) {
      cards.push({
        itemId: item.id,
        term: item.term,
        isPhrase: item.isPhrase,
        translation: item.translation,
        type: "recall",
        prompt: item.translation,
        options,
      });
    }
    // Items with neither a usable context nor a translation are skipped —
    // there is nothing to build a question from.
  }

  return c.json({ cards, due });
});

practiceRoutes.post("/answer", async (c) => {
  const { userId } = c.get("session");
  const body = practiceAnswerSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw Errors.badRequest(body.error.issues[0]?.message ?? "Datos inválidos");

  const item = await applyPracticeAnswer(userId, body.data.itemId, body.data.correct);
  if (!item) throw Errors.notFound("Palabra");
  return c.json({ ok: true, practiceStage: item.practiceStage, nextPracticeAt: item.nextPracticeAt });
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
    term: item.term,
    translation: item.translation,
    sentence: body.data.sentence,
  });
  return c.json(result);
});
