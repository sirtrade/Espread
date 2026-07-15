import { grammarCandidateSchema, type GrammarCandidate } from "../llm/schemas.js";
import { normalizeTerm } from "./normalize.js";

/** Server-side cap per review (grammar-track design §10). */
export const MAX_GRAMMAR_CANDIDATES_PER_REVIEW = 5;

/** Canonical single gap marker stored in exercises. */
export const GRAMMAR_GAP = "___";

/**
 * Normalizes a model-produced canonical key into the stable identity used for
 * `(user_id, canonical_key)` uniqueness: lowercase, whitespace to `-`, only
 * `a-z 0-9 áéíóúüñ + _ -` survive. The model's key is never trusted verbatim
 * (design §3); collapsing near-synonym keys is explicitly out of scope here.
 */
export function normalizeCanonicalKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFC")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9áéíóúüñ+_-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[-+_]+|[-+_]+$/g, "");
}

/** Word-boundary containment on normalized text (punctuation/case-insensitive). */
function containsNormalized(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeTerm(needle);
  if (!normalizedNeedle) return false;
  return ` ${normalizeTerm(haystack)} `.includes(` ${normalizedNeedle} `);
}

/**
 * Validates raw model-produced grammar candidates into storable ones. Pure and
 * per-element: a candidate that fails any check is dropped without affecting
 * the others or the lexical review items (design §4, §12).
 *
 * Checks, in order:
 *  - shape (zod `grammarCandidateSchema`);
 *  - canonical key survives normalization (>= 3 chars);
 *  - `sourceForm` is a multiword construction (a single word is lexical
 *    territory, never a grammar unit — design §3);
 *  - `sourceForm` actually occurs in `sourceSentence`, and the sentence in the
 *    article body;
 *  - the exercise has exactly one gap, leaks no accepted answer in the cloze,
 *    its primary accepted answer belongs to the stored context, and at least 3
 *    distinct wrong options survive dedupe against the accepted answers;
 *  - duplicate canonical keys collapse to the first candidate;
 *  - at most `MAX_GRAMMAR_CANDIDATES_PER_REVIEW` survive.
 */
export function parseGrammarCandidates(raw: readonly unknown[], articleBody: string): GrammarCandidate[] {
  const result: GrammarCandidate[] = [];
  const seenKeys = new Set<string>();

  for (const value of raw) {
    if (result.length >= MAX_GRAMMAR_CANDIDATES_PER_REVIEW) break;

    const parsed = grammarCandidateSchema.safeParse(value);
    if (!parsed.success) continue;
    const candidate = parsed.data;

    const canonicalKey = normalizeCanonicalKey(candidate.canonicalKey);
    if (canonicalKey.length < 3 || seenKeys.has(canonicalKey)) continue;

    if (normalizeTerm(candidate.sourceForm).split(/\s+/).filter(Boolean).length < 2) continue;
    if (!containsNormalized(candidate.sourceSentence, candidate.sourceForm)) continue;
    if (!containsNormalized(articleBody, candidate.sourceSentence)) continue;

    const exercise = validateExercise(candidate);
    if (!exercise) continue;

    seenKeys.add(canonicalKey);
    result.push({ ...candidate, canonicalKey, exercise });
  }

  return result;
}

function validateExercise(candidate: GrammarCandidate): GrammarCandidate["exercise"] | null {
  const { exercise } = candidate;

  // Exactly one gap; tolerate any underscore run the model produced, but
  // store the canonical `___` marker.
  const gaps = exercise.cloze.match(/_{2,}/g) ?? [];
  if (gaps.length !== 1) return null;
  const cloze = exercise.cloze.replace(/_{2,}/, GRAMMAR_GAP);

  // The answer must not be readable anywhere in the prompt (design §7).
  const clozeText = cloze.replace(GRAMMAR_GAP, " ");
  if (exercise.acceptedAnswers.some((answer) => containsNormalized(clozeText, answer))) return null;

  // The primary correct form belongs to the saved context, so the card always
  // reconstructs something the reader actually saw.
  if (!containsNormalized(candidate.sourceSentence, exercise.acceptedAnswers[0]!)) return null;

  const acceptedNormalized = new Set(exercise.acceptedAnswers.map(normalizeTerm));
  const options: string[] = [];
  const seenOptions = new Set<string>();
  for (const option of exercise.options) {
    const normalized = normalizeTerm(option);
    if (!normalized || seenOptions.has(normalized) || acceptedNormalized.has(normalized)) continue;
    seenOptions.add(normalized);
    options.push(option);
  }
  if (options.length < 3) return null;

  return { cloze, acceptedAnswers: exercise.acceptedAnswers, options };
}
