import { SPANISH_FREQUENCY_V1, SPANISH_FREQUENCY_VERSION } from "../data/spanishFrequencyV1.js";

export interface KnownWordStatInput {
  lemma: string;
  source: "learned" | "reading" | "manual";
  knownSince: number | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function mondayUtc(ms: number): number {
  const date = new Date(ms);
  const day = (date.getUTCDay() + 6) % 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day);
}

export function buildVocabularyStats(rows: readonly KnownWordStatInput[], now = Date.now()) {
  const known = rows.filter((row) => row.knownSince !== null);
  const lemmaSet = new Set(known.map((row) => row.lemma));
  const ranges = Array.from({ length: 5 }, (_, index) => {
    const start = index * 1000;
    const entries = SPANISH_FREQUENCY_V1.slice(start, start + 1000);
    const knownCount = entries.reduce((sum, lemma) => sum + (lemmaSet.has(lemma) ? 1 : 0), 0);
    return { from: start + 1, to: start + entries.length, known: knownCount, total: entries.length };
  });

  const currentWeek = mondayUtc(now);
  const weekly = Array.from({ length: 12 }, (_, index) => {
    const weekStart = currentWeek - (11 - index) * WEEK_MS;
    const weekEnd = weekStart + WEEK_MS;
    const added = known.reduce(
      (sum, row) => sum + (row.knownSince! >= weekStart && row.knownSince! < weekEnd ? 1 : 0),
      0,
    );
    return { weekStart, added };
  });

  return {
    total: known.length,
    bySource: {
      learned: known.filter((row) => row.source === "learned").length,
      reading: known.filter((row) => row.source === "reading").length,
      manual: known.filter((row) => row.source === "manual").length,
    },
    weekly,
    coverage: { version: SPANISH_FREQUENCY_VERSION, ranges },
  };
}
