import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { listKnownWords } from "../../db/repositories/knownWords.js";
import { buildVocabularyStats } from "../../domain/vocabularyStats.js";
import type { AppEnv } from "../context.js";

export const knownWordsRoutes = new Hono<AppEnv>();

knownWordsRoutes.use("*", requireAuth);

knownWordsRoutes.get("/", async (c) => {
  const { userId } = c.get("session");
  const rows = await listKnownWords(userId);
  return c.json({
    items: rows.map((row) => ({
      lemma: row.lemma,
      source: row.source,
      encounters: row.encounters,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      knownSince: row.knownSince!,
    })),
  });
});

knownWordsRoutes.get("/stats", async (c) => {
  const { userId } = c.get("session");
  return c.json(buildVocabularyStats(await listKnownWords(userId)));
});
