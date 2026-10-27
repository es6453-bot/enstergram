ALTER TABLE `rounds` ADD `daily_date` text;--> statement-breakpoint
CREATE UNIQUE INDEX `one_daily_round` ON `rounds` (`daily_date`) WHERE "rounds"."cancelled" = 0;