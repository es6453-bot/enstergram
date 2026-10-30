# Start here — Estergram on Vercel

This is the standard Next.js / GitHub OAuth / libSQL edition. It replaces the previous Sites/Vinext build for a Vercel deployment.

1. Read `VERCEL-SETUP.md` and prepare the database, OAuth app and Vercel environment variables.
2. Restore the separate private migration backup into an empty database before signing in, if preserving the existing game.
3. Publish the complete source with Git/GitHub Desktop and deploy using the Next.js preset. `vercel.json` sets the production build command.
4. Verify `/api/health`, real GitHub sign-in, owner access and preserved game records before switching players to the new URL.

For source checks:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

The source release passes 57 automated tests and a standard Next.js production build. This does not replace verification of real external credentials and the final hosted deployment.

The source ZIP includes code, assets, tests, migrations, dependency lockfile and setup documentation. Installed dependencies, generated builds, local databases, secrets and the private live-game backup are excluded. Do not upload the private backup or `.env.local` to GitHub.

Keep the previous live game available until cutover succeeds. See `README.md` for game behavior and `COLLABORATING.md` for the shared development workflow.
