import { describe, expect, it } from "vitest";
import {
  advanceSrs,
  creditAllowedToday,
  intervalDaysForStage,
  LAPSE_STAGE_DROP,
  lapseSrs,
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

describe("lapseSrs", () => {
  const now = 5_000_000;

  it("drops LAPSE_STAGE_DROP rungs instead of resetting to 0", () => {
    expect(LAPSE_STAGE_DROP).toBe(2);
    // A word deep on the ladder only steps back a couple rungs.
    expect(lapseSrs(5, now).srsStage).toBe(3);
    expect(lapseSrs(7, now).srsStage).toBe(5);
  });

  it("walks the whole ladder back two rungs at a time", () => {
    expect(lapseSrs(0, now).srsStage).toBe(0);
    expect(lapseSrs(1, now).srsStage).toBe(0);
    expect(lapseSrs(2, now).srsStage).toBe(0);
    expect(lapseSrs(3, now).srsStage).toBe(1);
  });

  it("never goes below stage 0", () => {
    expect(lapseSrs(0, now).srsStage).toBe(0);
    expect(lapseSrs(1, now).srsStage).toBe(0);
  });

  it("is due immediately by default (re-marked while reading)", () => {
    expect(lapseSrs(4, now)).toEqual({ srsStage: 2, nextDueAt: now });
  });

  it("uses a short retry delay for a wrong quiz answer", () => {
    const next = lapseSrs(5, now, PRACTICE_RETRY_MS);
    expect(next.srsStage).toBe(3);
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
    expect(creditAllowedToday(null, day1, "UTC")).toBe(true);
  });

  it("blocks a second credit the same calendar day", () => {
    expect(creditAllowedToday(day1, day1Later, "UTC")).toBe(false);
  });

  it("allows a credit again on the next day", () => {
    expect(creditAllowedToday(day1, day2, "UTC")).toBe(true);
  });

  // Anti-farm is measured in the user's local day, not UTC. These two moments
  // straddle UTC midnight but land on the SAME local day, so the second earns
  // no credit — whereas the old UTC logic would have (wrongly) allowed it.
  describe("UTC+3 (Europe/Moscow)", () => {
    // 02:00 and 23:00 local on 2026-01-10 = 2026-01-09 23:00 and 2026-01-10 20:00 UTC.
    const early = Date.UTC(2026, 0, 9, 23, 0, 0);
    const late = Date.UTC(2026, 0, 10, 20, 0, 0);

    it("blocks a second credit within one local day even across UTC midnight", () => {
      expect(creditAllowedToday(early, late, "Europe/Moscow")).toBe(false);
      // Sanity: under UTC these fall on different calendar days.
      expect(creditAllowedToday(early, late, "UTC")).toBe(true);
    });

    it("allows a credit again on the next local day", () => {
      const nextLocalDay = Date.UTC(2026, 0, 11, 0, 0, 0); // 03:00 local on 2026-01-11
      expect(creditAllowedToday(early, nextLocalDay, "Europe/Moscow")).toBe(true);
    });
  });

  describe("UTC−8 (America/Los_Angeles, PST in January)", () => {
    // 15:00 and 17:00 local on 2026-01-10 = 2026-01-10 23:00 and 2026-01-11 01:00 UTC.
    const early = Date.UTC(2026, 0, 10, 23, 0, 0);
    const late = Date.UTC(2026, 0, 11, 1, 0, 0);

    it("blocks a second credit within one local day even across UTC midnight", () => {
      expect(creditAllowedToday(early, late, "America/Los_Angeles")).toBe(false);
      // Sanity: under UTC these fall on different calendar days.
      expect(creditAllowedToday(early, late, "UTC")).toBe(true);
    });

    it("allows a credit again on the next local day", () => {
      const nextLocalDay = Date.UTC(2026, 0, 11, 20, 0, 0); // 12:00 local on 2026-01-11
      expect(creditAllowedToday(early, nextLocalDay, "America/Los_Angeles")).toBe(true);
    });
  });
});
