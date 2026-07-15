ALTER TABLE `articles` ADD `skipped_at` integer;--> statement-breakpoint
ALTER TABLE `articles` ADD `skip_reason` text;--> statement-breakpoint
ALTER TABLE `articles` ADD `skip_comment` text;