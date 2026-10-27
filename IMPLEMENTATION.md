# Implementation checklist

- [x] Likes ledger, atomic purchases, normalized inventory and activation effects
- [x] Configurable placeholder catalog and round snapshots
- [x] Shop, inventory confirmation, composer, anonymous voting, score breakdowns
- [x] Owner dashboard: prompts, scheduling, catalog, settings, inventory
- [x] Transaction, concurrency, scoring, privacy and lifecycle checks
- [x] Influencer tier editor and follower progression, optional celebrations
- [x] Cosmetic ownership, live profile preview, equipped slots and finalized-result popouts
- [x] Eastern daily activity, forgiving freezes, milestones and versioned owner settings
- [x] 37 tests, Typecheck, lint and production build
- [ ] Browser visual review of new profiles/streaks (browser access was previously declined)

Architecture: Vinext App Router / TypeScript, Sites identity, Cloudflare D1. No real money. Rewards settle once at finalization. Existing Likes and Followers formulas are retained, with only documented score effects applied. All four effects use a single activation slot per round, including Brand Deal. Purchased unused items persist. Round and activation parameters are immutable snapshots.

Private publication uses the checked source and production build. The native deployment outcome and live URL are recorded in the chat.

Daily schedule: America/New_York, 00:00 through 23:59 inclusive, next-day voting alongside the next daily submission round. Server-calculated timestamps, one active daily date, boundary refresh, and DST transitions are covered by tests.
