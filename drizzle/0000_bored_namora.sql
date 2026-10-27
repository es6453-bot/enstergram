CREATE TABLE `activations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`round_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`item_id` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `catalog`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_activation` ON `activations` (`user_id`,`round_id`);--> statement-breakpoint
CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`payload` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ballots` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`user_id` text NOT NULL,
	`choices` text NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_ballot` ON `ballots` (`round_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`icon` text NOT NULL,
	`image` text,
	`cost` integer NOT NULL,
	`effect` text NOT NULL,
	`parameter` integer NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`available_from` integer,
	`available_until` integer,
	`placeholder` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "positive_cost" CHECK("catalog"."cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE `effects` (
	`activation_id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`parameter` integer NOT NULL,
	FOREIGN KEY (`activation_id`) REFERENCES `activations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `follower_awards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`round_id` text NOT NULL,
	`amount` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_followers` ON `follower_awards` (`user_id`,`round_id`);--> statement-breakpoint
CREATE TABLE `inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `catalog`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "no_negative_stock" CHECK("inventory"."quantity" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_stock` ON `inventory` (`user_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`round_id` text,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`note` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'player' NOT NULL,
	`followers` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`scheduled` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`placeholder` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `catalog`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`round_id` text NOT NULL,
	`kind` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_receipt` ON `receipts` (`user_id`,`round_id`,`kind`);--> statement-breakpoint
CREATE TABLE `results` (
	`submission_id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`user_id` text NOT NULL,
	`rank` integer NOT NULL,
	`raw` integer NOT NULL,
	`bonus` integer NOT NULL,
	`score` integer NOT NULL,
	`followers` integer NOT NULL,
	`breakdown` text NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`prompt` text NOT NULL,
	`opens` integer NOT NULL,
	`closes` integer NOT NULL,
	`ends` integer NOT NULL,
	`cancelled` integer DEFAULT 0 NOT NULL,
	`finalized` integer,
	`config` text NOT NULL,
	`placeholder` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_entry` ON `submissions` (`round_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `wallets` (
	`user_id` text PRIMARY KEY NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "no_overdraft" CHECK("wallets"."balance" >= 0)
);
