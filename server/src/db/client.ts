import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import * as schema from "./schema.js";

const dir = path.dirname(config.DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

export const sqlite = new Database(config.DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("foreign_keys = ON");

logger.info({ dbPath: config.DB_PATH }, "SQLite initialized (WAL mode)");

export const db = drizzle(sqlite, { schema });
