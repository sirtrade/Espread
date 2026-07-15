import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "../client.js";
import { articles, dailyActivity, knownWords } from "../schema.js";
import { buildWeeklyProgress, currentStreak } from "../../domain/motivation.js";
import { localDayKey } from "../../lib/timezone.js";

export async function recordPracticeActivity(userId: number, localDay: string, now = Date.now()): Promise<void> {
  await db
    .insert(dailyActivity)
    .values({ userId, localDay, practice: true, updatedAt: now })
    .onConflictDoUpdate({
      target: [dailyActivity.userId, dailyActivity.localDay],
      set: { practice: true, updatedAt: now },
    });
}

export async function getCurrentStreak(userId: number, timeZone: string, now = Date.now()): Promise<number> {
  const activity = await db.query.dailyActivity.findMany({
    where: eq(dailyActivity.userId, userId),
    orderBy: [asc(dailyActivity.localDay)],
  });
  return currentStreak(activity, localDayKey(now, timeZone));
}

export async function getMotivationStats(userId: number, timeZone: string, now = Date.now()) {
  const [activity, readRows, learnedRows] = await Promise.all([
    db.query.dailyActivity.findMany({
      where: eq(dailyActivity.userId, userId),
      orderBy: [asc(dailyActivity.localDay)],
    }),
    db.query.articles.findMany({
      where: and(eq(articles.userId, userId), isNotNull(articles.readAt)),
      columns: { readAt: true },
    }),
    db.query.knownWords.findMany({
      where: and(
        eq(knownWords.userId, userId),
        eq(knownWords.source, "learned"),
        isNotNull(knownWords.knownSince),
      ),
      columns: { knownSince: true },
    }),
  ]);

  return {
    currentStreak: currentStreak(activity, localDayKey(now, timeZone)),
    weeklyProgress: buildWeeklyProgress(
      readRows.flatMap((row) => (row.readAt === null ? [] : [row.readAt])),
      learnedRows.flatMap((row) => (row.knownSince === null ? [] : [row.knownSince])),
      now,
      timeZone,
    ),
  };
}
