import { normalizeTerm } from "../domain/normalize.js";
import { findTermContext } from "../domain/context.js";
import { applyReviewToBank, type BankItemRecord, type ReviewedItem } from "../domain/bank.js";
import { reviewMarkedItems } from "../llm/review.js";
import { reviewSchema, type ReviewResult } from "../llm/schemas.js";
import { config } from "../lib/config.js";
import { withUserLock } from "../lib/locks.js";
import { Errors } from "../api/errors.js";
import { getArticleById } from "../db/repositories/articles.js";
import { getUserById } from "../db/repositories/users.js";
import { getBankItemsMap } from "../db/repositories/bank.js";
import { applyCompletion } from "../db/repositories/completion.js";
import { countRecentCalls } from "../db/repositories/llmCalls.js";
import { getUserStats } from "../db/repositories/stats.js";
import { getActiveSession, setSessionReviewed } from "../db/repositories/sessions.js";

export async function reviewSession(userId: number): Promise<ReviewResult> {
  return withUserLock(`session:${userId}`, async () => {
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
  });
}

export interface CompleteResult {
  newlyLearned: string[];
  articlesRead: number;
}

function bankItemDiffers(before: BankItemRecord | undefined, after: BankItemRecord): boolean {
  if (!before) return true;
  return (
    before.status !== after.status ||
    before.exposures !== after.exposures ||
    before.cleanStreak !== after.cleanStreak ||
    before.translation !== after.translation
  );
}

export async function completeSession(userId: number): Promise<CompleteResult> {
  return withUserLock(`session:${userId}`, async () => {
    const session = await getActiveSession(userId);
    if (!session) throw Errors.notFound("Sesión de lectura");
    if (session.state !== "reviewed" || !session.reviewResult) {
      throw Errors.badRequest("La sesión aún no fue analizada. Llama a /session/review primero.");
    }

    const article = await getArticleById(session.articleId);
    if (!article) throw Errors.notFound("Artículo");

    const review = reviewSchema.parse(JSON.parse(session.reviewResult));
    const exposedTerms: string[] = JSON.parse(article.targetTerms);
    const fallbackContext = article.body.slice(0, 200);
    const contextFor = (term: string) => findTermContext(article.body, term) ?? fallbackContext;

    const reviewedItems: ReviewedItem[] = [
      ...review.words.map((w) => {
        const term = normalizeTerm(w.term);
        return {
          term,
          isPhrase: false,
          translation: w.translation,
          frequency: w.frequency,
          context: contextFor(term),
        };
      }),
      ...review.phrases
        .filter((p) => p.clave)
        .map((p) => {
          const term = normalizeTerm(p.clave as string);
          return {
            term,
            isPhrase: true,
            translation: p.explanation,
            frequency: "alta" as const,
            context: contextFor(term),
          };
        }),
    ];

    const before = await getBankItemsMap(userId);
    const after = applyReviewToBank(before, exposedTerms, reviewedItems);

    // Only rows that actually changed get written — a completion typically
    // touches a handful of terms, not the user's whole bank.
    const changedItems = [...after.values()].filter((item) => bankItemDiffers(before.get(item.term), item));

    const newlyLearned = changedItems
      .filter((item) => item.status === "learned" && before.get(item.term)?.status !== "learned")
      .map((item) => item.term);

    await applyCompletion({
      userId,
      sessionId: session.id,
      articleId: article.id,
      markedWords: session.markedWords,
      markedSents: session.markedSents,
      reviewResult: session.reviewResult,
      changedItems,
      newlyLearnedCount: newlyLearned.length,
    });

    const stats = await getUserStats(userId);
    return { newlyLearned, articlesRead: stats?.articlesRead ?? 0 };
  });
}
