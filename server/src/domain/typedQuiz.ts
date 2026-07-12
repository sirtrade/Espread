/**
 * Typed-recall quiz (bot): the user sees the translation (L1) and must TYPE
 * the Spanish word, instead of picking it from buttons. Production recall is
 * a much stronger memory exercise than multiple-choice recognition, so it
 * kicks in once a word has climbed a couple of SRS rungs.
 */

import { buildClozeCard } from "./practice.js";

/** From this SRS stage on, the bot asks for a typed answer instead of buttons. */
export const TYPED_QUIZ_MIN_STAGE = 2;

/** A pending typed quiz older than this is ignored (stray texts aren't graded). */
export const PENDING_QUIZ_TTL_MS = 24 * 60 * 60 * 1000;

export interface TypedQuizCard {
  /** the translation the user must produce the Spanish word for */
  prompt: string;
  /** the article sentence with the word blanked, shown as a hint (may be null) */
  contextHint: string | null;
  /** forms accepted as the answer: the surface form and/or the lemma */
  accepted: string[];
}

export interface TypedQuizSource {
  lemma: string;
  translation: string | null;
  firstContext: string | null;
  surfaceForm: string | null;
}

/**
 * Builds a typed-recall card, or null when it can't be asked safely (no
 * translation, or the translation echoes the answer). The blanked context
 * sentence is included as a hint when available — with a typed answer it
 * can't give the word away, and it disambiguates synonyms.
 */
export function buildTypedQuizCard(src: TypedQuizSource): TypedQuizCard | null {
  if (!src.translation) return null;
  const accepted = [src.surfaceForm, src.lemma].filter(
    (f): f is string => typeof f === "string" && f.length > 0,
  );
  if (accepted.length === 0) return null;
  // The translation must not contain the answer (e.g. a borrowed word).
  const lowerTranslation = src.translation.toLowerCase();
  if (accepted.some((f) => lowerTranslation.includes(f.toLowerCase()))) return null;

  const cloze = buildClozeCard(src.firstContext, src.lemma, src.surfaceForm);
  const contextHint =
    cloze && !accepted.some((f) => cloze.prompt.toLowerCase().includes(f.toLowerCase()))
      ? cloze.prompt
      : null;

  return { prompt: src.translation, contextHint, accepted };
}

const LEADING_ARTICLES = /^(?:el|la|los|las|un|una|unos|unas)\s+/;

/** Lowercase, trim edge punctuation, collapse spaces, drop a leading article. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[¿¡!?.,;:«»"'()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(LEADING_ARTICLES, "");
}

/** Strips Spanish diacritics (á→a, ñ→n) for accent-forgiving comparison. */
function deaccent(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** True when the strings are equal up to one insertion, deletion or substitution. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (short.length === long.length) i++; // substitution
    j++; // insertion in the longer string (or the substitution's other half)
  }
  return edits + (long.length - j) <= 1;
}

/** Typo forgiveness only applies to answers long enough that one edit can't
 *  turn them into a different common word (casa/cosa, pero/perro). */
const MIN_LENGTH_FOR_TYPO = 6;

export type TypedVerdict =
  /** exact match (accents included) */
  | "exact"
  /** right word, wrong spelling (missing accent or a single typo) */
  | "spelling"
  | "wrong";

export interface TypedGrade {
  correct: boolean;
  verdict: TypedVerdict;
  /** the accepted form the input matched (or the primary form when wrong) */
  matched: string;
}

/**
 * Grades a typed answer against the accepted forms. Accent mistakes and a
 * single typo (on long enough words) still count as correct — the goal is
 * recalling the word, not perfect orthography — but the verdict lets the
 * caller show the proper spelling.
 */
export function gradeTypedAnswer(input: string, accepted: readonly string[]): TypedGrade {
  const given = normalize(input);

  for (const form of accepted) {
    if (normalize(form) === given) return { correct: true, verdict: "exact", matched: form };
  }

  const givenPlain = deaccent(given);
  for (const form of accepted) {
    if (deaccent(normalize(form)) === givenPlain) {
      return { correct: true, verdict: "spelling", matched: form };
    }
  }

  for (const form of accepted) {
    const target = deaccent(normalize(form));
    if (target.length >= MIN_LENGTH_FOR_TYPO && withinOneEdit(target, givenPlain)) {
      return { correct: true, verdict: "spelling", matched: form };
    }
  }

  return { correct: false, verdict: "wrong", matched: accepted[0] ?? "" };
}
