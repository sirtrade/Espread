import { normalizeTerm } from "../domain/normalize.js";
import { applyReviewToBank, type ReviewedItem } from "../domain/bank.js";
import { reviewMarkedItems } from "../llm/review.js";
import { reviewSchema, type ReviewResult } from "../llm/schemas.js";
import { config } from "../lib/config.js";
import { Errors } from "../api/errors.js";
import { getArticleById } from "../db/repositories/articles.js";
import { getUserById } from "../db/repositories/users.js";
import { getBankItemsMap, upsertBankState } from "../db/repositories/bank.js";
import { countRecentCalls } from "../db/repositories/llmCalls.js";
import { getUserStats, incrementArticlesRead, incrementItemsLearned } from "../db/repositories/stats.js";
import { deleteSession, getActiveSession, setSessionReviewed } from "../db/repositories/sessions.js";

export async function reviewSession(userId: number): Promise<ReviewResult> {
  const session = await getActiveSession(userId);
  if (!session) throw Errors.notFound("Sesión de lectura");

  if (session.state === "reviewed" && session.reviewResult) {
    return reviewSchema.parse(JSON.parse(session.reviewResult));
  }

  const count = await countRecentCalls(userId, "review");
  if (count >= config.DAILY_REVIEW_LIMIT) {
    throw Errors.rateLimited(`Alcanzaste el límite diario de ${config.DAILY_REVIEW_LIMIT} análisis. Vuelve mañana.`);
  }

  const [article, user] = await Promise.all([getArticleById(session.articleId), getUserById(userId)]);
  if (!article || !user) throw Errors.notFound("Artículo o usuario");

  const markedWords = [...new Set((JSON.parse(session.markedWords) as string[]).map(normalizeTerm).filter(Boolean))];
  const markedSents = [...new Set((JSON.parse(session.markedSents) as string[]).map((s) => s.trim()).filter(Boolean))];

  const result = await reviewMarkedItems({
    userId,
    articleTitle: article.title,
    articleBody: article.body,
    level: user.level,
    explainLang: user.explainLang,
    markedWords,
    markedSents,
  });

  await setSessionReviewed(session.id, result);
  return result;
}

export interface CompleteResult {
  newlyLearned: string[];
  articlesRead: number;
}

export async function completeSession(userId: number): Promise<CompleteResult> {
  const session = await getActiveSession(userId);
  if (!session) throw Errors.notFound("Sesión de lectura");
  if (session.state !== "reviewed" || !session.reviewResult) {
    throw Errors.badRequest("La sesión aún no fue analizada. Llama a /session/review primero.");
  }

  const article = await getArticleById(session.articleId);
  if (!article) throw Errors.notFound("Artículo");

  const review = reviewSchema.parse(JSON.parse(session.reviewResult));
  const exposedTerms: string[] = JSON.parse(article.targetTerms);
  const context = article.body.slice(0, 200);

  const reviewedItems: ReviewedItem[] = [
    ...review.words.map((w) => ({
      term: normalizeTerm(w.term),
      isPhrase: false,
      translation: w.translation,
      frequency: w.frequency,
      context,
    })),
    ...review.phrases
      .filter((p) => p.clave)
      .map((p) => ({
        term: normalizeTerm(p.clave as string),
        isPhrase: true,
        translation: p.explanation,
        frequency: "alta" as const,
        context,
      })),
  ];

  const before = await getBankItemsMap(userId);
  const after = applyReviewToBank(before, exposedTerms, reviewedItems);
  await upsertBankState(userId, after);

  const newlyLearned = [...after.values()]
    .filter((item) => item.status === "learned" && before.get(item.term)?.status !== "learned")
    .map((item) => item.term);

  await incrementArticlesRead(userId);
  if (newlyLearned.length > 0) await incrementItemsLearned(userId, newlyLearned.length);
  await deleteSession(userId);

  const stats = await getUserStats(userId);
  return { newlyLearned, articlesRead: stats?.articlesRead ?? 0 };
}
