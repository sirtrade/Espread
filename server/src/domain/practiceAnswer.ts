export type PracticeCardType = "cloze" | "recall" | "typed";

/** Upper bound for a meaningful first-attempt response time (10 minutes). */
export const PRACTICE_LATENCY_MAX_MS = 600_000;

/** Repository-level normalization protects non-HTTP callers as well as the API. */
export function clampPracticeLatency(latencyMs: number | null | undefined): number | null {
  if (latencyMs == null || !Number.isFinite(latencyMs)) return null;
  return Math.min(PRACTICE_LATENCY_MAX_MS, Math.max(0, Math.round(latencyMs)));
}
