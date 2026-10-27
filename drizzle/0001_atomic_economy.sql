CREATE INDEX ledger_user ON ledger(user_id,created);
--> statement-breakpoint
CREATE INDEX entries_round ON submissions(round_id);
--> statement-breakpoint
CREATE INDEX ballots_round ON ballots(round_id);
--> statement-breakpoint
CREATE UNIQUE INDEX unique_round_reward ON ledger(user_id,round_id,kind) WHERE round_id IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER ledger_apply AFTER INSERT ON ledger BEGIN
  UPDATE wallets SET balance=balance+NEW.amount WHERE user_id=NEW.user_id;
  SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'Wallet not found') END;
END;
--> statement-breakpoint
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT,'Ledger entries are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT,'Ledger entries are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER purchase_validate BEFORE INSERT ON purchases BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM catalog c JOIN wallets w ON w.user_id=NEW.user_id WHERE c.id=NEW.item_id AND c.enabled=1 AND w.balance>=c.cost AND (c.available_from IS NULL OR c.available_from<=unixepoch('subsec')*1000) AND (c.available_until IS NULL OR c.available_until>unixepoch('subsec')*1000)) THEN RAISE(ABORT,'Item unavailable or insufficient Clout') END;
END;
--> statement-breakpoint
CREATE TRIGGER purchase_apply AFTER INSERT ON purchases BEGIN
 INSERT INTO ledger(id,user_id,kind,amount,note,created) SELECT NEW.id,NEW.user_id,'purchase',-cost,'Purchased '||name,NEW.created FROM catalog WHERE id=NEW.item_id;
 INSERT INTO inventory(id,user_id,item_id,quantity) VALUES(NEW.user_id||':'||NEW.item_id,NEW.user_id,NEW.item_id,1) ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=quantity+1;
END;
--> statement-breakpoint
CREATE TRIGGER activation_validate BEFORE INSERT ON activations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rounds r JOIN submissions s ON s.round_id=r.id AND s.id=NEW.submission_id JOIN inventory i ON i.item_id=NEW.item_id AND i.user_id=NEW.user_id JOIN catalog c ON c.id=i.item_id WHERE r.id=NEW.round_id AND s.user_id=NEW.user_id AND i.quantity>0 AND c.enabled=1 AND r.cancelled=0 AND r.finalized IS NULL AND r.opens<=unixepoch('subsec')*1000 AND r.closes>unixepoch('subsec')*1000 AND (c.available_from IS NULL OR c.available_from<=unixepoch('subsec')*1000) AND (c.available_until IS NULL OR c.available_until>unixepoch('subsec')*1000)) THEN RAISE(ABORT,'Activation is unavailable, expired, or unauthorized') END;
END;
--> statement-breakpoint
CREATE TRIGGER activation_apply AFTER INSERT ON activations BEGIN
 UPDATE inventory SET quantity=quantity-1 WHERE user_id=NEW.user_id AND item_id=NEW.item_id;
 INSERT INTO effects SELECT NEW.id,NEW.round_id,NEW.submission_id,name,effect,parameter FROM catalog WHERE id=NEW.item_id;
END;
--> statement-breakpoint
CREATE TRIGGER activation_no_update BEFORE UPDATE ON activations BEGIN SELECT RAISE(ABORT,'Activation is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER activation_no_delete BEFORE DELETE ON activations BEGIN SELECT RAISE(ABORT,'Activation is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER effect_no_update BEFORE UPDATE ON effects BEGIN SELECT RAISE(ABORT,'Effect snapshot is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER effect_no_delete BEFORE DELETE ON effects BEGIN SELECT RAISE(ABORT,'Effect snapshot is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER submission_insert_window BEFORE INSERT ON submissions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rounds WHERE id=NEW.round_id AND cancelled=0 AND finalized IS NULL AND opens<=unixepoch('subsec')*1000 AND closes>unixepoch('subsec')*1000) THEN RAISE(ABORT,'Submission window closed') END;
END;
--> statement-breakpoint
CREATE TRIGGER submission_update_window BEFORE UPDATE ON submissions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rounds WHERE id=OLD.round_id AND cancelled=0 AND finalized IS NULL AND opens<=unixepoch('subsec')*1000 AND closes>unixepoch('subsec')*1000) THEN RAISE(ABORT,'Submission window closed') END;
 SELECT CASE WHEN NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id OR NEW.round_id<>OLD.round_id THEN RAISE(ABORT,'Submission identity is immutable') END;
END;
--> statement-breakpoint
CREATE TRIGGER ballot_insert_window BEFORE INSERT ON ballots BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rounds WHERE id=NEW.round_id AND cancelled=0 AND finalized IS NULL AND closes<=unixepoch('subsec')*1000 AND ends>unixepoch('subsec')*1000) THEN RAISE(ABORT,'Voting window closed') END;
END;
--> statement-breakpoint
CREATE TRIGGER ballot_update_window BEFORE UPDATE ON ballots BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rounds WHERE id=OLD.round_id AND cancelled=0 AND finalized IS NULL AND closes<=unixepoch('subsec')*1000 AND ends>unixepoch('subsec')*1000) THEN RAISE(ABORT,'Voting window closed') END;
 SELECT CASE WHEN NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id OR NEW.round_id<>OLD.round_id THEN RAISE(ABORT,'Ballot identity is immutable') END;
END;
--> statement-breakpoint
CREATE TRIGGER results_validate BEFORE INSERT ON results BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rounds WHERE id=NEW.round_id AND cancelled=0 AND ends<=unixepoch('subsec')*1000) THEN RAISE(ABORT,'Round cannot finalize') END;
END;
--> statement-breakpoint
CREATE TRIGGER results_no_update BEFORE UPDATE ON results BEGIN SELECT RAISE(ABORT,'Final results are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER results_no_delete BEFORE DELETE ON results BEGIN SELECT RAISE(ABORT,'Final results are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER followers_apply AFTER INSERT ON follower_awards BEGIN UPDATE profiles SET followers=followers+NEW.amount WHERE id=NEW.user_id; END;
--> statement-breakpoint
CREATE TRIGGER followers_no_update BEFORE UPDATE ON follower_awards BEGIN SELECT RAISE(ABORT,'Follower awards are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER followers_no_delete BEFORE DELETE ON follower_awards BEGIN SELECT RAISE(ABORT,'Follower awards are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER round_snapshot BEFORE UPDATE OF config,prompt,opens,closes,ends ON rounds BEGIN SELECT RAISE(ABORT,'Published round configuration is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER receipts_no_update BEFORE UPDATE ON receipts BEGIN SELECT RAISE(ABORT,'Participation receipts are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER receipts_no_delete BEFORE DELETE ON receipts BEGIN SELECT RAISE(ABORT,'Participation receipts are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'Audit log is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'Audit log is immutable'); END;
