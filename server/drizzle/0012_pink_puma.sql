CREATE TABLE `known_words` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`lemma` text NOT NULL,
	`source` text NOT NULL,
	`encounters` integer DEFAULT 0 NOT NULL,
	`first_seen_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`known_since` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `known_words_user_lemma_idx` ON `known_words` (`user_id`,`lemma`);--> statement-breakpoint
CREATE INDEX `known_words_user_known_since_idx` ON `known_words` (`user_id`,`known_since`);--> statement-breakpoint
ALTER TABLE `articles` ADD `lemmas` text DEFAULT '[]' NOT NULL;