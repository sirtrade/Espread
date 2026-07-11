import { normalizeTerm } from "./normalize.js";

const MAX_CONTEXT_LEN = 300;

/**
 * Finds the first sentence of `body` that contains `term` (whole-word match
 * on normalized text), to store as the bank item's firstContext. Returns
 * null when the term never appears, e.g. the LLM returned a lemma instead
 * of the surface form that was marked.
 */
export function findTermContext(body: string, term: string): string | null {
  const normTerm = normalizeTerm(term);
  if (!normTerm) return null;

  const sentences = body.split(/(?<=[.!?…])\s+|\n+/);
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (` ${normalizeTerm(sentence)} `.includes(` ${normTerm} `)) {
      return sentence.length > MAX_CONTEXT_LEN ? `${sentence.slice(0, MAX_CONTEXT_LEN - 1)}…` : sentence;
    }
  }
  return null;
}
