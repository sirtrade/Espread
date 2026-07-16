import { suggestTopicRemoval, TOPIC_SKIP_WINDOW_MS } from "../domain/topicPreferences.js";
import { getRecentSkips } from "../db/repositories/articles.js";
import { getUserTopics } from "../db/repositories/topics.js";
import { dismissTopicSuggestion, getTopicSuggestionDismissals } from "../db/repositories/topicSuggestions.js";

/**
 * The soft "remove topic X from your interests?" suggestion (F-19), shown as
 * a Home banner (owner decision 2026-07-15). Read-only: the topic is never
 * removed automatically — removal goes through the ordinary PATCH /me topics
 * flow, and "keep it" is recorded via markTopicSuggestionDismissed so the
 * suggestion disappears until enough NEW skips accumulate.
 */
export async function evaluateTopicSuggestion(userId: number, now = Date.now()): Promise<{ topic: string } | null> {
  const topics = await getUserTopics(userId);
  if (topics.length === 0) return null;
  const [skips, dismissals] = await Promise.all([
    getRecentSkips(userId, now - TOPIC_SKIP_WINDOW_MS),
    getTopicSuggestionDismissals(userId),
  ]);
  const suggestion = suggestTopicRemoval({ topics, skips, dismissals, now });
  return suggestion ? { topic: suggestion.topic } : null;
}

export async function markTopicSuggestionDismissed(userId: number, topic: string, now = Date.now()): Promise<void> {
  await dismissTopicSuggestion(userId, topic, now);
}
