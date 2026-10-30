# Deploy Estergram on Vercel

This edition replaces the Sites/Vinext runtime with standard Next.js, Auth.js GitHub sign-in and a remote libSQL database. It preserves the game UI, competition rules, immutable accounting and Eastern schedule. The original Sites deployment is a separate application and remains available until you switch players to the new URL.

## 1. Replace the GitHub source

Use the complete contents of this folder as the repository root. `package.json`, `vercel.json`, `auth.ts`, `app/`, `lib/` and `drizzle/` must be at the root of `es6453-bot/enstergram`.

The old upload omitted several program files as well as dotfiles. Replace it with this complete edition. Use Git/GitHub Desktop for the upload so files such as `app/[...path]/page.tsx` and `app/api/auth/[...nextauth]/route.ts` and all hidden configuration files are retained. Do not mix the old Vinext build scripts or `vite.config.ts` into this edition. The standalone Vercel app does not need `.openai/hosting.json` or the Sites Worker.

Create a branch or a separate repository for the migration and review the changes before merging. Keep the existing Sites source in its original project. Do not upload `node_modules`, `.next`, `.data`, `.env.local`, or the private migration backup.

## 2. Create a libSQL database

In Turso, create a **libSQL-compatible** database and obtain its `libsql://...` URL and an authentication token. This app uses `@libsql/client` and existing SQLite triggers, rather than the separate Turso Database rewrite. Ensure the database supports libSQL and SQLite triggers. Store the URL and token privately in Vercel environment settings.

Local development may use a `file:` URL. Vercel requires a remote database; its filesystem is not a persistent game database. Preview deployments should use a separate database and separate OAuth app from production. Check the provider's current plan limits before provisioning; this source package creates no paid resources.

## 3. Create a GitHub OAuth application

In the GitHub account that should own the game, create an OAuth App under Developer settings. Use the stable production URL of your Vercel project:

- Homepage: `https://YOUR-STABLE-VERCEL-DOMAIN`
- Authorization callback: `https://YOUR-STABLE-VERCEL-DOMAIN/api/auth/callback/github`

Copy its Client ID and Client Secret into Vercel environment settings. Choose the final stable domain before creating this app; changing that domain also requires updating the callback. For local development use a separate OAuth app with `http://localhost:3000/api/auth/callback/github`.

## 4. Configure Vercel

Use the Next.js framework preset, Node.js **24.x**, and the repository root. `vercel.json` declares the install and build commands:

```text
Install: pnpm install --frozen-lockfile
Build:   pnpm run vercel-build
Output:  leave the Next.js default
```

Set these variables for Production. Use separate values for Preview if enabling previews:

| Variable | Value |
| --- | --- |
| `TURSO_DATABASE_URL` | Remote libSQL URL |
| `TURSO_AUTH_TOKEN` | Database authentication token |
| `AUTH_SECRET` | At least 32 cryptographically random characters |
| `AUTH_GITHUB_ID` | OAuth application Client ID |
| `AUTH_GITHUB_SECRET` | OAuth application Client Secret |
| `OWNER_GITHUB_ID` | The owner's numeric GitHub user ID, not username |
| `ALLOWED_GITHUB_IDS` | Optional comma-separated numeric IDs for invited players |

Look up a numeric GitHub ID using `https://api.github.com/users/YOUR_USERNAME` and its `id` field. The owner ID is a public identifier; Client Secrets and database tokens are secret. Generate `AUTH_SECRET` locally with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Enter the result directly into Vercel. Do not commit secrets or the private backup. `AUTH_URL` is optional; set it to the stable production origin only if host inference is unsuitable. Auth.js detects Vercel's trusted proxy environment automatically.

Access starts **owner-only**. Add other numeric GitHub IDs to `ALLOWED_GITHUB_IDS` to invite your group. Use `*` only when intentionally opening the game to every GitHub account. Existing sessions are checked against the current allowlist on every game API request. The first random visitor can never become admin.

## 5. Preserve the existing game before first sign-in

The separate `Estergram-private-migration-backup.json` export contains live player/game records and must stay private. It is not included in the GitHub source ZIP.

Before anyone signs into the Vercel edition, restore that backup into an **empty** target database. From this project folder, copy `.env.example` to `.env.local` and fill in the real database values and verified `OWNER_GITHUB_ID`, or set them in your terminal environment. Then run:

```sh
pnpm install --frozen-lockfile
pnpm db:restore "ABSOLUTE_PATH_TO_PRIVATE_BACKUP.json"
```

The restore applies all nine migrations, copies existing records transactionally, verifies wallet/ledger and follower/award totals, restores all database triggers, and links the single existing owner profile to the configured GitHub account. It does not repeat starting grants, purchase debits, follower awards or inventory consumption. A populated target is refused; the script never clears or merges data. Failed restores roll back both copied records and temporary trigger changes.

The backup is a bounded table export taken during preparation, not a live replication connection. Stop gameplay on the old site before the final cutover and refresh the export if anyone has played or edited content since it was taken. Preserve the old site until the new deployment and sign-in have been verified. Account identities are deliberately not matched by display name or unverified email.

This export currently contains one player, the owner. If other legacy players are included in a later export, verify their GitHub identities and link each before their first new sign-in:

```sh
pnpm accounts:link NUMERIC_GITHUB_ID EXISTING_PROFILE_ID
```

The script refuses an identity already linked elsewhere or a separate already-created GitHub profile. It does not automatically merge accounts. Starting a new game instead is possible with an empty database, but existing progress is preserved only by following the restore workflow.

## 6. Deploy and verify

Deploy the reviewed source. The production build validates required configuration, applies/verifies checksum-tracked migrations, and runs the standard Next.js production build. Database migrations are transactional and retry-safe; applied files must remain immutable. Saving new environment variables requires a new deployment.

Check:

1. `/api/health` returns HTTP 200 with `{"ok":true}`.
2. `/signin` completes GitHub sign-in and returns to the game.
3. The owner sees Creator studio; a non-owner cannot change content or economy settings.
4. Imported Likes, followers, rounds, prompts and inventory match the old game.
5. Submission, anonymous voting, result profiles, cosmetics and streaks work.

Only switch players to the Vercel URL after these checks. A passing local build does not verify real GitHub OAuth or connectivity to your hosted database.

## Local development and checks

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

For a local database, use `TURSO_DATABASE_URL=file:.data/estergram.sqlite` and create the `.data` folder first. Local sign-in still uses real GitHub OAuth; there is no header-based or development authentication bypass in this edition.

`pnpm build` compiles without service credentials so CI can check source. `pnpm vercel-build` additionally requires deployment configuration and migrates the configured database; it does not pretend that missing service credentials are a working deployment.

References: [Auth.js GitHub setup](https://authjs.dev/getting-started/providers/github), [Auth.js deployment](https://authjs.dev/getting-started/deployment), [libSQL SDK and atomic transactions](https://docs.turso.tech/sdk/ts/reference), [Vercel environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables).
