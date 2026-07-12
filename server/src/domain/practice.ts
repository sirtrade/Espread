/**
 * Spaced-repetition practice over bank items. Practice now feeds the same
 * learning pipeline as reading: a first-try-correct answer counts as a clean
 * encounter (see nextStreakState), so drilling a word can promote it to
 * "learned" just like clean reading exposures do. The SRS ladder
 * (practiceStage/nextPracticeAt) is orthogonal and always advances.
 */

import { LEARNED_STREAK_THRESHOLD, type BankStatus, type PartOfSpeech } from "./bank.js";

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

/** Two timestamps fall on the same calendar day (UTC). */
function isSameUtcDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
}

export interface StreakInput {
  cleanStreak: number;
  status: BankStatus;
  /** when this item last earned a practice streak credit (anti-farm) */
  lastStreakCreditAt: number | null;
}

export interface StreakResult {
  cleanStreak: number;
  status: BankStatus;
  lastStreakCreditAt: number | null;
  /** the streak actually moved up this answer (a "clean encounter" landed) */
  streakCredited: boolean;
  /** this answer crossed the threshold and promoted the item to "learned" */
  becameLearned: boolean;
}

/**
 * Learning effect of one practice answer, mirroring the reading-exposure rule:
 *  - a first-try-correct answer is a clean encounter: cleanStreak+1, and at
 *    LEARNED_STREAK_THRESHOLD the item becomes "learned";
 *  - a wrong answer resets the streak to 0 (no daily limit on resets);
 *  - anti-farm: at most one streak credit per item per calendar day (UTC).
 *    Extra correct answers the same day still move SRS but not the streak.
 *  - already-learned items are never re-credited.
 */
export function nextStreakState(input: StreakInput, correct: boolean, now: number): StreakResult {
  if (!correct) {
    return {
      cleanStreak: 0,
      status: input.status,
      lastStreakCreditAt: input.lastStreakCreditAt,
      streakCredited: false,
      becameLearned: false,
    };
  }

  const alreadyCreditedToday = input.lastStreakCreditAt != null && isSameUtcDay(input.lastStreakCreditAt, now);
  if (input.status === "learned" || alreadyCreditedToday) {
    return {
      cleanStreak: input.cleanStreak,
      status: input.status,
      lastStreakCreditAt: input.lastStreakCreditAt,
      streakCredited: false,
      becameLearned: false,
    };
  }

  const cleanStreak = input.cleanStreak + 1;
  const becameLearned = cleanStreak >= LEARNED_STREAK_THRESHOLD;
  return {
    cleanStreak,
    status: becameLearned ? "learned" : input.status,
    lastStreakCreditAt: now,
    streakCredited: true,
    becameLearned,
  };
}

/**
 * POS-aware padding words, used only as a last resort when the user's bank
 * can't supply enough same-part-of-speech distractors. Kept per-POS so a noun
 * question never offers a verb as a decoy. Phrase cards get no fallback — a
 * phrase must be drilled against other phrases or skipped entirely.
 */
export const FALLBACK_DISTRACTORS: Record<"noun" | "verb" | "adj", readonly string[]> = {
  noun: [
    "desarrollo",
    "esfuerzo",
    "amenaza",
    "propuesta",
    "recurso",
    "acuerdo",
    "fuente",
    "medida",
    "nivel",
    "crecimiento",
  ],
  verb: [
    "desarrollar",
    "proponer",
    "alcanzar",
    "establecer",
    "impulsar",
    "señalar",
    "lograr",
    "mantener",
    "generar",
    "sostener",
  ],
  adj: [
    "importante",
    "reciente",
    "evidente",
    "complejo",
    "notable",
    "frecuente",
    "amplio",
    "profundo",
    "escaso",
    "sólido",
  ],
};

/** The fallback list for a POS. Nouns/adverbs/other fall back to the noun list. */
function fallbackForPos(pos: PartOfSpeech | null): readonly string[] {
  if (pos === "verb") return FALLBACK_DISTRACTORS.verb;
  if (pos === "adj") return FALLBACK_DISTRACTORS.adj;
  return FALLBACK_DISTRACTORS.noun;
}

/** A multi-word answer/option (used to keep phrases and single words apart). */
export function isPhraseText(text: string): boolean {
  return text.trim().includes(" ");
}

function shuffleInPlace<T>(arr: T[], random: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * Builds a shuffled multiple-choice option list: the correct term plus up to
 * `count - 1` distinct distractors drawn from `pool` (already ordered by
 * priority by the caller). No built-in padding — the caller composes the pool,
 * including any POS-aware fallback, so this never mixes phrases with words or
 * crosses parts of speech.
 */
export function buildOptions(
  correct: string,
  pool: readonly string[],
  count = 4,
  random: () => number = Math.random,
): string[] {
  const seen = new Set([correct.toLowerCase()]);
  const distractors: string[] = [];

  for (const c of shuffleInPlace([...pool], random)) {
    if (distractors.length >= count - 1) break;
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    distractors.push(c);
  }

  return shuffleInPlace([correct, ...distractors], random);
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

/** Minimum options for a usable multiple-choice card (correct + 2 distractors). */
const MIN_OPTIONS = 3;

/** Everything needed to build a practice card, independent of the DB row shape. */
export interface CardSource {
  lemma: string;
  isPhrase: boolean;
  translation: string | null;
  firstContext: string | null;
  surfaceForm: string | null;
  contextTranslation: string | null;
  pos: PartOfSpeech | null;
  /** same-POS distractors stored on the item */
  storedDistractors: readonly string[];
  /** other bank lemmas of the same POS, for padding */
  poolLemmas: readonly string[];
}

export type CardType = "cloze" | "recall";

export interface BuiltCard {
  type: CardType;
  prompt: string;
  /** the correct option: the blanked surface form (cloze) or the lemma (recall) */
  answer: string;
  options: string[];
  translation: string | null;
  /** the article sentence, for after-answer feedback */
  context: string | null;
  /** translation of the context sentence, shown as a cloze hint */
  contextTranslation: string | null;
}

/** Composes the distractor pool for an item, keeping phrases and words apart. */
function distractorPool(src: CardSource): string[] {
  const base = [...src.storedDistractors, ...src.poolLemmas];
  if (src.isPhrase) {
    // Phrase cards drill only against other phrases (no single words, no fallback).
    return base.filter(isPhraseText);
  }
  return [...base.filter((w) => !isPhraseText(w)), ...fallbackForPos(src.pos)];
}

/** Whether `answer` occurs anywhere inside `text` (case-insensitive). */
function leaks(text: string, answer: string): boolean {
  return text.toLowerCase().includes(answer.toLowerCase());
}

/** Cloze variant, or null when there is no usable context or the answer would
 *  still be visible in the prompt after blanking (leak). */
function buildClozeVariant(src: CardSource, pool: string[], random: () => number): BuiltCard | null {
  const cloze = buildClozeCard(src.firstContext, src.lemma, src.surfaceForm);
  if (!cloze) return null;
  // The blank replaces the first occurrence; a repeat elsewhere would leak it.
  if (leaks(cloze.prompt, cloze.answer)) return null;
  const options = buildOptions(cloze.answer, pool, 4, random);
  if (options.length < MIN_OPTIONS) return null;
  return {
    type: "cloze",
    prompt: cloze.prompt,
    answer: cloze.answer,
    options,
    translation: src.translation,
    context: src.firstContext,
    contextTranslation: src.contextTranslation,
  };
}

/** Recall variant, or null when there is no translation or the lemma leaks
 *  into the translation prompt (e.g. a translation that echoes the word). */
function buildRecallVariant(src: CardSource, pool: string[], random: () => number): BuiltCard | null {
  if (!src.translation) return null;
  if (leaks(src.translation, src.lemma)) return null;
  const options = buildOptions(src.lemma, pool, 4, random);
  if (options.length < MIN_OPTIONS) return null;
  return {
    type: "recall",
    prompt: src.translation,
    answer: src.lemma,
    options,
    translation: src.translation,
    context: src.firstContext,
    contextTranslation: src.contextTranslation,
  };
}

/**
 * Builds one practice card for an item, or null when neither a cloze nor a
 * recall card can be made safely (missing data, unavoidable answer leak, or —
 * for phrases — too few phrase distractors).
 *
 * `prefer` alternates the question style; leak protection degrades a leaking
 * recall into a cloze (and skips a leaking cloze), so the returned card always
 * satisfies: the correct answer never appears in the prompt.
 */
export function buildCard(src: CardSource, prefer: CardType = "cloze", random: () => number = Math.random): BuiltCard | null {
  const pool = distractorPool(src);
  const cloze = buildClozeVariant(src, pool, random);
  const recall = buildRecallVariant(src, pool, random);
  const [first, second] = prefer === "cloze" ? [cloze, recall] : [recall, cloze];
  return first ?? second ?? null;
}
