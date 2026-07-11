import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tgUserId: integer("tg_user_id").notNull(),
  username: text("username"),
  level: text("level", { enum: ["A2", "B1", "B2", "C1"] })
    .notNull()
    .default("A2"),
  explainLang: text("explain_lang", { enum: ["ru", "en", "es"] })
    .notNull()
    .default("ru"),
  timezone: text("timezone").notNull().default("UTC"),
  dailyEnabled: integer("daily_enabled", { mode: "boolean" }).notNull().default(false),
  dailyTime: text("daily_time").notNull().default("08:00"),
  // In-chat vocabulary quizzes: how many per day the user wants (0 = off).
  botQuizzesPerDay: integer("bot_quizzes_per_day").notNull().default(0),
  lastBotQuizAt: integer("last_bot_quiz_at"),
  onboardedAt: integer("onboarded_at"),
  lastDailyDeliveredDate: text("last_daily_delivered_date"),
  lastPrefetchDate: text("last_prefetch_date"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
}, (t) => ({
  tgUserIdIdx: uniqueIndex("users_tg_user_id_idx").on(t.tgUserId),
}));

export const userTopics = sqliteTable("user_topics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  topic: text("topic").notNull(),
  position: integer("position").notNull().default(0),
});

export const bankItems = sqliteTable(
  "bank_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    isPhrase: integer("is_phrase", { mode: "boolean" }).notNull().default(false),
    status: text("status", { enum: ["active", "learned", "ignored"] })
      .notNull()
      .default("active"),
    exposures: integer("exposures").notNull().default(1),
    cleanStreak: integer("clean_streak").notNull().default(0),
    translation: text("translation"),
    firstContext: text("first_context"),
    // Spaced-repetition state for the practice mode. Deliberately separate
    // from status/cleanStreak: practice reinforces memory but only clean
    // reading exposures can promote an item to "learned".
    practiceStage: integer("practice_stage").notNull().default(0),
    nextPracticeAt: integer("next_practice_at"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch('now') * 1000)`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch('now') * 1000)`),
  },
  (t) => ({
    userTermIdx: uniqueIndex("bank_items_user_term_idx").on(t.userId, t.term),
  }),
);

export const articles = sqliteTable(
  "articles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    topic: text("topic").notNull(),
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    targetTerms: text("target_terms").notNull().default("[]"),
    prefetched: integer("prefetched", { mode: "boolean" }).notNull().default(false),
    consumed: integer("consumed", { mode: "boolean" }).notNull().default(false),
    // Reading history: when the session completes, its marks and LLM review
    // are archived here (an article is read at most once) so past readings
    // can be reopened with the words the user didn't know at the time.
    markedWords: text("marked_words").notNull().default("[]"),
    markedSents: text("marked_sents").notNull().default("[]"),
    reviewResult: text("review_result"),
    readAt: integer("read_at"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch('now') * 1000)`),
  },
  (t) => ({
    userReadIdx: index("articles_user_read_idx").on(t.userId, t.readAt),
  }),
);

export const readingSessions = sqliteTable(
  "reading_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    markedWords: text("marked_words").notNull().default("[]"),
    markedSents: text("marked_sents").notNull().default("[]"),
    reviewResult: text("review_result"),
    state: text("state", { enum: ["reading", "reviewed"] })
      .notNull()
      .default("reading"),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch('now') * 1000)`),
  },
  (t) => ({
    userActiveIdx: uniqueIndex("reading_sessions_user_active_idx").on(t.userId),
  }),
);

export const llmCalls = sqliteTable(
  "llm_calls",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["search", "generate", "review", "practice"] }).notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: integer("cost_usd_micros").notNull().default(0),
    ok: integer("ok", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch('now') * 1000)`),
  },
  (t) => ({
    // The per-user daily rate-limit check runs before every generation/review;
    // without this it's a full scan of an ever-growing table.
    userKindCreatedIdx: index("llm_calls_user_kind_created_idx").on(t.userId, t.kind, t.createdAt),
  }),
);

export const userStats = sqliteTable("user_stats", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  articlesRead: integer("articles_read").notNull().default(0),
  itemsLearned: integer("items_learned").notNull().default(0),
  lastLearnedDigestAt: integer("last_learned_digest_at"),
});
