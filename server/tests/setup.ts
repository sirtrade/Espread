import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.NODE_ENV ??= "test";
process.env.BOT_TOKEN ??= "123456:TEST-TOKEN";
process.env.ANTHROPIC_API_KEY ??= "sk-test-key";
// Network guard (B-4): the SDK reads ANTHROPIC_BASE_URL natively, so any LLM
// call that slips past a file's mock fails fast on a local connection refuse
// instead of silently reaching api.anthropic.com (and, with a real key in the
// environment, spending money and polluting llm_calls). Forced assignment on
// purpose: some environments preset ANTHROPIC_BASE_URL to the real API, and
// tests must never honor it.
process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:9";
process.env.JWT_SECRET ??= "test-secret-please-ignore-0123456789";
process.env.ADMIN_TG_IDS ??= "";
process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "lector-test-")), "test.db");
