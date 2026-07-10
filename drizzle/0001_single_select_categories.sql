ALTER TABLE `youtube_links` RENAME TO `video_links`;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `single_select_categories` (
	`category` text PRIMARY KEY NOT NULL
);
