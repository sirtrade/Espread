import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { getUsageByUser } from "../../db/repositories/llmCalls.js";
import {
  countUnenrichedItems,
  getUnenrichedItems,
  updateBankItemFields,
  type BankItemRow,
} from "../../db/repositories/bank.js";
import { getUserById } from "../../db/repositories/users.js";
import { enrichBankItems } from "../../llm/enrichBank.js";
import { normalizeTerm } from "../../domain/normalize.js";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { config } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { Errors } from "../errors.js";
import type { AppEnv } from "../context.js";

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use("*", requireAuth);

adminRoutes.use("*", async (c, next) => {
  const { tgUserId } = c.get("session");
  if (!config.ADMIN_TG_IDS.includes(tgUserId)) throw Errors.forbidden();
  await next();
});

adminRoutes.get("/usage", async (c) => {
  const [usage, allUsers] = await Promise.all([getUsageByUser(), db.select().from(users)]);
  const usernameById = new Map(allUsers.map((u) => [u.id, u.username ?? String(u.tgUserId)]));

  const byUser = usage.map((u) => ({
    userId: u.userId,
    username: usernameById.get(u.userId) ?? "?",
    calls: u.calls,
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    costUsd: u.costUsdMicros / 1_000_000,
  }));

  const totalCostUsd = byUser.reduce((sum, u) => sum + u.costUsd, 0);
  return c.json({ byUser, totalCostUsd });
});

const ENRICH_LLM_CHUNK = 10;

/**
 * One-off backfill after the lemma migration: runs bank rows whose new card
 * fields are still NULL through the LLM and fills lemma / pos / gender /
 * clean translation / note / contextTranslation / freqBand / distractors.
 * Processes up to `limit` rows per call; call repeatedly until remaining=0.
 */
adminRoutes.post("/enrich-bank", async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 200);
  const rows = await getUnenrichedItems(limit);

  const byUser = new Map<number, BankItemRow[]>();
  for (const row of rows) {
    byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
  }

  let updated = 0;
  let lemmaConflicts = 0;
  let failed = 0;

  for (const [ownerId, ownerRows] of byUser) {
    const owner = await getUserById(ownerId);
    if (!owner) continue;

    for (let i = 0; i < ownerRows.length; i += ENRICH_LLM_CHUNK) {
      const chunk = ownerRows.slice(i, i + ENRICH_LLM_CHUNK);
      const rowById = new Map(chunk.map((r) => [r.id, r]));

      let cards;
      try {
        cards = await enrichBankItems({
          userId: ownerId,
          level: owner.level,
          explainLang: owner.explainLang,
          items: chunk.map((r) => ({
            id: r.id,
            term: r.lemma,
            translation: r.translation,
            context: r.firstContext,
          })),
        });
      } catch (err) {
        logger.error({ err, ownerId }, "Bank enrichment LLM call failed");
        failed += chunk.length;
        continue;
      }

      for (const card of cards) {
        const row = rowById.get(card.id);
        if (!row) continue; // hallucinated id — ignore

        const lemma = normalizeTerm(card.lemma) || row.lemma;
        const fields = {
          // The legacy term is the exact form as it was marked in a text.
          surfaceForm: row.surfaceForm ?? row.lemma,
          pos: card.pos,
          gender: card.gender,
          translation: card.translation,
          note: card.note,
          contextTranslation: card.contextTranslation,
          distractors: JSON.stringify(card.distractors),
          freqBand: card.freqBand,
        };
        try {
          await updateBankItemFields(row.id, { ...fields, lemma });
          updated += 1;
        } catch {
          // user_id+lemma already taken by another row (e.g. the user has
          // both "perfila" and "perfilarse"): keep this row's old lemma but
          // still fill the card fields, and report the collision.
          await updateBankItemFields(row.id, fields);
          lemmaConflicts += 1;
          updated += 1;
        }
      }
    }
  }

  const remaining = await countUnenrichedItems();
  return c.json({ processed: rows.length, updated, lemmaConflicts, failed, remaining });
});
