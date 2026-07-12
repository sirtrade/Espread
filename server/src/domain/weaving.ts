import { normalizeTerm } from "./normalize.js";

/**
 * A lenient check that a (possibly inflected) lemma actually shows up in an
 * article body. Spanish inflection means the exact lemma rarely appears
 * verbatim ("perfilar" -> "se perfila"), so we match on a shared stem: every
 * word of the lemma must have some body word that shares a leading stem.
 * Accuracy is deliberately loose — over-counting only costs an extra clean
 * exposure, under-counting only keeps a word due a little longer.
 */
export function termAppearsIn(body: string, lemma: string): boolean {
  const bodyWords = normalizeTerm(body).split(/\s+/).filter(Boolean);
  const lemmaWords = normalizeTerm(lemma).split(/\s+/).filter(Boolean);
  if (lemmaWords.length === 0) return false;
  return lemmaWords.every((lw) => {
    // Drop the last couple of letters so inflected endings still match, but
    // keep at least 4 chars so short words don't match everything.
    const stemLen = Math.max(4, lw.length - 2);
    const stem = lw.slice(0, Math.min(lw.length, stemLen));
    return bodyWords.some((bw) => bw.startsWith(stem) || stem.startsWith(bw));
  });
}

/**
 * From the words we asked the model to weave in, keep only those that actually
 * landed in the article: verified by a body stem-match, or explicitly reported
 * by the model in its `usedTerms`. This becomes the article's `target_terms`,
 * so a skipped candidate is never mistaken for a clean exposure.
 */
export function verifyWovenTerms(
  candidates: readonly string[],
  body: string,
  modelUsed: readonly string[] | undefined,
): string[] {
  const modelSet = new Set((modelUsed ?? []).map((t) => normalizeTerm(t)));
  return candidates.filter((c) => termAppearsIn(body, c) || modelSet.has(normalizeTerm(c)));
}
