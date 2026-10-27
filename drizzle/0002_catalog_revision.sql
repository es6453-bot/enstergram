CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`bucket` integer NOT NULL,
	`count` integer NOT NULL,
	CONSTRAINT "request_limit" CHECK("rate_limits"."count" <= 60)
);
--> statement-breakpoint
ALTER TABLE `activations` ADD `catalog_revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `catalog` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchases` ADD `catalog_revision` integer DEFAULT 1 NOT NULL;