ALTER TABLE `bank_items` ADD `practice_stage` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `bank_items` ADD `next_practice_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `bot_quizzes_per_day` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_bot_quiz_at` integer;