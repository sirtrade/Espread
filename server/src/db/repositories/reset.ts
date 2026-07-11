import { eq } from "drizzle-orm";
import { db } from "../client.js";
import { articles, bankItems, readingSessions, userStats } from "../schema.js";

/** Wipes a user's reading/vocabulary progress: bank, articles (cascades sessions), and stats counters. */
export async function resetUserProgress(userId: number): Promise<void> {
  db.transaction((trx) => {
    trx.delete(readingSessions).where(eq(readingSessions.userId, userId)).run();
    trx.delete(bankItems).where(eq(bankItems.userId, userId)).run();
    trx.delete(articles).where(eq(articles.userId, userId)).run();
    trx
      .update(userStats)
      .set({ articlesRead: 0, itemsLearned: 0, lastLearnedDigestAt: null })
      .where(eq(userStats.userId, userId))
      .run();
  });
}
