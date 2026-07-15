import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ZodError } from "zod";
import { ApiError } from "./errors.js";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { articlesRoutes } from "./routes/articles.js";
import { sessionRoutes } from "./routes/session.js";
import { bankRoutes } from "./routes/bank.js";
import { practiceRoutes } from "./routes/practice.js";
import { statsRoutes } from "./routes/stats.js";
import { adminRoutes } from "./routes/admin.js";
import { knownWordsRoutes } from "./routes/knownWords.js";
import type { AppEnv } from "./context.js";

export function createApp() {
  const app = new Hono<AppEnv>();

  app.get("/health", (c) => c.json({ ok: true }));

  const api = new Hono<AppEnv>();
  // Largest legitimate payload is PUT /session marks (~120 KB worst case);
  // anything bigger is garbage and shouldn't reach JSON.parse.
  api.use(
    "*",
    bodyLimit({
      maxSize: 256 * 1024,
      onError: (c) => c.json({ error: { code: "payload_too_large", message: "Cuerpo de la petición demasiado grande" } }, 413),
    }),
  );
  api.route("/auth", authRoutes);
  api.route("/me", meRoutes);
  api.route("/articles", articlesRoutes);
  api.route("/session", sessionRoutes);
  api.route("/bank", bankRoutes);
  api.route("/practice", practiceRoutes);
  api.route("/stats", statsRoutes);
  api.route("/known-words", knownWordsRoutes);
  api.route("/admin", adminRoutes);
  app.route("/api", api);

  // Serves the built Mini App in production (single-container deploy). In
  // local dev the webapp runs under its own Vite dev server instead.
  if (config.STATIC_DIR) {
    const dir = config.STATIC_DIR;
    app.use("/*", serveStatic({ root: dir }));
    app.get("*", (c) => {
      const indexPath = join(dir, "index.html");
      if (!existsSync(indexPath)) return c.notFound();
      return c.html(readFileSync(indexPath, "utf-8"));
    });
  }

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(err.toBody(), err.status as never);
    }
    if (err instanceof ZodError) {
      return c.json({ error: { code: "bad_request", message: err.issues[0]?.message ?? "Datos inválidos" } }, 400);
    }
    logger.error({ err }, "Unhandled API error");
    return c.json({ error: { code: "internal_error", message: "Error interno del servidor" } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Ruta no encontrada" } }, 404));

  return app;
}
