import { describe, expect, it } from "vitest";
import {
  advanceSrs,
  creditAllowedToday,
  intervalDaysForStage,
  PRACTICE_RETRY_MS,
  resetSrs,
  SRS_INTERVALS_DAYS,
} from "../src/domain/srs.js";

const DAY = 24 * 60 * 60 * 1000;

describe("advanceSrs", () => {
  it("walks up the interval ladder on each success", () => {
    const now = 1_000_000;
    let stage = 0;
    for (const [i, days] of SRS_INTERVALS_DAYS.entries()) {
      const next = advanceSrs(stage, now);
      expect(next.srsStage).toBe(i + 1);
      expect(next.nextDueAt).toBe(now + days * DAY);
      stage = next.srsStage;
    }
  });

  it("caps the stage at the top rung (repeats at 120 days)", () => {
    const now = 0;
    const top = SRS_INTERVALS_DAYS.length;
    const next = advanceSrs(top, now);
    expect(next.srsStage).toBe(top);
    expect(next.nextDueAt).toBe(SRS_INTERVALS_DAYS[top - 1]! * DAY);
  });
});

describe("resetSrs", () => {
  it("drops back to stage 0, due immediately for reading", () => {
    const now = 5_000_000;
    expect(resetSrs(now)).toEqual({ srsStage: 0, nextDueAt: now });
  });

  it("uses a short retry delay for a wrong quiz answer", () => {
    const now = 5_000_000;
    const next = resetSrs(now, PRACTICE_RETRY_MS);
    expect(next.srsStage).toBe(0);
    expect(next.nextDueAt).toBe(now + PRACTICE_RETRY_MS);
    expect(next.nextDueAt).toBeLessThan(now + DAY);
  });
});

describe("intervalDaysForStage", () => {
  it("clamps below and above the ladder", () => {
    expect(intervalDaysForStage(0)).toBe(SRS_INTERVALS_DAYS[0]);
    expect(intervalDaysForStage(1)).toBe(SRS_INTERVALS_DAYS[0]);
    expect(intervalDaysForStage(SRS_INTERVALS_DAYS.length)).toBe(SRS_INTERVALS_DAYS.at(-1));
    expect(intervalDaysForStage(999)).toBe(SRS_INTERVALS_DAYS.at(-1));
  });
});

describe("creditAllowedToday", () => {
  const day1 = Date.UTC(2026, 0, 10, 9, 0, 0);
  const day1Later = Date.UTC(2026, 0, 10, 20, 0, 0);
  const day2 = Date.UTC(2026, 0, 11, 9, 0, 0);

  it("allows a credit when never credited before", () => {
    expect(creditAllowedToday(null, day1)).toBe(true);
  });

  it("blocks a second credit the same calendar day", () => {
    expect(creditAllowedToday(day1, day1Later)).toBe(false);
  });

  it("allows a credit again on the next day", () => {
    expect(creditAllowedToday(day1, day2)).toBe(true);
  });
});
