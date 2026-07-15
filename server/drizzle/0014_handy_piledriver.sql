ALTER TABLE `bank_items` ADD `contexts` text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE `users` ADD `pending_quiz_context_added_at` integer;