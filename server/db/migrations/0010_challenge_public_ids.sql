-- 0010_challenge_public_ids
--
-- Public-ID-Refactor Phase 3: `challenge.id` von int auf text (nanoid).
-- FK-Spalte `match_result.challenge_id` zieht auf text mit.

PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- 1) Mapping
CREATE TEMP TABLE _challenge_id_map (old_id INTEGER PRIMARY KEY, new_id TEXT NOT NULL UNIQUE);
--> statement-breakpoint
INSERT INTO _challenge_id_map (old_id, new_id)
SELECT id, lower(hex(randomblob(8))) FROM `challenge`;
--> statement-breakpoint

-- 2) challenge neu mit text-PK
CREATE TABLE `__new_challenge` (
	`id` text PRIMARY KEY NOT NULL,
	`challenger_id` text NOT NULL,
	`challenged_id` text NOT NULL,
	`ranking_id` text NOT NULL,
	`status` text DEFAULT 'PROPOSED' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`accepted_at` integer,
	`declined_at` integer,
	`expired_at` integer,
	`completed_at` integer,
	`disputed_at` integer,
	`cancelled_at` integer,
	`decline_reason` text,
	`decline_note` text,
	FOREIGN KEY (`challenger_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`challenged_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ranking_id`) REFERENCES `ranking`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_challenge`
SELECT map.new_id, c.challenger_id, c.challenged_id, c.ranking_id, c.status, c.created_at, c.accepted_at, c.declined_at, c.expired_at, c.completed_at, c.disputed_at, c.cancelled_at, c.decline_reason, c.decline_note
FROM `challenge` c JOIN _challenge_id_map map ON map.old_id = c.id;
--> statement-breakpoint
DROP TABLE `challenge`;--> statement-breakpoint
ALTER TABLE `__new_challenge` RENAME TO `challenge`;--> statement-breakpoint
CREATE INDEX `challenge_challenger_status_idx` ON `challenge` (`challenger_id`,`status`);--> statement-breakpoint
CREATE INDEX `challenge_challenged_status_idx` ON `challenge` (`challenged_id`,`status`);--> statement-breakpoint
CREATE INDEX `challenge_pair_created_idx` ON `challenge` (`challenger_id`,`challenged_id`,`created_at`);--> statement-breakpoint

-- 3) match_result: challenge_id → text
CREATE TABLE `__new_match_result` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`challenge_id` text NOT NULL,
	`winner_id` text NOT NULL,
	`sets` text NOT NULL,
	`match_mode` text NOT NULL,
	`reported_at` integer DEFAULT (unixepoch()) NOT NULL,
	`reported_by` text NOT NULL,
	`confirmation_status` text DEFAULT 'pending' NOT NULL,
	`confirmed_at` integer,
	`disputed_at` integer,
	`dispute_note` text,
	`outcome` text DEFAULT 'regular' NOT NULL,
	`outcome_note` text,
	`applied` integer DEFAULT false NOT NULL,
	`applied_at` integer,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenge`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`winner_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reported_by`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_match_result`
SELECT r.id, map.new_id, r.winner_id, r.sets, r.match_mode, r.reported_at, r.reported_by, r.confirmation_status, r.confirmed_at, r.disputed_at, r.dispute_note, r.outcome, r.outcome_note, r.applied, r.applied_at
FROM `match_result` r JOIN _challenge_id_map map ON map.old_id = r.challenge_id;
--> statement-breakpoint
DROP TABLE `match_result`;--> statement-breakpoint
ALTER TABLE `__new_match_result` RENAME TO `match_result`;--> statement-breakpoint
CREATE UNIQUE INDEX `match_result_challenge_idx` ON `match_result` (`challenge_id`);--> statement-breakpoint

DROP TABLE _challenge_id_map;--> statement-breakpoint
PRAGMA foreign_keys=ON;
