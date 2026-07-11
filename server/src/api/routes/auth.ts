import { Hono } from "hono";
import { validateInitData, InitDataError } from "../../auth/telegramInitData.js";
import { signSession } from "../../auth/jwt.js";
import { findOrCreateUser } from "../../db/repositories/users.js";
import { getUserTopics } from "../../db/repositories/topics.js";
import { config } from "../../lib/config.js";
import { Errors } from "../errors.js";
import { serializeProfile } from "../serializers.js";
import { authTelegramSchema } from "../validation.js";
import type { AppEnv } from "../context.js";

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/telegram", async (c) => {
  const body = authTelegramSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw Errors.badRequest("initData es requerido");

  let validated;
  try {
    validated = validateInitData(body.data.initData, config.BOT_TOKEN);
  } catch (err) {
    if (err instanceof InitDataError) throw Errors.unauthorized();
    throw err;
  }

  const user = await findOrCreateUser(validated.user.id, validated.user.username);
  const token = signSession({ userId: user.id, tgUserId: user.tgUserId });
  const topics = await getUserTopics(user.id);

  return c.json({ token, profile: serializeProfile(user, topics) });
});
