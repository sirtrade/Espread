CREATE TABLE `practice_answers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`ts` integer NOT NULL,
	`card_type` text NOT NULL,
	`correct` integer NOT NULL,
	`used_hint` integer NOT NULL,
	`latency_ms` integer,
	`srs_stage_before` integer NOT NULL,
	`srs_stage_after` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `bank_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `practice_answers_user_ts_idx` ON `practice_answers` (`user_id`,`ts`);--> statement-breakpoint
CREATE INDEX `practice_answers_item_ts_idx` ON `practice_answers` (`item_id`,`ts`);