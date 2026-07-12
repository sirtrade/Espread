import { advanceSrs, creditAllowedToday, graduatesOnSuccess, resetSrs } from "./srs.js";

/**
 * Active words with an SRS stage at or below this rung count toward the active
 * pool cap. Words that have matured past it (long intervals) still circulate
 * but no longer occupy a slot, so new words can keep flowing in.
 */
export const POOL_SLOT_MAX_STAGE = 3;

/** At most this many target words are woven into one article... */
export const MAX_TARGET_TERMS = 3;
/** ...of which at most this many may be brand-new (never woven before). */
export const MAX_NEW_TARGET_TERMS = 2;

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
  /** rung on the SRS interval ladder (0 = new / just reset) */
  srsStage: number;
  /** when the word is next due (null = due now, never scheduled) */
  nextDueAt: number | null;
  /** last time the word climbed the ladder (anti-farm daily cap) */
  lastCreditAt: number | null;
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

/** The reader's explicit accept/reject choices from the review screen, keyed
 *  by lemma. Sets are normalized lemmas restricted to the current review. */
export interface StatusOverrides {
  accepted: ReadonlySet<string>;
  rejected: ReadonlySet<string>;
}

/** Honors the reader's manual choice over the frequency verdict: a rejected
 *  lemma never enters the active bank even if frequent, an accepted one does
 *  even if rare. Absent an override, falls back to the frequency band. */
function statusForItem(lemma: string, freqBand: FreqBand, overrides?: StatusOverrides): BankStatus {
  if (overrides?.rejected.has(lemma)) return "ignored";
  if (overrides?.accepted.has(lemma)) return "active";
  return statusForFreqBand(freqBand);
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

/** True when an active word occupies a pool slot (young enough on the ladder). */
function occupiesSlot(item: Pick<BankItemRecord, "status" | "srsStage">): boolean {
  return item.status === "active" && item.srsStage <= POOL_SLOT_MAX_STAGE;
}

/**
 * Applies one reading session's review results to the user's bank.
 * Keys are lemmas (dictionary forms).
 *
 * Rules:
 * - exposedLemmas are the active bank items that were actually woven into the
 *   article (validated against the body). Ones NOT re-marked earn a clean
 *   exposure and climb the SRS ladder (once per day). Ones re-marked drop back
 *   to stage 0 (due again immediately) and follow the fresh verdict.
 * - Any other marked item (new or already tracked) is upserted per its
 *   frequency band: top1000..top5000 -> active, rare -> ignored.
 * - `poolLimit` caps the active pool (0 = no limit), counting only words young
 *   enough to occupy a slot (srsStage <= POOL_SLOT_MAX_STAGE). A word that
 *   WOULD become active but wasn't already active is parked as "queued" once
 *   the final map already holds `poolLimit` slot-occupying words. New words are
 *   considered in `reviewed` order, so earlier cards claim free slots first.
 * - A clean exposure for a word already at the top SRS rung graduates it to
 *   "learned" instead of rescheduling it.
 *
 * Pure function: no DB/IO. Returns a new map (does not mutate `existing`).
 */
export function applyReviewToBank(
  existing: ReadonlyMap<string, BankItemRecord>,
  exposedLemmas: readonly string[],
  reviewed: readonly ReviewedItem[],
  overrides?: StatusOverrides,
  poolLimit = 0,
  now = Date.now(),
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
      // Re-marked: the word is still unknown — reset the schedule so it comes
      // back soon, and follow the fresh frequency verdict.
      item.exposures += 1;
      const s = resetSrs(now);
      item.srsStage = s.srsStage;
      item.nextDueAt = s.nextDueAt;
      item.status = statusForItem(lemma, mark.freqBand, overrides);
      updateCardFields(item, mark);
    } else {
      // Clean exposure: climb the ladder, but at most once per calendar day.
      item.exposures += 1;
      if (creditAllowedToday(item.lastCreditAt, now)) {
        if (graduatesOnSuccess(item.srsStage)) {
          // Survived the whole ladder plus the final 120-day review — learned.
          item.status = "learned";
          item.lastCreditAt = now;
        } else {
          const s = advanceSrs(item.srsStage, now);
          item.srsStage = s.srsStage;
          item.nextDueAt = s.nextDueAt;
          item.lastCreditAt = now;
        }
      }
    }
  }

  const limited = poolLimit > 0;
  // Live count of slot-occupying words in the map we're building. Words the
  // exposed pass matured past POOL_SLOT_MAX_STAGE no longer count, freeing room.
  let slotCount = 0;
  for (const item of result.values()) if (occupiesSlot(item)) slotCount++;

  for (const mark of reviewed) {
    if (exposedSet.has(mark.lemma) && existing.has(mark.lemma)) continue;

    const desired = statusForItem(mark.lemma, mark.freqBand, overrides);
    // A word already active keeps its slot; only a word becoming active anew
    // (rare accepted, a queued/learned word re-marked, or a first-seen word)
    // competes for a free slot under the cap.
    const wasActive = existing.get(mark.lemma)?.status === "active";
    let status = desired;
    if (desired === "active" && !wasActive && limited && slotCount >= poolLimit) {
      status = "queued";
    }

    const prior = result.get(mark.lemma);
    const priorOccupied = prior ? occupiesSlot(prior) : false;
    if (prior) {
      // A marked word is unknown again: reset its schedule to stage 0.
      prior.exposures += 1;
      const s = resetSrs(now);
      prior.srsStage = s.srsStage;
      prior.nextDueAt = s.nextDueAt;
      prior.status = status;
      updateCardFields(prior, mark);
    } else {
      result.set(mark.lemma, {
        lemma: mark.lemma,
        isPhrase: mark.isPhrase,
        status,
        exposures: 1,
        srsStage: 0,
        nextDueAt: null,
        lastCreditAt: null,
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
    // New and reset words sit at stage 0, so an active one always occupies a slot.
    const nowOccupied = status === "active";
    slotCount += (nowOccupied ? 1 : 0) - (priorOccupied ? 1 : 0);
  }

  return result;
}

/**
 * How many of the user's queued words to promote so the active pool refills
 * toward the cap. `activeCount` is the number of slot-occupying words. Pure:
 * the caller pulls the oldest `n` queued rows (createdAt ASC) and activates them.
 */
export function queuedPromotionCount(activeCount: number, queuedCount: number, poolLimit: number): number {
  if (poolLimit <= 0) return queuedCount;
  return Math.max(0, Math.min(poolLimit - activeCount, queuedCount));
}

/** A bank item as far as target-term selection cares. */
export type SelectableItem = Pick<BankItemRecord, "lemma" | "exposures" | "srsStage" | "nextDueAt">;

/** A word is due when it has never been scheduled or its timer has expired. */
function isDue(item: SelectableItem, now: number): boolean {
  return item.nextDueAt == null || item.nextDueAt <= now;
}

/**
 * Picks the words to weave into the next article — dosed, not dumped:
 *  - only DUE active words are candidates (respecting the SRS schedule);
 *  - at most `max` total, of which at most `maxNew` may be brand-new
 *    (srsStage 0, never woven before);
 *  - scheduled reviews take priority (most overdue first), new words fill any
 *    remaining slots (fewest exposures first).
 * Words not picked simply stay due and surface in a later article.
 */
export function selectTargetTerms(
  activeItems: readonly SelectableItem[],
  now = Date.now(),
  max = MAX_TARGET_TERMS,
  maxNew = MAX_NEW_TARGET_TERMS,
): string[] {
  const due = activeItems.filter((i) => isDue(i, now));
  const isNew = (i: SelectableItem) => i.srsStage === 0;

  const reviews = due
    .filter((i) => !isNew(i))
    .sort((a, b) => (a.nextDueAt ?? 0) - (b.nextDueAt ?? 0));
  const fresh = due.filter(isNew).sort((a, b) => a.exposures - b.exposures);

  const picked: string[] = [];
  for (const r of reviews) {
    if (picked.length >= max) break;
    picked.push(r.lemma);
  }
  let newCount = 0;
  for (const n of fresh) {
    if (picked.length >= max || newCount >= maxNew) break;
    picked.push(n.lemma);
    newCount++;
  }
  return picked;
}
