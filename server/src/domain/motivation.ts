import { localDayKey } from "../lib/timezone.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ActivityDay {
  localDay: string;
  reading: boolean;
  practice: boolean;
}

export interface WeeklyProgress {
  weekStart: string;
  articlesRead: number;
  wordsLearned: number;
}

function dayKeyToUtc(dayKey: string): number {
  const [year, month, day] = dayKey.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day);
}

export function shiftDayKey(dayKey: string, days: number): string {
  return new Date(dayKeyToUtc(dayKey) + days * DAY_MS).toISOString().slice(0, 10);
}

export function weekStartDayKey(dayKey: string): string {
  const date = new Date(dayKeyToUtc(dayKey));
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return shiftDayKey(dayKey, -daysSinceMonday);
}

/**
 * A current streak survives through an unfinished local day: if today has no
 * activity yet, yesterday may still anchor it. A gap before that ends it.
 */
export function currentStreak(days: readonly ActivityDay[], today: string): number {
  const useful = new Set(days.filter((day) => day.reading || day.practice).map((day) => day.localDay));
  let cursor = useful.has(today) ? today : shiftDayKey(today, -1);
  let streak = 0;
  while (useful.has(cursor)) {
    streak += 1;
    cursor = shiftDayKey(cursor, -1);
  }
  return streak;
}

export function buildWeeklyProgress(
  articleReadAt: readonly number[],
  learnedAt: readonly number[],
  now: number,
  timeZone: string,
  weeks = 12,
): WeeklyProgress[] {
  const currentWeek = weekStartDayKey(localDayKey(now, timeZone));
  const buckets = Array.from({ length: weeks }, (_, index) => ({
    weekStart: shiftDayKey(currentWeek, -(weeks - 1 - index) * 7),
    articlesRead: 0,
    wordsLearned: 0,
  }));
  const byWeek = new Map(buckets.map((bucket) => [bucket.weekStart, bucket]));

  for (const at of articleReadAt) {
    const bucket = byWeek.get(weekStartDayKey(localDayKey(at, timeZone)));
    if (bucket) bucket.articlesRead += 1;
  }
  for (const at of learnedAt) {
    const bucket = byWeek.get(weekStartDayKey(localDayKey(at, timeZone)));
    if (bucket) bucket.wordsLearned += 1;
  }
  return buckets;
}
