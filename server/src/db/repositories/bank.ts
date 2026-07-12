import { and, asc, eq, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "../client.js";
import { bankItems } from "../schema.js";
import type { BankItemRecord, BankStatus } from "../../domain/bank.js";
import { nextPracticeState } from "../../domain/practice.js";

export type BankItemRow = typeof bankItems.$inferSelect;

export async function getBankItemsMap(userId: number): Promise<Map<string, BankItemRecord>> {
  const rows = await db.query.bankItems.findMany({ where: eq(bankItems.userId, userId) });
  return new Map(
    rows.map((r) => [
      r.lemma,
      {
        lemma: r.lemma,
        isPhrase: r.isPhrase,
        status: r.status,
        exposures: r.exposures,
        cleanStreak: r.cleanStreak,
        translation: r.translation,
        firstContext: r.firstContext,
        surfaceForm: r.surfaceForm,
        pos: r.pos,
        gender: r.gender,
        note: r.note,
        contextTranslation: r.contextTranslation,
        distractors: r.distractors,
        freqBand: r.freqBand,
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
): Promise<Array<{ lemma: string; exposures: number }>> {
  const rows = await db.query.bankItems.findMany({
    where: and(eq(bankItems.userId, userId), eq(bankItems.status, "active")),
    columns: { lemma: true, exposures: true },
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

function dueForPracticeWhere(userId: number, now: number) {
  return and(
    eq(bankItems.userId, userId),
    eq(bankItems.status, "active"),
    or(isNull(bankItems.nextPracticeAt), lte(bankItems.nextPracticeAt, now)),
  );
}

/** Active items whose spaced-repetition timer has expired (or never started). */
export async function getDueForPractice(userId: number, now: number, limit: number): Promise<BankItemRow[]> {
  return db.query.bankItems.findMany({
    where: dueForPracticeWhere(userId, now),
    // Nulls (never practiced) sort first in SQLite ASC — new words come first.
    orderBy: [asc(bankItems.nextPracticeAt)],
    limit,
  });
}

export async function countDueForPractice(userId: number, now: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bankItems)
    .where(dueForPracticeWhere(userId, now));
  return row?.count ?? 0;
}

/** Applies a practice answer to the SRS state. Never touches status/cleanStreak. */
export async function applyPracticeAnswer(
  userId: number,
  itemId: number,
  correct: boolean,
  now = Date.now(),
): Promise<BankItemRow | undefined> {
  const item = await db.query.bankItems.findFirst({
    where: and(eq(bankItems.userId, userId), eq(bankItems.id, itemId)),
  });
  if (!item) return undefined;

  const next = nextPracticeState(item.practiceStage, correct, now);
  const [row] = await db.update(bankItems).set(next).where(eq(bankItems.id, itemId)).returning();
  return row;
}

export async function getBankItemById(userId: number, itemId: number): Promise<BankItemRow | undefined> {
  return db.query.bankItems.findFirst({ where: and(eq(bankItems.userId, userId), eq(bankItems.id, itemId)) });
}

/** Random terms from the user's other bank items, used as quiz distractors. */
export async function getDistractorPool(userId: number, excludeItemId: number, limit = 12): Promise<BankItemRow[]> {
  return db.query.bankItems.findMany({
    where: and(eq(bankItems.userId, userId), ne(bankItems.id, excludeItemId)),
    orderBy: sql`random()`,
    limit,
  });
}

/** A random due item plus distractors, for the in-chat bot quiz. */
export async function getRandomDueItem(userId: number, now: number): Promise<BankItemRow | undefined> {
  const [row] = await db.query.bankItems.findMany({
    where: dueForPracticeWhere(userId, now),
    orderBy: sql`random()`,
    limit: 1,
  });
  return row;
}

/** Legacy rows (created before the lemma migration) whose card fields are still empty. */
export async function getUnenrichedItems(limit: number): Promise<BankItemRow[]> {
  return db.query.bankItems.findMany({
    where: or(isNull(bankItems.pos), isNull(bankItems.freqBand)),
    orderBy: [asc(bankItems.id)],
    limit,
  });
}

export async function countUnenrichedItems(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bankItems)
    .where(or(isNull(bankItems.pos), isNull(bankItems.freqBand)));
  return row?.count ?? 0;
}

export async function updateBankItemFields(
  itemId: number,
  fields: Partial<Omit<BankItemRow, "id" | "userId" | "createdAt">>,
): Promise<void> {
  await db
    .update(bankItems)
    .set({ ...fields, updatedAt: Date.now() })
    .where(eq(bankItems.id, itemId));
}

export async function countBankByStatus(userId: number, status: BankStatus): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bankItems)
    .where(and(eq(bankItems.userId, userId), eq(bankItems.status, status)));
  return row?.count ?? 0;
}
