# Collaborating on the Vercel edition

Use `es6453-bot/enstergram` or your chosen shared repository. This folder is the repository root; do not nest it underneath another `estergram` directory when importing to Vercel.

Use Git or GitHub Desktop to publish the complete source. Browser drag-and-drop previously omitted hidden files and several required modules, including bracketed route folders. Do not upload `node_modules`, `.next`, `.data`, `.env.local`, credentials or private backups.

Suggested workflow:

```sh
git switch main
git pull --ff-only
git switch -c feature/your-change
pnpm install --frozen-lockfile
```

Make changes and run:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
git add .
git commit -m "Describe the change"
git push -u origin feature/your-change
```

Open a pull request and have another group member review it. Production uses the stable Vercel project/domain. Use separate database and OAuth settings for previews so a preview cannot modify production game records.

Keep applied migrations immutable; generate new schema changes with `pnpm db:generate` and coordinate migration numbering. Both SQL and Drizzle metadata belong in Git. The deployed build runs migrations through a checksum-tracked transaction runner.

Keep anonymous voting projections, server-side authorization, immutable accounting, deterministic scoring and America/New_York calendar rules intact. UI-only role fields and incoming identity headers are never trusted. Cosmetics and streaks must not change voting permissions or competitive scoring.

Content and economy edits belong in Creator studio. Configuration stored in a hosted database is not automatically included in source exports. Use the private backup/restore workflow for a migration rather than re-creating balances with new grants.

See `VERCEL-SETUP.md` for service setup, environment variables, data preservation, owner mapping and release checks. Source access, website access and Vercel deployment access are separate permissions.
