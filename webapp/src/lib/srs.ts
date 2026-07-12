/** Mirrors the server's SRS ladder (server/src/domain/srs.ts) for display. */
export const SRS_INTERVALS_DAYS = [1, 3, 7, 14, 30, 60, 120] as const;

export const SRS_MAX_STAGE = SRS_INTERVALS_DAYS.length;

/** Days until the next review for a 1-based stage (clamped into the ladder). */
export function intervalDaysForStage(stage: number): number {
  const idx = Math.min(Math.max(stage, 1), SRS_INTERVALS_DAYS.length) - 1;
  return SRS_INTERVALS_DAYS[idx]!;
}

/** How many rungs a lapse drops the ladder. Mirrors the server: a failure is a
 *  soft lapse (drop a couple rungs), not a full reset to stage 0. */
export const LAPSE_STAGE_DROP = 2;

/** The stage a word lands on after a soft lapse (floored at 0). */
export function lapsedStage(currentStage: number): number {
  return Math.max(0, currentStage - LAPSE_STAGE_DROP);
}
