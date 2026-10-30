CREATE TABLE `auth_link_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`email_verified` integer,
	`image` text,
	FOREIGN KEY (`id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_user_email` ON `auth_users` (lower("email"));--> statement-breakpoint
CREATE TABLE `auth_verification_tokens` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_auth_verification` ON `auth_verification_tokens` (`identifier`,`token`);--> statement-breakpoint
CREATE TABLE `player_handles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`onboarded` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "onboarding_state" CHECK("player_handles"."onboarded" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_player_username` ON `player_handles` (lower("username"));
--> statement-breakpoint
INSERT INTO auth_users(id,name) SELECT id,name FROM profiles;
--> statement-breakpoint
INSERT INTO player_handles(user_id,username,onboarded) SELECT id,'player_' || printf('%06d',ROW_NUMBER() OVER(ORDER BY id)),1 FROM profiles;
