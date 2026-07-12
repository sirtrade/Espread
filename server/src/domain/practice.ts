/**
 * Spaced-repetition practice over bank items. Deliberately independent from
 * the reading-exposure pipeline (status/cleanStreak): practice reinforces
 * memory, but only clean encounters in real articles promote to "learned".
 */

export const PRACTICE_INTERVALS_DAYS = [1, 3, 7, 14, 30] as const;

/** A wrong answer sends the item back to stage 0 and makes it due again shortly. */
const RETRY_AFTER_MS = 10 * 60 * 1000;

export interface PracticeState {
  practiceStage: number;
  nextPracticeAt: number;
}

export function nextPracticeState(currentStage: number, correct: boolean, now: number): PracticeState {
  if (!correct) {
    return { practiceStage: 0, nextPracticeAt: now + RETRY_AFTER_MS };
  }
  const stage = Math.min(currentStage + 1, PRACTICE_INTERVALS_DAYS.length);
  const days = PRACTICE_INTERVALS_DAYS[stage - 1]!;
  return { practiceStage: stage, nextPracticeAt: now + days * 24 * 60 * 60 * 1000 };
}

/** Common Spanish words used to pad multiple-choice options when the user's
 *  bank is still too small to supply enough distractors. */
export const FALLBACK_DISTRACTORS = [
  "desarrollo",
  "esfuerzo",
  "amenaza",
  "propuesta",
  "recurso",
  "acuerdo",
  "fuente",
  "medida",
  "apoyo",
  "nivel",
  "crecimiento",
  "búsqueda",
] as const;

/**
 * Builds a shuffled multiple-choice option list containing the correct term
 * plus distinct distractors drawn first from `pool`, then from the built-in
 * fallback list.
 */
export function buildOptions(
  correct: string,
  pool: readonly string[],
  count = 4,
  random: () => number = Math.random,
): string[] {
  const distractors: string[] = [];
  const seen = new Set([correct.toLowerCase()]);

  const candidates = [...pool];
  // Fisher-Yates over the pool so distractor picks are uniform.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }

  for (const c of [...candidates, ...FALLBACK_DISTRACTORS]) {
    if (distractors.length >= count - 1) break;
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    distractors.push(c);
  }

  const options = [...distractors];
  const insertAt = Math.floor(random() * (options.length + 1));
  options.splice(insertAt, 0, correct);
  return options;
}

/**
 * Replaces the term inside its context sentence with a blank, for cloze
 * cards. Case-insensitive; returns null when the term does not occur in the
 * context (caller falls back to a translation prompt).
 */
export function buildCloze(context: string, term: string): string | null {
  const idx = context.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return null;
  return context.slice(0, idx) + "_____" + context.slice(idx + term.length);
}

/**
 * Cloze over the stored context: the blank hides the surface form actually
 * used in the sentence ("perfila"), falling back to the lemma. Returns the
 * blanked prompt plus the answer that fills it, or null when neither form
 * occurs in the context.
 */
export function buildClozeCard(
  context: string | null,
  lemma: string,
  surfaceForm: string | null,
): { prompt: string; answer: string } | null {
  if (!context) return null;
  for (const answer of [surfaceForm, lemma]) {
    if (!answer) continue;
    const prompt = buildCloze(context, answer);
    if (prompt) return { prompt, answer };
  }
  return null;
}

/** Same-POS distractors stored on the item (JSON), falling back gracefully. */
export function parseStoredDistractors(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === "string" && d.length > 0) : [];
  } catch {
    return [];
  }
}
