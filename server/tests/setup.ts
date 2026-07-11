import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.NODE_ENV ??= "test";
process.env.BOT_TOKEN ??= "123456:TEST-TOKEN";
process.env.ANTHROPIC_API_KEY ??= "sk-test-key";
process.env.JWT_SECRET ??= "test-secret-please-ignore-0123456789";
process.env.ADMIN_TG_IDS ??= "";
process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "lector-test-")), "test.db");
