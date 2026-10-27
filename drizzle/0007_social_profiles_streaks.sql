CREATE TABLE `cosmetic_ownership` (
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`source` text NOT NULL,
	`earned` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `cosmetics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_cosmetic_owner` ON `cosmetic_ownership` (`user_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `cosmetics` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`kind` text NOT NULL,
	`effect` text NOT NULL,
	`params` text NOT NULL,
	`icon` text NOT NULL,
	`image` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`unlock_type` text NOT NULL,
	`unlock_value` integer DEFAULT 0 NOT NULL,
	`unlock_target` text DEFAULT '' NOT NULL,
	`placeholder` integer DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_activity` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`source` text NOT NULL,
	`round_id` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_activity_day` ON `daily_activity` (`user_id`,`day`);--> statement-breakpoint
CREATE TABLE `equipped_cosmetics` (
	`user_id` text NOT NULL,
	`slot` text NOT NULL,
	`item_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `cosmetics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_equipped_slot` ON `equipped_cosmetics` (`user_id`,`slot`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_equipped_item` ON `equipped_cosmetics` (`user_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `freeze_grants` (
	`user_id` text NOT NULL,
	`period` text NOT NULL,
	`day` text NOT NULL,
	`amount` integer NOT NULL,
	`balance` integer NOT NULL,
	`rules` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_freeze_refill` ON `freeze_grants` (`user_id`,`period`);--> statement-breakpoint
CREATE TABLE `profile_styles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `social_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `social_settings_versions` (
	`revision` integer PRIMARY KEY NOT NULL,
	`effective_day` text NOT NULL,
	`data` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `streak_days` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`status` text NOT NULL,
	`streak` integer NOT NULL,
	`rules` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_streak_day` ON `streak_days` (`user_id`,`day`);--> statement-breakpoint
CREATE TABLE `streak_milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`days` integer NOT NULL,
	`cosmetic_id` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`placeholder` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`cosmetic_id`) REFERENCES `cosmetics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `streak_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`created_day` text NOT NULL,
	`last_day` text NOT NULL,
	`current` integer DEFAULT 0 NOT NULL,
	`longest` integer DEFAULT 0 NOT NULL,
	`freeze_balance` integer DEFAULT 0 NOT NULL,
	`last_period` text DEFAULT '' NOT NULL,
	`active_days` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`token` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "streak_nonnegative" CHECK("streak_state"."current" >= 0 AND "streak_state"."longest" >= "streak_state"."current" AND "streak_state"."freeze_balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE `tier_awards` (
	`user_id` text NOT NULL,
	`tier_id` text NOT NULL,
	`earned` integer NOT NULL,
	`acknowledged` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tier_id`) REFERENCES `tiers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_tier_award` ON `tier_awards` (`user_id`,`tier_id`);--> statement-breakpoint
CREATE TABLE `tiers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`icon` text NOT NULL,
	`image` text DEFAULT '' NOT NULL,
	`color` text NOT NULL,
	`color_end` text NOT NULL,
	`threshold` integer NOT NULL,
	`sort_order` integer NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`celebration` integer DEFAULT 1 NOT NULL,
	`placeholder` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "tier_threshold" CHECK("tiers"."threshold" >= 0)
);
--> statement-breakpoint
CREATE TRIGGER cosmetic_equip_guard BEFORE INSERT ON equipped_cosmetics BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM cosmetic_ownership o JOIN cosmetics c ON c.id=o.item_id WHERE o.user_id=NEW.user_id AND o.item_id=NEW.item_id AND c.enabled=1 AND (NEW.slot=c.kind OR (c.kind='badge' AND NEW.slot IN ('badge:0','badge:1','badge:2','badge:3','badge:4','badge:5')))) THEN RAISE(ABORT,'Cosmetic is unowned, disabled, or in the wrong slot') END;
END;
--> statement-breakpoint
CREATE TRIGGER cosmetic_equip_no_update BEFORE UPDATE ON equipped_cosmetics BEGIN SELECT RAISE(ABORT,'Replace equipped slots transactionally'); END;
--> statement-breakpoint
CREATE TRIGGER cosmetic_owner_no_update BEFORE UPDATE ON cosmetic_ownership BEGIN SELECT RAISE(ABORT,'Earned cosmetics are permanent'); END;
--> statement-breakpoint
CREATE TRIGGER cosmetic_owner_no_delete BEFORE DELETE ON cosmetic_ownership BEGIN SELECT RAISE(ABORT,'Earned cosmetics are permanent'); END;
--> statement-breakpoint
CREATE TRIGGER activity_eligible BEFORE INSERT ON daily_activity BEGIN
 SELECT CASE WHEN NEW.source NOT IN ('submission','voting') OR NOT EXISTS(SELECT 1 FROM receipts WHERE user_id=NEW.user_id AND round_id=NEW.round_id AND kind=NEW.source) THEN RAISE(ABORT,'Daily activity requires verified participation') END;
END;
--> statement-breakpoint
CREATE TRIGGER activity_no_update BEFORE UPDATE ON daily_activity BEGIN SELECT RAISE(ABORT,'Daily participation is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER activity_no_delete BEFORE DELETE ON daily_activity BEGIN SELECT RAISE(ABORT,'Daily participation is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER streak_day_no_update BEFORE UPDATE ON streak_days BEGIN SELECT RAISE(ABORT,'Streak decisions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER streak_day_no_delete BEFORE DELETE ON streak_days BEGIN SELECT RAISE(ABORT,'Streak decisions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER freeze_grant_no_update BEFORE UPDATE ON freeze_grants BEGIN SELECT RAISE(ABORT,'Freeze refills are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER freeze_grant_no_delete BEFORE DELETE ON freeze_grants BEGIN SELECT RAISE(ABORT,'Freeze refills are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER social_version_no_update BEFORE UPDATE ON social_settings_versions BEGIN SELECT RAISE(ABORT,'Settings history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER social_version_no_delete BEFORE DELETE ON social_settings_versions BEGIN SELECT RAISE(ABORT,'Settings history is immutable'); END;

