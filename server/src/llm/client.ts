import Anthropic from "@anthropic-ai/sdk";
import { config } from "../lib/config.js";

export const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

export function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/** Retries a call on 429 (rate limit) / 529 (overloaded) with exponential backoff + jitter. */
export async function withBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const status = err instanceof Anthropic.APIError ? err.status : undefined;
      const retryable = status === 429 || status === 529;
      if (!retryable || attempt >= maxRetries) throw err;
      const delayMs = 500 * 2 ** attempt + Math.random() * 250;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempt += 1;
    }
  }
}
