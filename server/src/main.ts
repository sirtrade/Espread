import { serve } from "@hono/node-server";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./db/client.js";
import { createApp } from "./api/app.js";
import { startBot } from "./bot/bot.js";
import { startScheduler } from "./scheduler/scheduler.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";

migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
logger.info("Migrations applied");

const app = createApp();

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info({ port: info.port }, "Lector API listening");
});

startBot();
startScheduler();
