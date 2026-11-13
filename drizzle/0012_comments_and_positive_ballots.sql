CREATE TABLE `response_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`submission_id` text NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "response_comment_length" CHECK(length("response_comments"."content") BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE INDEX `response_comment_page` ON `response_comments` (`submission_id`,`id`);
--> statement-breakpoint
INSERT INTO economy_updates(id,created) VALUES('positive-ballots-v1',unixepoch('subsec')*1000);
--> statement-breakpoint
UPDATE catalog SET enabled=0,revision=revision+1 WHERE effect='downvote_shield' AND enabled=1;
--> statement-breakpoint
UPDATE catalog SET description='Give a good take a bigger stage. Double your voting points.',revision=revision+1
WHERE id='algorithm-boost' AND description='Give a good take a bigger stage. Double positive voting points; downvotes stay the same.';
--> statement-breakpoint
CREATE TRIGGER retired_shield_insert BEFORE INSERT ON catalog
WHEN NEW.effect='downvote_shield' AND NEW.enabled=1
BEGIN SELECT RAISE(ABORT,'This power-up is retired.'); END;
--> statement-breakpoint
CREATE TRIGGER retired_shield_update BEFORE UPDATE OF enabled,effect ON catalog
WHEN NEW.effect='downvote_shield' AND NEW.enabled=1
BEGIN SELECT RAISE(ABORT,'This power-up is retired.'); END;
--> statement-breakpoint
CREATE TRIGGER ballot_positive_insert BEFORE INSERT ON ballots
WHEN json_type(NEW.choices)<>'array' OR json_array_length(NEW.choices)<>3
BEGIN SELECT RAISE(ABORT,'Choose up to three favorites.'); END;
--> statement-breakpoint
CREATE TRIGGER ballot_positive_update BEFORE UPDATE OF choices ON ballots
WHEN json_type(NEW.choices)<>'array' OR json_array_length(NEW.choices)<>3
BEGIN SELECT RAISE(ABORT,'Choose up to three favorites.'); END;
