import { describe, expect, it } from "vitest";
import {
  normalizeArticleLemmas,
  readingEncounterLemmas,
  reachesReadingThreshold,
  READING_KNOWN_THRESHOLD,
} from "../src/domain/knownWords.js";

describe("known-word domain", () => {
  it("normalizes, deduplicates and verifies final-body content lemmas", () => {
    const body = "Las científicas analizaron datos importantes y publicaron el hallazgo.";
    expect(
      normalizeArticleLemmas(
        ["Científica", "analizar", "dato", "importante", "hallazgo", "hallazgo", "el", "inexistente", "de"],
        body,
      ),
    ).toEqual(["científica", "analizar", "dato", "importante", "hallazgo"]);
  });

  it("excludes marked terms and every lemma already in the bank", () => {
    expect(
      readingEncounterLemmas(
        ["analizar", "dato", "hallazgo"],
        ["analizaron"],
        new Set(["dato"]),
      ),
    ).toEqual(["hallazgo"]);
  });

  it("recognizes reading knowledge at the configured third encounter", () => {
    expect(READING_KNOWN_THRESHOLD).toBe(3);
    expect(reachesReadingThreshold(2)).toBe(false);
    expect(reachesReadingThreshold(3)).toBe(true);
  });
});
