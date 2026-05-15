CREATE TABLE `age_group` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`name` text NOT NULL,
	`min_age` integer,
	`max_age` integer,
	`gender_rule` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `age_group_season_name_idx` ON `age_group` (`season_id`,`name`);--> statement-breakpoint
CREATE TABLE `season` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'PLANNED' NOT NULL,
	`started_at` integer,
	`closed_at` integer,
	`archived_at` integer,
	`config` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `season_name_idx` ON `season` (`name`);