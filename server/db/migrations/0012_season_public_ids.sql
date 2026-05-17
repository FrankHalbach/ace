-- 0012_season_public_ids
--
-- Public-ID-Refactor Phase 5: `season.id` von int auf text (nanoid).
-- FK-Spalten age_group.season_id und ranking.season_id ziehen auf text.

PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- 1) Mapping
CREATE TEMP TABLE _season_id_map (old_id INTEGER PRIMARY KEY, new_id TEXT NOT NULL UNIQUE);
--> statement-breakpoint
INSERT INTO _season_id_map (old_id, new_id)
SELECT id, lower(hex(randomblob(8))) FROM `season`;
--> statement-breakpoint

-- 2) season neu mit text-PK
CREATE TABLE `__new_season` (
	`id` text PRIMARY KEY NOT NULL,
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
INSERT INTO `__new_season`
SELECT map.new_id, s.name, s.status, s.started_at, s.closed_at, s.archived_at, s.config, s.created_at, s.updated_at
FROM `season` s JOIN _season_id_map map ON map.old_id = s.id;
--> statement-breakpoint
DROP TABLE `season`;--> statement-breakpoint
ALTER TABLE `__new_season` RENAME TO `season`;--> statement-breakpoint
CREATE UNIQUE INDEX `season_name_idx` ON `season` (`name`);--> statement-breakpoint

-- 3) age_group: season_id → text
CREATE TABLE `__new_age_group` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` text NOT NULL,
	`name` text NOT NULL,
	`min_age` integer,
	`max_age` integer,
	`gender` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_age_group`
SELECT ag.id, map.new_id, ag.name, ag.min_age, ag.max_age, ag.gender, ag.active
FROM `age_group` ag JOIN _season_id_map map ON map.old_id = ag.season_id;
--> statement-breakpoint
DROP TABLE `age_group`;--> statement-breakpoint
ALTER TABLE `__new_age_group` RENAME TO `age_group`;--> statement-breakpoint
CREATE UNIQUE INDEX `age_group_season_name_idx` ON `age_group` (`season_id`,`name`);--> statement-breakpoint

-- 4) ranking: season_id → text
CREATE TABLE `__new_ranking` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`age_group_id` integer NOT NULL,
	`mode` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`age_group_id`) REFERENCES `age_group`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_ranking`
SELECT r.id, map.new_id, r.age_group_id, r.mode, r.config, r.created_at
FROM `ranking` r JOIN _season_id_map map ON map.old_id = r.season_id;
--> statement-breakpoint
DROP TABLE `ranking`;--> statement-breakpoint
ALTER TABLE `__new_ranking` RENAME TO `ranking`;--> statement-breakpoint
CREATE UNIQUE INDEX `ranking_unique_idx` ON `ranking` (`season_id`,`age_group_id`);--> statement-breakpoint

DROP TABLE _season_id_map;--> statement-breakpoint
PRAGMA foreign_keys=ON;
