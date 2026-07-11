import { eq } from "drizzle-orm";
import { db } from "../client.js";
import { userStats } from "../schema.js";

export async function getUserStats(userId: number) {
  return db.query.userStats.findFirst({ where: eq(userStats.userId, userId) });
}

export async function setLastLearnedDigestAt(userId: number, atMs: number): Promise<void> {
  await db.update(userStats).set({ lastLearnedDigestAt: atMs }).where(eq(userStats.userId, userId));
}
