import { spawnSync } from "node:child_process";
import { createClient } from "@libsql/client";
import { migrate } from "./migrations.mjs";
import { databaseOptions, loadLocalEnvironment } from "./environment.mjs";
loadLocalEnvironment();
const required = [
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "AUTH_SECRET",
  "AUTH_GITHUB_ID",
  "AUTH_GITHUB_SECRET",
  "OWNER_GITHUB_ID",
];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length)
  throw new Error(
    `Deployment setup is incomplete. Set these server-side Vercel environment variables: ${missing.join(", ")}. See VERCEL-SETUP.md.`,
  );
if (
  process.env.AUTH_SECRET.length < 32 ||
  !/^[1-9]\d*$/.test(process.env.OWNER_GITHUB_ID)
)
  throw new Error(
    "AUTH_SECRET needs at least 32 random characters; OWNER_GITHUB_ID must be a numeric GitHub ID.",
  );
const client = createClient(databaseOptions());
try {
  const result = await migrate(client);
  console.log(`Database ready: ${result.total} migrations verified.`);
} finally {
  client.close();
}
const build = spawnSync(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build", "--webpack"],
  { stdio: "inherit", env: process.env },
);
if (build.error) throw build.error;
process.exit(build.status ?? 1);
