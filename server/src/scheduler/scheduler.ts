import cron from "node-cron";
import { logger } from "../lib/logger.js";
import { bot, openAppKeyboard } from "../bot/bot.js";
import { localDateStr, localHHMM, subtractMinutes } from "./time.js";
import {
  getAllUsers,
  getAllUsersWithDailyEnabled,
  markDailyDelivered,
  markPrefetchDone,
  setLastBotQuizAt,
} from "../db/repositories/users.js";
import { sendBotQuiz } from "../bot/quiz.js";
import { generateFreshArticle } from "../services/articleService.js";
import { getUnconsumedPrefetchedArticle } from "../db/repositories/articles.js";
import { getLearnedSince } from "../db/repositories/bank.js";
import { getUserStats, setLastLearnedDigestAt } from "../db/repositories/stats.js";

const PREGEN_LEAD_MINUTES = 5;
/** Fixed local hour for the learned-items digest (TZ 6: "раз в день дайджестом, не спамить"). */
const DIGEST_LOCAL_HOUR = "20:00";

async function runDailyDelivery(now: Date): Promise<void> {
  const users = await getAllUsersWithDailyEnabled();

  for (const user of users) {
    // Everything per-user is inside try/catch: one bad row (e.g. a timezone
    // Intl rejects) must not abort delivery for every user after it.
    let today: string;
    let hhmm: string;
    try {
      today = localDateStr(now, user.timezone);
      hhmm = localHHMM(now, user.timezone);
    } catch (err) {
      logger.error({ err, userId: user.id, timezone: user.timezone }, "Invalid user timezone, skipping delivery");
      continue;
    }
    const pregenAt = subtractMinutes(user.dailyTime, PREGEN_LEAD_MINUTES);

    if (hhmm === pregenAt && user.lastPrefetchDate !== today) {
      await markPrefetchDone(user.id, today);
      try {
        await generateFreshArticle(user.id, true);
        logger.info({ userId: user.id }, "Pre-generated daily article");
      } catch (err) {
        logger.error({ err, userId: user.id }, "Daily pre-generation failed");
      }
    }

    if (hhmm === user.dailyTime && user.lastDailyDeliveredDate !== today) {
      await markDailyDelivered(user.id, today);
      try {
        const existing = await getUnconsumedPrefetchedArticle(user.id);
        if (!existing) {
          // Pregen missed or failed earlier — generate now as a fallback so the
          // notification still points at something readable.
          await generateFreshArticle(user.id, true);
        }
        await bot.api.sendMessage(user.tgUserId, "Tu lectura de hoy 📖", {
          reply_markup: openAppKeyboard("Leer ahora"),
        });
        logger.info({ userId: user.id }, "Sent daily reading notification");
      } catch (err) {
        logger.error({ err, userId: user.id }, "Daily delivery failed");
      }
    }
  }
}

async function runLearnedDigest(now: Date): Promise<void> {
  const users = await getAllUsers();

  for (const user of users) {
    let hhmm: string;
    let todayLocal: string;
    try {
      hhmm = localHHMM(now, user.timezone);
      todayLocal = localDateStr(now, user.timezone);
    } catch (err) {
      logger.error({ err, userId: user.id, timezone: user.timezone }, "Invalid user timezone, skipping digest");
      continue;
    }
    if (hhmm !== DIGEST_LOCAL_HOUR) continue;

    const stats = await getUserStats(user.id);
    // First digest ever: look back one day, not over the whole history.
    const since = stats?.lastLearnedDigestAt ?? now.getTime() - 24 * 60 * 60 * 1000;
    if (stats?.lastLearnedDigestAt && localDateStr(new Date(stats.lastLearnedDigestAt), user.timezone) === todayLocal) {
      continue; // already sent today
    }

    const learned = await getLearnedSince(user.id, since);
    if (learned.length === 0) continue;

    try {
      const list = learned.map((item) => `• ${item.term}`).join("\n");
      await bot.api.sendMessage(user.tgUserId, `🎉 ¡Aprendiste ${learned.length} palabra(s)/frase(s) hoy!\n\n${list}`);
      await setLastLearnedDigestAt(user.id, now.getTime());
    } catch (err) {
      logger.error({ err, userId: user.id }, "Learned digest send failed");
    }
  }
}

/** In-chat quizzes are only sent during waking hours (user's local time). */
const QUIZ_WINDOW_START = "09:00";
const QUIZ_WINDOW_END = "21:00";
const QUIZ_WINDOW_HOURS = 12;

async function runBotQuizzes(now: Date): Promise<void> {
  const users = await getAllUsers();

  for (const user of users) {
    if (user.botQuizzesPerDay <= 0) continue;

    let hhmm: string;
    try {
      hhmm = localHHMM(now, user.timezone);
    } catch (err) {
      logger.error({ err, userId: user.id, timezone: user.timezone }, "Invalid user timezone, skipping quiz");
      continue;
    }
    if (hhmm < QUIZ_WINDOW_START || hhmm >= QUIZ_WINDOW_END) continue;

    // N quizzes spread evenly across the window: send whenever at least
    // window/N has passed since the previous quiz. Self-corrects after
    // downtime without needing a per-day sent counter.
    const intervalMs = (QUIZ_WINDOW_HOURS * 60 * 60 * 1000) / user.botQuizzesPerDay;
    if (user.lastBotQuizAt && now.getTime() - user.lastBotQuizAt < intervalMs) continue;

    try {
      const sent = await sendBotQuiz(bot, user);
      if (sent) {
        await setLastBotQuizAt(user.id, now.getTime());
        logger.info({ userId: user.id }, "Sent bot quiz");
      }
    } catch (err) {
      logger.error({ err, userId: user.id }, "Bot quiz send failed");
    }
  }
}

/**
 * node-cron over BullMQ: this is a single-process, single-container app with
 * no existing Redis dependency and modest scale (per-user daily jobs, not a
 * high-throughput task queue). A plain in-process minute tick is enough to
 * hit each user's per-timezone delivery minute and needs no extra infra.
 */
export function startScheduler(): void {
  cron.schedule("* * * * *", () => {
    const now = new Date();
    runDailyDelivery(now).catch((err) => logger.error({ err }, "Daily delivery tick failed"));
    runLearnedDigest(now).catch((err) => logger.error({ err }, "Learned digest tick failed"));
    runBotQuizzes(now).catch((err) => logger.error({ err }, "Bot quiz tick failed"));
  });
  logger.info("Scheduler started: daily delivery + pre-generation + learned digest + bot quizzes, checked every minute");
}
