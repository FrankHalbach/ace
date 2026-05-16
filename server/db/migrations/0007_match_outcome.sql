-- 0007_match_outcome
--
-- Walk-Over und Aufgabe als Match-Ausgang (Issues #29 / #30).
-- Bestehende Zeilen sind alle regulär — Default greift automatisch.

ALTER TABLE `match_result` ADD `outcome` text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE `match_result` ADD `outcome_note` text;--> statement-breakpoint
ALTER TABLE `friendly_result` ADD `outcome` text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE `friendly_result` ADD `outcome_note` text;
