import type { GrammarCandidate } from "../llm/schemas.js";
import { appendContext, parseContexts, type BankContext } from "./contexts.js";

/** `users.grammar_active_pool_limit` bounds (0 = unlimited). */
export const GRAMMAR_POOL_LIMIT_MIN = 0;
export const GRAMMAR_POOL_LIMIT_MAX = 50;
export const GRAMMAR_POOL_LIMIT_DEFAULT = 10;

export type GrammarStatus = "active" | "queued" | "learned" | "ignored";

/** The stored row fields the lifecycle planner needs. */
export interface ExistingGrammarItem {
  id: number;
  canonicalKey: string;
  contexts: string;
}

export interface GrammarInsertPlan {
  canonicalKey: string;
  pattern: string;
  category: GrammarCandidate["category"];
  explanation: string;
  status: GrammarStatus;
  contexts: string;
  exercise: string;
  srsStage: number;
  nextDueAt: number;
  lastCreditAt: null;
}

export interface GrammarContextUpdatePlan {
  id: number;
  contexts: string;
}

const NO_LEGACY = { firstContext: null, contextTranslation: null, surfaceForm: null };

function candidateContext(candidate: GrammarCandidate, articleId: number, now: number): BankContext {
  return {
    sentence: candidate.sourceSentence,
    translation: candidate.sourceSentenceTranslation,
    surfaceForm: candidate.sourceForm,
    articleId,
    addedAt: now,
  };
}

/**
 * Plans the persistence of the reader's explicitly accepted grammar candidates
 * (grammar-track design §6). Pure — the caller executes the plan inside the
 * completion transaction.
 *
 * - A new canonical key becomes `active` while the independent grammar pool
 *   has room (`poolLimit` 0 = unlimited), otherwise `queued` (FIFO promotion
 *   happens later via `rebalanceGrammarPool`). New items start at the bottom
 *   of the SRS ladder, due immediately.
 * - A repeat canonical key only gains a context (deduped, capped at 5): its
 *   status and SRS are untouched, so a learned unit stays learned and reading
 *   never produces grammar SRS credit.
 */
export function planGrammarSaves(params: {
  accepted: readonly GrammarCandidate[];
  existing: readonly ExistingGrammarItem[];
  activeCount: number;
  poolLimit: number;
  articleId: number;
  now: number;
}): { inserts: GrammarInsertPlan[]; contextUpdates: GrammarContextUpdatePlan[] } {
  const existingByKey = new Map(params.existing.map((item) => [item.canonicalKey, item]));
  const inserts: GrammarInsertPlan[] = [];
  const contextUpdates: GrammarContextUpdatePlan[] = [];
  let activeCount = params.activeCount;

  for (const candidate of params.accepted) {
    const context = candidateContext(candidate, params.articleId, params.now);
    const existing = existingByKey.get(candidate.canonicalKey);

    if (existing) {
      const current = parseContexts(existing.contexts, NO_LEGACY);
      const next = appendContext(current, context);
      const serialized = JSON.stringify(next);
      if (serialized !== JSON.stringify(current)) {
        contextUpdates.push({ id: existing.id, contexts: serialized });
      }
      continue;
    }

    const hasRoom = params.poolLimit <= 0 || activeCount < params.poolLimit;
    if (hasRoom) activeCount += 1;
    inserts.push({
      canonicalKey: candidate.canonicalKey,
      pattern: candidate.pattern,
      category: candidate.category,
      explanation: candidate.explanation,
      status: hasRoom ? "active" : "queued",
      contexts: JSON.stringify([context]),
      exercise: JSON.stringify(candidate.exercise),
      srsStage: 0,
      nextDueAt: params.now,
      lastCreditAt: null,
    });
  }

  return { inserts, contextUpdates };
}
