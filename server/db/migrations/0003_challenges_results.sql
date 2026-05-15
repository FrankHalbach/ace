CREATE TABLE `challenge` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`challenger_id` integer NOT NULL,
	`challenged_id` integer NOT NULL,
	`ranking_id` integer NOT NULL,
	`status` text DEFAULT 'PROPOSED' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`accepted_at` integer,
	`declined_at` integer,
	`expired_at` integer,
	`completed_at` integer,
	`disputed_at` integer,
	`decline_reason` text,
	`decline_note` text,
	FOREIGN KEY (`challenger_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`challenged_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ranking_id`) REFERENCES `ranking`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `challenge_challenger_status_idx` ON `challenge` (`challenger_id`,`status`);--> statement-breakpoint
CREATE INDEX `challenge_challenged_status_idx` ON `challenge` (`challenged_id`,`status`);--> statement-breakpoint
CREATE INDEX `challenge_pair_created_idx` ON `challenge` (`challenger_id`,`challenged_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `match_result` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`challenge_id` integer NOT NULL,
	`winner_id` integer NOT NULL,
	`sets` text NOT NULL,
	`match_mode` text NOT NULL,
	`reported_at` integer DEFAULT (unixepoch()) NOT NULL,
	`reported_by` integer NOT NULL,
	`confirmation_status` text DEFAULT 'pending' NOT NULL,
	`confirmed_at` integer,
	`disputed_at` integer,
	`dispute_note` text,
	`applied` integer DEFAULT false NOT NULL,
	`applied_at` integer,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenge`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`winner_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reported_by`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `match_result_challenge_idx` ON `match_result` (`challenge_id`);--> statement-breakpoint
CREATE TABLE `match_points_award` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_result_id` integer NOT NULL,
	`ranking_entry_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`points` integer NOT NULL,
	`reason` text NOT NULL,
	`awarded_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`match_result_id`) REFERENCES `match_result`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ranking_entry_id`) REFERENCES `ranking_entry`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mpa_member_idx` ON `match_points_award` (`member_id`);