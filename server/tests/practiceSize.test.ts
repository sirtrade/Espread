import { describe, expect, it } from "vitest";
import {
  clampPracticeSize,
  DEFAULT_PRACTICE_SIZE,
  PRACTICE_SIZE_MAX,
  PRACTICE_SIZE_MIN,
  PRACTICE_SIZE_OPTIONS,
} from "../src/domain/practiceSize.js";

describe("clampPracticeSize", () => {
  it("returns the offered presets unchanged", () => {
    for (const size of PRACTICE_SIZE_OPTIONS) {
      expect(clampPracticeSize(size)).toBe(size);
    }
  });

  it("falls back to the default for missing or malformed input", () => {
    expect(clampPracticeSize(NaN)).toBe(DEFAULT_PRACTICE_SIZE);
    expect(clampPracticeSize(0)).toBe(DEFAULT_PRACTICE_SIZE);
    expect(clampPracticeSize(-4)).toBe(DEFAULT_PRACTICE_SIZE);
    expect(clampPracticeSize(Infinity)).toBe(DEFAULT_PRACTICE_SIZE);
  });

  it("clamps to the [MIN, MAX] range", () => {
    expect(clampPracticeSize(1)).toBe(PRACTICE_SIZE_MIN);
    expect(clampPracticeSize(1000)).toBe(PRACTICE_SIZE_MAX);
    expect(clampPracticeSize(25)).toBe(25);
  });

  it("truncates fractional requests to a whole number of cards", () => {
    expect(clampPracticeSize(10.9)).toBe(10);
  });
});
