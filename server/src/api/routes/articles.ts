import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { startReading } from "../../services/articleService.js";
import { getArticleById, listReadArticles } from "../../db/repositories/articles.js";
import { Errors } from "../errors.js";
import { serializeArticle, serializeHistoryItem, serializeReadArticle, serializeSession } from "../serializers.js";
import type { AppEnv } from "../context.js";

export const articlesRoutes = new Hono<AppEnv>();

articlesRoutes.use("*", requireAuth);

articlesRoutes.post("/", async (c) => {
  const { userId } = c.get("session");
  const { article, session } = await startReading(userId);
  return c.json({ article: serializeArticle(article), session: serializeSession(session) });
});

articlesRoutes.get("/", async (c) => {
  const { userId } = c.get("session");
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 20, 1), 100);
  const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
  const { items, total } = await listReadArticles(userId, limit, offset);
  return c.json({ items: items.map(serializeHistoryItem), total });
});

articlesRoutes.get("/:id", async (c) => {
  const { userId } = c.get("session");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) throw Errors.badRequest("id inválido");

  const article = await getArticleById(id);
  // 404 (not 403) for someone else's article: don't leak that the id exists.
  if (!article || article.userId !== userId || article.readAt === null) throw Errors.notFound("Artículo");
  return c.json({ article: serializeReadArticle(article) });
});
