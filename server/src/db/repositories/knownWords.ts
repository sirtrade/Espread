import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../client.js";
import { knownWords } from "../schema.js";
import { normalizeTerm } from "../../domain/normalize.js";

export type KnownWordSource = "learned" | "reading" | "manual";
export type KnownWordRow = typeof knownWords.$inferSelect;

export async function recognizeKnownWord(
  userId: number,
  rawLemma: string,
  source: Exclude<KnownWordSource, "reading">,
  now = Date.now(),
): Promise<void> {
  const lemma = normalizeTerm(rawLemma);
  if (!lemma) return;
  await db
    .insert(knownWords)
    .values({
      userId,
      lemma,
      source,
      encounters: 0,
      firstSeenAt: now,
      lastSeenAt: now,
      knownSince: now,
    })
    .onConflictDoUpdate({
      target: [knownWords.userId, knownWords.lemma],
      set: {
        source: sql`CASE
          WHEN excluded.source = 'learned' THEN 'learned'
          WHEN ${knownWords.source} = 'learned' THEN ${knownWords.source}
          ELSE excluded.source
        END`,
        lastSeenAt: now,
        knownSince: sql`coalesce(${knownWords.knownSince}, ${now})`,
      },
    });
}

export async function listKnownWords(userId: number): Promise<KnownWordRow[]> {
  return db.query.knownWords.findMany({
    where: and(eq(knownWords.userId, userId), isNotNull(knownWords.knownSince)),
    orderBy: [asc(knownWords.knownSince), asc(knownWords.lemma)],
  });
}

/** Every registry row, including sub-threshold reading lemmas
 *  (`known_since IS NULL`) — the stats screen reports those as "on the way". */
export async function listAllKnownWordRows(userId: number): Promise<KnownWordRow[]> {
  return db.query.knownWords.findMany({ where: eq(knownWords.userId, userId) });
}
