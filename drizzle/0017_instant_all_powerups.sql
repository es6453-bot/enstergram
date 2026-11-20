ALTER TABLE `powerup_reservations` ADD `type` text DEFAULT 'word_limit' NOT NULL;
--> statement-breakpoint
DROP TRIGGER powerup_reservation_validate;
--> statement-breakpoint
CREATE TRIGGER powerup_reservation_validate BEFORE INSERT ON powerup_reservations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM catalog WHERE id=NEW.item_id AND revision=NEW.catalog_revision)
 THEN RAISE(ABORT,'This item changed. Refresh your inventory and confirm again.') END;
 SELECT CASE WHEN NOT EXISTS(
   SELECT 1 FROM catalog c JOIN inventory i ON i.item_id=c.id AND i.user_id=NEW.user_id
   JOIN rounds r ON r.id=NEW.round_id
   WHERE c.id=NEW.item_id AND c.effect=NEW.type
   AND NEW.type IN ('word_limit','positive_multiplier','clout_multiplier','media_response')
   AND c.revision=NEW.catalog_revision AND c.name=NEW.name AND c.parameter=NEW.parameter
   AND c.enabled=1 AND i.quantity>0 AND r.cancelled=0 AND r.finalized IS NULL
   AND r.opens<=unixepoch('subsec')*1000 AND r.closes>unixepoch('subsec')*1000
   AND (c.available_from IS NULL OR c.available_from<=unixepoch('subsec')*1000)
   AND (c.available_until IS NULL OR c.available_until>unixepoch('subsec')*1000)
   AND NOT EXISTS(SELECT 1 FROM activations WHERE user_id=NEW.user_id AND round_id=NEW.round_id)
 ) THEN RAISE(ABORT,'Activation is unavailable, expired, or unauthorized') END;
END;
--> statement-breakpoint
DROP TRIGGER activation_apply;
--> statement-breakpoint
CREATE TRIGGER activation_apply AFTER INSERT ON activations BEGIN
 UPDATE inventory SET quantity=quantity-1 WHERE user_id=NEW.user_id AND item_id=NEW.item_id
   AND NOT EXISTS(SELECT 1 FROM powerup_reservations WHERE id=NEW.id);
 INSERT INTO effects(activation_id,round_id,submission_id,name,type,parameter)
 SELECT NEW.id,NEW.round_id,NEW.submission_id,name,type,parameter
 FROM powerup_reservations WHERE id=NEW.id
 UNION ALL
 SELECT NEW.id,NEW.round_id,NEW.submission_id,name,effect,parameter FROM catalog
 WHERE id=NEW.item_id AND NOT EXISTS(SELECT 1 FROM powerup_reservations WHERE id=NEW.id);
END;
