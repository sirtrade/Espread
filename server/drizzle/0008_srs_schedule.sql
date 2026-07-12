ALTER TABLE `bank_items` RENAME COLUMN `practice_stage` TO `srs_stage`;--> statement-breakpoint
ALTER TABLE `bank_items` RENAME COLUMN `next_practice_at` TO `next_due_at`;--> statement-breakpoint
ALTER TABLE `bank_items` RENAME COLUMN `last_streak_credit_at` TO `last_credit_at`;--> statement-breakpoint
ALTER TABLE `bank_items` DROP COLUMN `clean_streak`;