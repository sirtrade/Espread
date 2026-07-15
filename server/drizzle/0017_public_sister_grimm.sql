CREATE TABLE `grammar_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`canonical_key` text NOT NULL,
	`pattern` text NOT NULL,
	`category` text NOT NULL,
	`explanation` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`contexts` text DEFAULT '[]' NOT NULL,
	`exercise` text NOT NULL,
	`srs_stage` integer DEFAULT 0 NOT NULL,
	`next_due_at` integer,
	`last_credit_at` integer,
	`created_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grammar_items_user_key_idx` ON `grammar_items` (`user_id`,`canonical_key`);--> statement-breakpoint
CREATE INDEX `grammar_items_user_status_due_idx` ON `grammar_items` (`user_id`,`status`,`next_due_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `grammar_active_pool_limit` integer DEFAULT 10 NOT NULL;