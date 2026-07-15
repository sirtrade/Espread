import { describe, expect, it } from "vitest";
import { SPANISH_FREQUENCY_V2, SPANISH_FREQUENCY_VERSION } from "../src/data/spanishFrequencyV2.js";
import { normalizeArticleLemmas, SPANISH_FUNCTION_WORDS } from "../src/domain/knownWords.js";
import { normalizeTerm } from "../src/domain/normalize.js";

describe("Spanish frequency list v2", () => {
  it("has 10,000 unique entries and a v2 version tag", () => {
    expect(SPANISH_FREQUENCY_V2).toHaveLength(10_000);
    expect(new Set(SPANISH_FREQUENCY_V2).size).toBe(10_000);
    expect(SPANISH_FREQUENCY_VERSION).toContain("v2");
  });

  it("contains only lemmas the reading pipeline can admit into the registry", () => {
    // Guards against drift between the offline derivation and
    // normalizeArticleLemmas: a list entry that the pipeline filter rejects
    // would make its band mathematically unreachable (the B-3 undercount bug).
    for (const lemma of SPANISH_FREQUENCY_V2) {
      expect(lemma).toBe(normalizeTerm(lemma));
      expect(lemma.length).toBeGreaterThanOrEqual(3);
      expect(lemma.includes(" ")).toBe(false);
      expect(SPANISH_FUNCTION_WORDS.has(lemma)).toBe(false);
    }
  });

  it("keeps its top entries acceptable to normalizeArticleLemmas end to end", () => {
    const sample = SPANISH_FREQUENCY_V2.slice(0, 25);
    const body = `Texto de prueba: ${sample.join(" ")}.`;
    expect(normalizeArticleLemmas(sample, body)).toEqual(sample);
  });
});
