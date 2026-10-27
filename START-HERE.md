# Estergram — source code handoff

This package contains the complete tracked source for the deployed Estergram game, including the shop, Likes economy, Eastern daily schedule, influencer tiers, cosmetic profiles, streaks, owner dashboard, migrations, tests, assets and supporting build scripts.

## Open the project

1. Extract `estergram-collaboration.zip`.
2. Open the inner `estergram` folder in your code editor.
3. Read `README.md` for architecture, game rules and database setup.
4. Read `COLLABORATING.md` to set up your shared repository and review workflow.

## Local requirements

- Node.js 24 or newer.
- pnpm 11.25 or newer compatible with the project's pinned package-manager version.
- Git for shared development.

From the extracted project folder:

```sh
pnpm install --frozen-lockfile
pnpm build
```

The first build generates the local Wrangler configuration. Run the eight local database migration commands in the README, once and in filename order, before starting the game:

```sh
pnpm dev
```

Open the loopback address printed by the development server. The portable local preview supplies a development sign-in identity; it is separate from production accounts and data. The first local account initializes the owner workspace and editable placeholders.

## Check changes

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

The release this package was exported from passed 37 automated tests, TypeScript, lint and a production build. New profile/streak layouts have not had a browser visual review. Test the pages and mobile layouts when making UI changes.

## What is included

- Application pages, API handlers, authentication adapter, server rules and progression systems.
- Database schema, all eight SQL migrations and Drizzle metadata.
- Frontend components, styles, icons and placeholder content.
- Dependency manifest, pinned lockfile, local development/build scripts and supporting vendor notices.
- Tests, implementation notes and setup documentation.
- `SOURCE-MANIFEST.json` identifying the exported source commit.

## What is separate

Installed dependencies and generated builds are recreated from the manifest and lockfile. This package does not include local databases, production player data, sessions, access tokens, Git credentials or the repository's Git history. Current owner-edited content/settings stored in the production database are not a database backup in this archive.

The production game is hosted at:

https://viral-algorithm-game.mauveclock20.chatgpt.site

The source archive does not grant access to that private website, its hosted database, or deployment permissions. The `.openai/hosting.json` file retains the original site's project identifier for the owner's existing project; that identifier is not a password. Keep the original identity when returning changes to that project. An independent deployment needs its own project registration and database.

Production authentication relies on Sites. Hosting this code elsewhere requires adapting the authentication/deployment integration and configuring a suitable Cloudflare D1 database; it is not a static HTML-only website. See the README before choosing another host.
