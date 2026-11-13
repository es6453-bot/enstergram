# Estergram — Vercel edition

A daily anonymous writing game with a Likes shop, consumable power-ups, follower tiers, cosmetic profiles, forgiving streaks and an owner dashboard.

This edition uses **Next.js 16, React 19, Auth.js and hosted libSQL**. Google, passwordless email and GitHub share the existing player database. Public guest browsing and practice require no account. See **[AUTH-SETUP.md](AUTH-SETUP.md)** to enable Google/email; their controls remain unavailable until configured. It runs on Vercel's Node.js runtime. It does not depend on Vinext, Cloudflare Worker bindings, Sites identity headers or `.openai/hosting.json`.

See [ADMIN-ACCESS.md](ADMIN-ACCESS.md) for Owner/Admin roles, verified account IDs, administrator management and server-side access controls.

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

The suite contains 68 tests covering game rules, anonymous voting privacy, tiers, profiles, streaks, DST, currency conservation, concurrent purchases, transactional libSQL batches, migration rollback, explicit owner access and data restore integrity. Identity linking, concurrent usernames, one-use email tokens and guest privacy are covered too, including a real Auth.js magic-link flow with simulated delivery. Real OAuth and production email delivery require configured services and deployment checks.

## Player and owner pages

| Page | Purpose |
| --- | --- |
| `/signin` | Google, passwordless email and existing GitHub sign-in |
| `/guest` | Public prompt/results preview and browser-local practice |
| `/onboarding` | Username choice for new players |
| `/account` | Link sign-in methods and change username |
| `/submit` | Today's response |
| `/vote` | Anonymous voting on yesterday's responses |
| `/results` | Final scores, raw/bonus breakdowns and revealed profiles |
| `/shop` | The Algorithm™ power-up catalog |
| `/inventory` | Owned consumables and activation confirmation |
| `/profile` and `/profile/edit` | Tiers, streaks, cosmetic collection and customization |
| `/admin` | Owner content, economy, inventory and profile-system editors |
| `/api/health` | Deployment readiness status, with no secret values |

Names, prompts, prices, effect parameters, tier thresholds, cosmetics and balance values are editable placeholders stored in the database. Owner access comes from `OWNER_GITHUB_ID`, never from being the first visitor. Blank `ALLOWED_GITHUB_IDS` restricts GitHub to the owner. Configured Google/email enable verified-player registration. Existing players should link new methods in Account settings first.

## Game guarantees

- The official clock is America/New_York, including daylight saving changes. Daily submissions run 00:00 through 23:59; voting is the next day alongside a new prompt. Voting is not a prerequisite to submitting that day's response.
- Likes are fictional, non-transferable currency, separate from voting points and Followers. A unique starting grant defaults to 100. No payment integration exists.
- Eligible submissions and valid ballots earn unique participation receipts. Rewards settle once at finalization. Edits and retries cannot duplicate awards.
- Purchases, inventory consumption, effects, participation and finalization retain their transactional database boundaries. Immutable ledger/results and no-overdraft protections remain enforced by SQLite/libSQL triggers and constraints.
- Each whitespace-separated token in a new or edited text response can have up to 20 characters, including dashes and underscores. Word Expansion increases the word count only.
- Supported power-up effects include word limit, positive-point multiplier, round-Likes multiplier and image responses. Each player has one activation slot per round.
- Ballots offer three ranked favorites. The downvote and PR Team power-up are retired. Rounds that finished before the change keep their original scoring.
- Signed-in players can post anonymous comments on response cards during voting and after finalization. Threads support any number of comments and load 20 at a time. Players can delete their own comments and staff can remove any comment.
- GIF Response lets a player upload a GIF, PNG, JPEG or WebP up to 2 MB as their entry. The first successful upload consumes one item. Replacements are free until submissions close. The server re-encodes images without metadata and serves them on the same origin, first to the author, then to eligible signed-in viewers during voting, and publicly once results are finalized.
- Round rules and activated effects are immutable snapshots. New balance edits do not rewrite finalized scores or completed transactions.
- Active voting exposes only opaque response IDs, content and applicable competitive effects. Decorated profiles appear only on one's own profile and finalized results.
- Daily activity counts once per Eastern date for a valid submission or ballot. Freezes preserve the streak without adding activity days or rewards. Missing a day never deducts Likes, Followers or earned cosmetics.
- Frozen and missed-day decisions use the versioned settings effective on each day. The default weekly refill is one freeze each Monday, capped at one banked freeze.

Finalization and missed-day reconciliation run on the next authenticated request after their deadlines. Staff can publish a prompt immediately for the current Eastern date or schedule one for a future midnight. Today's submissions close at the end of the Eastern day, and voting runs the next day.

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
