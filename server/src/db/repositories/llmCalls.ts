import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../client.js";
import { llmCalls } from "../schema.js";
import { computeCostMicros } from "../../llm/pricing.js";

export async function recordLlmCall(params: {
  userId: number | null;
  kind: "search" | "generate" | "review" | "practice" | "enrich";
  model: string;
  inputTokens: number;
  outputTokens: number;
  ok: boolean;
}): Promise<void> {
  await db.insert(llmCalls).values({
    userId: params.userId,
    kind: params.kind,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    costUsd: computeCostMicros(params.model, params.inputTokens, params.outputTokens),
    ok: params.ok,
  });
}

/** Counts a user's LLM calls of a given kind in the last 24h, for rate limiting. */
export async function countRecentCalls(userId: number, kind: "generate" | "review" | "practice"): Promise<number> {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(llmCalls)
    .where(and(eq(llmCalls.userId, userId), eq(llmCalls.kind, kind), gte(llmCalls.createdAt, since)));
  return row?.count ?? 0;
}

export interface UsageByUser {
  userId: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsdMicros: number;
}

export async function getUsageByUser(): Promise<UsageByUser[]> {
  const rows = await db
    .select({
      userId: llmCalls.userId,
      calls: sql<number>`count(*)`,
      inputTokens: sql<number>`sum(${llmCalls.inputTokens})`,
      outputTokens: sql<number>`sum(${llmCalls.outputTokens})`,
      costUsdMicros: sql<number>`sum(${llmCalls.costUsd})`,
    })
    .from(llmCalls)
    .groupBy(llmCalls.userId);
  return rows
    .filter((r): r is UsageByUser => r.userId !== null)
    .map((r) => ({ ...r, userId: r.userId as number }));
}
