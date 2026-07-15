import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "../client.js";
import { bankItems } from "../schema.js";
import {
  POOL_SLOT_MAX_STAGE,
  queuedPromotionCount,
  type BankItemRecord,
  type BankStatus,
  type PartOfSpeech,
} from "../../domain/bank.js";
import { advanceSrs, creditAllowedToday, graduatesOnSuccess, lapseSrs, PRACTICE_RETRY_MS, resetSrs } from "../../domain/srs.js";
import { recognizeKnownWord } from "./knownWords.js";
import { recordPracticeActivity } from "./activity.js";
import { localDayKey } from "../../lib/timezone.js";

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
        srsStage: r.srsStage,
        nextDueAt: r.nextDueAt,
        lastCreditAt: r.lastCreditAt,
        translation: r.translation,
        firstContext: r.firstContext,
        surfaceForm: r.surfaceForm,
        pos: r.pos,
        gender: r.gender,
        note: r.note,
        contextTranslation: r.contextTranslation,
        contexts: r.contexts,
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
): Promise<Array<{ lemma: string; exposures: number; srsStage: number; nextDueAt: number | null }>> {
  const rows = await db.query.bankItems.findMany({
    where: and(eq(bankItems.userId, userId), eq(bankItems.status, "active")),
    columns: { lemma: true, exposures: true, srsStage: true, nextDueAt: true },
  });
  return rows;
}

export async function setBankItemStatus(userId: number, itemId: number, status: BankStatus): Promise<BankItemRow | undefined> {
  // A manual status change is the one place a full reset is intended: the word
  // restarts at the bottom rung, due right away (relevant when moving it back
  // into study). Ordinary failures soft-lapse instead (see `lapseSrs`).
  const now = Date.now();
  const s = resetSrs(now);
  const [row] = await db
    .update(bankItems)
    .set({ status, srsStage: s.srsStage, nextDueAt: s.nextDueAt, lastCreditAt: null, updatedAt: now })
    .where(and(eq(bankItems.userId, userId), eq(bankItems.id, itemId)))
    .returning();
  if (row && status === "learned") await recognizeKnownWord(userId, row.lemma, "manual", now);
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
    or(isNull(bankItems.nextDueAt), lte(bankItems.nextDueAt, now)),
  );
}

/** Extra due candidates fetched so route-level shuffling can interleave words
 * and refill cards dropped by safe construction / cross-card anti-leak. */
export const PRACTICE_CANDIDATE_MULTIPLIER = 3;

/** Active items whose spaced-repetition timer has expired (or never started).
 * Returns an oversampled candidate pool; the route shuffles and caps output. */
export async function getDueForPractice(userId: number, now: number, limit: number): Promise<BankItemRow[]> {
  return db.query.bankItems.findMany({
    where: dueForPracticeWhere(userId, now),
    // Nulls (never practiced) sort first in SQLite ASC — new words come first.
    orderBy: [asc(bankItems.nextDueAt)],
    limit: limit * PRACTICE_CANDIDATE_MULTIPLIER,
  });
}

export async function countDueForPractice(userId: number, now: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bankItems)
    .where(dueForPracticeWhere(userId, now));
  return row?.count ?? 0;
}

/** The outcome of one practice answer: the new schedule state plus whether the
 *  word climbed the SRS ladder, for the end-of-session summary. */
export interface PracticeAnswerResult {
  itemId: number;
  lemma: string;
  srsStage: number;
  nextDueAt: number;
  status: BankStatus;
  /** the word climbed a rung this answer (first-try correct, within the daily cap) */
  advanced: boolean;
}

/**
 * Applies one practice answer to the shared SRS schedule:
 *  - a first-try-correct answer climbs a rung (once per calendar day per item,
 *    counted in the reader's `timeZone`);
 *  - a correct answer for a word already at the top rung graduates it to
 *    "learned" instead;
 *  - a repeat correct answer the same day leaves the schedule untouched;
 *  - a correct answer given after revealing the translation hint (`usedHint`)
 *    earns no credit: the schedule is left untouched so the word stays due and
 *    must be retrieved again unaided (retrieval effort was scaffolded away);
 *  - a wrong answer is a soft lapse: the word drops a couple rungs (`lapseSrs`,
 *    not a full reset to stage 0) and is due again after a short retry.
 * Practice and reading share this ladder, so drilling a word pushes out its
 * next appearance in articles too.
 */
export async function applyPracticeAnswer(
  userId: number,
  itemId: number,
  correct: boolean,
  now = Date.now(),
  usedHint = false,
  timeZone = "UTC",
): Promise<PracticeAnswerResult | undefined> {
  const item = await db.query.bankItems.findFirst({
    where: and(eq(bankItems.userId, userId), eq(bankItems.id, itemId)),
  });
  if (!item) return undefined;

  let srsStage = item.srsStage;
  let nextDueAt = item.nextDueAt ?? now;
  let lastCreditAt = item.lastCreditAt;
  let status = item.status;
  let advanced = false;

  if (!correct) {
    const s = lapseSrs(item.srsStage, now, PRACTICE_RETRY_MS);
    srsStage = s.srsStage;
    nextDueAt = s.nextDueAt;
  } else if (usedHint) {
    // Correct, but the translation was revealed first: no advance, and the
    // schedule (stage/nextDueAt/lastCreditAt) is left as-is so the word stays
    // due for an unaided retrieval later. `advanced` stays false.
  } else if (creditAllowedToday(item.lastCreditAt, now, timeZone)) {
    if (graduatesOnSuccess(item.srsStage)) {
      status = "learned";
      lastCreditAt = now;
      advanced = true;
    } else {
      const s = advanceSrs(item.srsStage, now);
      srsStage = s.srsStage;
      nextDueAt = s.nextDueAt;
      lastCreditAt = now;
      advanced = true;
    }
  }

  await db
    .update(bankItems)
    .set({ srsStage, nextDueAt, lastCreditAt, status, updatedAt: now })
    .where(eq(bankItems.id, itemId));

  if (status === "learned" && item.status !== "learned") {
    await recognizeKnownWord(userId, item.lemma, "learned", now);
  }
  // One server-accepted first answer completes a one-card practice. Webapp
  // retries stay client-side, bot answers use this same path, and the daily
  // upsert makes repeated delivery safe.
  await recordPracticeActivity(userId, localDayKey(now, timeZone), now);

  return { itemId, lemma: item.lemma, srsStage, nextDueAt, status, advanced };
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

/** Active words young enough to occupy a pool slot (srsStage <= threshold).
 *  Matured words still circulate but no longer count against the cap. */
export async function countActiveInPool(userId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bankItems)
    .where(
      and(
        eq(bankItems.userId, userId),
        eq(bankItems.status, "active"),
        lte(bankItems.srsStage, POOL_SLOT_MAX_STAGE),
      ),
    );
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
    countActiveInPool(userId),
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
