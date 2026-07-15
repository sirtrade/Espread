import { SPANISH_FREQUENCY_V2, SPANISH_FREQUENCY_VERSION } from "../data/spanishFrequencyV2.js";
import { READING_KNOWN_THRESHOLD } from "./knownWords.js";

export interface KnownWordStatInput {
  lemma: string;
  source: "learned" | "reading" | "manual";
  encounters: number;
  knownSince: number | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BAND_SIZE = 1000;

/**
 * Ceiling for the measured band-to-band decay of coverage. A saturated
 * profile (every band ~100%) yields a ratio of 1, which would make the
 * geometric tail infinite; clamping to 0.9 caps the beyond-list estimate at
 * 9x the last band, keeping the figure conservative for C2-ish readers.
 */
export const EXTRAPOLATION_MAX_DECAY = 0.9;

function mondayUtc(ms: number): number {
  const date = new Date(ms);
  const day = (date.getUTCDay() + 6) % 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day);
}

/**
 * Estimates the reader's total vocabulary beyond the frequency list.
 *
 * Model: the share of known words per 1000-lemma band decays roughly
 * geometrically with rank (Zipf-like tail). The decay ratio is the average of
 * observed consecutive band ratios (each clamped to <= 1 so noise can't make
 * coverage "grow" with rank); the words beyond the list are the geometric sum
 * `lastBand * lastShare * d/(1-d)`. Known words that are not on the list at
 * all (rare learned/manual lemmas) are already inside `knownTotal`, so the
 * estimate never dips below what the registry literally contains.
 */
export function estimateTotalVocabulary(
  ranges: ReadonlyArray<{ known: number; total: number }>,
  knownTotal: number,
): number {
  const bands = ranges.filter((range) => range.total > 0);
  const knownInList = bands.reduce((sum, range) => sum + range.known, 0);
  if (knownInList === 0) return knownTotal;

  const shares = bands.map((range) => range.known / range.total);
  const ratios: number[] = [];
  for (let i = 0; i + 1 < shares.length; i++) {
    if (shares[i]! <= 0) continue;
    ratios.push(Math.min(shares[i + 1]! / shares[i]!, 1));
  }
  const decay =
    ratios.length === 0
      ? 0
      : Math.min(ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length, EXTRAPOLATION_MAX_DECAY);

  const lastBand = bands[bands.length - 1]!;
  const tail = lastBand.total * (lastBand.known / lastBand.total) * (decay / (1 - decay));
  // No tail -> nothing estimated: report the registry literally instead of
  // letting the rounding inflate a small count (50 must not become "~100").
  if (tail === 0) return knownTotal;
  return Math.max(knownTotal, Math.round((knownTotal + tail) / 100) * 100);
}

export function buildVocabularyStats(rows: readonly KnownWordStatInput[], now = Date.now()) {
  const known = rows.filter((row) => row.knownSince !== null);
  const lemmaSet = new Set(known.map((row) => row.lemma));
  const ranges = Array.from({ length: Math.ceil(SPANISH_FREQUENCY_V2.length / BAND_SIZE) }, (_, index) => {
    const start = index * BAND_SIZE;
    const entries = SPANISH_FREQUENCY_V2.slice(start, start + BAND_SIZE);
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

  // Reading lemmas still below the threshold: invisible in `total` but shown
  // as "on the way" so the screen has feedback from the very first article.
  const accumulatingRows = rows.filter((row) => row.knownSince === null);
  const byEncounters = Array.from({ length: READING_KNOWN_THRESHOLD - 1 }, (_, index) => ({
    encounters: index + 1,
    count: 0,
  }));
  for (const row of accumulatingRows) {
    const bucket = Math.min(Math.max(row.encounters, 1), READING_KNOWN_THRESHOLD - 1);
    byEncounters[bucket - 1]!.count += 1;
  }

  return {
    total: known.length,
    bySource: {
      learned: known.filter((row) => row.source === "learned").length,
      reading: known.filter((row) => row.source === "reading").length,
      manual: known.filter((row) => row.source === "manual").length,
    },
    accumulating: {
      threshold: READING_KNOWN_THRESHOLD,
      total: accumulatingRows.length,
      byEncounters,
    },
    weekly,
    coverage: {
      version: SPANISH_FREQUENCY_VERSION,
      ranges,
      estimatedTotal: estimateTotalVocabulary(ranges, known.length),
    },
  };
}
