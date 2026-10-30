import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { loadLocalEnvironment, databaseOptions } from "./environment.mjs";
import { migrate } from "./migrations.mjs";
import { restoreSnapshot } from "./restore-core.mjs";
loadLocalEnvironment();
if (!process.argv[2])
  throw new Error("Usage: pnpm db:restore PATH_TO_PRIVATE_SITES_BACKUP.json");
const snapshot = JSON.parse(await readFile(process.argv[2], "utf8"));
const client = createClient(databaseOptions());
try {
  await migrate(client);
  const result = await restoreSnapshot(
    client,
    snapshot,
    process.env.OWNER_GITHUB_ID,
  );
  console.log(
    `Restored ${result.rows} rows across ${result.tables} tables and linked the existing owner. No rewards were reissued.`,
  );
} finally {
  client.close();
}
