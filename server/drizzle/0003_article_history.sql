ALTER TABLE `articles` ADD `marked_words` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD `marked_sents` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD `review_result` text;--> statement-breakpoint
ALTER TABLE `articles` ADD `read_at` integer;--> statement-breakpoint
CREATE INDEX `articles_user_read_idx` ON `articles` (`user_id`,`read_at`);