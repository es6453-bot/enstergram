# Estergram — The Algorithm™

A working implementation of the **Skill Shop and Likes Economy Addendum**, influencer tiers, cosmetic profiles, and forgiving daily streaks, with a submission → anonymous voting → results loop and an owner-facing Creator studio.

## Stack and scope

TypeScript, React, Vinext App Router and Cloudflare D1, hosted privately on Sites. Sites supplies authenticated identity; the app uses a server-side role table. This deployment uses D1 and Sites authentication **instead of the reference PRD's proposed Supabase/PostgreSQL, Supabase email/password auth, and Vercel**. The economy uses database constraints, transactions, and trusted server endpoints rather than PostgreSQL RLS. The original PRD's leaderboard, moderation, and password-account features remain outside this implementation.

## First visit and ownership

Open the private Site while signed in. The first authenticated visitor receives the admin role; owner-private platform access makes that visitor the owner. Placeholder content is inserted once. **Keep the Site owner-private until this initial bootstrap has completed.** Subsequent visitors are players, and every privileged mutation checks the database role. User-supplied role fields are ignored. There is no public bootstrap or role-escalation endpoint.

The local preview's `local_seedy` account and test economy are separate from the hosted database. No local test grant or purchase is published as production data.

## Owner workflow — no source edits

Visit `/admin` (Creator studio):

- **Prompts:** create/edit a draft, select its planned date, then use **Schedule** to publish a round. Opening is New York midnight, submission closing is the next midnight, and voting ends the following midnight. Named-zone conversion handles 23/25-hour daylight saving days. A prompt can produce only one round. Deleting a prompt archives it; already published round copies survive.
- **Catalog:** create items using one of four supported effect types. Edit names, descriptions, icon or HTTPS image URL, price, enabled state, availability window, parameter, and placeholder flag. Existing owned stock is preserved when an item is disabled. Unavailable items cannot be purchased or activated. Time-window inputs use the browser's time zone and persist UTC epochs.
- **Economy:** edit submission/voting Likes, podium Likes, default word limits, voting weights, minimum ranked-round size, and the exclusive follower reward table. Saving applies to **future published rounds**.
- **Inventory:** inspect any player's stock; add/remove up to 100 units per adjustment. Negative stock is rejected. Audited Likes grants support explicit testing or support corrections and appear in the immutable transaction ledger. There is no player currency-claim or transfer endpoint.
- **Rounds:** inspect deadlines and settlement state, retry finalization, or cancel an unfinalized round. Cancellation prevents all settlement rewards. Activated items are consumed immediately and are not automatically refunded on cancellation.
- **Profiles:** edit and reorder follower tiers; create, enable or disable cosmetics, badges and theme presets; configure automatic unlock thresholds; assign permanent cosmetics with an audit reason; edit streak milestones and freeze settings. Event, achievement and future shop references support owner assignments for now.
- **Audit:** inspect immutable owner-change records.

All four sample shop items and both draft prompts are labeled placeholders. The first open sample round is a rolling test round, also labeled placeholder. Replace or disable them through the dashboard. Re-loading samples uses fixed IDs and never overwrites your existing edits.

## Player workflow

- `/shop`: searchable/filterable responsive catalog, current Likes, owned quantities, purchase confirmation, and transaction history.
- `/inventory`: choose a saved response in an open submission round, review its effect and consumption rules, then activate an owned item. One activation slot covers **all four effect types**, including Brand Deal. Purchases alone do not consume items.
- `/submit`: save/edit a response while the server deadline permits. For Word Expansion, save an initial response within the default limit, activate the item, then edit up to the expanded limit. No placeholder submissions are generated for players.
- `/vote`: save or edit a nonempty partial/full ranked ballot. No response can occupy multiple slots, and self-voting is rejected. Own responses are excluded from the anonymous feed. Per-voter ordering is stable and randomized by a SHA-256 hash. Anonymous cards expose the applicable effect, but never authors, vote totals, other ballots, or joinable author IDs.
- `/results`: reveal identities and deterministic rankings only after the voting deadline. See raw scores, positive/negative points, shield/boost adjustments, final scores, follower awards, and your round's Likes ledger.
- `/profile`: decorated profile card, follower tier progress, cosmetic collection, seven-day activity calendar, current/longest streak and available freezes.
- `/profile/edit`: live preview, display name/bio, HTTPS avatar/banner images, custom colors, owned cosmetic selectors, limited badge selection, save/reset controls and animation preferences.

Words are whitespace-delimited tokens containing a Unicode letter or number. Attached punctuation, contractions, and hyphenated compounds are part of a token. Standalone emoji are not words. Responses have a 2,000-character safeguard. Both browser and server use the same counting function.

## Currency and scoring guarantees

Likes are the fictional, non-monetary, non-transferable shop currency. Voting scores are labeled points and remain separate from wallet balances and Followers. No payment integration or paid packages exist. Everyone receives a one-time 100-Like starting grant, including existing accounts; existing balances are preserved and the grant is added through the immutable ledger. New-player starting Likes can be changed in Creator studio and apply only to future accounts.

Participation earns durable, unique receipts when the server accepts a valid response or ballot. Edits cannot create more receipts. **All Likes rewards settle at finalization**, including the submission and voting amounts. This keeps cancelled-round rewards at zero and lets Brand Deal cover the selected round consistently. Initial defaults are 10 submission Likes, 5 voting Likes, and an additional 30/20/10 for podium places. Fewer than five entries is unranked: participation Likes still settle; podium Likes and follower awards do not.

The default follower table remains exclusive: 100/60/40 for podium, 25 for top 10% outside podium, 15 for top 25%, 5 for other entries, 0 for last. Last-place priority and minimum round size are preserved. Brand Deal never doubles followers. The larger reference PRD's separate career Likes metric is not implemented; cosmetic tier progression uses existing follower totals.

Finalization counts raw votes first, then applies the activation snapshot:

1. **Word limit:** change the chosen response's allowed word count (sample 15).
2. **Downvote shield:** remove at most the configured number of downvotes from score (sample 1).
3. **Positive multiplier:** multiply positive voting points only (sample 2×); retain negative points unchanged.
4. **Likes multiplier:** add a separate ledger bonus for the configured multiple of eligible base round Likes (sample 2×).

All abilities share one activation slot, so score effects do not stack. Ties use final score, first votes, second votes, third votes, then a stable codepoint submission-ID order. Every round freezes its rules at publication; every effect freezes its type, name, and parameter at activation. Final results, award entries, follower entries, participation receipts, and audits cannot be updated or deleted through database operations. Corrections use new audited entries.

Wallets update from ledger insert triggers. A purchase validates current stock availability and balance, debits the wallet, writes a ledger record, and adds inventory **in the same SQLite transaction**. A negative balance aborts the transaction. User-scoped purchase keys deduplicate retries; round/user activation uniqueness prevents duplicate consumption. Catalog revisions reject stale confirmations if the owner changed an item after it was displayed. Activations validate ownership, saved submission, availability, inventory, timestamps, and one-per-round uniqueness inside database triggers. Ballot replacement and eligibility receipt recording share a D1 batch transaction. Database deadline triggers close check/write races.

Finalization is a single D1 transaction with unique results/rewards/follower keys. Retries with stale round data remain safe. Phases always derive from UTC timestamps. **Settlement runs on the next authenticated game-state or results request after the deadline**, or the owner's retry action; an unattended scheduled job is not provisioned in this version. This does not permit late submissions or votes, and does not change the recorded round outcome. A periodic authenticated request can be connected later if immediate midnight settlement is needed.

## Local setup

Requirements: Node 24+ (tests use `node:sqlite`), pnpm 11.25+, Git.

```sh
pnpm install --frozen-lockfile
pnpm build
```

The build generates `dist/server/wrangler.json`. Apply each SQL migration **once**, in filename order, to local D1 (initial setup only):

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_bored_namora.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_atomic_economy.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_catalog_revision.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_confirmation_guards.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0004_scheduled_prompt_identity.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0005_starting_likes.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0006_daily_eastern_schedule.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0007_social_profiles_streaks.sql
pnpm dev
```

Open the printed loopback URL and use **Sign in to play** for the development-only identity. Hosted sign-in remains platform-owned. To simulate a full cycle, schedule a test round in Creator studio (2-minute submissions + 2-minute voting), participate, and refresh after its voting deadline. Automated tests exercise five-player results without waiting.

## Checks

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Tests execute the actual server functions against SQLite with a D1-compatible adapter. The concurrency test uses two real worker threads/connections competing for a single balance. Coverage includes Unicode counting, Word Expansion, positive-only boosts, PR Team, Brand Deal, raw/bonus transforms, inventory consumption, purchase retries, conservation, deadlines, receipt uniqueness, partial ballots and edits, self-votes, duplicate ranks, anonymous-feed fields, deterministic small-round rewards, finalization retries, immutable historical data, DST boundaries, owner authorization, configuration snapshots, stale confirmations, and database-backed request limits (60 mutations/user/minute).

## Delivery status

The implementation passes 37 automated tests, TypeScript checking, linting, and a production build. All eight migrations were applied successfully to local D1. The original shop was reviewed in the browser during its initial implementation; browser review was not rerun for the new profile and streak pages because browser access was previously declined. React server-render checks cover the new profile, editor and owner workspace rendering and escaped content; responsive layouts still need a live visual review.

Private publication uses the existing Site ID in `.openai/hosting.json`. The hosting platform applies the production migrations to a separate database. Local test grants, submissions, and purchases are not uploaded. The chat records the verified deployment outcome and live URL.

## Hosting and configuration

`.openai/hosting.json` declares the Site ID and logical D1 binding `DB`. Sites provisions the hosted database and applies the ordered schema migrations. `.env.example` lists the integration contract; the app needs no manually supplied secrets. Never trust raw identity headers when serving this Worker directly outside Sites: replace identity verification before doing so. No database credentials or administrative keys are shipped to the browser.

Use the Sites source workflow to push and package the exact checked source before deploying. `dist/`, local `.wrangler/` data, `.sites-runtime/`, and development identity cookies are not source data and are not checked in. Local and hosted databases are independent.

## Source map

- `db/schema.ts`, `drizzle/`: normalized tables, constraints, migrations, and atomic economy triggers.
- `lib/server.ts`: authenticated data projection, trusted game operations, and settlement.
- `lib/rules.ts`: shared pure word counting, score transforms, validation, and follower rules.
- `lib/time.ts`: named-zone date boundaries.
- `lib/progression.ts`, `lib/social.ts`: pure tier/streak rules, optimistic transactional updates, cosmetic ownership, authorized profile edits and owner configuration.
- `lib/social-seed.ts`: one-time sample content outside schema migrations, guarded by a release marker. Repeated initialization never overwrites owner edits.
- `app/api/game/route.ts`: authenticated same-origin API and rate limits.
- `app/ui.tsx`, `app/globals.css`: responsive shop, inventory, game pages, and Creator studio.
- `app/social-ui.tsx`, `app/social.css`: profile cards/popouts, wardrobe, tiers, activity UI and owner editors.
- `tests/economy.test.mjs`: SQLite integration and concurrency tests.

The D1 finalization batch size bounds practical round size. Load testing and scaling the settlement architecture for very large public games remain future work; this private deployment has not undergone a public-service security or load audit.

The first authenticated request after the Likes release performs an atomic, idempotent welcome-grant backfill for every existing wallet and updates stored catalog currency copy. Subsequent account setup grants the configured starting amount once to each new wallet. A release marker and a unique starting-grant ledger index prevent duplicate grants. Starting grants have no round ID, so Brand Deal does not multiply them. Legacy `submissionClout`, `votingClout`, `podiumClout`, and `clout_multiplier` identifiers remain internal compatibility keys; historical results, effects, and ledger rows are preserved.

## Daily Eastern schedule

The game follows `America/New_York`: EST in winter and EDT in summer. Queue one owner-written prompt per future date in Creator studio. Scheduling publishes the round in advance and the server derives its actual UTC timestamps; browser-supplied timestamps cannot override daily deadlines. Active daily rounds have a unique Eastern calendar date. Cancellation frees the date for a replacement prompt.

- Day 1: respond from 00:00 through the entire 23:59 minute (23:59:59.999).
- Day 2: vote on Day 1 responses from 00:00 through 23:59, and independently respond to Day 2’s new prompt.
- Day 3 at 00:00: Day 1 voting is closed and its results become eligible for settlement; Day 2 moves into voting while Day 3 submissions open.

The database stores the exclusive following-midnight boundary, so there is no one-minute gap, and 23/25-hour daylight-saving days remain correct. Public deadlines display the last included Eastern minute, 23:59. Daily dates must be queued before their opening; no prompt content is automatically invented when the queue is empty. Existing published/historical round snapshots are preserved. The explicit owner test mode still uses 2-minute submission and voting phases and has no daily slot.

Open pages refresh at the next server-provided phase boundary, check for newly queued prompts each minute, and refresh when returning to the tab. Background updates preserve unsaved responses, ballot selections, and selected history rounds until their actual round changes. Server and database deadline checks remain authoritative even if a tab or device is asleep. Final reward settlement still occurs on the next authenticated state/results request after voting closes.

## Influencer tiers and cosmetic profiles

Seven editable placeholder tiers use follower thresholds (0 / 100 / 500 / 1,500 / 5,000 / 15,000 / 50,000). Thresholds determine progression, while display order controls the owner’s tier list and breaks equal-threshold ties. Owners can change names, descriptions, icons/HTTPS images, colors/gradients and first-reach celebrations, or disable a tier. Tier achievements are unique per player/tier. None of these records affect competitive scoring or voting power.

Nine sample cosmetics demonstrate two theme presets, an avatar frame, a profile effect, a banner pattern, a title and three badges. All are clearly marked placeholders. Generic renderers allow solid/gradient themes, ring/double-ring/dashed frames, glow/sparkle/float effects, dots/stripes/grid patterns, emblem badges and text titles. Parameters are validated hex colors and bounded size, opacity and duration values. Arbitrary HTML, CSS and scripts cannot be supplied through content. Device reduced-motion settings always disable animation; the saved player preference also disables effects on profiles they view. Avatar/banner and catalog image fields accept HTTPS links; direct file upload is not provisioned.

Ownership is permanent and non-transferable. Automatic unlock rules support everyone, followers, earned tiers, longest streak and cumulative participation days. Owner assignments cover achievements, events, manual grants and future shop references; cosmetic purchasing is not implemented or charged. Streak milestones grant a configured cosmetic once. Disabling a cosmetic hides it and prevents equipping without deleting ownership. A profile save validates ownership and slots, limits displayed badges (default three), and atomically replaces selected equipment; an optimistic revision rejects stale edits. Save/reset controls preserve unsaved edits through routine background refreshes.

Anonymous voting retains its original projection: opaque response ID, content and competitive-effect snapshot only. Decorated profile popouts are attached only to finalized results and the viewer’s own profile. Profile color, badges, usernames, avatars and tiers never appear on anonymous responses.

## Forgiving streaks

New activity tracking begins when this feature is released; old submissions/results are not reinterpreted as historical check-ins. A valid accepted submission or nonempty valid ballot inserts one immutable `(player, Eastern calendar day)` activity record in the same transaction as participation. Edits, retries, multiple rounds and both activity types on the same day still count once. Simply viewing a page does not count. Later cancellation does not erase a previously accepted activity day, although cancelled competition rewards remain zero.

The default is one free freeze per Monday-based calendar week, with a maximum bank of one. Weekly or monthly frequency, grants (including zero), bank limit and displayed badge limit are configurable. Missed days consume available freezes automatically on the next request. A freeze preserves the count but adds no completed day or reward. The next active day increments the count; an unprotected miss resets only the current streak. Longest streak, participation history, followers, Likes and earned cosmetics remain intact. Streak milestones grant cosmetics only.

Daily decisions and periodic refills are unique, immutable records with their effective rules. Optimistic revisions and transaction tokens make concurrent refreshes safe; long absences are processed in bounded batches. Settings edits are versioned and begin at the next Eastern midnight, so delayed reconciliation uses the rules effective on each day. Monday refills and named-zone calendar arithmetic handle spring/fall DST transitions without assuming a day is 24 hours. Today remains pending until participation or the following midnight; freezes never mark today completed in advance.
