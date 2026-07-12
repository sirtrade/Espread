-- bank_items: term becomes lemma (the canonical dictionary-form key) and the
-- card gets structured fields. Existing rows keep their old term as lemma;
-- the new fields stay NULL until the admin enrichment endpoint fills them.
ALTER TABLE `bank_items` RENAME COLUMN `term` TO `lemma`;--> statement-breakpoint
DROP INDEX `bank_items_user_term_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `bank_items_user_lemma_idx` ON `bank_items` (`user_id`,`lemma`);--> statement-breakpoint
ALTER TABLE `bank_items` ADD `surface_form` text;--> statement-breakpoint
ALTER TABLE `bank_items` ADD `pos` text;--> statement-breakpoint
ALTER TABLE `bank_items` ADD `gender` text;--> statement-breakpoint
ALTER TABLE `bank_items` ADD `note` text;--> statement-breakpoint
ALTER TABLE `bank_items` ADD `context_translation` text;--> statement-breakpoint
ALTER TABLE `bank_items` ADD `distractors` text;--> statement-breakpoint
ALTER TABLE `bank_items` ADD `freq_band` text;--> statement-breakpoint
ALTER TABLE `articles` ADD `marks` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE `articles` SET `marks` = (
  SELECT COALESCE(json_group_array(json(m)), '[]')
  FROM (
    SELECT json_object('text', w.value, 'sentence', '', 'kind', 'word') AS m
    FROM json_each(`articles`.`marked_words`) w
    UNION ALL
    SELECT json_object('text', s.value, 'sentence', s.value, 'kind', 'sentence') AS m
    FROM json_each(`articles`.`marked_sents`) s
  )
);--> statement-breakpoint
ALTER TABLE `articles` DROP COLUMN `marked_words`;--> statement-breakpoint
ALTER TABLE `articles` DROP COLUMN `marked_sents`;--> statement-breakpoint
-- Active reading sessions are simply reset (agreed migration policy): the
-- user restarts the reading, so no per-session data migration is needed.
DELETE FROM `reading_sessions`;--> statement-breakpoint
ALTER TABLE `reading_sessions` ADD `marks` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `reading_sessions` DROP COLUMN `marked_words`;--> statement-breakpoint
ALTER TABLE `reading_sessions` DROP COLUMN `marked_sents`;
