import { createClient } from "@libsql/client";
import { loadLocalEnvironment, databaseOptions } from "./environment.mjs";
import { migrate } from "./migrations.mjs";
loadLocalEnvironment();
const client = createClient(databaseOptions());
try {
  const result = await migrate(client);
  console.log(
    `Database ready: ${result.applied} new migrations; ${result.total} total.`,
  );
} finally {
  client.close();
}
