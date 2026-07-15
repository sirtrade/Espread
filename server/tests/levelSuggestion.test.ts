import { describe, expect, it } from "vitest";
import {
  CEFR_LEVELS,
  LEVEL_SUGGESTION_HIGH_DENSITY,
  LEVEL_SUGGESTION_LOW_DENSITY,
  adjacentLevel,
  availableLevelSuggestion,
  countLexicalTokens,
  countMarkedLexicalTokens,
  readingMarkDensity,
  stableLevelSuggestion,
  type CompletedReading,
} from "../src/domain/levelSuggestion.js";

function reading(markedWords: number, totalWords = 100): CompletedReading {
  return {
    body: Array.from({ length: totalWords }, (_, i) => `palabra${String.fromCharCode(97 + (i % 26))}`).join(" "),
    marks: markedWords === 0
      ? []
      : [{ text: Array.from({ length: markedWords }, (_, i) => `marca${String.fromCharCode(97 + i)}`).join(" ") }],
  };
}

describe("level suggestion density", () => {
  it("counts Spanish lexical tokens and guards an empty body", () => {
    expect(countLexicalTokens("¿Qué tal? Niño, pingüino.")).toBe(4);
    expect(readingMarkDensity({ body: "123 …", marks: [{ text: "palabra" }] })).toBe(0);
  });

  it("counts mark.text words, not sentence size or mark count", () => {
    expect(readingMarkDensity({
      body: "Uno dos tres cuatro cinco seis siete ocho nueve diez.",
      marks: [{ text: "dos tres cuatro", sentence: "Uno dos tres cuatro cinco.", pos: { p: 0, s: 0, t: [2, 6] } }],
    })).toBe(0.3);
  });

  it("deduplicates identical and overlapping positional marks", () => {
    const body = "Uno dos tres cuatro cinco.";
    const sentence = body;
    expect(countMarkedLexicalTokens(body, [
      { text: "dos tres", sentence, pos: { p: 0, s: 0, t: [2, 4] } },
      { text: "tres cuatro", sentence, pos: { p: 0, s: 0, t: [4, 6] } },
      { text: sentence, sentence, pos: { p: 0, s: 0, t: [0, 8] } },
    ])).toBe(5);
  });

  it("normalizes and collapses legacy identical/subspan marks, then caps at body words", () => {
    expect(countMarkedLexicalTokens("Hola mundo.", [
      { text: "HÓLA mundo" },
      { text: "mundo" },
      { text: "otra marca enorme" },
    ])).toBe(2);
  });
});

describe("stable level suggestion", () => {
  it("maps every level to only one adjacent level and respects A2/C2 bounds", () => {
    expect(CEFR_LEVELS.map((level) => adjacentLevel(level, "up"))).toEqual(["B1", "B2", "C1", "C2", null]);
    expect(CEFR_LEVELS.map((level) => adjacentLevel(level, "down"))).toEqual([null, "A2", "B1", "B2", "C1"]);
  });

  it("suggests up only when all five readings are strictly below 2%", () => {
    expect(stableLevelSuggestion("B1", Array.from({ length: 5 }, () => reading(1)))).toEqual({
      direction: "up",
      targetLevel: "B2",
    });
    expect(stableLevelSuggestion("B1", Array.from({ length: 5 }, () => reading(2)))).toBeNull();
    expect(LEVEL_SUGGESTION_LOW_DENSITY).toBe(0.02);
  });

  it("suggests down only when all five readings are strictly above 8%", () => {
    expect(stableLevelSuggestion("C2", Array.from({ length: 5 }, () => reading(9)))).toEqual({
      direction: "down",
      targetLevel: "C1",
    });
    expect(stableLevelSuggestion("C1", Array.from({ length: 5 }, () => reading(8)))).toBeNull();
    expect(LEVEL_SUGGESTION_HIGH_DENSITY).toBe(0.08);
  });

  it("returns no suggestion for fewer than five, mixed windows, A2-down, or C2-up", () => {
    expect(stableLevelSuggestion("B1", Array.from({ length: 4 }, () => reading(0)))).toBeNull();
    expect(stableLevelSuggestion("B1", [reading(0), reading(0), reading(0), reading(0), reading(9)])).toBeNull();
    expect(stableLevelSuggestion("A2", Array.from({ length: 5 }, () => reading(9)))).toBeNull();
    expect(stableLevelSuggestion("C2", Array.from({ length: 5 }, () => reading(0)))).toBeNull();
  });
});

describe("suggestion cooldown", () => {
  const signal = Array.from({ length: 5 }, () => reading(0));
  const now = Date.parse("2026-03-15T00:30:00Z");

  it("suppresses the same direction for 14 local calendar days after showing", () => {
    const shownAt = Date.parse("2026-03-02T23:30:00Z");
    expect(availableLevelSuggestion(
      "B1",
      signal,
      { direction: "up", shownAt, dismissedAt: null },
      now,
      "America/Los_Angeles",
    )).toBeNull(); // local Mar 2 -> local Mar 14: 12 days
    expect(availableLevelSuggestion(
      "B1",
      signal,
      { direction: "up", shownAt, dismissedAt: null },
      Date.parse("2026-03-16T07:30:00Z"),
      "America/Los_Angeles",
    )).toEqual({ direction: "up", targetLevel: "B2" }); // local Mar 16: exactly 14 days, across DST
  });

  it("uses dismissal time and does not suppress an opposite direction", () => {
    expect(availableLevelSuggestion(
      "B1",
      signal,
      { direction: "up", shownAt: now - 30 * 86_400_000, dismissedAt: now - 1_000 },
      now,
      "UTC",
    )).toBeNull();
    expect(availableLevelSuggestion(
      "B1",
      signal,
      { direction: "down", shownAt: now - 1_000, dismissedAt: null },
      now,
      "UTC",
    )).toEqual({ direction: "up", targetLevel: "B2" });
  });
});
