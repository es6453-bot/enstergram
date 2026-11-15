CREATE TABLE `response_awards` (
	`submission_id` text NOT NULL,
	`award` text NOT NULL,
	`granted_by` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`granted_by`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "valid_response_award" CHECK("response_awards"."award" IN ('reddit_gold','top_tier','skull'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_response_award` ON `response_awards` (`submission_id`,`award`);--> statement-breakpoint
CREATE TABLE `response_reactions` (
	`submission_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reaction` text NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "valid_response_reaction" CHECK("response_reactions"."reaction" IN ('heart','thumbs_up','skull','crying','talking'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_response_reaction` ON `response_reactions` (`submission_id`,`user_id`,`reaction`);--> statement-breakpoint
CREATE TABLE `__new_response_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`submission_id` text NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`mime` text,
	`image` blob,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "response_comment_length" CHECK(length("__new_response_comments"."content") <= 1000 AND (length("__new_response_comments"."content") > 0 OR "__new_response_comments"."image" IS NOT NULL)),
	CONSTRAINT "response_comment_image" CHECK(("__new_response_comments"."mime" IS NULL AND "__new_response_comments"."image" IS NULL) OR ("__new_response_comments"."mime" IS NOT NULL AND "__new_response_comments"."mime" IN ('image/gif','image/webp') AND "__new_response_comments"."image" IS NOT NULL AND length("__new_response_comments"."image") BETWEEN 1 AND 2097152))
);
--> statement-breakpoint
INSERT INTO `__new_response_comments`(id,submission_id,user_id,content)
SELECT id,submission_id,user_id,content FROM response_comments;
--> statement-breakpoint
INSERT INTO sqlite_sequence(name,seq)
SELECT '__new_response_comments',seq FROM sqlite_sequence WHERE name='response_comments'
AND NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name='__new_response_comments');
--> statement-breakpoint
UPDATE sqlite_sequence SET seq=MAX(seq,COALESCE((SELECT seq FROM sqlite_sequence WHERE name='response_comments'),0))
WHERE name='__new_response_comments';
--> statement-breakpoint
DROP TABLE `response_comments`;--> statement-breakpoint
ALTER TABLE `__new_response_comments` RENAME TO `response_comments`;--> statement-breakpoint
CREATE INDEX `response_comment_page` ON `response_comments` (`submission_id`,`id`);
--> statement-breakpoint
INSERT OR IGNORE INTO cosmetics(id,name,description,kind,effect,params,icon,enabled,unlock_type,unlock_value,placeholder)
VALUES('top-response','Top Response','Finish first in a completed round with a positive score.','badge','emblem',
  '{"primary":"#312344","secondary":"#191726","accent":"#ffd36e","size":3,"speed":4,"opacity":20}',
  '🏆',1,'round_winner',0,0);
