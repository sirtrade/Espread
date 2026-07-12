import { normalizeTerm } from "../domain/normalize.js";
import { findTermContext } from "../domain/context.js";
import { dedupeMarks, type Mark } from "../domain/marks.js";
import { applyReviewToBank, type BankItemRecord, type ReviewedItem } from "../domain/bank.js";
import { reviewMarkedItems } from "../llm/review.js";
import { reviewSchema, type ReviewItem, type ReviewResult } from "../llm/schemas.js";
import type { ArticleRow } from "../db/repositories/articles.js";
import { config } from "../lib/config.js";
import { withUserLock } from "../lib/locks.js";
import { Errors } from "../api/errors.js";
import { getArticleById } from "../db/repositories/articles.js";
import { getUserById } from "../db/repositories/users.js";
import { getBankItemsMap } from "../db/repositories/bank.js";
import { applyCompletion } from "../db/repositories/completion.js";
import { countRecentCalls } from "../db/repositories/llmCalls.js";
import { getUserStats } from "../db/repositories/stats.js";
import { getActiveSession, setSessionReviewed } from "../db/repositories/sessions.js";

/** A review card enriched for the client: the raw LLM verdict plus the exact
 *  sentence from the article the item was marked in. */
export interface ReviewItemView extends ReviewItem {
  contextSentence: string;
}

/** One woven bank word's standing in this reading, so the review screen can
 *  show the reader whether their known words earned a clean exposure. */
export interface WovenTermProgress {
  lemma: string;
  /** clean-exposure streak BEFORE this session is completed */
  cleanStreak: number;
  /** the reader marked it again -> the streak will reset on completion */
  markedAgain: boolean;
}

export interface ReviewView {
  items: ReviewItemView[];
  wovenTerms: WovenTermProgress[];
}

/** Builds the client-facing review: attaches each item's article sentence and
 *  reports how the article's woven bank words fared (clean vs. broken). */
function buildReviewView(article: ArticleRow, marks: readonly Mark[], result: ReviewResult, bank: ReadonlyMap<string, BankItemRecord>): ReviewView {
  const fallbackContext = article.body.slice(0, 200);
  const items: ReviewItemView[] = result.items.map((item) => ({
    ...item,
    contextSentence: contextForItem(item, marks, article.body, fallbackContext),
  }));

  const reviewedLemmas = new Set(result.items.map((i) => normalizeTerm(i.lemma)).filter((l) => l.length > 0));
  const exposedLemmas: string[] = JSON.parse(article.targetTerms);
  const wovenTerms: WovenTermProgress[] = exposedLemmas.map((lemma) => {
    const record = bank.get(lemma);
    return {
      lemma,
      cleanStreak: record?.cleanStreak ?? 0,
      markedAgain: reviewedLemmas.has(normalizeTerm(lemma)),
    };
  });

  return { items, wovenTerms };
}

export async function reviewSession(userId: number): Promise<ReviewView> {
  return withUserLock(`session:${userId}`, async () => {
    const session = await getActiveSession(userId);
    if (!session) throw Errors.notFound("Sesión de lectura");

    const [article, user] = await Promise.all([getArticleById(session.articleId), getUserById(userId)]);
    if (!article || !user) throw Errors.notFound("Artículo o usuario");

    const rawMarks = JSON.parse(session.marks) as Mark[];

    let result: ReviewResult;
    if (session.state === "reviewed" && session.reviewResult) {
      result = reviewSchema.parse(JSON.parse(session.reviewResult));
    } else {
      const count = await countRecentCalls(userId, "review");
      if (count >= config.DAILY_REVIEW_LIMIT) {
        throw Errors.rateLimited(`Alcanzaste el límite diario de ${config.DAILY_REVIEW_LIMIT} análisis. Vuelve mañana.`);
      }
      result = await reviewMarkedItems({
        userId,
        articleTitle: article.title,
        articleBody: article.body,
        level: user.level,
        explainLang: user.explainLang,
        marks: dedupeMarks(rawMarks),
      });
      await setSessionReviewed(session.id, result);
    }

    const bank = await getBankItemsMap(userId);
    return buildReviewView(article, rawMarks, result, bank);
  });
}

export interface CompleteResult {
  newlyLearned: string[];
  articlesRead: number;
}

function bankItemDiffers(before: BankItemRecord | undefined, after: BankItemRecord): boolean {
  if (!before) return true;
  return (
    before.status !== after.status ||
    before.exposures !== after.exposures ||
    before.cleanStreak !== after.cleanStreak ||
    before.translation !== after.translation ||
    before.surfaceForm !== after.surfaceForm ||
    before.firstContext !== after.firstContext ||
    before.pos !== after.pos ||
    before.gender !== after.gender ||
    before.note !== after.note ||
    before.contextTranslation !== after.contextTranslation ||
    before.distractors !== after.distractors ||
    before.freqBand !== after.freqBand
  );
}

/** The sentence the item was marked in: prefer the mark whose sentence
 *  contains the surface form, then a body search, then a body-prefix fallback. */
function contextForItem(item: ReviewItem, marks: readonly Mark[], articleBody: string, fallback: string): string {
  const normSurface = normalizeTerm(item.surface);
  if (normSurface) {
    for (const mark of marks) {
      if (!mark.sentence) continue;
      if (` ${normalizeTerm(mark.sentence)} `.includes(` ${normSurface} `)) return mark.sentence;
    }
    // A merged construction ("se llama") may not appear contiguously; fall
    // back to the sentence of the mark whose text is part of the surface.
    for (const mark of marks) {
      if (!mark.sentence) continue;
      const normText = normalizeTerm(mark.text);
      if (normText && ` ${normSurface} `.includes(` ${normText} `)) return mark.sentence;
    }
  }
  return (
    findTermContext(articleBody, item.surface) ??
    findTermContext(articleBody, item.lemma) ??
    fallback
  );
}

/** The reader's per-card intake choices from the review screen (lemmas). */
export interface CompletionChoices {
  accepted?: string[];
  rejected?: string[];
}

export async function completeSession(userId: number, choices: CompletionChoices = {}): Promise<CompleteResult> {
  return withUserLock(`session:${userId}`, async () => {
    const session = await getActiveSession(userId);
    if (!session) throw Errors.notFound("Sesión de lectura");
    if (session.state !== "reviewed" || !session.reviewResult) {
      throw Errors.badRequest("La sesión aún no fue analizada. Llama a /session/review primero.");
    }

    const article = await getArticleById(session.articleId);
    if (!article) throw Errors.notFound("Artículo");

    const review = reviewSchema.parse(JSON.parse(session.reviewResult));
    const marks = JSON.parse(session.marks) as Mark[];
    const exposedLemmas: string[] = JSON.parse(article.targetTerms);
    const fallbackContext = article.body.slice(0, 200);

    const reviewedItems: ReviewedItem[] = [];
    for (const item of review.items) {
      const lemma = normalizeTerm(item.lemma);
      if (!lemma) continue;
      // The prompt forbids duplicate lemmas, but dedupe defensively: the
      // first card wins, later ones would double-count exposures.
      if (reviewedItems.some((r) => r.lemma === lemma)) continue;
      reviewedItems.push({
        lemma,
        isPhrase: item.pos === "phrase",
        surfaceForm: item.surface,
        pos: item.pos,
        gender: item.gender,
        translation: item.translation,
        note: item.note,
        contextTranslation: item.contextTranslation,
        freqBand: item.freqBand,
        distractors: item.distractors,
        context: contextForItem(item, marks, article.body, fallbackContext),
      });
    }

    // Honor the reader's manual accept/reject over the frequency verdict, but
    // only for lemmas that were actually in this review (ignore stray input).
    const reviewedLemmaSet = new Set(reviewedItems.map((r) => r.lemma));
    const normalizeChoice = (lemmas: string[] | undefined): Set<string> =>
      new Set((lemmas ?? []).map(normalizeTerm).filter((l) => reviewedLemmaSet.has(l)));
    const overrides = { accepted: normalizeChoice(choices.accepted), rejected: normalizeChoice(choices.rejected) };

    const before = await getBankItemsMap(userId);
    const after = applyReviewToBank(before, exposedLemmas, reviewedItems, overrides);

    // Only rows that actually changed get written — a completion typically
    // touches a handful of lemmas, not the user's whole bank.
    const changedItems = [...after.values()].filter((item) => bankItemDiffers(before.get(item.lemma), item));

    const newlyLearned = changedItems
      .filter((item) => item.status === "learned" && before.get(item.lemma)?.status !== "learned")
      .map((item) => item.lemma);

    await applyCompletion({
      userId,
      sessionId: session.id,
      articleId: article.id,
      marks: session.marks,
      reviewResult: session.reviewResult,
      changedItems,
      newlyLearnedCount: newlyLearned.length,
    });

    const stats = await getUserStats(userId);
    return { newlyLearned, articlesRead: stats?.articlesRead ?? 0 };
  });
}
