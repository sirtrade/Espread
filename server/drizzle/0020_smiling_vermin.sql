CREATE TABLE `topic_suggestion_dismissals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`topic` text NOT NULL,
	`dismissed_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topic_suggestion_dismissals_user_topic_idx` ON `topic_suggestion_dismissals` (`user_id`,`topic`);