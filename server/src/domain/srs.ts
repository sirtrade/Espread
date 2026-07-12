/**
 * Spaced-repetition schedule shared by reading and practice. A word climbs the
 * interval ladder on every successful encounter — a clean reading exposure
 * (woven into an article and NOT re-marked) or a first-try-correct quiz answer
 * — and drops back to stage 0 on a failure (re-marked while reading, or a wrong
 * quiz answer). `nextDueAt` decides when the word comes up again, both for
 * weaving into the next article and for practice.
 *
 * A word that succeeds again while already at the top rung (i.e. it survived
 * the whole ladder plus the final 120-day review) graduates to "learned"
 * automatically. The reader can still mark a word learned/ignored by hand in
 * the bank, and bring a learned word back into study.
 */

/** Days between reviews at each rung. The top rung repeats every 120 days. */
export const SRS_INTERVALS_DAYS = [1, 3, 7, 14, 30, 60, 120] as const;

export const SRS_MAX_STAGE = SRS_INTERVALS_DAYS.length;

/** A success at the top rung means the word has outgrown the ladder. */
export function graduatesOnSuccess(currentStage: number): boolean {
  return currentStage >= SRS_MAX_STAGE;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A wrong practice answer makes the item due again shortly, not next article. */
export const PRACTICE_RETRY_MS = 10 * 60 * 1000;

export interface SrsState {
  srsStage: number;
  nextDueAt: number;
}

/** Days until the next review for a 1-based stage (clamped into the ladder). */
export function intervalDaysForStage(stage: number): number {
  const idx = Math.min(Math.max(stage, 1), SRS_INTERVALS_DAYS.length) - 1;
  return SRS_INTERVALS_DAYS[idx]!;
}

/** A successful encounter climbs one rung (callers promote to "learned"
 *  instead when `graduatesOnSuccess` says the ladder is already topped). */
export function advanceSrs(currentStage: number, now: number): SrsState {
  const srsStage = Math.min(currentStage + 1, SRS_INTERVALS_DAYS.length);
  return { srsStage, nextDueAt: now + intervalDaysForStage(srsStage) * DAY_MS };
}

/**
 * A failure resets the ladder to stage 0. `delayMs` controls how soon it's due
 * again: 0 for a re-marked reading word (eligible for the very next article), a
 * short retry for a wrong quiz answer so it isn't asked back-to-back.
 */
export function resetSrs(now: number, delayMs = 0): SrsState {
  return { srsStage: 0, nextDueAt: now + delayMs };
}

/** Two timestamps fall on the same calendar day (UTC). */
export function isSameUtcDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
}

/**
 * Anti-farm: a word may climb the ladder at most once per calendar day (UTC),
 * no matter how many times it's encountered (reading + several quiz answers).
 * `lastCreditAt` is the timestamp of the last credited advance.
 */
export function creditAllowedToday(lastCreditAt: number | null, now: number): boolean {
  return lastCreditAt == null || !isSameUtcDay(lastCreditAt, now);
}
