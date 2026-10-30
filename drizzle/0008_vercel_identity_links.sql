CREATE TABLE `auth_identities` (
	`provider` text NOT NULL,
	`subject` text NOT NULL,
	`user_id` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_oauth_identity` ON `auth_identities` (`provider`,`subject`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_provider_per_profile` ON `auth_identities` (`user_id`,`provider`);