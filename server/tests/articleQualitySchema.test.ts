import { describe, expect, it } from "vitest";
import { articleQualityVerdictSchema } from "../src/llm/schemas.js";

function validVerdict(overrides: Record<string, unknown> = {}) {
  return {
    estimatedLevel: "C1",
    naturalness: 4,
    cefrFit: 4,
    readability: 5,
    factualGrounding: 5,
    issues: [
      { category: "collocation", severity: "minor", excerpt: "daban por el epitafio", suggestion: "usa una colocación natural" },
    ],
    ...overrides,
  };
}

describe("articleQualityVerdictSchema", () => {
  it("accepts a well-formed verdict", () => {
    expect(articleQualityVerdictSchema.safeParse(validVerdict()).success).toBe(true);
  });

  it("defaults omitted issues to an empty array", () => {
    const parsed = articleQualityVerdictSchema.parse(validVerdict({ issues: undefined }));
    expect(parsed.issues).toEqual([]);
  });

  it("normalizes an omitted excerpt to null", () => {
    const parsed = articleQualityVerdictSchema.parse(
      validVerdict({ issues: [{ category: "grammar", severity: "major", suggestion: "corrige el tiempo verbal" }] }),
    );
    expect(parsed.issues[0]?.excerpt).toBeNull();
  });

  it("rejects an out-of-range score", () => {
    expect(articleQualityVerdictSchema.safeParse(validVerdict({ naturalness: 6 })).success).toBe(false);
    expect(articleQualityVerdictSchema.safeParse(validVerdict({ cefrFit: 0 })).success).toBe(false);
  });

  it("rejects a non-integer score", () => {
    expect(articleQualityVerdictSchema.safeParse(validVerdict({ readability: 3.5 })).success).toBe(false);
  });

  it("rejects an invalid estimated level", () => {
    expect(articleQualityVerdictSchema.safeParse(validVerdict({ estimatedLevel: "C3" })).success).toBe(false);
  });

  it("rejects an unknown issue category", () => {
    const bad = validVerdict({ issues: [{ category: "vibes", severity: "minor", suggestion: "x" }] });
    expect(articleQualityVerdictSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an invalid severity", () => {
    const bad = validVerdict({ issues: [{ category: "lexicon", severity: "fatal", suggestion: "x" }] });
    expect(articleQualityVerdictSchema.safeParse(bad).success).toBe(false);
  });
});
