/**
 * Spaced-repetition schedule shared by reading and practice. A word climbs the
 * interval ladder on a successful encounter — a first-try-correct quiz answer,
 * or a clean reading exposure (woven into an article and NOT re-marked) but only
 * on the lower rungs (see `READING_CREDIT_MAX_STAGE`). A failure (re-marked while
 * reading, or a wrong quiz answer) is a soft lapse: the word drops a couple rungs
 * (`lapseSrs`) rather than restarting from zero, because memory keeps its storage
 * strength and re-learning is faster (savings; Bjork & Bjork, 1992). A full reset
 * to stage 0 (`resetSrs`) is reserved for a manual status change, where a clean
 * restart is intended. `nextDueAt` decides when the word comes up again, both for
 * weaving into the next article and for practice.
 *
 * A word that succeeds again while already at the top rung (i.e. it survived
 * the whole ladder plus the final 120-day review) graduates to "learned"
 * automatically — but only through active recall in practice/bot, never from
 * passive reading (see `READING_CREDIT_MAX_STAGE`). The reader can still mark a
 * word learned/ignored by hand in the bank, and bring a learned word back into
 * study.
 */

import { localDayKey } from "../lib/timezone.js";

/** Days between reviews at each rung. The top rung repeats every 120 days. */
export const SRS_INTERVALS_DAYS = [1, 3, 7, 14, 30, 60, 120] as const;

export const SRS_MAX_STAGE = SRS_INTERVALS_DAYS.length;

/** A success at the top rung means the word has outgrown the ladder. */
export function graduatesOnSuccess(currentStage: number): boolean {
  return currentStage >= SRS_MAX_STAGE;
}

/**
 * The highest rung a clean reading exposure may advance a word from. Passive
 * reading ("the word appeared in an article and wasn't re-marked") is a weak
 * retrieval signal — "didn't mark it" is not "recalled it", and incidental
 * uptake from reading takes many encounters and yields mostly receptive
 * knowledge (Karpicke & Roediger, 2008; Webb, 2007; Uchihara et al., 2019).
 * So reading only helps a word climb while it's still on the lower rungs
 * (srsStage <= this value); past it, exposure still counts (`exposures`) but no
 * longer moves the schedule, and the word can only advance — and graduate to
 * "learned" — through active recall in practice/bot.
 */
export const READING_CREDIT_MAX_STAGE = 2;

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
 * A full reset to stage 0. Reserved for a manual status change, where the reader
 * deliberately restarts the word's schedule. Ordinary failures use `lapseSrs`.
 * `delayMs` controls how soon it's due again.
 */
export function resetSrs(now: number, delayMs = 0): SrsState {
  return { srsStage: 0, nextDueAt: now + delayMs };
}

/** How many rungs a lapse drops the ladder (a soft lapse, not a full reset). */
export const LAPSE_STAGE_DROP = 2;

/**
 * A soft lapse for a failed retrieval — a wrong quiz answer, or a word re-marked
 * while reading. The word drops `LAPSE_STAGE_DROP` rungs (floored at 0) instead
 * of resetting to stage 0: memory keeps its storage strength, so re-learning is
 * faster and the word doesn't have to climb the whole ladder again. `delayMs`
 * controls how soon it's due again: 0 for a re-marked reading word (eligible for
 * the very next article), a short retry for a wrong quiz answer so it isn't
 * asked back-to-back. A lapse from stage 0 or 1 stays low but never goes negative.
 */
export function lapseSrs(currentStage: number, now: number, delayMs = 0): SrsState {
  return { srsStage: Math.max(0, currentStage - LAPSE_STAGE_DROP), nextDueAt: now + delayMs };
}

/** Two timestamps fall on the same calendar day in the user's timezone. */
export function isSameLocalDay(a: number, b: number, timeZone: string): boolean {
  return localDayKey(a, timeZone) === localDayKey(b, timeZone);
}

/**
 * Anti-farm: a word may climb the ladder at most once per calendar day, no
 * matter how many times it's encountered (reading + several quiz answers). The
 * day boundary is the user's own local midnight (`timeZone`), not UTC, so a
 * reader in UTC+3 can't earn two credits in one of their days by practicing at
 * 02:00 and again at 23:00 local. `lastCreditAt` is the timestamp of the last
 * credited advance.
 */
export function creditAllowedToday(lastCreditAt: number | null, now: number, timeZone: string): boolean {
  return lastCreditAt == null || !isSameLocalDay(lastCreditAt, now, timeZone);
}
