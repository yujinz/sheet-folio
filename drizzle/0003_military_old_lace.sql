CREATE TABLE `tag_categories` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`name_alt` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
