DROP TRIGGER round_snapshot;
--> statement-breakpoint
-- Legacy daily rounds ended at the following midnight. 22:00 and that
-- midnight always share an Eastern UTC offset, including DST weekends.
UPDATE rounds SET ends=ends-7200000
WHERE daily_date IS NOT NULL AND cancelled=0 AND finalized IS NULL
  AND ends>unixepoch('subsec')*1000 AND ends-7200000>closes
  AND json_type(config,'$.schedule') IS NULL;
--> statement-breakpoint
CREATE TRIGGER round_snapshot BEFORE UPDATE OF config,prompt,opens,closes,ends ON rounds BEGIN SELECT RAISE(ABORT,'Published round configuration is immutable'); END;
--> statement-breakpoint
CREATE INDEX due_rounds ON rounds(ends) WHERE finalized IS NULL AND cancelled=0;
