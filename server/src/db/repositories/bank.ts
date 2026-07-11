import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../client.js";
import { bankItems } from "../schema.js";
import type { BankItemRecord, BankStatus } from "../../domain/bank.js";

export type BankItemRow = typeof bankItems.$inferSelect;

export async function getBankItemsMap(userId: number): Promise<Map<string, BankItemRecord>> {
  const rows = await db.query.bankItems.findMany({ where: eq(bankItems.userId, userId) });
  return new Map(
    rows.map((r) => [
      r.term,
      {
        term: r.term,
        isPhrase: r.isPhrase,
        status: r.status,
        exposures: r.exposures,
        cleanStreak: r.cleanStreak,
        translation: r.translation,
        firstContext: r.firstContext,
      },
    ]),
  );
}

export async function getBankItems(userId: number, status?: BankStatus): Promise<BankItemRow[]> {
  return db.query.bankItems.findMany({
    where: status ? and(eq(bankItems.userId, userId), eq(bankItems.status, status)) : eq(bankItems.userId, userId),
    orderBy: (t, { desc }) => [desc(t.updatedAt)],
  });
}

export async function getActiveItemsForSelection(
  userId: number,
): Promise<Array<{ term: string; exposures: number }>> {
  const rows = await db.query.bankItems.findMany({
    where: and(eq(bankItems.userId, userId), eq(bankItems.status, "active")),
    columns: { term: true, exposures: true },
  });
  return rows;
}

export async function setBankItemStatus(userId: number, itemId: number, status: BankStatus): Promise<BankItemRow | undefined> {
  const [row] = await db
    .update(bankItems)
    // A manual status change is a fresh start for the learning counter.
    .set({ status, cleanStreak: 0, updatedAt: Date.now() })
    .where(and(eq(bankItems.userId, userId), eq(bankItems.id, itemId)))
    .returning();
  return row;
}

export async function getLearnedSince(userId: number, sinceMs: number): Promise<BankItemRow[]> {
  return db.query.bankItems.findMany({
    where: and(eq(bankItems.userId, userId), eq(bankItems.status, "learned"), gte(bankItems.updatedAt, sinceMs)),
  });
}

export async function countBankByStatus(userId: number, status: BankStatus): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bankItems)
    .where(and(eq(bankItems.userId, userId), eq(bankItems.status, status)));
  return row?.count ?? 0;
}
