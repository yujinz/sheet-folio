CREATE TABLE IF NOT EXISTS `device_zoom` (
	`device_id` text NOT NULL,
	`song_id` integer NOT NULL,
	`zoom` integer DEFAULT 100 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `device_zoom_device_song_idx` ON `device_zoom` (`device_id`,`song_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `song_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`song_id` integer NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`filename` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`source_url` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `song_tags` (
	`song_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `song_tags_song_tag_idx` ON `song_tags` (`song_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `songs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`title_en` text DEFAULT '' NOT NULL,
	`difficulty` integer NOT NULL,
	`notes` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_en` text DEFAULT '' NOT NULL,
	`color` text NOT NULL,
	`category` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `tags_category_name_idx` ON `tags` (`category`,`name`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `youtube_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`song_id` integer NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
