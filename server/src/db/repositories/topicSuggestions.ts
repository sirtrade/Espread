import { eq } from "drizzle-orm";
import { db } from "../client.js";
import { topicSuggestionDismissals } from "../schema.js";

/** topic -> dismissedAt of the reader's last "keep it" decision (F-19). */
export async function getTopicSuggestionDismissals(userId: number): Promise<Map<string, number>> {
  const rows = await db.query.topicSuggestionDismissals.findMany({
    where: eq(topicSuggestionDismissals.userId, userId),
  });
  return new Map(rows.map((r) => [r.topic, r.dismissedAt]));
}

/** Records "keep the topic" — only later skips count toward re-suggesting. */
export async function dismissTopicSuggestion(userId: number, topic: string, dismissedAt: number): Promise<void> {
  await db
    .insert(topicSuggestionDismissals)
    .values({ userId, topic, dismissedAt })
    .onConflictDoUpdate({
      target: [topicSuggestionDismissals.userId, topicSuggestionDismissals.topic],
      set: { dismissedAt },
    });
}
