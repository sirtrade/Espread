import { eq, sql } from "drizzle-orm";
import { db } from "../client.js";
import { bankItems, readingSessions, userStats } from "../schema.js";
import type { BankItemRecord } from "../../domain/bank.js";

/**
 * Applies a finished reading session in a single transaction: bank upserts,
 * stats counters, and the session delete land together or not at all, so a
 * crash mid-way can't double-apply the review (exposures/streaks) on retry.
 */
export async function applyCompletion(params: {
  userId: number;
  sessionId: number;
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

    trx.delete(readingSessions).where(eq(readingSessions.id, params.sessionId)).run();
  });
}
