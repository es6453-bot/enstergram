CREATE TRIGGER purchase_revision BEFORE INSERT ON purchases BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM catalog WHERE id=NEW.item_id AND revision=NEW.catalog_revision) THEN RAISE(ABORT,'This item changed. Refresh the shop and confirm again.') END;
END;
--> statement-breakpoint
CREATE TRIGGER activation_revision BEFORE INSERT ON activations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM catalog WHERE id=NEW.item_id AND revision=NEW.catalog_revision) THEN RAISE(ABORT,'This item changed. Refresh your inventory and confirm again.') END;
END;
--> statement-breakpoint
CREATE INDEX rate_limit_bucket ON rate_limits(bucket);
--> statement-breakpoint
CREATE TRIGGER ledger_round_eligibility BEFORE INSERT ON ledger WHEN NEW.round_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rounds WHERE id=NEW.round_id AND cancelled=0 AND ends<=unixepoch('subsec')*1000) THEN RAISE(ABORT,'Round rewards are not eligible') END;
END;
