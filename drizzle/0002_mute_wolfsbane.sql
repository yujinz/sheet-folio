ALTER TABLE `songs` ADD `title_alt` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `songs` DROP COLUMN `title_en`;--> statement-breakpoint
ALTER TABLE `tags` ADD `name_alt` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tags` DROP COLUMN `name_en`;