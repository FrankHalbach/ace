CREATE TABLE `audit_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`subject_kind` text,
	`subject_id` text,
	`before` text,
	`after` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_entry_subject_idx` ON `audit_entry` (`subject_kind`,`subject_id`);--> statement-breakpoint
CREATE INDEX `audit_entry_created_idx` ON `audit_entry` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_entry_actor_idx` ON `audit_entry` (`actor_id`);--> statement-breakpoint
CREATE TABLE `team_tag` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_tag_name_lower_idx` ON `team_tag` (lower("name"));--> statement-breakpoint
CREATE TABLE `member_team_tag` (
	`member_id` text NOT NULL,
	`team_tag_id` text NOT NULL,
	`assigned_at` integer DEFAULT (unixepoch()) NOT NULL,
	`assigned_by` text,
	PRIMARY KEY(`member_id`, `team_tag_id`),
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_tag_id`) REFERENCES `team_tag`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_by`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_member` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`birth_year` integer NOT NULL,
	`gender` text NOT NULL,
	`dtb_lk` real DEFAULT 25 NOT NULL,
	`status` text DEFAULT 'aktiv' NOT NULL,
	`roles` text DEFAULT '["player"]' NOT NULL,
	`preferences` text DEFAULT '{"singlesChallenges":true,"singlesFriendly":true,"doublesFriendly":false,"mixedFriendly":false,"ageGroupFriendly":false}' NOT NULL,
	`last_friendly_at` integer,
	`deactivated_at` integer,
	`deactivation_reason` text,
	`invited_at` integer,
	`invited_by` text,
	`first_login_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_member`("id", "email", "first_name", "last_name", "birth_year", "gender", "dtb_lk", "status", "roles", "preferences", "last_friendly_at", "created_at", "updated_at") SELECT "id", "email", "first_name", "last_name", "birth_year", "gender", "dtb_lk", "status", "roles", "preferences", "last_friendly_at", "created_at", "updated_at" FROM `member`;--> statement-breakpoint
DROP TABLE `member`;--> statement-breakpoint
ALTER TABLE `__new_member` RENAME TO `member`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `member_email_lower_idx` ON `member` (lower(`email`));