import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client.js";
import { grammarItems } from "../schema.js";
import { queuedPromotionCount } from "../../domain/bank.js";
import type { GrammarStatus } from "../../domain/grammarLifecycle.js";

export type GrammarItemRow = typeof grammarItems.$inferSelect;

export async function listGrammarItems(userId: number, status?: GrammarStatus): Promise<GrammarItemRow[]> {
  return db.query.grammarItems.findMany({
    where: status
      ? and(eq(grammarItems.userId, userId), eq(grammarItems.status, status))
      : eq(grammarItems.userId, userId),
    orderBy: [asc(grammarItems.createdAt), asc(grammarItems.id)],
  });
}

export async function getGrammarItemsByKeys(userId: number, keys: readonly string[]): Promise<GrammarItemRow[]> {
  if (keys.length === 0) return [];
  return db.query.grammarItems.findMany({
    where: and(eq(grammarItems.userId, userId), inArray(grammarItems.canonicalKey, [...keys])),
  });
}

export async function countGrammarByStatus(userId: number, status: GrammarStatus): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(grammarItems)
    .where(and(eq(grammarItems.userId, userId), eq(grammarItems.status, status)));
  return row?.count ?? 0;
}

/**
 * Promotes the oldest queued grammar units into free active slots (FIFO),
 * mirroring the lexical `rebalanceActivePool` but on the independent grammar
 * pool. Idempotent; never demotes. Returns the promoted canonical keys.
 */
export async function rebalanceGrammarPool(userId: number, poolLimit: number): Promise<string[]> {
  const [activeCount, queuedCount] = await Promise.all([
    countGrammarByStatus(userId, "active"),
    countGrammarByStatus(userId, "queued"),
  ]);
  const promote = queuedPromotionCount(activeCount, queuedCount, poolLimit);
  if (promote <= 0) return [];

  const oldest = await db.query.grammarItems.findMany({
    where: and(eq(grammarItems.userId, userId), eq(grammarItems.status, "queued")),
    orderBy: [asc(grammarItems.createdAt), asc(grammarItems.id)],
    limit: promote,
  });
  if (oldest.length === 0) return [];

  await db
    .update(grammarItems)
    .set({ status: "active", updatedAt: Date.now() })
    .where(
      inArray(
        grammarItems.id,
        oldest.map((row) => row.id),
      ),
    );
  return oldest.map((row) => row.canonicalKey);
}
