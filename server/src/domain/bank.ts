export const LEARNED_STREAK_THRESHOLD = 3;

export type BankStatus = "active" | "learned" | "ignored";

export interface BankItemRecord {
  term: string;
  isPhrase: boolean;
  status: BankStatus;
  exposures: number;
  cleanStreak: number;
  translation: string | null;
  firstContext: string | null;
}

export interface ReviewedItem {
  /** normalized term */
  term: string;
  isPhrase: boolean;
  translation: string | null;
  frequency: "alta" | "baja";
  context?: string | null;
}

/**
 * Applies one reading session's review results to the user's bank.
 *
 * Rules (see TZ 4.2.4):
 * - exposedTerms are the active bank items woven into the article.
 *   Ones NOT marked again get a clean exposure (streak+1, learned at 3).
 *   Ones marked again reset the streak and follow the fresh verdict.
 * - Any other marked item (new or already tracked) is upserted per its
 *   frequency verdict: alta -> active, baja -> ignored.
 *
 * Pure function: no DB/IO. Returns a new map (does not mutate `existing`).
 */
export function applyReviewToBank(
  existing: ReadonlyMap<string, BankItemRecord>,
  exposedTerms: readonly string[],
  reviewed: readonly ReviewedItem[],
): Map<string, BankItemRecord> {
  const result = new Map<string, BankItemRecord>();
  for (const [term, item] of existing) {
    result.set(term, { ...item });
  }

  const reviewedMap = new Map(reviewed.map((r) => [r.term, r]));
  const exposedSet = new Set(exposedTerms);

  for (const term of exposedSet) {
    const item = result.get(term);
    if (!item) continue;

    const mark = reviewedMap.get(term);
    if (mark) {
      item.exposures += 1;
      item.cleanStreak = 0;
      item.status = mark.frequency === "alta" ? "active" : "ignored";
      if (mark.translation) item.translation = mark.translation;
    } else {
      item.exposures += 1;
      item.cleanStreak += 1;
      if (item.cleanStreak >= LEARNED_STREAK_THRESHOLD) {
        item.status = "learned";
      }
    }
  }

  for (const mark of reviewed) {
    if (exposedSet.has(mark.term) && existing.has(mark.term)) continue;

    const item = result.get(mark.term);
    if (item) {
      item.exposures += 1;
      item.cleanStreak = 0;
      item.status = mark.frequency === "alta" ? "active" : "ignored";
      if (mark.translation) item.translation = mark.translation;
    } else {
      result.set(mark.term, {
        term: mark.term,
        isPhrase: mark.isPhrase,
        status: mark.frequency === "alta" ? "active" : "ignored",
        exposures: 1,
        cleanStreak: 0,
        translation: mark.translation,
        firstContext: mark.context ?? null,
      });
    }
  }

  return result;
}

/** Picks up to `limit` active items with the fewest exposures, for weaving into the next article. */
export function selectTargetTerms(
  activeItems: readonly Pick<BankItemRecord, "term" | "exposures">[],
  limit = 8,
): string[] {
  return [...activeItems]
    .sort((a, b) => a.exposures - b.exposures)
    .slice(0, limit)
    .map((i) => i.term);
}
