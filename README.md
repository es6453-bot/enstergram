# Estergram — Vercel edition

A daily anonymous writing game with a Likes shop, consumable power-ups, follower tiers, cosmetic profiles, forgiving streaks and an owner dashboard.

This edition uses **Next.js 16, React 19, Auth.js GitHub sign-in and hosted libSQL**. It runs on Vercel's Node.js runtime. It does not depend on Vinext, Cloudflare Worker bindings, Sites identity headers or `.openai/hosting.json`.

## Deploy

Follow **[VERCEL-SETUP.md](VERCEL-SETUP.md)**. The production deployment needs a remote libSQL database, GitHub OAuth credentials, a session secret and the owner's numeric GitHub ID. The build validates configuration and applies checksum-tracked migrations. Without those service credentials, this is a tested source release, not a working hosted game.

To preserve the old game, restore the separate private backup into an empty database **before the first new sign-in**. The backup is deliberately excluded from this repository and source archive. The restore preserves ledger balances, rewards, history and owner identity without repeating insert-side accounting.

## Develop

Requirements: Node.js 24.x and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
```

Copy `.env.example` to `.env.local`, configure your local GitHub OAuth application, and set a database URL. A local database can use `file:.data/estergram.sqlite` after creating `.data/`; Vercel must use a remote database.

```sh
pnpm db:migrate
pnpm dev
```

Use the URL printed by Next.js. Local development uses real GitHub sign-in; there is no mock account or trusted-header authentication bypass.

## Checks

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

The suite contains 44 tests covering game rules, anonymous voting privacy, tiers, profiles, streaks, DST, currency conservation, concurrent purchases, transactional libSQL batches, migration rollback, explicit owner access and data restore integrity. Real GitHub OAuth and hosted database connectivity require their configured services and a deployment check.

## Player and owner pages

| Page | Purpose |
| --- | --- |
| `/signin` | GitHub sign-in |
| `/submit` | Today's response |
| `/vote` | Anonymous voting on yesterday's responses |
| `/results` | Final scores, raw/bonus breakdowns and revealed profiles |
| `/shop` | The Algorithm™ power-up catalog |
| `/inventory` | Owned consumables and activation confirmation |
| `/profile` and `/profile/edit` | Tiers, streaks, cosmetic collection and customization |
| `/admin` | Owner content, economy, inventory and profile-system editors |
| `/api/health` | Deployment readiness status, with no secret values |

Names, prompts, prices, effect parameters, tier thresholds, cosmetics and balance values are editable placeholders stored in the database. Owner access comes from `OWNER_GITHUB_ID`, never from being the first visitor. Blank `ALLOWED_GITHUB_IDS` means owner-only; add verified numeric IDs to invite the group.

## Game guarantees

- The official clock is America/New_York, including daylight saving changes. Daily submissions run 00:00 through 23:59; voting is the next day alongside a new prompt. Voting is not a prerequisite to submitting that day's response.
- Likes are fictional, non-transferable currency, separate from voting points and Followers. A unique starting grant defaults to 100. No payment integration exists.
- Eligible submissions and valid ballots earn unique participation receipts. Rewards settle once at finalization. Edits and retries cannot duplicate awards.
- Purchases, inventory consumption, effects, participation and finalization retain their transactional database boundaries. Immutable ledger/results and no-overdraft protections remain enforced by SQLite/libSQL triggers and constraints.
- Four generic competitive effects are supported: word limit, downvote shield, positive-point multiplier and round-Likes multiplier. One activation slot applies per user per round; Brand Deal never doubles Followers.
- Round rules and activated effects are immutable snapshots. New balance edits do not rewrite finalized scores or completed transactions.
- Active voting exposes only opaque response IDs, content and applicable competitive effects. Decorated profiles appear only on one's own profile and finalized results.
- Daily activity counts once per Eastern date for a valid submission or ballot. Freezes preserve the streak without adding activity days or rewards. Missing a day never deducts Likes, Followers or earned cosmetics.
- Frozen and missed-day decisions use the versioned settings effective on each day. The default weekly refill is one freeze each Monday, capped at one banked freeze.

Finalization and missed-day reconciliation run on the next authenticated request after their deadlines. Owner-written daily prompts must be queued in advance; no new prompt is invented when the queue is empty.

## Source map

- `app/ui.tsx`, `app/social-ui.tsx`: responsive game, profile and admin interfaces.
- `app/api/game/route.ts`: authenticated same-origin operations and rate limits.
- `auth.ts`, `lib/current-user.ts`, `lib/identity-policy.ts`: verified OAuth sessions, allowlist and owner policy.
- `lib/database.ts`: hosted libSQL adapter with atomic write batches.
- `lib/server.ts`, `lib/rules.ts`: currency, competition and settlement.
- `lib/social.ts`, `lib/progression.ts`, `lib/time.ts`: cosmetics, tiers, streaks and named-zone date rules.
- `db/schema.ts`, `drizzle/`: normalized schema and nine immutable migrations.
- `scripts/`: environment checks, migration runner, safe restore and verified legacy-account linking.
- `tests/`: SQLite/libSQL, concurrency, privacy and rendering checks.

Use Git branches and reviewed pull requests for collaboration. Read [COLLABORATING.md](COLLABORATING.md). The original Sites deployment and its source are separate from this Vercel edition.
