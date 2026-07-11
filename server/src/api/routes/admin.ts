import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { getUsageByUser } from "../../db/repositories/llmCalls.js";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { config } from "../../lib/config.js";
import { Errors } from "../errors.js";
import type { AppEnv } from "../context.js";

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use("*", requireAuth);

adminRoutes.use("*", async (c, next) => {
  const { tgUserId } = c.get("session");
  if (!config.ADMIN_TG_IDS.includes(tgUserId)) throw Errors.forbidden();
  await next();
});

adminRoutes.get("/usage", async (c) => {
  const [usage, allUsers] = await Promise.all([getUsageByUser(), db.select().from(users)]);
  const usernameById = new Map(allUsers.map((u) => [u.id, u.username ?? String(u.tgUserId)]));

  const byUser = usage.map((u) => ({
    userId: u.userId,
    username: usernameById.get(u.userId) ?? "?",
    calls: u.calls,
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    costUsd: u.costUsdMicros / 1_000_000,
  }));

  const totalCostUsd = byUser.reduce((sum, u) => sum + u.costUsd, 0);
  return c.json({ byUser, totalCostUsd });
});
