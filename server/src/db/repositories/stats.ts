import { eq, sql } from "drizzle-orm";
import { db } from "../client.js";
import { userStats } from "../schema.js";

export async function incrementArticlesRead(userId: number): Promise<void> {
  await db
    .update(userStats)
    .set({ articlesRead: sql`${userStats.articlesRead} + 1` })
    .where(eq(userStats.userId, userId));
}

export async function incrementItemsLearned(userId: number, delta: number): Promise<void> {
  if (delta <= 0) return;
  await db
    .update(userStats)
    .set({ itemsLearned: sql`${userStats.itemsLearned} + ${delta}` })
    .where(eq(userStats.userId, userId));
}

export async function getUserStats(userId: number) {
  return db.query.userStats.findFirst({ where: eq(userStats.userId, userId) });
}
