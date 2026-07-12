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
  // Cap on how many words may be "active" (in study) at once. New accepted
  // words beyond the cap are parked as "queued" and promoted FIFO as slots
  // free up. 0 = no limit (every accepted word goes straight to active).
  activePoolLimit: integer("active_pool_limit").notNull().default(20),
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
    // Dictionary form — the canonical key (verb infinitive incl. pronominal
    // -se, noun singular, adjective masculine singular).
    lemma: text("lemma").notNull(),
    isPhrase: integer("is_phrase", { mode: "boolean" }).notNull().default(false),
    // "queued" is reserved for the upcoming intake queue; nothing sets it yet.
    status: text("status", { enum: ["active", "learned", "ignored", "queued"] })
      .notNull()
      .default("active"),
    exposures: integer("exposures").notNull().default(1),
    cleanStreak: integer("clean_streak").notNull().default(0),
    // Short translation of the lemma (no parentheses, no Spanish inside).
    translation: text("translation"),
    // The sentence in which the word was marked.
    firstContext: text("first_context"),
    // The exact inflected form as it appeared in the text ("perfila").
    surfaceForm: text("surface_form"),
    pos: text("pos", { enum: ["verb", "noun", "adj", "adv", "phrase", "other"] }),
    gender: text("gender", { enum: ["m", "f"] }),
    // Optional usage explanation (what used to pollute translation).
    note: text("note"),
    // Translation of firstContext into the user's explain language.
    contextTranslation: text("context_translation"),
    // JSON array of 3 same-POS Spanish words, for quiz options.
    distractors: text("distractors"),
    freqBand: text("freq_band", { enum: ["top1000", "top3000", "top5000", "rare"] }),
    // Spaced-repetition ladder for the practice mode. Orthogonal to the
    // learning streak below: it controls WHEN an item comes up for review,
    // while cleanStreak controls promotion to "learned".
    practiceStage: integer("practice_stage").notNull().default(0),
    nextPracticeAt: integer("next_practice_at"),
    // Anti-farm guard: a first-try-correct practice answer counts as a clean
    // encounter (cleanStreak+1, like a reading exposure), but only once per
    // calendar day per item. This stamps the last credited answer.
    lastStreakCreditAt: integer("last_streak_credit_at"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch('now') * 1000)`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch('now') * 1000)`),
  },
  (t) => ({
    userLemmaIdx: uniqueIndex("bank_items_user_lemma_idx").on(t.userId, t.lemma),
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
    // JSON array of Mark objects: { text, sentence, kind, pos? }.
    marks: text("marks").notNull().default("[]"),
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
    // JSON array of Mark objects: { text, sentence, kind, pos? }.
    marks: text("marks").notNull().default("[]"),
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
    kind: text("kind", { enum: ["search", "generate", "review", "practice", "enrich"] }).notNull(),
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
