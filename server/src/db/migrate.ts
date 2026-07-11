import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "./client.js";
import { logger } from "../lib/logger.js";

migrate(db, { migrationsFolder: "./drizzle" });
logger.info("Migrations applied");
sqlite.close();
