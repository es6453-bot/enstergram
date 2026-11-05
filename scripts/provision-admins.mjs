import { createClient } from "@libsql/client";
import { adaptClient } from "../lib/database.ts";
import { bootstrapOwner, inviteAdmin, roleFor } from "../lib/access.ts";
import { loadLocalEnvironment, databaseOptions } from "./environment.mjs";
loadLocalEnvironment();
const emails = process.argv.slice(2);
if (!emails.length)
  throw new Error(
    "Usage: node scripts/provision-admins.mjs GOOGLE_EMAIL [GOOGLE_EMAIL ...]",
  );
const client = createClient(databaseOptions());
try {
  const db = adaptClient(client),
    owner = await bootstrapOwner(db, process.env.OWNER_GITHUB_ID);
  if (!owner || (await roleFor(db, owner)) !== "owner")
    throw new Error(
      "The verified Google-linked Owner must be initialized first.",
    );
  const configured = await db
    .prepare(
      "SELECT user_id FROM auth_identities WHERE provider='github' AND subject=?",
    )
    .bind(process.env.OWNER_GITHUB_ID)
    .first();
  if (configured?.user_id !== owner)
    throw new Error("Configured bootstrap identity is not the existing Owner.");
  for (const email of emails) {
    const result = await inviteAdmin(db, owner, email);
    console.log(JSON.stringify({ email, ...result }));
  }
} finally {
  client.close();
}
