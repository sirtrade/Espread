import { eq, sql } from "drizzle-orm";
import { db } from "../client.js";
import { articles, bankItems, readingSessions, userStats } from "../schema.js";
import type { BankItemRecord } from "../../domain/bank.js";

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
}): Promise<void> {
  const now = Date.now();
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
            distractors: item.distractors,
            freqBand: item.freqBand,
            updatedAt: now,
          },
        })
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

    trx.delete(readingSessions).where(eq(readingSessions.id, params.sessionId)).run();
  });
}
