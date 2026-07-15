/**
 * Práctica session size — how many cards a single training session requests.
 *
 * Several short sessions beat one long one (distributed practice; Cepeda et al.
 * 2006), and users differ in stamina, so the size is a per-profile preference.
 * The UI offers a few presets; the server clamps any incoming value to a safe
 * range so a hand-crafted request can't ask for an unbounded queue.
 */

/** Presets offered in Settings. */
export const PRACTICE_SIZE_OPTIONS = [5, 10, 20] as const;

/** Default when the user hasn't chosen (matches the historic `limit=10`). */
export const DEFAULT_PRACTICE_SIZE = 10;

/** Hard bounds enforced on the practice queue endpoint. */
export const PRACTICE_SIZE_MIN = 1;
export const PRACTICE_SIZE_MAX = 30;

/**
 * Clamps an arbitrary requested size to [PRACTICE_SIZE_MIN, PRACTICE_SIZE_MAX].
 * Non-finite / non-positive input falls back to DEFAULT_PRACTICE_SIZE, so a
 * missing or malformed `?limit=` never yields an empty or invalid session.
 */
export function clampPracticeSize(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_PRACTICE_SIZE;
  return Math.min(Math.max(Math.trunc(value), PRACTICE_SIZE_MIN), PRACTICE_SIZE_MAX);
}
