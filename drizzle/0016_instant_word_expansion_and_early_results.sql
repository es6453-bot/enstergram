CREATE TABLE `powerup_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`round_id` text NOT NULL,
	`item_id` text NOT NULL,
	`catalog_revision` integer NOT NULL,
	`name` text NOT NULL,
	`parameter` integer NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `catalog`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_powerup_reservation` ON `powerup_reservations` (`user_id`,`round_id`);--> statement-breakpoint
CREATE TABLE `round_closures` (
	`round_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`original_ends` integer NOT NULL,
	`closed` integer NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TRIGGER powerup_reservation_validate BEFORE INSERT ON powerup_reservations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM catalog WHERE id=NEW.item_id AND revision=NEW.catalog_revision)
 THEN RAISE(ABORT,'This item changed. Refresh your inventory and confirm again.') END;
 SELECT CASE WHEN NOT EXISTS(
   SELECT 1 FROM catalog c JOIN inventory i ON i.item_id=c.id AND i.user_id=NEW.user_id
   JOIN rounds r ON r.id=NEW.round_id
   WHERE c.id=NEW.item_id AND c.effect='word_limit' AND c.revision=NEW.catalog_revision
   AND c.name=NEW.name AND c.parameter=NEW.parameter AND c.enabled=1 AND i.quantity>0
   AND r.cancelled=0 AND r.finalized IS NULL
   AND r.opens<=unixepoch('subsec')*1000 AND r.closes>unixepoch('subsec')*1000
   AND (c.available_from IS NULL OR c.available_from<=unixepoch('subsec')*1000)
   AND (c.available_until IS NULL OR c.available_until>unixepoch('subsec')*1000)
   AND NOT EXISTS(SELECT 1 FROM activations WHERE user_id=NEW.user_id AND round_id=NEW.round_id)
 ) THEN RAISE(ABORT,'Activation is unavailable, expired, or unauthorized') END;
END;
--> statement-breakpoint
CREATE TRIGGER powerup_reservation_apply AFTER INSERT ON powerup_reservations BEGIN
 UPDATE inventory SET quantity=quantity-1 WHERE user_id=NEW.user_id AND item_id=NEW.item_id;
 INSERT INTO activations(id,user_id,round_id,submission_id,item_id,created,catalog_revision)
 SELECT NEW.id,NEW.user_id,NEW.round_id,s.id,NEW.item_id,NEW.created,NEW.catalog_revision
 FROM submissions s WHERE s.user_id=NEW.user_id AND s.round_id=NEW.round_id;
END;
--> statement-breakpoint
CREATE TRIGGER submission_bind_reserved_powerup AFTER INSERT ON submissions BEGIN
 INSERT INTO activations(id,user_id,round_id,submission_id,item_id,created,catalog_revision)
 SELECT p.id,p.user_id,p.round_id,NEW.id,p.item_id,p.created,p.catalog_revision
 FROM powerup_reservations p WHERE p.user_id=NEW.user_id AND p.round_id=NEW.round_id;
END;
--> statement-breakpoint
CREATE TRIGGER powerup_reservation_no_update BEFORE UPDATE ON powerup_reservations BEGIN
 SELECT RAISE(ABORT,'Activation is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER powerup_reservation_no_delete BEFORE DELETE ON powerup_reservations BEGIN
 SELECT RAISE(ABORT,'Activation is immutable');
END;
--> statement-breakpoint
DROP TRIGGER activation_validate;
--> statement-breakpoint
CREATE TRIGGER activation_validate BEFORE INSERT ON activations BEGIN
 SELECT CASE WHEN NOT EXISTS(
   SELECT 1 FROM rounds r JOIN submissions s ON s.round_id=r.id AND s.id=NEW.submission_id
   WHERE r.id=NEW.round_id AND s.user_id=NEW.user_id AND r.cancelled=0 AND r.finalized IS NULL
   AND r.opens<=unixepoch('subsec')*1000 AND r.closes>unixepoch('subsec')*1000
   AND (
     EXISTS(SELECT 1 FROM powerup_reservations p WHERE p.id=NEW.id AND p.user_id=NEW.user_id
       AND p.round_id=NEW.round_id AND p.item_id=NEW.item_id AND p.catalog_revision=NEW.catalog_revision)
     OR (
       NOT EXISTS(SELECT 1 FROM powerup_reservations WHERE user_id=NEW.user_id AND round_id=NEW.round_id)
       AND NOT EXISTS(SELECT 1 FROM powerup_reservations WHERE id=NEW.id)
       AND EXISTS(SELECT 1 FROM inventory i JOIN catalog c ON c.id=i.item_id
         WHERE i.user_id=NEW.user_id AND i.item_id=NEW.item_id AND i.quantity>0 AND c.enabled=1
         AND (c.available_from IS NULL OR c.available_from<=unixepoch('subsec')*1000)
         AND (c.available_until IS NULL OR c.available_until>unixepoch('subsec')*1000))
     )
   )
 ) THEN RAISE(ABORT,'Activation is unavailable, expired, or unauthorized') END;
END;
--> statement-breakpoint
DROP TRIGGER activation_revision;
--> statement-breakpoint
CREATE TRIGGER activation_revision BEFORE INSERT ON activations
WHEN NOT EXISTS(SELECT 1 FROM powerup_reservations WHERE id=NEW.id AND catalog_revision=NEW.catalog_revision)
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM catalog WHERE id=NEW.item_id AND revision=NEW.catalog_revision)
 THEN RAISE(ABORT,'This item changed. Refresh your inventory and confirm again.') END;
END;
--> statement-breakpoint
DROP TRIGGER activation_apply;
--> statement-breakpoint
CREATE TRIGGER activation_apply AFTER INSERT ON activations BEGIN
 UPDATE inventory SET quantity=quantity-1 WHERE user_id=NEW.user_id AND item_id=NEW.item_id
   AND NOT EXISTS(SELECT 1 FROM powerup_reservations WHERE id=NEW.id);
 INSERT INTO effects(activation_id,round_id,submission_id,name,type,parameter)
 SELECT NEW.id,NEW.round_id,NEW.submission_id,name,'word_limit',parameter
 FROM powerup_reservations WHERE id=NEW.id
 UNION ALL
 SELECT NEW.id,NEW.round_id,NEW.submission_id,name,effect,parameter FROM catalog
 WHERE id=NEW.item_id AND NOT EXISTS(SELECT 1 FROM powerup_reservations WHERE id=NEW.id);
END;
--> statement-breakpoint
DROP TRIGGER media_activation_requires_upload;
--> statement-breakpoint
CREATE TRIGGER media_activation_requires_upload BEFORE INSERT ON activations
WHEN NOT EXISTS(SELECT 1 FROM powerup_reservations WHERE id=NEW.id)
AND EXISTS(SELECT 1 FROM catalog WHERE id=NEW.item_id AND effect='media_response')
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM submissions WHERE id=NEW.submission_id AND content='')
 THEN RAISE(ABORT,'Choose a GIF or image on the submission page to activate this power-up.') END;
END;
--> statement-breakpoint
CREATE TRIGGER round_closure_validate BEFORE INSERT ON round_closures BEGIN
 SELECT CASE WHEN NOT EXISTS(
   SELECT 1 FROM rounds r JOIN staff_roles s ON s.user_id=NEW.owner_id AND s.role='owner'
   WHERE r.id=NEW.round_id AND r.cancelled=0 AND r.finalized IS NULL AND r.ends=NEW.original_ends
   AND r.closes<=NEW.closed AND NEW.closed<r.ends
   AND NEW.closed<=unixepoch('subsec')*1000
   AND NEW.closed>=unixepoch('subsec')*1000-1000
 ) THEN RAISE(ABORT,'Only the Owner can close an active vote.') END;
END;
--> statement-breakpoint
DROP TRIGGER round_snapshot;
--> statement-breakpoint
CREATE TRIGGER round_snapshot BEFORE UPDATE OF config,prompt,opens,closes,ends ON rounds
WHEN NEW.config<>OLD.config OR NEW.prompt<>OLD.prompt OR NEW.opens<>OLD.opens
  OR NEW.closes<>OLD.closes OR NOT EXISTS(
    SELECT 1 FROM round_closures WHERE round_id=OLD.id AND original_ends=OLD.ends AND closed=NEW.ends
  )
BEGIN SELECT RAISE(ABORT,'Published round configuration is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER round_closure_apply AFTER INSERT ON round_closures BEGIN
 UPDATE rounds SET ends=NEW.closed WHERE id=NEW.round_id;
 INSERT INTO audit(id,actor,action,payload,created)
 VALUES('early-close:'||NEW.round_id,NEW.owner_id,'owner_close_voting',
   json_object('roundId',NEW.round_id,'originalEnds',NEW.original_ends,'closed',NEW.closed),NEW.closed);
END;
--> statement-breakpoint
CREATE TRIGGER round_closure_no_update BEFORE UPDATE ON round_closures BEGIN
 SELECT RAISE(ABORT,'Voting closure is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER round_closure_no_delete BEFORE DELETE ON round_closures BEGIN
 SELECT RAISE(ABORT,'Voting closure is immutable');
END;
