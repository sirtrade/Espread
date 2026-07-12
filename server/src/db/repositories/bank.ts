import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "../client.js";
import { bankItems, userStats } from "../schema.js";
import { queuedPromotionCount, type BankItemRecord, type BankStatus, type PartOfSpeech } from "../../domain/bank.js";
import { nextPracticeState, nextStreakState } from "../../domain/practice.js";

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

/** The outcome of one practice answer: the new SRS + learning state, plus
 *  flags the client needs for its end-of-session summary. */
export interface PracticeAnswerResult {
  itemId: number;
  lemma: string;
  practiceStage: number;
  nextPracticeAt: number;
  cleanStreak: number;
  status: BankStatus;
  /** the streak moved up (a clean encounter landed, respecting the daily cap) */
  streakCredited: boolean;
  /** this answer promoted the item to "learned" */
  becameLearned: boolean;
}

/**
 * Applies one practice answer. Advances the SRS ladder (always) and the
 * learning streak (a first-try-correct answer is a clean encounter, capped at
 * one credit per day; a wrong answer resets it). Promotion to "learned" bumps
 * userStats.itemsLearned in the same transaction — the same accounting as a
 * clean reading exposure in applyCompletion.
 *
 * A `becameLearned` here frees an active slot, but we deliberately do NOT
 * rebalance the queue from this path: practice runs card-by-card with no
 * queued-count surface to report back to the client. The freed slot is picked
 * up by the next completeSession / bank PATCH / limit raise, all of which call
 * rebalanceActivePool. Queued words never surface for practice anyway
 * (getDueForPractice filters status=active), so nothing is lost by waiting.
 */
export async function applyPracticeAnswer(
  userId: number,
  itemId: number,
  correct: boolean,
  now = Date.now(),
): Promise<PracticeAnswerResult | undefined> {
  const item = await db.query.bankItems.findFirst({
    where: and(eq(bankItems.userId, userId), eq(bankItems.id, itemId)),
  });
  if (!item) return undefined;

  const srs = nextPracticeState(item.practiceStage, correct, now);
  const streak = nextStreakState(
    { cleanStreak: item.cleanStreak, status: item.status, lastStreakCreditAt: item.lastStreakCreditAt },
    correct,
    now,
  );

  db.transaction((trx) => {
    trx
      .update(bankItems)
      .set({
        practiceStage: srs.practiceStage,
        nextPracticeAt: srs.nextPracticeAt,
        cleanStreak: streak.cleanStreak,
        status: streak.status,
        lastStreakCreditAt: streak.lastStreakCreditAt,
        updatedAt: now,
      })
      .where(eq(bankItems.id, itemId))
      .run();

    if (streak.becameLearned) {
      trx
        .update(userStats)
        .set({ itemsLearned: sql`${userStats.itemsLearned} + 1` })
        .where(eq(userStats.userId, userId))
        .run();
    }
  });

  return {
    itemId,
    lemma: item.lemma,
    practiceStage: srs.practiceStage,
    nextPracticeAt: srs.nextPracticeAt,
    cleanStreak: streak.cleanStreak,
    status: streak.status,
    streakCredited: streak.streakCredited,
    becameLearned: streak.becameLearned,
  };
}

export async function getBankItemById(userId: number, itemId: number): Promise<BankItemRow | undefined> {
  return db.query.bankItems.findFirst({ where: and(eq(bankItems.userId, userId), eq(bankItems.id, itemId)) });
}

/** Resolves a lemma to the user's bank row (post-reading quiz answers arrive
 *  keyed by lemma, since the client never sees item ids). */
export async function getBankItemByLemma(userId: number, lemma: string): Promise<BankItemRow | undefined> {
  return db.query.bankItems.findFirst({ where: and(eq(bankItems.userId, userId), eq(bankItems.lemma, lemma)) });
}

/** Random same-POS terms from the user's other bank items, used as quiz
 *  distractors. Filtering by POS and phrase-ness keeps decoys plausible and
 *  stops phrases and single words from mixing in one card's options. */
export async function getDistractorPool(
  userId: number,
  excludeItemId: number,
  filter: { pos: PartOfSpeech | null; isPhrase: boolean },
  limit = 12,
): Promise<BankItemRow[]> {
  const conditions = [
    eq(bankItems.userId, userId),
    ne(bankItems.id, excludeItemId),
    eq(bankItems.isPhrase, filter.isPhrase),
  ];
  if (filter.pos) conditions.push(eq(bankItems.pos, filter.pos));
  return db.query.bankItems.findMany({
    where: and(...conditions),
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

/**
 * Refills the active pool from the queue: while there's room under `poolLimit`
 * (0 = no limit), promotes the oldest queued words (createdAt ASC) to active.
 * Idempotent and safe to call after anything that may free a slot (a word
 * learned/ignored, a manual status change, a raised limit). Never demotes:
 * an over-limit pool (e.g. after "Estudiar ahora") just promotes nothing.
 * Returns the promoted lemmas, oldest first.
 */
export async function rebalanceActivePool(userId: number, poolLimit: number): Promise<string[]> {
  const [activeCount, queuedCount] = await Promise.all([
    countBankByStatus(userId, "active"),
    countBankByStatus(userId, "queued"),
  ]);
  const promote = queuedPromotionCount(activeCount, queuedCount, poolLimit);
  if (promote <= 0) return [];

  const oldest = await db.query.bankItems.findMany({
    where: and(eq(bankItems.userId, userId), eq(bankItems.status, "queued")),
    orderBy: [asc(bankItems.createdAt), asc(bankItems.id)],
    limit: promote,
  });
  if (oldest.length === 0) return [];

  await db
    .update(bankItems)
    .set({ status: "active", updatedAt: Date.now() })
    .where(
      inArray(
        bankItems.id,
        oldest.map((r) => r.id),
      ),
    );
  return oldest.map((r) => r.lemma);
}
