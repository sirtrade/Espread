import { normalizeTerm } from "./normalize.js";
import { termAppearsIn } from "./weaving.js";

export const READING_KNOWN_THRESHOLD = 3;

// Exported so the frequency-list derivation and its tests stay in lockstep
// with this filter: a list entry this set rejects could never be counted.
export const SPANISH_FUNCTION_WORDS = new Set(
  (
    "a al algo alguna algunas alguno algunos ante antes aquel aquella aquellas aquellos aquí así aun aunque " +
    "bajo bien cada como con contra cual cuales cualquier cuando de del desde donde dos durante e el ella ellas " +
    "ello ellos en entre era erais eran eras eres es esa esas ese eso esos esta estaba estaban estado estar estas " +
    "este esto estos fue fuera fueron ha haber había han hasta hay la las le les lo los más me mi mis muy ni no nos " +
    "o otra otras otro otros para pero poco por porque que quien quienes se sea ser si sin sobre su sus te tiene todo " +
    "tras tú un una unas uno unos usted ustedes y ya yo"
  ).split(/\s+/),
);

/** Cleans model-produced article lemmas without trusting their formatting or
 * completeness. Only single content words that can be found in the exact final
 * body survive; order is stable and duplicates are removed. */
export function normalizeArticleLemmas(raw: readonly string[], body: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const lemma = normalizeTerm(value);
    if (
      !lemma ||
      lemma.includes(" ") ||
      lemma.length < 3 ||
      SPANISH_FUNCTION_WORDS.has(lemma) ||
      seen.has(lemma) ||
      !termAppearsIn(body, lemma)
    ) {
      continue;
    }
    seen.add(lemma);
    result.push(lemma);
  }
  return result;
}

/** Article lemmas eligible for passive reading encounters: a learner must not
 * have marked the word in this reading, and it must not already be in any bank
 * status. */
export function readingEncounterLemmas(
  articleLemmas: readonly string[],
  markedTerms: readonly string[],
  bankLemmas: ReadonlySet<string>,
): string[] {
  return articleLemmas.filter((lemma) => {
    if (bankLemmas.has(lemma)) return false;
    return !markedTerms.some((marked) => termAppearsIn(marked, lemma));
  });
}

export function reachesReadingThreshold(encounters: number): boolean {
  return encounters >= READING_KNOWN_THRESHOLD;
}
