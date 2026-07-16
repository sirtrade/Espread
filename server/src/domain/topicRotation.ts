/**
 * Picks a topic for the next article, avoiding the last two topics used
 * (TZ 4.2.1: "не повторять тему двух последних статей"). Falls back to the
 * full topic list if avoiding recents would leave nothing to choose from.
 *
 * F-19: `skipCounts` (recent "not interested" skips per topic) turns the
 * uniform pick into a weighted one — weight 1 / (1 + skips), so a topic
 * skipped as boring is chosen proportionally less often but never excluded
 * (the reader may just have disliked those particular stories). Without
 * `skipCounts` all weights are 1 and the pick stays uniform.
 */
export function pickTopic(
  topics: readonly string[],
  recentTopics: readonly string[],
  random: () => number = Math.random,
  skipCounts?: ReadonlyMap<string, number>,
): string {
  if (topics.length === 0) {
    throw new Error("No topics to choose from");
  }
  const avoid = new Set(recentTopics.slice(-2));
  const candidates = topics.filter((t) => !avoid.has(t));
  const pool = candidates.length > 0 ? candidates : topics;

  const weights = pool.map((t) => 1 / (1 + Math.max(0, skipCounts?.get(t) ?? 0)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (!Number.isFinite(total) || total <= 0) {
    // Degenerate weights (can't happen with 1/(1+n), but never brick the
    // generator over a bad stats input): fall back to a uniform pick.
    const idx = Math.floor(random() * pool.length);
    return pool[Math.min(idx, pool.length - 1)]!;
  }

  let r = random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]!;
    if (r < 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}
