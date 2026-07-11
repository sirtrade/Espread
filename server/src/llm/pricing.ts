/**
 * USD per million tokens. Verify against the current Anthropic pricing page
 * before relying on cost figures in production — these are the rates at
 * time of writing and models/prices change.
 */
const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-8": { input: 15, output: 75 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
};

const DEFAULT_PRICING = { input: 3, output: 15 };

/** Returns cost in micro-USD (1e-6 USD) so it fits an integer SQLite column. */
export function computeCostMicros(model: string, inputTokens: number, outputTokens: number): number {
  const rate = PRICING_USD_PER_MTOK[model] ?? DEFAULT_PRICING;
  const usd = (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
  return Math.round(usd * 1_000_000);
}
