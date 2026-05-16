-- 0008_member_public_ids
--
-- Erste Etappe des Public-ID-Refactors: `member.id` wird von
-- `integer AUTOINCREMENT` auf `text` (nanoid 21 Zeichen) umgestellt.
-- Alle FK-Spalten, die auf `member.id` verweisen, ziehen mit auf `text`.
--
-- Pre-Launch: Dev-Daten werden via `lower(hex(randomblob(8)))` gemappt
-- (16-Hex-Strings statt sauberer nanoid). Wer Dev-Daten sauber will:
-- `pnpm db:reset && pnpm db:seed`. Production-Daten gibt es noch nicht.

PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- 1) Mapping-Tabelle: alte Int-ID → neue Text-ID (random hex)
CREATE TEMP TABLE _member_id_map (old_id INTEGER PRIMARY KEY, new_id TEXT NOT NULL UNIQUE);
--> statement-breakpoint
INSERT INTO _member_id_map (old_id, new_id)
SELECT id, lower(hex(randomblob(8))) FROM `member`;
--> statement-breakpoint

-- 2) member-Tabelle neu mit text-PK
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
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_member` (`id`, `email`, `first_name`, `last_name`, `birth_year`, `gender`, `dtb_lk`, `status`, `roles`, `preferences`, `last_friendly_at`, `created_at`, `updated_at`)
SELECT map.new_id, m.email, m.first_name, m.last_name, m.birth_year, m.gender, m.dtb_lk, m.status, m.roles, m.preferences, m.last_friendly_at, m.created_at, m.updated_at
FROM `member` m JOIN _member_id_map map ON map.old_id = m.id;
--> statement-breakpoint
DROP TABLE `member`;--> statement-breakpoint
ALTER TABLE `__new_member` RENAME TO `member`;--> statement-breakpoint
CREATE UNIQUE INDEX `member_email_lower_idx` ON `member` (lower(`email`));--> statement-breakpoint

-- 3) challenge: challenger_id + challenged_id → text
CREATE TABLE `__new_challenge` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`challenger_id` text NOT NULL,
	`challenged_id` text NOT NULL,
	`ranking_id` integer NOT NULL,
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
SELECT c.id, cr.new_id, cd.new_id, c.ranking_id, c.status, c.created_at, c.accepted_at, c.declined_at, c.expired_at, c.completed_at, c.disputed_at, c.cancelled_at, c.decline_reason, c.decline_note
FROM `challenge` c
JOIN _member_id_map cr ON cr.old_id = c.challenger_id
JOIN _member_id_map cd ON cd.old_id = c.challenged_id;
--> statement-breakpoint
DROP TABLE `challenge`;--> statement-breakpoint
ALTER TABLE `__new_challenge` RENAME TO `challenge`;--> statement-breakpoint
CREATE INDEX `challenge_challenger_status_idx` ON `challenge` (`challenger_id`,`status`);--> statement-breakpoint
CREATE INDEX `challenge_challenged_status_idx` ON `challenge` (`challenged_id`,`status`);--> statement-breakpoint
CREATE INDEX `challenge_pair_created_idx` ON `challenge` (`challenger_id`,`challenged_id`,`created_at`);--> statement-breakpoint

-- 4) friendly: initiator_id → text
CREATE TABLE `__new_friendly` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
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
SELECT f.id, m.new_id, f.format, f.scheduled_at, f.court_info, f.note, f.match_mode, f.status, f.created_at, f.confirmed_at, f.declined_at, f.cancelled_at, f.played_at, f.completed_at, f.disputed_at
FROM `friendly` f JOIN _member_id_map m ON m.old_id = f.initiator_id;
--> statement-breakpoint
DROP TABLE `friendly`;--> statement-breakpoint
ALTER TABLE `__new_friendly` RENAME TO `friendly`;--> statement-breakpoint
CREATE INDEX `friendly_initiator_status_idx` ON `friendly` (`initiator_id`,`status`);--> statement-breakpoint
CREATE INDEX `friendly_scheduled_idx` ON `friendly` (`scheduled_at`);--> statement-breakpoint

-- 5) friendly_invitee: member_id → text
CREATE TABLE `__new_friendly_invitee` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`friendly_id` integer NOT NULL,
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
SELECT fi.id, fi.friendly_id, m.new_id, fi.team, fi.status, fi.responded_at, fi.created_at
FROM `friendly_invitee` fi JOIN _member_id_map m ON m.old_id = fi.member_id;
--> statement-breakpoint
DROP TABLE `friendly_invitee`;--> statement-breakpoint
ALTER TABLE `__new_friendly_invitee` RENAME TO `friendly_invitee`;--> statement-breakpoint
CREATE UNIQUE INDEX `friendly_invitee_unique` ON `friendly_invitee` (`friendly_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `friendly_invitee_member_status_idx` ON `friendly_invitee` (`member_id`,`status`);--> statement-breakpoint

-- 6) friendly_result: reported_by + confirmed_by + JSON winner_member_ids
CREATE TABLE `__new_friendly_result` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`friendly_id` integer NOT NULL,
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
-- winner_member_ids ist ein JSON-Array von Member-IDs (int). Per
-- json_each iterieren, mapping nachschlagen, dann json_group_array.
INSERT INTO `__new_friendly_result`
SELECT
  fr.id, fr.friendly_id,
  (SELECT json_group_array(map.new_id) FROM json_each(fr.winner_member_ids) j JOIN _member_id_map map ON map.old_id = j.value),
  fr.sets, fr.match_mode, fr.reported_at, rb.new_id, fr.confirmation_status, fr.confirmed_at,
  cb.new_id, fr.disputed_at, fr.dispute_note, fr.outcome, fr.outcome_note
FROM `friendly_result` fr
JOIN _member_id_map rb ON rb.old_id = fr.reported_by
LEFT JOIN _member_id_map cb ON cb.old_id = fr.confirmed_by;
--> statement-breakpoint
DROP TABLE `friendly_result`;--> statement-breakpoint
ALTER TABLE `__new_friendly_result` RENAME TO `friendly_result`;--> statement-breakpoint
CREATE UNIQUE INDEX `friendly_result_friendly_idx` ON `friendly_result` (`friendly_id`);--> statement-breakpoint

-- 7) magic_link_token: member_id → text
CREATE TABLE `__new_magic_link_token` (
	`token` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_magic_link_token`
SELECT t.token, m.new_id, t.created_at, t.expires_at, t.consumed_at
FROM `magic_link_token` t JOIN _member_id_map m ON m.old_id = t.member_id;
--> statement-breakpoint
DROP TABLE `magic_link_token`;--> statement-breakpoint
ALTER TABLE `__new_magic_link_token` RENAME TO `magic_link_token`;--> statement-breakpoint
CREATE INDEX `mlt_member_created_idx` ON `magic_link_token` (`member_id`,`created_at`);--> statement-breakpoint

-- 8) match_points_award: member_id → text
CREATE TABLE `__new_match_points_award` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_result_id` integer NOT NULL,
	`ranking_entry_id` integer NOT NULL,
	`member_id` text NOT NULL,
	`points` integer NOT NULL,
	`reason` text NOT NULL,
	`awarded_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`match_result_id`) REFERENCES `match_result`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ranking_entry_id`) REFERENCES `ranking_entry`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_match_points_award`
SELECT a.id, a.match_result_id, a.ranking_entry_id, m.new_id, a.points, a.reason, a.awarded_at
FROM `match_points_award` a JOIN _member_id_map m ON m.old_id = a.member_id;
--> statement-breakpoint
DROP TABLE `match_points_award`;--> statement-breakpoint
ALTER TABLE `__new_match_points_award` RENAME TO `match_points_award`;--> statement-breakpoint
CREATE INDEX `mpa_member_idx` ON `match_points_award` (`member_id`);--> statement-breakpoint

-- 9) match_result: winner_id + reported_by → text
CREATE TABLE `__new_match_result` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`challenge_id` integer NOT NULL,
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
SELECT r.id, r.challenge_id, w.new_id, r.sets, r.match_mode, r.reported_at, rb.new_id, r.confirmation_status, r.confirmed_at, r.disputed_at, r.dispute_note, r.outcome, r.outcome_note, r.applied, r.applied_at
FROM `match_result` r
JOIN _member_id_map w ON w.old_id = r.winner_id
JOIN _member_id_map rb ON rb.old_id = r.reported_by;
--> statement-breakpoint
DROP TABLE `match_result`;--> statement-breakpoint
ALTER TABLE `__new_match_result` RENAME TO `match_result`;--> statement-breakpoint
CREATE UNIQUE INDEX `match_result_challenge_idx` ON `match_result` (`challenge_id`);--> statement-breakpoint

-- 10) ranking_entry: member_id → text
CREATE TABLE `__new_ranking_entry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ranking_id` integer NOT NULL,
	`member_id` text NOT NULL,
	`position` integer NOT NULL,
	`points` integer,
	`elo_rating` real,
	`last_match_at` integer,
	FOREIGN KEY (`ranking_id`) REFERENCES `ranking`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_ranking_entry`
SELECT re.id, re.ranking_id, m.new_id, re.position, re.points, re.elo_rating, re.last_match_at
FROM `ranking_entry` re JOIN _member_id_map m ON m.old_id = re.member_id;
--> statement-breakpoint
DROP TABLE `ranking_entry`;--> statement-breakpoint
ALTER TABLE `__new_ranking_entry` RENAME TO `ranking_entry`;--> statement-breakpoint
CREATE UNIQUE INDEX `re_ranking_member_idx` ON `ranking_entry` (`ranking_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `re_ranking_position_idx` ON `ranking_entry` (`ranking_id`,`position`);--> statement-breakpoint

DROP TABLE _member_id_map;--> statement-breakpoint
PRAGMA foreign_keys=ON;
