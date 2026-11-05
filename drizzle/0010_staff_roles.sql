CREATE TABLE `admin_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_by` text NOT NULL,
	`created` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`accepted_user` text,
	`accepted_subject` text,
	`resolved` integer,
	FOREIGN KEY (`created_by`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accepted_user`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invitation_status" CHECK("admin_invitations"."status" IN ('pending','accepted','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_pending_admin_invitation` ON `admin_invitations` (lower("email")) WHERE "admin_invitations"."status"='pending';--> statement-breakpoint
CREATE TABLE `google_accounts` (
	`subject` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`verified_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_google_account_per_player` ON `google_accounts` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `google_verified_email` ON `google_accounts` (lower("email"));--> statement-breakpoint
CREATE TABLE `player_suspensions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `staff_roles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`google_subject` text NOT NULL,
	`granted_by` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`google_subject`) REFERENCES `google_accounts`(`subject`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`granted_by`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "staff_role_type" CHECK("staff_roles"."role" IN ('owner','admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_role_per_google_account` ON `staff_roles` (`google_subject`);
--> statement-breakpoint
INSERT INTO google_accounts(subject,user_id,email,verified_at)
 SELECT i.subject,i.user_id,lower(a.email),a.email_verified FROM auth_identities i JOIN auth_users a ON a.id=i.user_id
 WHERE i.provider='google' AND a.email IS NOT NULL AND a.email_verified IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM auth_identities e WHERE e.user_id=i.user_id AND e.provider='email');
--> statement-breakpoint
CREATE TRIGGER staff_insert_identity BEFORE INSERT ON staff_roles BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM google_accounts g JOIN auth_identities i ON i.provider='google' AND i.subject=g.subject AND i.user_id=g.user_id WHERE g.subject=NEW.google_subject AND g.user_id=NEW.user_id) THEN RAISE(ABORT,'staff_requires_authenticated_google') END;
 SELECT CASE WHEN NEW.role='admin' AND NOT EXISTS(SELECT 1 FROM staff_roles WHERE user_id=NEW.granted_by AND role='owner') THEN RAISE(ABORT,'staff_grant_requires_owner') END;
 SELECT CASE WHEN NEW.role='owner' AND EXISTS(SELECT 1 FROM staff_roles WHERE role='owner') THEN RAISE(ABORT,'owner_assignment_locked') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM player_suspensions WHERE user_id=NEW.user_id) THEN RAISE(ABORT,'suspended_player_cannot_be_staff') END;
END;
--> statement-breakpoint
CREATE TRIGGER staff_identity_immutable BEFORE UPDATE ON staff_roles WHEN NEW.user_id<>OLD.user_id OR NEW.google_subject<>OLD.google_subject BEGIN SELECT RAISE(ABORT,'staff_identity_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER staff_no_owner_promotion BEFORE UPDATE ON staff_roles WHEN OLD.role<>'owner' AND NEW.role='owner' BEGIN SELECT RAISE(ABORT,'owner_promotion_forbidden'); END;
--> statement-breakpoint
CREATE TRIGGER staff_keep_last_owner_update BEFORE UPDATE ON staff_roles WHEN OLD.role='owner' AND NEW.role<>'owner' AND (SELECT COUNT(*) FROM staff_roles WHERE role='owner')<=1 BEGIN SELECT RAISE(ABORT,'last_owner_protected'); END;
--> statement-breakpoint
CREATE TRIGGER staff_keep_last_owner_delete BEFORE DELETE ON staff_roles WHEN OLD.role='owner' AND (SELECT COUNT(*) FROM staff_roles WHERE role='owner')<=1 BEGIN SELECT RAISE(ABORT,'last_owner_protected'); END;
--> statement-breakpoint
CREATE TRIGGER google_identity_immutable BEFORE UPDATE ON google_accounts WHEN NEW.subject<>OLD.subject OR NEW.user_id<>OLD.user_id BEGIN SELECT RAISE(ABORT,'google_identity_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER staff_google_identity_delete BEFORE DELETE ON auth_identities WHEN OLD.provider='google' AND EXISTS(SELECT 1 FROM staff_roles WHERE google_subject=OLD.subject) BEGIN SELECT RAISE(ABORT,'staff_google_identity_protected'); END;
--> statement-breakpoint
CREATE TRIGGER staff_google_identity_update BEFORE UPDATE ON auth_identities WHEN OLD.provider='google' AND (NEW.provider<>OLD.provider OR NEW.subject<>OLD.subject OR NEW.user_id<>OLD.user_id) AND EXISTS(SELECT 1 FROM staff_roles WHERE google_subject=OLD.subject) BEGIN SELECT RAISE(ABORT,'staff_google_identity_protected'); END;
--> statement-breakpoint
CREATE TRIGGER suspension_protect_staff_insert BEFORE INSERT ON player_suspensions WHEN EXISTS(SELECT 1 FROM staff_roles WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'staff_accounts_protected'); END;
--> statement-breakpoint
CREATE TRIGGER suspension_protect_staff_update BEFORE UPDATE ON player_suspensions WHEN EXISTS(SELECT 1 FROM staff_roles WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'staff_accounts_protected'); END;
--> statement-breakpoint
CREATE TRIGGER admin_invite_owner_only BEFORE INSERT ON admin_invitations WHEN NOT EXISTS(SELECT 1 FROM staff_roles WHERE user_id=NEW.created_by AND role='owner') BEGIN SELECT RAISE(ABORT,'admin_invitation_requires_owner'); END;
