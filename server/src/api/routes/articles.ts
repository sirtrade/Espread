import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { startReading } from "../../services/articleService.js";
import { serializeArticle, serializeSession } from "../serializers.js";
import type { AppEnv } from "../context.js";

export const articlesRoutes = new Hono<AppEnv>();

articlesRoutes.use("*", requireAuth);

articlesRoutes.post("/", async (c) => {
  const { userId } = c.get("session");
  const { article, session } = await startReading(userId);
  return c.json({ article: serializeArticle(article), session: serializeSession(session) });
});
