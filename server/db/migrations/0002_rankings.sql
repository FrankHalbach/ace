CREATE TABLE `ranking` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`age_group_id` integer NOT NULL,
	`variant` text NOT NULL,
	`mode` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`age_group_id`) REFERENCES `age_group`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ranking_unique_idx` ON `ranking` (`season_id`,`age_group_id`,`variant`);--> statement-breakpoint
CREATE TABLE `ranking_entry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ranking_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`position` integer NOT NULL,
	`points` integer,
	`elo_rating` real,
	`last_match_at` integer,
	FOREIGN KEY (`ranking_id`) REFERENCES `ranking`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `re_ranking_member_idx` ON `ranking_entry` (`ranking_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `re_ranking_position_idx` ON `ranking_entry` (`ranking_id`,`position`);