-- 0009_ranking_public_ids
--
-- Public-ID-Refactor Phase 2: `ranking.id` von int auf text (nanoid).
-- Alle FK-Spalten auf ranking.id ziehen mit auf text:
--   - challenge.ranking_id
--   - ranking_entry.ranking_id
-- Backfill via lower(hex(randomblob(8))). pnpm db:reset regeneriert sauber.

PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- 1) Mapping-Tabelle
CREATE TEMP TABLE _ranking_id_map (old_id INTEGER PRIMARY KEY, new_id TEXT NOT NULL UNIQUE);
--> statement-breakpoint
INSERT INTO _ranking_id_map (old_id, new_id)
SELECT id, lower(hex(randomblob(8))) FROM `ranking`;
--> statement-breakpoint

-- 2) ranking-Tabelle neu mit text-PK
CREATE TABLE `__new_ranking` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` integer NOT NULL,
	`age_group_id` integer NOT NULL,
	`mode` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`age_group_id`) REFERENCES `age_group`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_ranking` (`id`, `season_id`, `age_group_id`, `mode`, `config`, `created_at`)
SELECT map.new_id, r.season_id, r.age_group_id, r.mode, r.config, r.created_at
FROM `ranking` r JOIN _ranking_id_map map ON map.old_id = r.id;
--> statement-breakpoint
DROP TABLE `ranking`;--> statement-breakpoint
ALTER TABLE `__new_ranking` RENAME TO `ranking`;--> statement-breakpoint
CREATE UNIQUE INDEX `ranking_unique_idx` ON `ranking` (`season_id`,`age_group_id`);--> statement-breakpoint

-- 3) challenge: ranking_id → text
CREATE TABLE `__new_challenge` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
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
SELECT c.id, c.challenger_id, c.challenged_id, map.new_id, c.status, c.created_at, c.accepted_at, c.declined_at, c.expired_at, c.completed_at, c.disputed_at, c.cancelled_at, c.decline_reason, c.decline_note
FROM `challenge` c JOIN _ranking_id_map map ON map.old_id = c.ranking_id;
--> statement-breakpoint
DROP TABLE `challenge`;--> statement-breakpoint
ALTER TABLE `__new_challenge` RENAME TO `challenge`;--> statement-breakpoint
CREATE INDEX `challenge_challenger_status_idx` ON `challenge` (`challenger_id`,`status`);--> statement-breakpoint
CREATE INDEX `challenge_challenged_status_idx` ON `challenge` (`challenged_id`,`status`);--> statement-breakpoint
CREATE INDEX `challenge_pair_created_idx` ON `challenge` (`challenger_id`,`challenged_id`,`created_at`);--> statement-breakpoint

-- 4) ranking_entry: ranking_id → text
CREATE TABLE `__new_ranking_entry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ranking_id` text NOT NULL,
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
SELECT re.id, map.new_id, re.member_id, re.position, re.points, re.elo_rating, re.last_match_at
FROM `ranking_entry` re JOIN _ranking_id_map map ON map.old_id = re.ranking_id;
--> statement-breakpoint
DROP TABLE `ranking_entry`;--> statement-breakpoint
ALTER TABLE `__new_ranking_entry` RENAME TO `ranking_entry`;--> statement-breakpoint
CREATE UNIQUE INDEX `re_ranking_member_idx` ON `ranking_entry` (`ranking_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `re_ranking_position_idx` ON `ranking_entry` (`ranking_id`,`position`);--> statement-breakpoint

DROP TABLE _ranking_id_map;--> statement-breakpoint
PRAGMA foreign_keys=ON;
