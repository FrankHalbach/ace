-- 0011_friendly_public_ids
--
-- Public-ID-Refactor Phase 4: `friendly.id` von int auf text (nanoid).
-- FK-Spalten friendly_invitee.friendly_id und friendly_result.friendly_id
-- ziehen auf text mit.

PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- 1) Mapping
CREATE TEMP TABLE _friendly_id_map (old_id INTEGER PRIMARY KEY, new_id TEXT NOT NULL UNIQUE);
--> statement-breakpoint
INSERT INTO _friendly_id_map (old_id, new_id)
SELECT id, lower(hex(randomblob(8))) FROM `friendly`;
--> statement-breakpoint

-- 2) friendly neu mit text-PK
CREATE TABLE `__new_friendly` (
	`id` text PRIMARY KEY NOT NULL,
	`initiator_id` text NOT NULL,
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
INSERT INTO `__new_friendly`
SELECT map.new_id, f.initiator_id, f.format, f.scheduled_at, f.court_info, f.note, f.match_mode, f.status, f.created_at, f.confirmed_at, f.declined_at, f.cancelled_at, f.played_at, f.completed_at, f.disputed_at
FROM `friendly` f JOIN _friendly_id_map map ON map.old_id = f.id;
--> statement-breakpoint
DROP TABLE `friendly`;--> statement-breakpoint
ALTER TABLE `__new_friendly` RENAME TO `friendly`;--> statement-breakpoint
CREATE INDEX `friendly_initiator_status_idx` ON `friendly` (`initiator_id`,`status`);--> statement-breakpoint
CREATE INDEX `friendly_scheduled_idx` ON `friendly` (`scheduled_at`);--> statement-breakpoint

-- 3) friendly_invitee: friendly_id → text
CREATE TABLE `__new_friendly_invitee` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`friendly_id` text NOT NULL,
	`member_id` text NOT NULL,
	`team` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`responded_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`friendly_id`) REFERENCES `friendly`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_friendly_invitee`
SELECT fi.id, map.new_id, fi.member_id, fi.team, fi.status, fi.responded_at, fi.created_at
FROM `friendly_invitee` fi JOIN _friendly_id_map map ON map.old_id = fi.friendly_id;
--> statement-breakpoint
DROP TABLE `friendly_invitee`;--> statement-breakpoint
ALTER TABLE `__new_friendly_invitee` RENAME TO `friendly_invitee`;--> statement-breakpoint
CREATE UNIQUE INDEX `friendly_invitee_unique` ON `friendly_invitee` (`friendly_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `friendly_invitee_member_status_idx` ON `friendly_invitee` (`member_id`,`status`);--> statement-breakpoint

-- 4) friendly_result: friendly_id → text
CREATE TABLE `__new_friendly_result` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`friendly_id` text NOT NULL,
	`winner_member_ids` text NOT NULL,
	`sets` text NOT NULL,
	`match_mode` text NOT NULL,
	`reported_at` integer DEFAULT (unixepoch()) NOT NULL,
	`reported_by` text NOT NULL,
	`confirmation_status` text DEFAULT 'pending' NOT NULL,
	`confirmed_at` integer,
	`confirmed_by` text,
	`disputed_at` integer,
	`dispute_note` text,
	`outcome` text DEFAULT 'regular' NOT NULL,
	`outcome_note` text,
	FOREIGN KEY (`friendly_id`) REFERENCES `friendly`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reported_by`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`confirmed_by`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_friendly_result`
SELECT fr.id, map.new_id, fr.winner_member_ids, fr.sets, fr.match_mode, fr.reported_at, fr.reported_by, fr.confirmation_status, fr.confirmed_at, fr.confirmed_by, fr.disputed_at, fr.dispute_note, fr.outcome, fr.outcome_note
FROM `friendly_result` fr JOIN _friendly_id_map map ON map.old_id = fr.friendly_id;
--> statement-breakpoint
DROP TABLE `friendly_result`;--> statement-breakpoint
ALTER TABLE `__new_friendly_result` RENAME TO `friendly_result`;--> statement-breakpoint
CREATE UNIQUE INDEX `friendly_result_friendly_idx` ON `friendly_result` (`friendly_id`);--> statement-breakpoint

DROP TABLE _friendly_id_map;--> statement-breakpoint
PRAGMA foreign_keys=ON;
