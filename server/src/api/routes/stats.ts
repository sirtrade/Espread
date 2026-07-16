import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { countBankByStatus } from "../../db/repositories/bank.js";
import { getUserById } from "../../db/repositories/users.js";
import { getUserStats } from "../../db/repositories/stats.js";
import { getMotivationStats } from "../../db/repositories/activity.js";
import { evaluateLevelSuggestion } from "../../services/levelSuggestionService.js";
import { evaluateTopicSuggestion } from "../../services/topicSuggestionService.js";
import type { AppEnv } from "../context.js";

export const statsRoutes = new Hono<AppEnv>();

statsRoutes.use("*", requireAuth);

statsRoutes.get("/", async (c) => {
  const { userId } = c.get("session");
  const [stats, user, active, learned, queued, levelSuggestion, topicSuggestion] = await Promise.all([
    getUserStats(userId),
    getUserById(userId),
    countBankByStatus(userId, "active"),
    countBankByStatus(userId, "learned"),
    countBankByStatus(userId, "queued"),
    evaluateLevelSuggestion(userId),
    evaluateTopicSuggestion(userId),
  ]);
  const motivation = await getMotivationStats(userId, user?.timezone ?? "UTC");

  return c.json({
    articlesRead: stats?.articlesRead ?? 0,
    itemsInProgress: active,
    itemsLearned: learned,
    itemsQueued: queued,
    activePoolLimit: user?.activePoolLimit ?? 0,
    levelSuggestion,
    topicSuggestion,
    ...motivation,
  });
});
