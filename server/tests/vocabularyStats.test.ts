import { describe, expect, it } from "vitest";
import { buildVocabularyStats } from "../src/domain/vocabularyStats.js";

describe("vocabulary statistics", () => {
  it("counts sources, weekly additions and frequency ranges", () => {
    const now = Date.UTC(2026, 6, 15);
    const stats = buildVocabularyStats(
      [
        { lemma: "casa", source: "learned", knownSince: now },
        { lemma: "tecnología", source: "reading", knownSince: now - 7 * 86_400_000 },
        { lemma: "fuera-de-lista", source: "manual", knownSince: now },
        { lemma: "pendiente", source: "reading", knownSince: null },
      ],
      now,
    );

    expect(stats.total).toBe(3);
    expect(stats.bySource).toEqual({ learned: 1, reading: 1, manual: 1 });
    expect(stats.weekly.reduce((sum, week) => sum + week.added, 0)).toBe(3);
    expect(stats.coverage.version).toContain("v1");
    expect(stats.coverage.ranges).toHaveLength(5);
    expect(stats.coverage.ranges.reduce((sum, range) => sum + range.known, 0)).toBeGreaterThanOrEqual(2);
  });
});
