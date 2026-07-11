import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../client.js";
import { articles } from "../schema.js";

export type ArticleRow = typeof articles.$inferSelect;

export async function createArticle(params: {
  userId: number;
  title: string;
  body: string;
  topic: string;
  sourceName: string | null;
  sourceUrl: string | null;
  targetTerms: string[];
  prefetched?: boolean;
}): Promise<ArticleRow> {
  const [row] = await db
    .insert(articles)
    .values({
      userId: params.userId,
      title: params.title,
      body: params.body,
      topic: params.topic,
      sourceName: params.sourceName,
      sourceUrl: params.sourceUrl,
      targetTerms: JSON.stringify(params.targetTerms),
      prefetched: params.prefetched ?? false,
    })
    .returning();
  if (!row) throw new Error("Failed to create article");
  return row;
}

export async function getRecentTopics(userId: number, limit = 2): Promise<string[]> {
  const rows = await db.query.articles.findMany({
    where: eq(articles.userId, userId),
    orderBy: [desc(articles.createdAt)],
    limit,
    columns: { topic: true },
  });
  return rows.map((r) => r.topic);
}

export async function getUnconsumedPrefetchedArticle(userId: number): Promise<ArticleRow | undefined> {
  return db.query.articles.findFirst({
    where: and(eq(articles.userId, userId), eq(articles.prefetched, true), eq(articles.consumed, false)),
    orderBy: [desc(articles.createdAt)],
  });
}

export async function markArticleConsumed(articleId: number): Promise<void> {
  await db.update(articles).set({ consumed: true }).where(eq(articles.id, articleId));
}

export async function getArticleById(articleId: number): Promise<ArticleRow | undefined> {
  return db.query.articles.findFirst({ where: eq(articles.id, articleId) });
}

export interface ReadArticleSummary {
  id: number;
  title: string;
  topic: string;
  readAt: number | null;
  markedWords: string;
  markedSents: string;
}

/** Completed readings, newest first, for the history screen. */
export async function listReadArticles(
  userId: number,
  limit: number,
  offset: number,
): Promise<{ items: ReadArticleSummary[]; total: number }> {
  const where = and(eq(articles.userId, userId), isNotNull(articles.readAt));
  const [items, [count]] = await Promise.all([
    db.query.articles.findMany({
      where,
      orderBy: [desc(articles.readAt)],
      limit,
      offset,
      columns: { id: true, title: true, topic: true, readAt: true, markedWords: true, markedSents: true },
    }),
    db.select({ total: sql<number>`count(*)` }).from(articles).where(where),
  ]);
  return { items, total: count?.total ?? 0 };
}
