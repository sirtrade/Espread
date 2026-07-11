import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { getUserById, updateUser, type UserPatch } from "../../db/repositories/users.js";
import { getUserTopics, setUserTopics } from "../../db/repositories/topics.js";
import { Errors } from "../errors.js";
import { serializeProfile } from "../serializers.js";
import { patchMeSchema } from "../validation.js";
import type { AppEnv } from "../context.js";

export const meRoutes = new Hono<AppEnv>();

meRoutes.use("*", requireAuth);

meRoutes.get("/", async (c) => {
  const { userId } = c.get("session");
  const user = await getUserById(userId);
  if (!user) throw Errors.notFound("Usuario");
  const topics = await getUserTopics(userId);
  return c.json(serializeProfile(user, topics));
});

meRoutes.patch("/", async (c) => {
  const { userId } = c.get("session");
  const body = patchMeSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw Errors.badRequest(body.error.issues[0]?.message ?? "Datos inválidos");

  const { topics, markOnboarded, ...rest } = body.data;
  const patch: UserPatch = { ...rest };
  if (markOnboarded) patch.onboardedAt = Date.now();

  if (Object.keys(patch).length > 0) {
    await updateUser(userId, patch);
  }
  if (topics) {
    await setUserTopics(userId, topics);
  }

  const user = await getUserById(userId);
  if (!user) throw Errors.notFound("Usuario");
  const currentTopics = await getUserTopics(userId);
  return c.json(serializeProfile(user, currentTopics));
});
