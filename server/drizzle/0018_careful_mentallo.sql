PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_practice_answers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`item_id` integer,
	`item_kind` text DEFAULT 'word' NOT NULL,
	`grammar_item_id` integer,
	`ts` integer NOT NULL,
	`card_type` text NOT NULL,
	`correct` integer NOT NULL,
	`used_hint` integer NOT NULL,
	`latency_ms` integer,
	`srs_stage_before` integer NOT NULL,
	`srs_stage_after` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `bank_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grammar_item_id`) REFERENCES `grammar_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_practice_answers`("id", "user_id", "item_id", "item_kind", "grammar_item_id", "ts", "card_type", "correct", "used_hint", "latency_ms", "srs_stage_before", "srs_stage_after") SELECT "id", "user_id", "item_id", 'word', NULL, "ts", "card_type", "correct", "used_hint", "latency_ms", "srs_stage_before", "srs_stage_after" FROM `practice_answers`;--> statement-breakpoint
DROP TABLE `practice_answers`;--> statement-breakpoint
ALTER TABLE `__new_practice_answers` RENAME TO `practice_answers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `practice_answers_user_ts_idx` ON `practice_answers` (`user_id`,`ts`);--> statement-breakpoint
CREATE INDEX `practice_answers_item_ts_idx` ON `practice_answers` (`item_id`,`ts`);--> statement-breakpoint
CREATE INDEX `practice_answers_grammar_item_ts_idx` ON `practice_answers` (`grammar_item_id`,`ts`);