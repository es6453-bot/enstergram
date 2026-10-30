import { createClient } from "@libsql/client";
import { loadLocalEnvironment, databaseOptions } from "./environment.mjs";
loadLocalEnvironment();
const [subject, profileId] = process.argv.slice(2);
if (!/^[1-9]\d*$/.test(subject || "") || !profileId)
  throw new Error(
    "Usage: pnpm accounts:link NUMERIC_GITHUB_ID EXISTING_PROFILE_ID. Verify that both accounts belong to the same player before linking.",
  );
const client = createClient(databaseOptions());
const tx = await client.transaction("write");
try {
  const profile = await tx.execute({
    sql: "SELECT id FROM profiles WHERE id=?",
    args: [profileId],
  });
  if (!profile.rows.length)
    throw new Error("Existing player profile not found.");
  const collision = await tx.execute({
    sql: "SELECT id FROM profiles WHERE id=? AND id<>?",
    args: [`github:${subject}`, profileId],
  });
  if (collision.rows.length)
    throw new Error(
      "This GitHub account already has a separate game profile. Automatic merging is refused.",
    );
  await tx.execute({
    sql: "INSERT INTO auth_identities VALUES('github',?,?,?) ON CONFLICT(provider,subject) DO NOTHING",
    args: [subject, profileId, Date.now()],
  });
  const linked = await tx.execute({
    sql: "SELECT user_id FROM auth_identities WHERE provider='github' AND subject=?",
    args: [subject],
  });
  if (linked.rows[0]?.user_id !== profileId)
    throw new Error(
      "This GitHub identity is already linked to another profile.",
    );
  await tx.commit();
  console.log("Account linked. Existing progress is preserved.");
} catch (error) {
  if (!tx.closed) await tx.rollback();
  throw error;
} finally {
  tx.close();
  client.close();
}
