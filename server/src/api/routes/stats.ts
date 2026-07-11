import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { countBankByStatus } from "../../db/repositories/bank.js";
import { getUserStats } from "../../db/repositories/stats.js";
import type { AppEnv } from "../context.js";

export const statsRoutes = new Hono<AppEnv>();

statsRoutes.use("*", requireAuth);

statsRoutes.get("/", async (c) => {
  const { userId } = c.get("session");
  const [stats, active, learned] = await Promise.all([
    getUserStats(userId),
    countBankByStatus(userId, "active"),
    countBankByStatus(userId, "learned"),
  ]);

  return c.json({
    articlesRead: stats?.articlesRead ?? 0,
    itemsInProgress: active,
    itemsLearned: learned,
  });
});
