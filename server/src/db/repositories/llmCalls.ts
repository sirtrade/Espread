import { db } from "../client.js";
import { llmCalls } from "../schema.js";
import { computeCostMicros } from "../../llm/pricing.js";

export async function recordLlmCall(params: {
  userId: number | null;
  kind: "search" | "generate" | "review";
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
