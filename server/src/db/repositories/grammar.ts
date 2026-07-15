import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../client.js";
import { grammarItems, practiceAnswers } from "../schema.js";
import { queuedPromotionCount } from "../../domain/bank.js";
import { clampPracticeLatency } from "../../domain/practiceAnswer.js";
import { recordPracticeActivity } from "./activity.js";
import { localDayKey } from "../../lib/timezone.js";
import {
  advanceSrs,
  creditAllowedToday,
  graduatesOnSuccess,
  lapseSrs,
  PRACTICE_RETRY_MS,
  resetSrs,
} from "../../domain/srs.js";
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

/** Manual status change from the Bank tab. Mirrors `setBankItemStatus`: the
 *  unit restarts at the bottom rung, due right away (relevant when moving it
 *  back into study); ordinary practice failures will soft-lapse instead. */
export async function setGrammarItemStatus(
  userId: number,
  itemId: number,
  status: GrammarStatus,
): Promise<GrammarItemRow | undefined> {
  const now = Date.now();
  const s = resetSrs(now);
  const [row] = await db
    .update(grammarItems)
    .set({ status, srsStage: s.srsStage, nextDueAt: s.nextDueAt, lastCreditAt: null, updatedAt: now })
    .where(and(eq(grammarItems.userId, userId), eq(grammarItems.id, itemId)))
    .returning();
  return row;
}

export async function countGrammarByStatus(userId: number, status: GrammarStatus): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(grammarItems)
    .where(and(eq(grammarItems.userId, userId), eq(grammarItems.status, status)));
  return row?.count ?? 0;
}

export async function getGrammarItemById(userId: number, itemId: number): Promise<GrammarItemRow | undefined> {
  return db.query.grammarItems.findFirst({
    where: and(eq(grammarItems.userId, userId), eq(grammarItems.id, itemId)),
  });
}

function dueGrammarWhere(userId: number, now: number) {
  return and(
    eq(grammarItems.userId, userId),
    eq(grammarItems.status, "active"),
    or(isNull(grammarItems.nextDueAt), lte(grammarItems.nextDueAt, now)),
  );
}

/** Active grammar units whose SRS timer has expired (or never started). */
export async function getDueGrammarForPractice(userId: number, now: number, limit: number): Promise<GrammarItemRow[]> {
  return db.query.grammarItems.findMany({
    where: dueGrammarWhere(userId, now),
    orderBy: [asc(grammarItems.nextDueAt)],
    limit,
  });
}

export async function countDueGrammarForPractice(userId: number, now: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(grammarItems)
    .where(dueGrammarWhere(userId, now));
  return row?.count ?? 0;
}

export interface GrammarPracticeAnswerResult {
  itemId: number;
  pattern: string;
  srsStage: number;
  nextDueAt: number;
  status: GrammarStatus;
  /** the unit climbed a rung this answer (first-try correct, within the daily cap) */
  advanced: boolean;
}

/**
 * Applies one grammar practice answer to the shared SRS ladder, mirroring the
 * lexical `applyPracticeAnswer` semantics exactly: first-try-correct climbs a
 * rung at most once per local calendar day, top-rung success graduates to
 * `learned`, a hinted correct answer earns no credit, and a wrong answer
 * soft-lapses (2 rungs down, due again shortly). Practice is the ONLY thing
 * that moves grammar SRS — reading/weaving never call this (design §6).
 *
 * The SRS update and the polymorphic journal row (`practice_answers` with
 * `item_kind='grammar'`, `grammar_item_id` set, `item_id` NULL — F-15) land
 * in one transaction; retries never reach this function (first-attempt-only).
 */
export async function applyGrammarPracticeAnswer(
  userId: number,
  itemId: number,
  correct: boolean,
  now = Date.now(),
  usedHint = false,
  timeZone = "UTC",
  metadata: { cardType?: "cloze" | "typed"; latencyMs?: number | null } = {},
): Promise<GrammarPracticeAnswerResult | undefined> {
  const item = await getGrammarItemById(userId, itemId);
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
    // Correct after revealing the pattern/explanation hint: no credit, the
    // schedule stays put so the construction must be retrieved unaided later.
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

  db.transaction((trx) => {
    trx
      .update(grammarItems)
      .set({ srsStage, nextDueAt, lastCreditAt, status, updatedAt: now })
      .where(eq(grammarItems.id, itemId))
      .run();
    trx
      .insert(practiceAnswers)
      .values({
        userId,
        itemId: null,
        itemKind: "grammar",
        grammarItemId: itemId,
        ts: now,
        cardType: metadata.cardType ?? "cloze",
        correct,
        usedHint,
        latencyMs: clampPracticeLatency(metadata.latencyMs),
        srsStageBefore: item.srsStage,
        srsStageAfter: srsStage,
      })
      .run();
  });

  // A grammar answer is a useful action for the streak, same as a word answer.
  await recordPracticeActivity(userId, localDayKey(now, timeZone));

  return { itemId, pattern: item.pattern, srsStage, nextDueAt, status, advanced };
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
