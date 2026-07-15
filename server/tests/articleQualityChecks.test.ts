import { describe, expect, it } from "vitest";
import {
  countWords,
  deterministicArticleChecks,
  WORD_HARD_MAX,
  WORD_HARD_MIN,
  WORD_TARGET_MAX,
  WORD_TARGET_MIN,
} from "../src/domain/articleQuality.js";

function wordsOf(n: number): string {
  return Array(n).fill("palabra").join(" ");
}

describe("countWords", () => {
  it("counts real words and ignores punctuation-only tokens", () => {
    expect(countWords("Hola, mundo entero.")).toBe(3);
    expect(countWords("  uno   dos  tres  ")).toBe(3);
    expect(countWords("uno — dos")).toBe(2);
  });

  it("counts numbers as words", () => {
    expect(countWords("En 2026 pasó algo")).toBe(4);
  });
});

describe("deterministicArticleChecks: length", () => {
  it("passes a body inside the ideal band with no length issue", () => {
    const result = deterministicArticleChecks(wordsOf(WORD_TARGET_MIN + 10));
    expect(result.hardFail).toBe(false);
    expect(result.issues.some((i) => i.category === "length")).toBe(false);
  });

  it("hard-fails a body below the hard minimum", () => {
    const result = deterministicArticleChecks(wordsOf(WORD_HARD_MIN - 50));
    expect(result.hardFail).toBe(true);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ category: "length", severity: "major" }),
    );
  });

  it("hard-fails a body above the hard maximum", () => {
    const result = deterministicArticleChecks(wordsOf(WORD_HARD_MAX + 50));
    expect(result.hardFail).toBe(true);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ category: "length", severity: "major" }),
    );
  });

  it("reports a minor issue when between the hard bound and the ideal band", () => {
    const result = deterministicArticleChecks(wordsOf(WORD_TARGET_MIN - 20));
    expect(result.hardFail).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ category: "length", severity: "minor" }),
    );
  });

  it("keeps the ideal band tighter than the hard band", () => {
    expect(WORD_HARD_MIN).toBeLessThan(WORD_TARGET_MIN);
    expect(WORD_HARD_MAX).toBeGreaterThan(WORD_TARGET_MAX);
  });
});

describe("deterministicArticleChecks: cohesion", () => {
  it("flags empty paragraphs as a minor cohesion issue", () => {
    const body = `${wordsOf(WORD_TARGET_MIN)}\n\n\n\n${wordsOf(20)}`;
    const result = deterministicArticleChecks(body);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ category: "cohesion", severity: "minor" }),
    );
  });

  it("does not flag a clean two-paragraph body", () => {
    const body = `${wordsOf(150)}\n\n${wordsOf(120)}`;
    const result = deterministicArticleChecks(body);
    expect(result.issues.some((i) => i.category === "cohesion")).toBe(false);
  });
});
