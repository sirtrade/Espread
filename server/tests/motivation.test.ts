import { describe, expect, it } from "vitest";
import { buildWeeklyProgress, currentStreak, weekStartDayKey } from "../src/domain/motivation.js";
import { localDayKey } from "../src/lib/timezone.js";

describe("motivation domain", () => {
  it("keeps yesterday's streak during an unfinished local day and resets after a gap", () => {
    const days = [
      { localDay: "2026-07-12", reading: true, practice: false },
      { localDay: "2026-07-13", reading: false, practice: true },
      { localDay: "2026-07-14", reading: true, practice: true },
    ];
    expect(currentStreak(days, "2026-07-15")).toBe(3);
    expect(currentStreak(days, "2026-07-16")).toBe(0);
  });

  it("counts one useful day even when both activity flags are set", () => {
    expect(currentStreak([{ localDay: "2026-07-15", reading: true, practice: true }], "2026-07-15")).toBe(1);
  });

  it("uses local day boundaries in east and west timezones", () => {
    const beforeMoscowMidnight = Date.UTC(2026, 6, 15, 20, 59);
    const afterMoscowMidnight = Date.UTC(2026, 6, 15, 21, 1);
    expect(localDayKey(beforeMoscowMidnight, "Europe/Moscow")).toBe("2026-07-15");
    expect(localDayKey(afterMoscowMidnight, "Europe/Moscow")).toBe("2026-07-16");

    const beforeLaMidnight = Date.UTC(2026, 6, 16, 6, 59);
    const afterLaMidnight = Date.UTC(2026, 6, 16, 7, 1);
    expect(localDayKey(beforeLaMidnight, "America/Los_Angeles")).toBe("2026-07-15");
    expect(localDayKey(afterLaMidnight, "America/Los_Angeles")).toBe("2026-07-16");
  });

  it("groups read articles and learned words into local Monday weeks", () => {
    const now = Date.UTC(2026, 6, 15, 12);
    const sundayLateUtc = Date.UTC(2026, 6, 12, 23, 30); // Monday in Moscow
    const progress = buildWeeklyProgress([sundayLateUtc], [now], now, "Europe/Moscow", 2);
    expect(weekStartDayKey("2026-07-13")).toBe("2026-07-13");
    expect(progress).toEqual([
      { weekStart: "2026-07-06", articlesRead: 0, wordsLearned: 0 },
      { weekStart: "2026-07-13", articlesRead: 1, wordsLearned: 1 },
    ]);
  });
});
