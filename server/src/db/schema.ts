import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tgUserId: integer("tg_user_id").notNull(),
  username: text("username"),
  level: text("level", { enum: ["A2", "B1", "B2", "C1", "C2"] })
    .notNull()
    .default("A2"),
  explainLang: text("explain_lang", { enum: ["ru", "en", "es"] })
    .notNull()
    .default("ru"),
  timezone: text("timezone").notNull().default("UTC"),
  // Display preferences live on the profile (not the device) so they survive
  // re-opening the Mini App from another device or origin. Null = follow the
  // client default (Telegram color scheme / "md").
  theme: text("theme", { enum: ["claro", "sepia", "oscuro", "ambar"] }),
  fontSize: text("font_size", { enum: ["sm", "md", "lg", "xl"] }),
  dailyEnabled: integer("daily_enabled", { mode: "boolean" }).notNull().default(false),
  dailyTime: text("daily_time").notNull().default("08:00"),
  // In-chat vocabulary quizzes: how many per day the user wants (0 = off).
  botQuizzesPerDay: integer("bot_quizzes_per_day").notNull().default(0),
  // How many cards a Práctica session requests (5 / 10 / 20). Several short
  // sessions beat one long one (distributed practice); the server clamps 1-30.
  practiceSize: integer("practice_size").notNull().default(10),
  // Cap on how many words may be "active" (in study) at once. New accepted
  // words beyond the cap are parked as "queued" and promoted FIFO as slots
  // free up. 0 = no limit (every accepted word goes straight to active).
  activePoolLimit: integer("active_pool_limit").notNull().default(20),
  // Independent cap for the grammar track's active pool (0 = unlimited,
  // clamped to 0-50 in the API). Lexical and grammar pools never share slots.
  grammarActivePoolLimit: integer("grammar_active_pool_limit").notNull().default(10),
  lastBotQuizAt: integer("last_bot_quiz_at"),
  // In-chat typed quiz awaiting a free-text answer: the bank item being asked
  // and when it was sent (stale pendings expire so old texts aren't graded).
  pendingQuizItemId: integer("pending_quiz_item_id"),
  pendingQuizSentAt: integer("pending_quiz_sent_at"),
  // Identifies the randomly selected context for typed bot feedback without
  // exposing its surface form before the answer is graded.
  pendingQuizContextAddedAt: integer("pending_quiz_context_added_at"),
  // F-8 suggestion interaction metadata. Null means no suggestion has been
  // displayed since onboarding/reset/the last actual level change.
  levelSuggestionDirection: text("level_suggestion_direction", { enum: ["up", "down"] }),
  levelSuggestionShownAt: integer("level_suggestion_shown_at"),
  levelSuggestionDismissedAt: integer("level_suggestion_dismissed_at"),
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

/**
 * "Keep the topic" decisions for the remove-topic suggestion (F-19). A
 * separate table (not a column on user_topics) because setUserTopics
 * recreates topic rows on every settings edit and would wipe the stamp.
 * Only skips AFTER dismissed_at count toward re-suggesting the topic.
 */
export const topicSuggestionDismissals = sqliteTable(
  "topic_suggestion_dismissals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    dismissedAt: integer("dismissed_at").notNull(),
  },
  (t) => ({
    userTopicIdx: uniqueIndex("topic_suggestion_dismissals_user_topic_idx").on(t.userId, t.topic),
  }),
);

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
    // "active" words circulate through articles/practice on the SRS ladder;
    // "queued" waits for a free active slot; "learned"/"ignored" are set
    // manually by the reader (there is no automatic promotion any more).
    status: text("status", { enum: ["active", "learned", "ignored", "queued"] })
      .notNull()
      .default("active"),
    exposures: integer("exposures").notNull().default(1),
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
    // Up to five contextual encounters. Nullable/default-compatible so rows
    // from before F-6 keep using the legacy fields above.
    contexts: text("contexts").default("[]"),
    // JSON array of 3 same-POS Spanish words, for quiz options.
    distractors: text("distractors"),
    freqBand: text("freq_band", { enum: ["top1000", "top3000", "top5000", "rare"] }),
    // Spaced-repetition ladder shared by reading and practice. `srsStage` is
    // the rung on SRS_INTERVALS_DAYS; `nextDueAt` is when the word next comes
    // up (for weaving into an article and for practice). A clean reading
    // exposure or a correct quiz answer climbs a rung; re-marking / a wrong
    // answer drops back to stage 0.
    srsStage: integer("srs_stage").notNull().default(0),
    nextDueAt: integer("next_due_at"),
    // Anti-farm guard: a word advances at most once per calendar day, no
    // matter how many times it's seen (reading + practice). Stamps the last
    // credited encounter.
    lastCreditAt: integer("last_credit_at"),
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

export const practiceAnswers = sqliteTable(
  "practice_answers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Polymorphic target (F-15): exactly one of item_id/grammar_item_id is
    // set, discriminated by item_kind — a grammar attempt never carries a
    // fake bank_items FK. Enforced by the two writer paths + tests.
    itemId: integer("item_id").references(() => bankItems.id, { onDelete: "cascade" }),
    itemKind: text("item_kind", { enum: ["word", "grammar"] })
      .notNull()
      .default("word"),
    grammarItemId: integer("grammar_item_id").references(() => grammarItems.id, { onDelete: "cascade" }),
    ts: integer("ts").notNull(),
    cardType: text("card_type", { enum: ["cloze", "recall", "typed"] }).notNull(),
    correct: integer("correct", { mode: "boolean" }).notNull(),
    usedHint: integer("used_hint", { mode: "boolean" }).notNull(),
    latencyMs: integer("latency_ms"),
    srsStageBefore: integer("srs_stage_before").notNull(),
    srsStageAfter: integer("srs_stage_after").notNull(),
  },
  (t) => ({
    userTsIdx: index("practice_answers_user_ts_idx").on(t.userId, t.ts),
    itemTsIdx: index("practice_answers_item_ts_idx").on(t.itemId, t.ts),
    grammarItemTsIdx: index("practice_answers_grammar_item_ts_idx").on(t.grammarItemId, t.ts),
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
    // Content-word lemmas emitted by the writer/editor and then normalized and
    // verified against the final article body on the server.
    lemmas: text("lemmas").notNull().default("[]"),
    prefetched: integer("prefetched", { mode: "boolean" }).notNull().default(false),
    consumed: integer("consumed", { mode: "boolean" }).notNull().default(false),
    // Reading history: when the session completes, its marks and LLM review
    // are archived here (an article is read at most once) so past readings
    // can be reopened with the words the user didn't know at the time.
    // JSON array of Mark objects: { text, sentence, kind, pos? }.
    marks: text("marks").notNull().default("[]"),
    reviewResult: text("review_result"),
    readAt: integer("read_at"),
    // Skip record (F-17): an article is read or skipped at most once, so the
    // questionnaire answer lives here (no separate table). The reason/comment
    // feed future topic selection (F-18/F-19). Comment only with "other".
    skippedAt: integer("skipped_at"),
    skipReason: text("skip_reason", { enum: ["repeat", "not_interested", "too_hard", "other"] }),
    skipComment: text("skip_comment"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch('now') * 1000)`),
  },
  (t) => ({
    userReadIdx: index("articles_user_read_idx").on(t.userId, t.readAt),
  }),
);

/**
 * Grammar-track units (grammar-track design §5): a concrete productive
 * pattern the reader explicitly accepted from a review. Deliberately NOT a
 * bank_items extension — the key, content and exercises are different. The
 * SRS columns mirror the lexical ladder, but only active practice will ever
 * move them (reading/weaving give no grammar credit).
 */
export const grammarItems = sqliteTable(
  "grammar_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Server-normalized stable identity, e.g. "cuando+subjuntivo-presente".
    canonicalKey: text("canonical_key").notNull(),
    // Short Spanish display pattern, e.g. "cuando + presente de subjuntivo".
    pattern: text("pattern").notNull(),
    category: text("category", {
      enum: [
        "tense_aspect",
        "mood",
        "periphrasis",
        "pronouns",
        "agreement",
        "syntax",
        "prepositions",
        "connectors",
        "other",
      ],
    }).notNull(),
    // Short explanation in the user's explainLang at acceptance time.
    explanation: text("explanation").notNull(),
    status: text("status", { enum: ["active", "queued", "learned", "ignored"] })
      .notNull()
      .default("active"),
    // JSON array of up to 5 contexts (same shape as bank contexts): a repeat
    // detection of the same canonical key adds a context, never a second row.
    contexts: text("contexts").notNull().default("[]"),
    // Validated GrammarExercise JSON (cloze, acceptedAnswers, options).
    exercise: text("exercise").notNull(),
    srsStage: integer("srs_stage").notNull().default(0),
    nextDueAt: integer("next_due_at"),
    lastCreditAt: integer("last_credit_at"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch('now') * 1000)`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch('now') * 1000)`),
  },
  (t) => ({
    userKeyIdx: uniqueIndex("grammar_items_user_key_idx").on(t.userId, t.canonicalKey),
    userStatusDueIdx: index("grammar_items_user_status_due_idx").on(t.userId, t.status, t.nextDueAt),
  }),
);

export const knownWords = sqliteTable(
  "known_words",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lemma: text("lemma").notNull(),
    source: text("source", { enum: ["learned", "reading", "manual"] }).notNull(),
    encounters: integer("encounters").notNull().default(0),
    firstSeenAt: integer("first_seen_at")
      .notNull()
      .default(sql`(unixepoch('now') * 1000)`),
    lastSeenAt: integer("last_seen_at")
      .notNull()
      .default(sql`(unixepoch('now') * 1000)`),
    knownSince: integer("known_since"),
  },
  (t) => ({
    userLemmaIdx: uniqueIndex("known_words_user_lemma_idx").on(t.userId, t.lemma),
    userKnownSinceIdx: index("known_words_user_known_since_idx").on(t.userId, t.knownSince),
  }),
);

export const dailyActivity = sqliteTable(
  "daily_activity",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    localDay: text("local_day").notNull(),
    reading: integer("reading", { mode: "boolean" }).notNull().default(false),
    practice: integer("practice", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch('now') * 1000)`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch('now') * 1000)`),
  },
  (t) => ({
    userDayIdx: uniqueIndex("daily_activity_user_day_idx").on(t.userId, t.localDay),
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
    kind: text("kind", {
      enum: ["search", "generate", "review", "practice", "enrich", "audit", "rewrite", "lemmatize"],
    }).notNull(),
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
