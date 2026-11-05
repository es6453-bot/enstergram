# Owner and Admin access

This Vercel edition uses **Auth.js Google OAuth and Turso/libSQL**, not Supabase. It retains that working authentication/database architecture. The authenticated Auth.js player ID is the equivalent canonical account identifier; staff membership additionally binds to the verified Google OAuth subject. No username, client-provided email, browser role flag or legacy `profiles.role` column authorizes an administrative action.

## Roles

| Capability | Owner | Admin | Player/Guest |
| --- | --- | --- | --- |
| Manage prompts, schedules, rounds and shop | Yes | Yes | No |
| Existing economy, inventory, tiers and cosmetic tools | Yes | Yes | No |
| Suspend/reinstate ordinary players with an audit reason | Yes | Yes | No |
| Grant/revoke Admin and cancel pending authorizations | Yes | No | No |
| View staff Google identities and access audit history | Yes | No | No |
| Assign Owner or remove the final Owner through the app | No | No | No |

Owners and Admins keep their normal gameplay accounts. Moderation suspends official participation without deleting responses, ballots, scores, currency, followers or inventory. Staff cannot be suspended. To suspend an Admin, the Owner must first revoke that Admin role.

## Owner management interface

Open **Creator studio → Manage administrators**, or `/admin/access`. Only the Owner can open this page or its `/api/admin/access` endpoint.

- Choose an existing verified Google account by its canonical player ID, or enter its Google email address to resolve an existing verified identity.
- For a Google account that has not signed in, the Owner can save a pending authorization. It creates no fictional player/Google ID and sends no email. The intended person must visit the game and use Google sign-in themselves.
- On a verified Google OAuth callback, the server checks the actual Google subject, verified email and existing identity-to-player link before binding the pending authorization to that player ID. The original authorizing Owner must still have Owner status, and a cancelled authorization cannot activate.
- Revocation deletes the Admin membership; later sign-ins do not recreate it from an already accepted invitation. Roles are read from the database for subsequent requests, including requests made with a session created before revocation.
- Each role/invitation change is audited. Repeated grants and revocations do not duplicate role rows or successful-change audit entries.

## Server and database enforcement

All administrative game mutations, including the social/profile-system administration tools, call `requireStaff` against the database. Owner role-management operations call `requireOwner`. Normal game responses derive administrative visibility from that same database role; passing an `admin` query parameter or forging a role in JSON cannot expose administrative state.

The Owner API checks the signed-in server session, onboarding, current role, same-origin request and a persistent rate limit. It only grants `admin`, never accepts an Owner assignment, and rejects attempts to remove Owner access. Google-account metadata is written from the verified Auth.js OAuth callback, not submitted profile forms.

The database is server-only: Turso credentials are environment secrets, not browser keys. This architecture has no direct public database client/RPC or Supabase RLS layer. Secure backend authorization is the enforcement boundary. SQLite constraints/triggers add protection for role types, unique identities, role-to-Google identity matching, Owner-only Admin insertion, staff suspension prevention, immutable role identities and retaining the last Owner. Owner promotion is blocked. The last Owner's linked Google identity cannot be removed or reassigned through an identity update.

## Migration and initial provisioning

`0010_staff_roles.sql` adds `google_accounts`, `staff_roles`, `admin_invitations` and `player_suspensions`, plus constraints and protection triggers. It preserves the existing gameplay tables and identities. Existing verified Google-email metadata is backfilled only where the stored verification originated from the Google flow rather than a separate email identity.

The normal deployment build calls `bootstrapOwner` once: it resolves the previously configured numeric `OWNER_GITHUB_ID` through the existing identity link to the original Google-linked player. This preserves the already verified game owner; it does not make the first visitor Owner. Once an Owner exists, changing that environment setting cannot replace or demote the Owner. A fresh install without a Google-linked owner completes bootstrap after the configured account links Google.

The game owner or operator with private database credentials may provision requested accounts using:

```sh
node scripts/provision-admins.mjs GOOGLE_EMAIL [GOOGLE_EMAIL ...]
```

The script requires that the configured bootstrap identity still resolves to the existing Owner, then uses the same Owner-only grant/invitation functions as the web interface. Emails are onboarding selectors; active membership is always stored against real authenticated player/Google IDs. Do not use the private database token in a browser or share it with game Admins.

The old `profiles.role` field is retained for historical source/backup compatibility and is not trusted by the new authorization layer. Game responses substitute the current `staff_roles` role. Do not edit previously applied migrations or restore the old source over this release.

## Verification

`pnpm test` covers direct Owner API attempts by anonymous users, ordinary players and Admins; forged roles/emails; social/game administrative actions; revocation with an existing session identity; identity mismatch; concurrent/repeated grants; pending/cancelled authorization; suspension; and direct database attempts to remove, demote or replace the last Owner. Existing game/economy/authentication regressions run alongside those checks.
