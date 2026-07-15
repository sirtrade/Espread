import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { getUserById, updateUser, type UserPatch } from "../../db/repositories/users.js";
import { rebalanceActivePool } from "../../db/repositories/bank.js";
import { getUserTopics, setUserTopics } from "../../db/repositories/topics.js";
import { resetUserProgress } from "../../db/repositories/reset.js";
import { markLevelSuggestion } from "../../services/levelSuggestionService.js";
import { Errors } from "../errors.js";
import { serializeProfile } from "../serializers.js";
import { levelSuggestionInteractionSchema, patchMeSchema } from "../validation.js";
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

meRoutes.patch("/level-suggestion", async (c) => {
  const { userId } = c.get("session");
  const body = levelSuggestionInteractionSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw Errors.badRequest(body.error.issues[0]?.message ?? "Datos inválidos");
  await markLevelSuggestion(userId, body.data, body.data.action);
  return c.json({ ok: true });
});

meRoutes.patch("/", async (c) => {
  const { userId } = c.get("session");
  const body = patchMeSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw Errors.badRequest(body.error.issues[0]?.message ?? "Datos inválidos");

  const { topics, markOnboarded, ...rest } = body.data;
  const patch: UserPatch = { ...rest };
  if (markOnboarded) patch.onboardedAt = Date.now();

  // Raising the cap frees slots, so drain the queue afterwards. Lowering it
  // never demotes: the pool just deflates as words are learned/ignored.
  // Capacity comparison treats 0 as "unlimited" (∞), so 20 -> 0 is a raise
  // and 0 -> 20 is not.
  const previous = await getUserById(userId);
  if (!previous) throw Errors.notFound("Usuario");
  const capacity = (limit: number) => (limit === 0 ? Infinity : limit);
  const raisesLimit =
    patch.activePoolLimit !== undefined &&
    capacity(patch.activePoolLimit) > capacity(previous.activePoolLimit);

  if (Object.keys(patch).length > 0) {
    await updateUser(userId, patch);
  }
  if (topics) {
    await setUserTopics(userId, topics);
  }
  if (raisesLimit) {
    await rebalanceActivePool(userId, patch.activePoolLimit!);
  }

  const user = await getUserById(userId);
  if (!user) throw Errors.notFound("Usuario");
  const currentTopics = await getUserTopics(userId);
  return c.json(serializeProfile(user, currentTopics));
});

meRoutes.delete("/progress", async (c) => {
  const { userId } = c.get("session");
  await resetUserProgress(userId);
  return c.json({ ok: true });
});
