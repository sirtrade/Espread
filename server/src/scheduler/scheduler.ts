import cron from "node-cron";
import { logger } from "../lib/logger.js";
import { bot, openAppKeyboard } from "../bot/bot.js";
import { localDateStr, localHHMM, subtractMinutes } from "./time.js";
import {
  getAllUsers,
  getAllUsersWithDailyEnabled,
  markDailyDelivered,
  markPrefetchDone,
} from "../db/repositories/users.js";
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
    const today = localDateStr(now, user.timezone);
    const hhmm = localHHMM(now, user.timezone);
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
    if (localHHMM(now, user.timezone) !== DIGEST_LOCAL_HOUR) continue;

    const stats = await getUserStats(user.id);
    const since = stats?.lastLearnedDigestAt ?? 0;
    const todayLocal = localDateStr(now, user.timezone);
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
  });
  logger.info("Scheduler started: daily delivery + pre-generation + learned digest, checked every minute");
}
