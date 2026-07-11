import { eq, sql } from "drizzle-orm";
import { db } from "../client.js";
import { articles, bankItems, readingSessions, userStats } from "../schema.js";
import type { BankItemRecord } from "../../domain/bank.js";

/**
 * Applies a finished reading session in a single transaction: bank upserts,
 * stats counters, session archive onto the article row, and the session
 * delete land together or not at all, so a crash mid-way can't double-apply
 * the review (exposures/streaks) on retry.
 */
export async function applyCompletion(params: {
  userId: number;
  sessionId: number;
  articleId: number;
  markedWords: string;
  markedSents: string;
  reviewResult: string;
  changedItems: readonly BankItemRecord[];
  newlyLearnedCount: number;
}): Promise<void> {
  const now = Date.now();
  db.transaction((trx) => {
    for (const item of params.changedItems) {
      trx
        .insert(bankItems)
        .values({
          userId: params.userId,
          term: item.term,
          isPhrase: item.isPhrase,
          status: item.status,
          exposures: item.exposures,
          cleanStreak: item.cleanStreak,
          translation: item.translation,
          firstContext: item.firstContext,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [bankItems.userId, bankItems.term],
          set: {
            status: item.status,
            exposures: item.exposures,
            cleanStreak: item.cleanStreak,
            translation: item.translation,
            updatedAt: now,
          },
        })
        .run();
    }

    trx
      .update(userStats)
      .set({
        articlesRead: sql`${userStats.articlesRead} + 1`,
        itemsLearned: sql`${userStats.itemsLearned} + ${params.newlyLearnedCount}`,
      })
      .where(eq(userStats.userId, params.userId))
      .run();

    trx
      .update(articles)
      .set({
        markedWords: params.markedWords,
        markedSents: params.markedSents,
        reviewResult: params.reviewResult,
        readAt: now,
      })
      .where(eq(articles.id, params.articleId))
      .run();

    trx.delete(readingSessions).where(eq(readingSessions.id, params.sessionId)).run();
  });
}
