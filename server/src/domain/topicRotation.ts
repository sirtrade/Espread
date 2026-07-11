/**
 * Picks a topic for the next article, avoiding the last two topics used
 * (TZ 4.2.1: "не повторять тему двух последних статей"). Falls back to the
 * full topic list if avoiding recents would leave nothing to choose from.
 */
export function pickTopic(
  topics: readonly string[],
  recentTopics: readonly string[],
  random: () => number = Math.random,
): string {
  if (topics.length === 0) {
    throw new Error("No topics to choose from");
  }
  const avoid = new Set(recentTopics.slice(-2));
  const candidates = topics.filter((t) => !avoid.has(t));
  const pool = candidates.length > 0 ? candidates : topics;
  const idx = Math.floor(random() * pool.length);
  return pool[Math.min(idx, pool.length - 1)]!;
}
