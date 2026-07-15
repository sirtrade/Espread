import type { QualityIssue } from "../llm/schemas.js";

/**
 * Deterministic, LLM-free checks on a generated article body. These are the
 * source of truth for objective properties (length, empty paragraphs) that a
 * language model should not be trusted to self-report reliably.
 */

/** Ideal length band communicated to the writer and auditor (250-320 words). */
export const WORD_TARGET_MIN = 250;
export const WORD_TARGET_MAX = 320;

/**
 * Hard bounds that force a rewrite when crossed. Wider than the ideal band on
 * purpose: a solid 240- or 330-word article should not be rewritten over a
 * handful of words, but a 40-word stub or a 600-word wall clearly must be.
 */
export const WORD_HARD_MIN = 200;
export const WORD_HARD_MAX = 400;

/** Counts words in a Spanish body, ignoring punctuation-only tokens. */
export function countWords(body: string): number {
  return body
    .trim()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export interface DeterministicCheckResult {
  wordCount: number;
  issues: QualityIssue[];
  /** True when an objective problem is severe enough to require a rewrite. */
  hardFail: boolean;
}

/**
 * Runs the objective checks and returns any issues found, flagging a hard fail
 * when the length is outside the safety bounds. Cohesion problems (empty
 * paragraphs) are reported as minor issues that inform, but don't by themselves
 * force, a rewrite.
 */
export function deterministicArticleChecks(body: string): DeterministicCheckResult {
  const issues: QualityIssue[] = [];
  const wordCount = countWords(body);
  let hardFail = false;

  if (wordCount < WORD_HARD_MIN) {
    hardFail = true;
    issues.push({
      category: "length",
      severity: "major",
      excerpt: null,
      suggestion: `El texto tiene ${wordCount} palabras; es demasiado corto. Apunta a entre ${WORD_TARGET_MIN} y ${WORD_TARGET_MAX} palabras.`,
    });
  } else if (wordCount > WORD_HARD_MAX) {
    hardFail = true;
    issues.push({
      category: "length",
      severity: "major",
      excerpt: null,
      suggestion: `El texto tiene ${wordCount} palabras; es demasiado largo. Apunta a entre ${WORD_TARGET_MIN} y ${WORD_TARGET_MAX} palabras.`,
    });
  } else if (wordCount < WORD_TARGET_MIN || wordCount > WORD_TARGET_MAX) {
    issues.push({
      category: "length",
      severity: "minor",
      excerpt: null,
      suggestion: `El texto tiene ${wordCount} palabras; el rango ideal es ${WORD_TARGET_MIN}-${WORD_TARGET_MAX}.`,
    });
  }

  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim());
  const hasBlankParagraph = paragraphs.some((p) => p.length === 0);
  // A run of 3+ line breaks means a fully blank paragraph slipped in even when
  // the split above collapses the separator into one.
  const hasExtraBlankLine = /\n[ \t]*\n[ \t]*\n/.test(body);
  if (hasBlankParagraph || hasExtraBlankLine) {
    issues.push({
      category: "cohesion",
      severity: "minor",
      excerpt: null,
      suggestion: "Hay párrafos vacíos o saltos de línea sobrantes; limpia la separación de párrafos.",
    });
  }

  return { wordCount, issues, hardFail };
}
