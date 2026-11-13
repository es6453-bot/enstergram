CREATE TABLE `submission_media` (
	`submission_id` text PRIMARY KEY NOT NULL,
	`mime` text NOT NULL,
	`image` blob NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "submission_media_mime" CHECK("submission_media"."mime" IN ('image/gif','image/webp')),
	CONSTRAINT "submission_media_size" CHECK(length("submission_media"."image") BETWEEN 1 AND 2097152)
);
--> statement-breakpoint
CREATE TRIGGER media_activation_requires_upload BEFORE INSERT ON activations
WHEN EXISTS(SELECT 1 FROM catalog WHERE id=NEW.item_id AND effect='media_response')
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM submissions WHERE id=NEW.submission_id AND content='')
 THEN RAISE(ABORT,'Choose a GIF or image on the submission page to activate this power-up.') END;
END;
--> statement-breakpoint
CREATE TRIGGER media_insert_guard BEFORE INSERT ON submission_media BEGIN
 SELECT CASE WHEN NOT EXISTS(
   SELECT 1 FROM submissions s JOIN rounds r ON r.id=s.round_id
   JOIN effects e ON e.submission_id=s.id AND e.round_id=r.id
   WHERE s.id=NEW.submission_id AND s.content='' AND e.type='media_response'
   AND r.cancelled=0 AND r.finalized IS NULL
   AND r.opens<=unixepoch('subsec')*1000 AND r.closes>unixepoch('subsec')*1000
 ) THEN RAISE(ABORT,'Image submission is unavailable, expired, or unauthorized.') END;
END;
--> statement-breakpoint
CREATE TRIGGER media_update_guard BEFORE UPDATE ON submission_media BEGIN
 SELECT CASE WHEN NEW.submission_id<>OLD.submission_id OR NOT EXISTS(
   SELECT 1 FROM submissions s JOIN rounds r ON r.id=s.round_id
   WHERE s.id=OLD.submission_id AND r.cancelled=0 AND r.finalized IS NULL
   AND r.opens<=unixepoch('subsec')*1000 AND r.closes>unixepoch('subsec')*1000
 ) THEN RAISE(ABORT,'Image submission is unavailable, expired, or unauthorized.') END;
END;
--> statement-breakpoint
CREATE TRIGGER media_response_no_text BEFORE UPDATE OF content ON submissions
WHEN NEW.content<>'' AND EXISTS(SELECT 1 FROM submission_media WHERE submission_id=OLD.id)
BEGIN
 SELECT RAISE(ABORT,'Replace this response with another GIF or image.');
END;
--> statement-breakpoint
INSERT OR IGNORE INTO catalog(id,name,description,icon,cost,effect,parameter,placeholder)
SELECT 'gif-response','GIF Response','Play a GIF or image in place of a text response.','Image',50,'media_response',1,0
WHERE EXISTS(SELECT 1 FROM settings WHERE id=1);
