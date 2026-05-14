CREATE TABLE `member` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`birth_year` integer NOT NULL,
	`gender` text NOT NULL,
	`dtb_lk` real DEFAULT 25 NOT NULL,
	`status` text DEFAULT 'aktiv' NOT NULL,
	`roles` text DEFAULT '["player"]' NOT NULL,
	`preferences` text DEFAULT '{"singlesChallenges":true,"singlesFriendly":true,"doublesFriendly":false,"mixedFriendly":false,"seniorsFriendly":false}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_email_lower_idx` ON `member` (lower("email"));--> statement-breakpoint
CREATE TABLE `magic_link_token` (
	`token` text PRIMARY KEY NOT NULL,
	`member_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mlt_member_created_idx` ON `magic_link_token` (`member_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rate_limit_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`occurred_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rle_key_time_idx` ON `rate_limit_event` (`key`,`occurred_at`);