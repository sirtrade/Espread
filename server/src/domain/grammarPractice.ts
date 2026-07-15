import { grammarExerciseSchema, type GrammarExercise } from "../llm/schemas.js";
import { GRAMMAR_GAP } from "./grammar.js";
import { buildOptions, containsLeakTerm } from "./practice.js";

/** From this rung up a grammar unit is drilled as a typed cloze (produce the
 *  form) instead of multiple choice (recognize it) — design §7. */
export const GRAMMAR_TYPED_MIN_STAGE = 2;

/** Defensive parse of the stored exercise JSON: a corrupted row yields null
 *  and the card is skipped, never served with a broken or leaking prompt. */
export function parseGrammarExercise(raw: string): GrammarExercise | null {
  try {
    const parsed = grammarExerciseSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface GrammarCardSource {
  id: number;
  pattern: string;
  category: string;
  explanation: string;
  /** stored exercise JSON */
  exercise: string;
  srsStage: number;
}

/** A grammar practice card. `answer`/`options` are empty for typed cards: the
 *  accepted forms stay server-side and the answer is graded there. */
export interface GrammarQueueCard {
  grammarItemId: number;
  type: "cloze" | "typed";
  /** the stored cloze, one `___` gap */
  prompt: string;
  answer: string;
  options: string[];
  category: string;
  /** hint material (design §7): shown only on request, never contains an
   *  accepted answer (leaking values are nulled) */
  pattern: string | null;
  explanation: string | null;
  /** full sentence for after-answer feedback; null for typed (revealed by the
   *  answer endpoint instead) */
  context: string | null;
  /** all correct forms, for cross-card leak protection; never serialized */
  leakAnswers: string[];
}

/**
 * Builds the practice card for one due grammar unit, or null when the stored
 * exercise can't produce a safe card (corrupt JSON, missing gap, an accepted
 * answer readable in the prompt, or fewer than 4 MC options). Safety per
 * design §7: the answer is never visible in the prompt or the hint.
 */
export function buildGrammarQueueCard(
  src: GrammarCardSource,
  random: () => number = Math.random,
): GrammarQueueCard | null {
  const exercise = parseGrammarExercise(src.exercise);
  if (!exercise) return null;
  if (!exercise.cloze.includes(GRAMMAR_GAP)) return null;

  const answer = exercise.acceptedAnswers[0]!;
  const promptText = exercise.cloze.replace(GRAMMAR_GAP, " ");
  if (exercise.acceptedAnswers.some((form) => containsLeakTerm(promptText, form))) return null;

  const hintSafe = (text: string): string | null =>
    exercise.acceptedAnswers.some((form) => containsLeakTerm(text, form)) ? null : text;

  const typed = src.srsStage >= GRAMMAR_TYPED_MIN_STAGE;
  const options = typed ? [] : buildOptions(answer, exercise.options, 4, random);
  if (!typed && options.length < 4) return null;

  return {
    grammarItemId: src.id,
    type: typed ? "typed" : "cloze",
    prompt: exercise.cloze,
    answer: typed ? "" : answer,
    options,
    category: src.category,
    pattern: hintSafe(src.pattern),
    explanation: hintSafe(src.explanation),
    context: typed ? null : exercise.cloze.replace(GRAMMAR_GAP, answer),
    leakAnswers: [...exercise.acceptedAnswers],
  };
}
