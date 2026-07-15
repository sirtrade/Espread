import { eq, sql } from "drizzle-orm";
import { db } from "../client.js";
import { articles, bankItems, dailyActivity, grammarItems, knownWords, readingSessions, userStats } from "../schema.js";
import type { BankItemRecord } from "../../domain/bank.js";
import { READING_KNOWN_THRESHOLD } from "../../domain/knownWords.js";
import type { GrammarContextUpdatePlan, GrammarInsertPlan } from "../../domain/grammarLifecycle.js";

/**
 * Applies a finished reading session in a single transaction: bank upserts,
 * stats counters, session archive onto the article row, and the session
 * delete land together or not at all, so a crash mid-way can't double-apply
 * the review (exposures/streaks) on retry.
 */
export async function applyCompletion(params: {
  userId: number;
  sessionId: number;
  articleId: number;
  marks: string;
  reviewResult: string;
  changedItems: readonly BankItemRecord[];
  readingLemmas: readonly string[];
  /** explicitly accepted grammar candidates to create (design §6) */
  grammarInserts?: readonly GrammarInsertPlan[];
  /** repeat canonical keys: context-only updates, status/SRS untouched */
  grammarContextUpdates?: readonly GrammarContextUpdatePlan[];
  localDay: string;
  completedAt: number;
}): Promise<void> {
  const now = params.completedAt;
  db.transaction((trx) => {
    for (const item of params.changedItems) {
      // The "only overwrite context fields with non-empty values" rule is
      // applied in applyReviewToBank; the item here is the final state.
      trx
        .insert(bankItems)
        .values({
          userId: params.userId,
          lemma: item.lemma,
          isPhrase: item.isPhrase,
          status: item.status,
          exposures: item.exposures,
          srsStage: item.srsStage,
          nextDueAt: item.nextDueAt,
          lastCreditAt: item.lastCreditAt,
          translation: item.translation,
          firstContext: item.firstContext,
          surfaceForm: item.surfaceForm,
          pos: item.pos,
          gender: item.gender,
          note: item.note,
          contextTranslation: item.contextTranslation,
          contexts: item.contexts,
          distractors: item.distractors,
          freqBand: item.freqBand,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [bankItems.userId, bankItems.lemma],
          set: {
            status: item.status,
            exposures: item.exposures,
            srsStage: item.srsStage,
            nextDueAt: item.nextDueAt,
            lastCreditAt: item.lastCreditAt,
            translation: item.translation,
            firstContext: item.firstContext,
            surfaceForm: item.surfaceForm,
            pos: item.pos,
            gender: item.gender,
            note: item.note,
            contextTranslation: item.contextTranslation,
            contexts: item.contexts,
            distractors: item.distractors,
            freqBand: item.freqBand,
            updatedAt: now,
          },
        })
        .run();
    }

    for (const lemma of params.readingLemmas) {
      trx
        .insert(knownWords)
        .values({
          userId: params.userId,
          lemma,
          source: "reading",
          encounters: 1,
          firstSeenAt: now,
          lastSeenAt: now,
          knownSince: null,
        })
        .onConflictDoUpdate({
          target: [knownWords.userId, knownWords.lemma],
          set: {
            encounters: sql`${knownWords.encounters} + 1`,
            lastSeenAt: now,
            knownSince: sql`CASE
              WHEN ${knownWords.knownSince} IS NULL
                AND ${knownWords.encounters} + 1 >= ${READING_KNOWN_THRESHOLD}
              THEN ${now}
              ELSE ${knownWords.knownSince}
            END`,
            source: sql`CASE
              WHEN ${knownWords.knownSince} IS NULL
                AND ${knownWords.encounters} + 1 >= ${READING_KNOWN_THRESHOLD}
              THEN 'reading'
              ELSE ${knownWords.source}
            END`,
          },
        })
        .run();
    }

    for (const plan of params.grammarInserts ?? []) {
      // The plan is computed against a snapshot under the user lock; if a row
      // with the key appeared anyway, adding a context is handled by the
      // updates path next time — never clobber an existing unit's state.
      trx
        .insert(grammarItems)
        .values({ userId: params.userId, ...plan, updatedAt: now })
        .onConflictDoNothing()
        .run();
    }

    for (const update of params.grammarContextUpdates ?? []) {
      trx
        .update(grammarItems)
        .set({ contexts: update.contexts, updatedAt: now })
        .where(eq(grammarItems.id, update.id))
        .run();
    }

    trx
      .update(userStats)
      .set({ articlesRead: sql`${userStats.articlesRead} + 1` })
      .where(eq(userStats.userId, params.userId))
      .run();

    trx
      .update(articles)
      .set({
        marks: params.marks,
        reviewResult: params.reviewResult,
        readAt: now,
      })
      .where(eq(articles.id, params.articleId))
      .run();

    trx
      .insert(dailyActivity)
      .values({ userId: params.userId, localDay: params.localDay, reading: true, updatedAt: now })
      .onConflictDoUpdate({
        target: [dailyActivity.userId, dailyActivity.localDay],
        set: { reading: true, updatedAt: now },
      })
      .run();

    trx.delete(readingSessions).where(eq(readingSessions.id, params.sessionId)).run();
  });
}
