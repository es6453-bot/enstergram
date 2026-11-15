CREATE TABLE `achievement_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_id` text NOT NULL,
	`label` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "achievement_notification_kind" CHECK("achievement_notifications"."kind" IN ('award','badge'))
);
--> statement-breakpoint
CREATE INDEX `achievement_notifications_by_player` ON `achievement_notifications` (`user_id`,`id`);
--> statement-breakpoint
CREATE TRIGGER notify_response_award AFTER INSERT ON response_awards
BEGIN
  INSERT INTO achievement_notifications(user_id,kind,source_id,label)
  SELECT user_id,'award',NEW.submission_id,NEW.award
  FROM submissions WHERE id=NEW.submission_id;
END;
--> statement-breakpoint
CREATE TRIGGER withdraw_response_award_notification AFTER DELETE ON response_awards
BEGIN
  DELETE FROM achievement_notifications
  WHERE user_id=(SELECT user_id FROM submissions WHERE id=OLD.submission_id)
    AND kind='award' AND source_id=OLD.submission_id AND label=OLD.award;
END;
--> statement-breakpoint
CREATE TRIGGER notify_cosmetic_badge AFTER INSERT ON cosmetic_ownership
BEGIN
  INSERT INTO achievement_notifications(user_id,kind,source_id,label)
  SELECT NEW.user_id,'badge',id,name
  FROM cosmetics WHERE id=NEW.item_id AND kind='badge';
END;
