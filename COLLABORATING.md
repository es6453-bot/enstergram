# Collaborating on Estergram

## Create one shared source repository

One group member should extract the archive and create an empty private repository on your chosen Git hosting service. From the extracted `estergram` folder:

```sh
git init -b main
git add .
git commit -m "Import Estergram source"
git remote add origin YOUR_SHARED_REPOSITORY_URL
git push -u origin main
```

Replace `YOUR_SHARED_REPOSITORY_URL` with the URL supplied by your repository host. Invite the group as collaborators through that host. Everyone else should clone this shared repository, rather than independently uploading another copy of the ZIP.

This is a new shared development repository. It is separate from the hosting platform's existing deployment source repository. Sharing source does not change the live site's audience or grant publication access.

## Use branches and review changes

Start each task from an up-to-date main branch:

```sh
git switch main
git pull --ff-only
git switch -c feature/your-change
```

After implementing and checking a change:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
git add .
git commit -m "Describe the change"
git push -u origin feature/your-change
```

Open a pull request or merge request on your Git host. Have another group member review it before merging. Agree on who publishes approved changes to the existing live Site; pushing to this new collaboration repository does not automatically deploy it.

## Code map

| Area | Main files |
| --- | --- |
| Shop, submissions, voting, results, owner dashboard | `app/ui.tsx` |
| Profile cards, wardrobe and profile/streak editors | `app/social-ui.tsx` |
| Layout and styles | `app/layout.tsx`, `app/globals.css`, `app/social.css` |
| Authenticated API | `app/api/game/route.ts`, `app/chatgpt-auth.ts` |
| Competition, purchases, inventory and finalization | `lib/server.ts`, `lib/rules.ts` |
| Tiers, cosmetics, streaks and validations | `lib/social.ts`, `lib/progression.ts` |
| Editable placeholder seed content | `lib/social-seed.ts` |
| Eastern-time scheduling | `lib/time.ts` |
| Database | `db/schema.ts`, `drizzle/` |
| Integration, concurrency and rendering tests | `tests/economy.test.mjs` |
| Toolchain | `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `scripts/` |

## Shared working agreements

- Use Creator studio for the owner's prompt, economy, tier and cosmetic content changes. Production edits live in the database, not in frontend constants.
- Commit source, the lockfile, migrations and Drizzle metadata. The included `.gitignore` excludes dependencies, local databases, build outputs and local secrets.
- Keep applied migrations immutable. Add a new migration for subsequent schema changes, and coordinate migration generation to avoid conflicting sequence numbers.
- Use separate local databases. Do not pass production player data or development cookies around with the code.
- Preserve anonymous voting projections, server-side authorization and the immutable ledger/results rules.
- Keep economy settings and competitive effects snapshotted for published rounds. Cosmetic/streak work must not silently change scoring or previously earned rewards.
- Use America/New_York calendar dates for schedule and streak changes; test both daylight saving transitions.
- Run the checks above before merging. Test edited user flows in the browser at desktop and mobile sizes.

## Releasing to the existing Site

The designated owner/publisher should bring the reviewed changes into the existing Sites-managed project, run its checks/build, synchronize the source and publish through the Sites workflow. Preserve the existing `.openai/hosting.json` project ID and intended audience. Sites applies hosted migrations to the production database; local migrations and local test data are separate.

For an independent fork, register a separate Site and use its returned identity and database bindings. Do not reuse the original project ID for a different hosted project. The original owner retains control of the existing live game.
