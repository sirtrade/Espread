/**
 * Client mirror of the server's typed-recall grading (`server/src/domain/
 * typedQuiz.ts` `gradeTypedAnswer`). First attempts are always graded on the
 * server (the client is never told the accepted forms up front); this mirror is
 * used ONLY to grade same-session RETRIES of a typed card — a client-only
 * re-drill that never hits the server — against the answer the server already
 * revealed on the first attempt. Keep it in sync with the server function.
 */
import type { TypedVerdict } from "../api/types.js";

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
    if (short.length === long.length) i++;
    j++;
  }
  return edits + (long.length - j) <= 1;
}

/** Typo forgiveness only applies to answers long enough that one edit can't
 *  turn them into a different common word (casa/cosa, pero/perro). */
const MIN_LENGTH_FOR_TYPO = 6;

export interface TypedGrade {
  correct: boolean;
  verdict: TypedVerdict;
}

/** Grades a typed answer against the accepted forms, forgiving accents and a
 *  single typo on long-enough words — mirrors the server's `gradeTypedAnswer`. */
export function gradeTyped(input: string, accepted: readonly string[]): TypedGrade {
  const given = normalize(input);

  for (const form of accepted) {
    if (normalize(form) === given) return { correct: true, verdict: "exact" };
  }

  const givenPlain = deaccent(given);
  for (const form of accepted) {
    if (deaccent(normalize(form)) === givenPlain) return { correct: true, verdict: "spelling" };
  }

  for (const form of accepted) {
    const target = deaccent(normalize(form));
    if (target.length >= MIN_LENGTH_FOR_TYPO && withinOneEdit(target, givenPlain)) {
      return { correct: true, verdict: "spelling" };
    }
  }

  return { correct: false, verdict: "wrong" };
}
