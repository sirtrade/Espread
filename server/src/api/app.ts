import { Hono } from "hono";
import { ZodError } from "zod";
import { ApiError } from "./errors.js";
import { logger } from "../lib/logger.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { articlesRoutes } from "./routes/articles.js";
import { sessionRoutes } from "./routes/session.js";
import { bankRoutes } from "./routes/bank.js";
import { statsRoutes } from "./routes/stats.js";
import { adminRoutes } from "./routes/admin.js";
import type { AppEnv } from "./context.js";

export function createApp() {
  const app = new Hono<AppEnv>();

  app.get("/health", (c) => c.json({ ok: true }));

  const api = new Hono<AppEnv>();
  api.route("/auth", authRoutes);
  api.route("/me", meRoutes);
  api.route("/articles", articlesRoutes);
  api.route("/session", sessionRoutes);
  api.route("/bank", bankRoutes);
  api.route("/stats", statsRoutes);
  api.route("/admin", adminRoutes);
  app.route("/api", api);

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(err.toBody(), err.status as never);
    }
    if (err instanceof ZodError) {
      return c.json({ error: { code: "bad_request", message: err.issues[0]?.message ?? "Datos inválidos" } }, 400);
    }
    logger.error({ err }, "Unhandled API error");
    return c.json({ error: { code: "internal_error", message: "Внутренняя ошибка сервера" } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Ruta no encontrada" } }, 404));

  return app;
}
