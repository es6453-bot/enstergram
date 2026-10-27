CREATE TABLE `economy_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_starting_grant` ON `ledger` (`user_id`) WHERE "ledger"."kind" = 'starting';