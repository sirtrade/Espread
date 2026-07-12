/** Mirrors the server's SRS ladder (server/src/domain/srs.ts) for display. */
export const SRS_INTERVALS_DAYS = [1, 3, 7, 14, 30, 60, 120] as const;

export const SRS_MAX_STAGE = SRS_INTERVALS_DAYS.length;

/** Days until the next review for a 1-based stage (clamped into the ladder). */
export function intervalDaysForStage(stage: number): number {
  const idx = Math.min(Math.max(stage, 1), SRS_INTERVALS_DAYS.length) - 1;
  return SRS_INTERVALS_DAYS[idx]!;
}
