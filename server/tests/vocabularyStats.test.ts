import { describe, expect, it } from "vitest";
import {
  buildVocabularyStats,
  estimateTotalVocabulary,
  EXTRAPOLATION_MAX_DECAY,
} from "../src/domain/vocabularyStats.js";
import { READING_KNOWN_THRESHOLD } from "../src/domain/knownWords.js";

describe("vocabulary statistics", () => {
  it("counts sources, weekly additions and frequency ranges", () => {
    const now = Date.UTC(2026, 6, 15);
    const stats = buildVocabularyStats(
      [
        { lemma: "casa", source: "learned", encounters: 0, knownSince: now },
        { lemma: "tecnología", source: "reading", encounters: 3, knownSince: now - 7 * 86_400_000 },
        { lemma: "fuera-de-lista", source: "manual", encounters: 0, knownSince: now },
        { lemma: "pendiente", source: "reading", encounters: 1, knownSince: null },
      ],
      now,
    );

    expect(stats.total).toBe(3);
    expect(stats.bySource).toEqual({ learned: 1, reading: 1, manual: 1 });
    expect(stats.weekly.reduce((sum, week) => sum + week.added, 0)).toBe(3);
    expect(stats.coverage.version).toContain("v2");
    expect(stats.coverage.ranges).toHaveLength(10);
    expect(stats.coverage.ranges.reduce((sum, range) => sum + range.known, 0)).toBe(2);
    // With registry data present the estimate is shown and never understates
    // what the registry literally contains.
    expect(stats.coverage.estimatedTotal).toBeGreaterThanOrEqual(3);
  });

  it("reports sub-threshold reading lemmas as accumulating", () => {
    const now = Date.UTC(2026, 6, 15);
    const stats = buildVocabularyStats(
      [
        { lemma: "casa", source: "learned", encounters: 0, knownSince: now },
        { lemma: "uña", source: "reading", encounters: 1, knownSince: null },
        { lemma: "brote", source: "reading", encounters: 1, knownSince: null },
        { lemma: "hazaña", source: "reading", encounters: 2, knownSince: null },
      ],
      now,
    );

    expect(stats.accumulating.threshold).toBe(READING_KNOWN_THRESHOLD);
    expect(stats.accumulating.total).toBe(3);
    expect(stats.accumulating.byEncounters).toEqual([
      { encounters: 1, count: 2 },
      { encounters: 2, count: 1 },
    ]);
    // Accumulating rows are feedback, not knowledge: totals stay untouched.
    expect(stats.total).toBe(1);
  });
});

describe("estimateTotalVocabulary", () => {
  const band = (known: number, total = 1000) => ({ known, total });

  it("returns the literal registry size when nothing matches the list", () => {
    expect(estimateTotalVocabulary([band(0), band(0)], 0)).toBe(0);
    // Off-list-only registry (rare learned words): no curve to extrapolate.
    expect(estimateTotalVocabulary([band(0), band(0)], 7)).toBe(7);
  });

  it("does not extrapolate from a single populated band", () => {
    // p2/p1 = 0 -> decay 0 -> no tail: too early to guess beyond the list.
    expect(estimateTotalVocabulary([band(50), band(0), band(0)], 50)).toBe(50);
  });

  it("extends a geometric decay beyond the list", () => {
    // Shares 0.8, 0.4, 0.2, 0.1: decay 0.5 -> tail = 1000 * 0.1 * 1 = 100.
    const ranges = [band(800), band(400), band(200), band(100)];
    expect(estimateTotalVocabulary(ranges, 1500)).toBe(1600);
  });

  it("clamps saturated coverage so the estimate stays finite", () => {
    // All bands 100%: raw decay 1 would give an infinite tail.
    const ranges = Array.from({ length: 10 }, () => band(1000));
    const expected =
      Math.round((10_000 + 1000 * (EXTRAPOLATION_MAX_DECAY / (1 - EXTRAPOLATION_MAX_DECAY))) / 100) * 100;
    expect(estimateTotalVocabulary(ranges, 10_000)).toBe(expected);
  });

  it("ignores noisy coverage growth between bands", () => {
    // A later band can't be "more known" than an earlier one for decay
    // purposes: each ratio is clamped to 1.
    const ranges = [band(100), band(200), band(100)];
    const estimate = estimateTotalVocabulary(ranges, 400);
    expect(estimate).toBeGreaterThanOrEqual(400);
    expect(Number.isFinite(estimate)).toBe(true);
  });

  it("never dips below the registry size after rounding", () => {
    expect(estimateTotalVocabulary([band(3), band(0)], 3)).toBe(3);
  });
});
