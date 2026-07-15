import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import {
  deleteSession,
  getActiveSession,
  updateSessionMarks,
} from "../../db/repositories/sessions.js";
import { getArticleById } from "../../db/repositories/articles.js";
import { reviewSession, completeSession, skipSession } from "../../services/sessionService.js";
import { Errors } from "../errors.js";
import { serializeArticle, serializeSession } from "../serializers.js";
import { completeSessionSchema, putSessionSchema, skipSessionSchema } from "../validation.js";
import type { AppEnv } from "../context.js";

export const sessionRoutes = new Hono<AppEnv>();

sessionRoutes.use("*", requireAuth);

sessionRoutes.get("/", async (c) => {
  const { userId } = c.get("session");
  const session = await getActiveSession(userId);
  if (!session) return c.json({ session: null, article: null });

  const article = await getArticleById(session.articleId);
  return c.json({ session: serializeSession(session), article: article ? serializeArticle(article) : null });
});

sessionRoutes.put("/", async (c) => {
  const { userId } = c.get("session");
  const body = putSessionSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw Errors.badRequest(body.error.issues[0]?.message ?? "Datos inválidos");

  const session = await getActiveSession(userId);
  if (!session) throw Errors.notFound("Sesión de lectura");

  await updateSessionMarks(session.id, body.data.marks);
  return c.json({ ok: true });
});

sessionRoutes.delete("/", async (c) => {
  const { userId } = c.get("session");
  await deleteSession(userId);
  return c.json({ ok: true });
});

// F-17: skip the active reading with an optional questionnaire answer. An
// empty body is valid — the reason is optional, the skip happens either way.
// Deliberately separate from DELETE /session (which records nothing).
sessionRoutes.post("/skip", async (c) => {
  const { userId } = c.get("session");
  const parsed = skipSessionSchema.safeParse((await c.req.json().catch(() => null)) ?? {});
  if (!parsed.success) throw Errors.badRequest(parsed.error.issues[0]?.message ?? "Datos inválidos");

  await skipSession(userId, parsed.data);
  return c.json({ ok: true });
});

sessionRoutes.post("/review", async (c) => {
  const { userId } = c.get("session");
  const result = await reviewSession(userId);
  return c.json(result);
});

sessionRoutes.post("/complete", async (c) => {
  const { userId } = c.get("session");
  // Empty body is valid: it means "use the default frequency behavior".
  const parsed = completeSessionSchema.safeParse((await c.req.json().catch(() => null)) ?? {});
  if (!parsed.success) throw Errors.badRequest(parsed.error.issues[0]?.message ?? "Datos inválidos");

  const result = await completeSession(userId, parsed.data);
  return c.json(result);
});
