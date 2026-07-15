import { localDayKey } from "../lib/timezone.js";

export const CEFR_LEVELS = ["A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];
export type LevelSuggestionDirection = "up" | "down";

export const LEVEL_SUGGESTION_WINDOW = 5;
export const LEVEL_SUGGESTION_LOW_DENSITY = 0.02;
export const LEVEL_SUGGESTION_HIGH_DENSITY = 0.08;
export const LEVEL_SUGGESTION_COOLDOWN_DAYS = 14;

export interface DensityMark {
  text: string;
  sentence?: string;
  pos?: { p: number; s: number; t: [number, number] };
}

export interface CompletedReading {
  body: string;
  marks: readonly DensityMark[];
}

export interface LevelSuggestion {
  direction: LevelSuggestionDirection;
  targetLevel: CefrLevel;
}

export interface SuggestionHistory {
  direction: LevelSuggestionDirection | null;
  shownAt: number | null;
  dismissedAt: number | null;
}

const WORD_RE = /[A-Za-zÁÉÍÓÚÑÜáéíóúñü]+/g;

/** Lexical tokens use the same Spanish-letter definition as the reader UI. */
export function countLexicalTokens(text: string): number {
  return text.match(WORD_RE)?.length ?? 0;
}

function lexicalTokenIndices(text: string): number[] {
  const indices: number[] = [];
  let tokenIndex = 0;
  let lastIndex = 0;
  for (const match of text.matchAll(WORD_RE)) {
    const start = match.index ?? 0;
    if (start > lastIndex) tokenIndex += 1;
    indices.push(tokenIndex);
    tokenIndex += 1;
    lastIndex = start + match[0].length;
  }
  return indices;
}

function normalizedWords(text: string): string[] {
  return (text.match(WORD_RE) ?? []).map((word) =>
    word.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es"),
  );
}

function containsSequence(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((word, j) => haystack[i + j] === word)) return true;
  }
  return false;
}

/**
 * Counts lexical tokens actually present in mark.text.
 *
 * Positional marks are projected onto lexical token indices in their containing
 * sentence, so identical and overlapping word/span/sentence marks count once.
 * Legacy marks without usable positions are normalized and maximal contained
 * sequences are retained (identical/subspan duplicates collapse). The result is
 * capped by the article's lexical word count because malformed legacy metadata
 * must never produce density above 100%.
 */
export function countMarkedLexicalTokens(body: string, marks: readonly DensityMark[]): number {
  const positioned = new Set<string>();
  const legacySequences: string[][] = [];

  for (const mark of marks) {
    const markedCount = countLexicalTokens(mark.text);
    if (markedCount === 0) continue;

    if (mark.pos && mark.sentence) {
      const [from, to] = mark.pos.t;
      const candidates = lexicalTokenIndices(mark.sentence).filter((index) => index >= from && index <= to);
      if (candidates.length > 0) {
        for (const index of candidates.slice(0, markedCount)) {
          positioned.add(`${mark.pos.p}:${mark.pos.s}:${index}`);
        }
        continue;
      }
    }

    const words = normalizedWords(mark.text);
    if (words.length > 0) legacySequences.push(words);
  }

  const maximalLegacy: string[][] = [];
  const longestFirst = legacySequences.toSorted((a, b) => b.length - a.length);
  for (const words of longestFirst) {
    if (!maximalLegacy.some((existing) => containsSequence(existing, words))) {
      maximalLegacy.push(words);
    }
  }

  return Math.min(countLexicalTokens(body), positioned.size + maximalLegacy.reduce((sum, words) => sum + words.length, 0));
}

/** Density is the fraction of article lexical tokens covered by real marks. */
export function readingMarkDensity(reading: CompletedReading): number {
  const wordCount = countLexicalTokens(reading.body);
  if (wordCount === 0) return 0;
  return countMarkedLexicalTokens(reading.body, reading.marks) / wordCount;
}

export function adjacentLevel(level: CefrLevel, direction: LevelSuggestionDirection): CefrLevel | null {
  const index = CEFR_LEVELS.indexOf(level);
  const targetIndex = direction === "up" ? index + 1 : index - 1;
  return CEFR_LEVELS[targetIndex] ?? null;
}

/** Requires exactly the latest five readings and all five on one strict side. */
export function stableLevelSuggestion(
  level: CefrLevel,
  readings: readonly CompletedReading[],
): LevelSuggestion | null {
  if (readings.length < LEVEL_SUGGESTION_WINDOW) return null;
  const window = readings.slice(0, LEVEL_SUGGESTION_WINDOW);
  const densities = window.map(readingMarkDensity);
  let direction: LevelSuggestionDirection | null = null;
  if (densities.every((density) => density < LEVEL_SUGGESTION_LOW_DENSITY)) {
    direction = "up";
  } else if (densities.every((density) => density > LEVEL_SUGGESTION_HIGH_DENSITY)) {
    direction = "down";
  }
  if (!direction) return null;
  const targetLevel = adjacentLevel(level, direction);
  return targetLevel ? { direction, targetLevel } : null;
}

function localDayOrdinal(timestamp: number, timezone: string): number {
  const [year, month, day] = localDayKey(timestamp, timezone).split("-").map(Number);
  return Math.floor(Date.UTC(year!, month! - 1, day!) / 86_400_000);
}

export function isSuggestionCoolingDown(
  suggestion: LevelSuggestion,
  history: SuggestionHistory,
  now: number,
  timezone: string,
): boolean {
  if (history.direction !== suggestion.direction) return false;
  const lastInteraction = Math.max(history.shownAt ?? -Infinity, history.dismissedAt ?? -Infinity);
  if (!Number.isFinite(lastInteraction)) return false;
  return localDayOrdinal(now, timezone) - localDayOrdinal(lastInteraction, timezone) < LEVEL_SUGGESTION_COOLDOWN_DAYS;
}

export function availableLevelSuggestion(
  level: CefrLevel,
  readings: readonly CompletedReading[],
  history: SuggestionHistory,
  now: number,
  timezone: string,
): LevelSuggestion | null {
  const suggestion = stableLevelSuggestion(level, readings);
  return suggestion && !isSuggestionCoolingDown(suggestion, history, now, timezone) ? suggestion : null;
}
