/**
 * Turning skip-questionnaire answers (F-17) into topic personalization (F-19).
 *
 * Constants (rationale):
 * - TOPIC_SKIP_WINDOW_MS = 30 days — interests drift slowly; a month of
 *   history is enough signal without punishing a topic forever for a bad
 *   week of news.
 * - TOPIC_SUGGEST_THRESHOLD = 3 — one skip is noise, two may be a bad news
 *   week; three "not interested" skips of the same topic within the window
 *   is a pattern worth asking about. The topic is NEVER removed
 *   automatically — only suggested for removal.
 *
 * Only `not_interested` skips participate here: `repeat` feeds the F-18
 * story-avoidance list, `too_hard` is a level signal, `other`/no-reason says
 * nothing about the topic.
 */
export const TOPIC_SKIP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const TOPIC_SUGGEST_THRESHOLD = 3;

export interface TopicSkip {
  topic: string;
  /** when the article was skipped (ms) */
  skippedAt: number;
  skipReason: "repeat" | "not_interested" | "too_hard" | "other" | null;
}

/** Per-topic counts of recent "not interested" skips, for rotation weights. */
export function notInterestedSkipCounts(skips: readonly TopicSkip[], now: number): Map<string, number> {
  const cutoff = now - TOPIC_SKIP_WINDOW_MS;
  const counts = new Map<string, number>();
  for (const skip of skips) {
    if (skip.skipReason !== "not_interested" || skip.skippedAt < cutoff) continue;
    counts.set(skip.topic, (counts.get(skip.topic) ?? 0) + 1);
  }
  return counts;
}

/**
 * The topic to offer removing from the reader's interests, or null. A topic
 * qualifies after TOPIC_SUGGEST_THRESHOLD "not interested" skips within the
 * window, counting only skips after the reader's last "keep it" decision
 * (dismissal) for that topic; the most-skipped qualifying topic wins.
 */
export function suggestTopicRemoval(params: {
  topics: readonly string[];
  skips: readonly TopicSkip[];
  /** topic -> dismissedAt of the reader's last "keep it" decision */
  dismissals: ReadonlyMap<string, number>;
  now: number;
}): { topic: string; count: number } | null {
  const cutoff = params.now - TOPIC_SKIP_WINDOW_MS;
  let best: { topic: string; count: number } | null = null;
  for (const topic of params.topics) {
    const dismissedAt = params.dismissals.get(topic) ?? 0;
    const count = params.skips.filter(
      (s) =>
        s.topic === topic && s.skipReason === "not_interested" && s.skippedAt >= cutoff && s.skippedAt > dismissedAt,
    ).length;
    if (count >= TOPIC_SUGGEST_THRESHOLD && (best === null || count > best.count)) {
      best = { topic, count };
    }
  }
  return best;
}
