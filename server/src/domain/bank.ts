export const LEARNED_STREAK_THRESHOLD = 3;

// "queued" is reserved for the upcoming intake queue; no logic sets it yet.
export type BankStatus = "active" | "learned" | "ignored" | "queued";
export type PartOfSpeech = "verb" | "noun" | "adj" | "adv" | "phrase" | "other";
export type FreqBand = "top1000" | "top3000" | "top5000" | "rare";
export type Gender = "m" | "f";

export interface BankItemRecord {
  /** dictionary form — the canonical key */
  lemma: string;
  isPhrase: boolean;
  status: BankStatus;
  exposures: number;
  cleanStreak: number;
  /** short translation of the lemma */
  translation: string | null;
  /** the sentence in which the word was marked */
  firstContext: string | null;
  /** exact inflected form from the text ("perfila") */
  surfaceForm: string | null;
  pos: PartOfSpeech | null;
  gender: Gender | null;
  /** optional usage explanation */
  note: string | null;
  /** translation of firstContext into the user's explain language */
  contextTranslation: string | null;
  /** JSON array of 3 same-POS Spanish words */
  distractors: string | null;
  freqBand: FreqBand | null;
}

export interface ReviewedItem {
  /** normalized lemma */
  lemma: string;
  isPhrase: boolean;
  surfaceForm: string | null;
  pos: PartOfSpeech | null;
  gender: Gender | null;
  translation: string | null;
  note: string | null;
  contextTranslation: string | null;
  freqBand: FreqBand;
  /** 3 same-POS Spanish distractors */
  distractors: string[];
  /** the sentence in which the item was marked */
  context?: string | null;
}

/** Bank acceptance rule: frequent vocabulary is worth drilling, rare isn't. */
export function statusForFreqBand(freqBand: FreqBand): BankStatus {
  return freqBand === "rare" ? "ignored" : "active";
}

/** Overwrites card fields from a fresh review verdict. surfaceForm /
 *  firstContext / contextTranslation are only replaced by non-empty values,
 *  so a review that couldn't see the context never wipes existing data. */
function updateCardFields(item: BankItemRecord, mark: ReviewedItem): void {
  if (mark.translation) item.translation = mark.translation;
  if (mark.surfaceForm) item.surfaceForm = mark.surfaceForm;
  if (mark.context) item.firstContext = mark.context;
  if (mark.contextTranslation) item.contextTranslation = mark.contextTranslation;
  if (mark.pos) item.pos = mark.pos;
  item.gender = mark.gender ?? item.gender;
  if (mark.note) item.note = mark.note;
  item.freqBand = mark.freqBand;
  if (mark.distractors.length > 0) item.distractors = JSON.stringify(mark.distractors);
}

/**
 * Applies one reading session's review results to the user's bank.
 * Keys are lemmas (dictionary forms).
 *
 * Rules (see TZ 4.2.4):
 * - exposedLemmas are the active bank items woven into the article.
 *   Ones NOT marked again get a clean exposure (streak+1, learned at 3).
 *   Ones marked again reset the streak and follow the fresh verdict.
 * - Any other marked item (new or already tracked) is upserted per its
 *   frequency band: top1000..top5000 -> active, rare -> ignored.
 *
 * Pure function: no DB/IO. Returns a new map (does not mutate `existing`).
 */
export function applyReviewToBank(
  existing: ReadonlyMap<string, BankItemRecord>,
  exposedLemmas: readonly string[],
  reviewed: readonly ReviewedItem[],
): Map<string, BankItemRecord> {
  const result = new Map<string, BankItemRecord>();
  for (const [lemma, item] of existing) {
    result.set(lemma, { ...item });
  }

  const reviewedMap = new Map(reviewed.map((r) => [r.lemma, r]));
  const exposedSet = new Set(exposedLemmas);

  for (const lemma of exposedSet) {
    const item = result.get(lemma);
    if (!item) continue;

    const mark = reviewedMap.get(lemma);
    if (mark) {
      item.exposures += 1;
      item.cleanStreak = 0;
      item.status = statusForFreqBand(mark.freqBand);
      updateCardFields(item, mark);
    } else {
      item.exposures += 1;
      item.cleanStreak += 1;
      if (item.cleanStreak >= LEARNED_STREAK_THRESHOLD) {
        item.status = "learned";
      }
    }
  }

  for (const mark of reviewed) {
    if (exposedSet.has(mark.lemma) && existing.has(mark.lemma)) continue;

    const item = result.get(mark.lemma);
    if (item) {
      item.exposures += 1;
      item.cleanStreak = 0;
      item.status = statusForFreqBand(mark.freqBand);
      updateCardFields(item, mark);
    } else {
      result.set(mark.lemma, {
        lemma: mark.lemma,
        isPhrase: mark.isPhrase,
        status: statusForFreqBand(mark.freqBand),
        exposures: 1,
        cleanStreak: 0,
        translation: mark.translation,
        firstContext: mark.context ?? null,
        surfaceForm: mark.surfaceForm,
        pos: mark.pos,
        gender: mark.gender,
        note: mark.note,
        contextTranslation: mark.contextTranslation,
        distractors: mark.distractors.length > 0 ? JSON.stringify(mark.distractors) : null,
        freqBand: mark.freqBand,
      });
    }
  }

  return result;
}

/** Picks up to `limit` active items with the fewest exposures, for weaving into the next article. */
export function selectTargetTerms(
  activeItems: readonly Pick<BankItemRecord, "lemma" | "exposures">[],
  limit = 8,
): string[] {
  return [...activeItems]
    .sort((a, b) => a.exposures - b.exposures)
    .slice(0, limit)
    .map((i) => i.lemma);
}
