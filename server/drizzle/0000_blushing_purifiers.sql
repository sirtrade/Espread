CREATE TABLE `articles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`topic` text NOT NULL,
	`source_name` text,
	`source_url` text,
	`target_terms` text DEFAULT '[]' NOT NULL,
	`prefetched` integer DEFAULT false NOT NULL,
	`consumed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bank_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`term` text NOT NULL,
	`is_phrase` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`exposures` integer DEFAULT 1 NOT NULL,
	`clean_streak` integer DEFAULT 0 NOT NULL,
	`translation` text,
	`first_context` text,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_items_user_term_idx` ON `bank_items` (`user_id`,`term`);--> statement-breakpoint
CREATE TABLE `llm_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`kind` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd_micros` integer DEFAULT 0 NOT NULL,
	`ok` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `reading_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`article_id` integer NOT NULL,
	`marked_words` text DEFAULT '[]' NOT NULL,
	`marked_sents` text DEFAULT '[]' NOT NULL,
	`review_result` text,
	`state` text DEFAULT 'reading' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reading_sessions_user_active_idx` ON `reading_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_stats` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`articles_read` integer DEFAULT 0 NOT NULL,
	`items_learned` integer DEFAULT 0 NOT NULL,
	`last_learned_digest_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`topic` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tg_user_id` integer NOT NULL,
	`username` text,
	`level` text DEFAULT 'A2' NOT NULL,
	`explain_lang` text DEFAULT 'ru' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`daily_enabled` integer DEFAULT false NOT NULL,
	`daily_time` text DEFAULT '08:00' NOT NULL,
	`onboarded_at` integer,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_tg_user_id_idx` ON `users` (`tg_user_id`);