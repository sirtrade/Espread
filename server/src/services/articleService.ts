import { pickTopic } from "../domain/topicRotation.js";
import { selectTargetTerms } from "../domain/bank.js";
import { verifyWovenTerms } from "../domain/weaving.js";
import { normalizeArticleLemmas } from "../domain/knownWords.js";
import { generateArticle } from "../llm/articleGeneration.js";
import { config } from "../lib/config.js";
import { withUserLock } from "../lib/locks.js";
import { Errors } from "../api/errors.js";
import { getUserById } from "../db/repositories/users.js";
import { getUserTopics } from "../db/repositories/topics.js";
import {
  createArticle,
  getArticleById,
  getRecentTopics,
  getUnconsumedPrefetchedArticle,
  markArticleConsumed,
  type ArticleRow,
} from "../db/repositories/articles.js";
import { getActiveItemsForSelection } from "../db/repositories/bank.js";
import { countRecentCalls } from "../db/repositories/llmCalls.js";
import { createSession, getActiveSession, type SessionRow } from "../db/repositories/sessions.js";

export async function generateFreshArticle(userId: number, prefetched = false): Promise<ArticleRow> {
  const user = await getUserById(userId);
  if (!user) throw new Error("User not found");

  const topics = await getUserTopics(userId);
  if (topics.length === 0) throw Errors.badRequest("No hay temas configurados en tu perfil");

  const recentTopics = await getRecentTopics(userId, 2);
  const topic = pickTopic(topics, recentTopics);

  const activeItems = await getActiveItemsForSelection(userId);
  // Candidates we ASK the model to weave in (dosed). What it actually uses is
  // re-verified below, so a skipped candidate stays due for a later article.
  const candidateTerms = selectTargetTerms(activeItems, Date.now());

  const generated = await generateArticle({ userId, level: user.level, topic, targetTerms: candidateTerms });

  const wovenTerms = verifyWovenTerms(candidateTerms, generated.body, generated.usedTerms);
  const lemmas = normalizeArticleLemmas(generated.lemmas, generated.body);

  return createArticle({
    userId,
    title: generated.title,
    body: generated.body,
    topic,
    sourceName: generated.sourceName,
    sourceUrl: generated.sourceUrl,
    targetTerms: wovenTerms,
    lemmas,
    prefetched,
  });
}

/**
 * Resolves what the user should read next (TZ /articles: "учитывает
 * пре-генерированную, если есть"): an already-active session wins, then an
 * unconsumed pre-generated article, then a fresh (rate-limited) generation.
 */
export async function startReading(userId: number): Promise<{ article: ArticleRow; session: SessionRow }> {
  // Same lock key as review/complete: a double-tap on "Nueva lectura" must
  // not generate (and pay for) two articles racing for the one active session.
  return withUserLock(`session:${userId}`, () => startReadingLocked(userId));
}

async function startReadingLocked(userId: number): Promise<{ article: ArticleRow; session: SessionRow }> {
  const active = await getActiveSession(userId);
  if (active) {
    const article = await getArticleById(active.articleId);
    if (!article) throw new Error("Article for active session not found");
    return { article, session: active };
  }

  const prefetched = await getUnconsumedPrefetchedArticle(userId);
  if (prefetched) {
    await markArticleConsumed(prefetched.id);
    const session = await createSession(userId, prefetched.id);
    return { article: prefetched, session };
  }

  const count = await countRecentCalls(userId, "generate");
  if (count >= config.DAILY_ARTICLE_LIMIT) {
    throw Errors.rateLimited(
      `Alcanzaste el límite diario de ${config.DAILY_ARTICLE_LIMIT} lecturas generadas. Vuelve mañana.`,
    );
  }

  const article = await generateFreshArticle(userId, false);
  const session = await createSession(userId, article.id);
  return { article, session };
}
