-- 0006_age_groups_as_konkurrenzen
--
-- Eine Altersgruppe = eine Konkurrenz = eine Rangliste.
-- Cross-Product `gender_rule` * `variant` wird abgelöst durch ein
-- direktes `gender`-Feld auf `age_group`.
--
-- Daten-Mapping ist bewusst grob (gender_rule='mixed' -> 'mixed',
-- ansonsten -> 'm'). Pre-Launch (N-03): wer Dev-Daten hat, fährt
-- vor diesem Schritt `pnpm db:reset && pnpm db:seed`.

-- 1) Doppel-Ranglisten pro (Saison, AltersGruppe) entfernen,
--    bevor der Unique-Index ohne `variant` greift. ON DELETE CASCADE
--    räumt die zugehörigen ranking_entry-Zeilen mit auf.
DELETE FROM `ranking`
 WHERE `id` NOT IN (
   SELECT MIN(`id`) FROM `ranking`
    GROUP BY `season_id`, `age_group_id`
 );
--> statement-breakpoint

-- 2) `ranking` neu ohne `variant`, mit Unique auf (season_id, age_group_id).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ranking` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`age_group_id` integer NOT NULL,
	`mode` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`age_group_id`) REFERENCES `age_group`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_ranking`(`id`, `season_id`, `age_group_id`, `mode`, `config`, `created_at`)
SELECT `id`, `season_id`, `age_group_id`, `mode`, `config`, `created_at` FROM `ranking`;
--> statement-breakpoint
DROP TABLE `ranking`;--> statement-breakpoint
ALTER TABLE `__new_ranking` RENAME TO `ranking`;--> statement-breakpoint
CREATE UNIQUE INDEX `ranking_unique_idx` ON `ranking` (`season_id`,`age_group_id`);--> statement-breakpoint

-- 3) `age_group`: `gender_rule` -> `gender` ('m' | 'w' | 'mixed').
CREATE TABLE `__new_age_group` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`name` text NOT NULL,
	`min_age` integer,
	`max_age` integer,
	`gender` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_age_group`(`id`, `season_id`, `name`, `min_age`, `max_age`, `gender`, `active`)
SELECT
  `id`,
  `season_id`,
  `name`,
  `min_age`,
  `max_age`,
  CASE `gender_rule` WHEN 'mixed' THEN 'mixed' ELSE 'm' END,
  `active`
FROM `age_group`;
--> statement-breakpoint
DROP TABLE `age_group`;--> statement-breakpoint
ALTER TABLE `__new_age_group` RENAME TO `age_group`;--> statement-breakpoint
CREATE UNIQUE INDEX `age_group_season_name_idx` ON `age_group` (`season_id`,`name`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
