import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  MODEL: z.string().default("claude-sonnet-4-6"),
  DB_PATH: z.string().default("/data/lector.db"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  DAILY_ARTICLE_LIMIT: z.coerce.number().int().positive().default(10),
  DAILY_REVIEW_LIMIT: z.coerce.number().int().positive().default(20),
  DAILY_PRACTICE_LLM_LIMIT: z.coerce.number().int().positive().default(30),
  ADMIN_TG_IDS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number),
    ),
  WEBAPP_URL: z.string().url().optional(),
  STATIC_DIR: z.string().optional(),
  LOG_LEVEL: z.string().default("info"),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const config = loadConfig();
