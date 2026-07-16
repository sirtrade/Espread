/**
 * Story-avoidance list for the article search step (F-18). The search prompt
 * asks for "one fresh news story on the topic" and, having no memory, the
 * model keeps returning the loudest story of the week from a different
 * source. The fix: pass the reader's recent headlines as an explicit ban.
 *
 * Constants (rationale):
 * - RECENT_STORIES_WINDOW_MS = 14 days — the shelf life of a "fresh" news
 *   story: something read more than two weeks ago is unlikely to be what a
 *   search for recent news returns again, and a longer window would crowd
 *   out fresher entries under the cap.
 * - RECENT_STORIES_LIMIT = 15 — at the typical pace (1-2 readings/day) this
 *   covers the whole window while keeping the prompt block small (15 short
 *   lines, a few hundred tokens).
 * - STORY_TITLE_MAX_CHARS = 80 — a headline identifies its story within the
 *   first several words; truncation caps pathological titles.
 */
export const RECENT_STORIES_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
export const RECENT_STORIES_LIMIT = 15;
export const STORY_TITLE_MAX_CHARS = 80;

export interface RecentStoryCandidate {
  title: string;
  /** when the reader finished the article (null if it was skipped) */
  readAt: number | null;
  /** when the reader skipped the article (null if it was read) */
  skippedAt: number | null;
  /** questionnaire answer for skipped articles (F-17), null otherwise */
  skipReason: "repeat" | "not_interested" | "too_hard" | "other" | null;
}

function truncateTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= STORY_TITLE_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, STORY_TITLE_MAX_CHARS - 1).trimEnd()}…`;
}

/**
 * Builds the headline ban-list for the search prompt from the reader's read
 * and skipped articles. Articles skipped as "repeat" are the reader
 * explicitly saying "I've already seen this story", so they survive the cap
 * ahead of everything else; the rest rank by recency of the read/skip.
 */
export function buildStoryAvoidList(candidates: readonly RecentStoryCandidate[], now: number): string[] {
  const cutoff = now - RECENT_STORIES_WINDOW_MS;
  const inWindow = candidates
    .map((c) => ({ ...c, at: Math.max(c.readAt ?? 0, c.skippedAt ?? 0) }))
    .filter((c) => c.at >= cutoff && c.title.trim().length > 0);
  const priority = (c: (typeof inWindow)[number]) => (c.skippedAt !== null && c.skipReason === "repeat" ? 0 : 1);
  inWindow.sort((a, b) => priority(a) - priority(b) || b.at - a.at);
  return inWindow.slice(0, RECENT_STORIES_LIMIT).map((c) => truncateTitle(c.title));
}
