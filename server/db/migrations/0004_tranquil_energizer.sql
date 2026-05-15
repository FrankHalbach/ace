CREATE TABLE `friendly_invitee` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`friendly_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`team` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`responded_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`friendly_id`) REFERENCES `friendly`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `friendly_invitee_unique` ON `friendly_invitee` (`friendly_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `friendly_invitee_member_status_idx` ON `friendly_invitee` (`member_id`,`status`);--> statement-breakpoint
CREATE TABLE `friendly_result` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`friendly_id` integer NOT NULL,
	`winner_member_ids` text NOT NULL,
	`sets` text NOT NULL,
	`match_mode` text NOT NULL,
	`reported_at` integer DEFAULT (unixepoch()) NOT NULL,
	`reported_by` integer NOT NULL,
	`confirmation_status` text DEFAULT 'pending' NOT NULL,
	`confirmed_at` integer,
	`confirmed_by` integer,
	`disputed_at` integer,
	`dispute_note` text,
	FOREIGN KEY (`friendly_id`) REFERENCES `friendly`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reported_by`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`confirmed_by`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `friendly_result_friendly_idx` ON `friendly_result` (`friendly_id`);--> statement-breakpoint
CREATE TABLE `friendly` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`initiator_id` integer NOT NULL,
	`format` text NOT NULL,
	`scheduled_at` integer NOT NULL,
	`court_info` text,
	`note` text,
	`match_mode` text NOT NULL,
	`status` text DEFAULT 'PROPOSED' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`confirmed_at` integer,
	`declined_at` integer,
	`cancelled_at` integer,
	`played_at` integer,
	`completed_at` integer,
	`disputed_at` integer,
	FOREIGN KEY (`initiator_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `friendly_initiator_status_idx` ON `friendly` (`initiator_id`,`status`);--> statement-breakpoint
CREATE INDEX `friendly_scheduled_idx` ON `friendly` (`scheduled_at`);--> statement-breakpoint
ALTER TABLE `member` ADD `last_friendly_at` integer;