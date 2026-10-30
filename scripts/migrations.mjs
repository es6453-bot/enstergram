import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
export async function migrate(
  client,
  directory = new URL("../drizzle/", import.meta.url),
) {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS _app_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied INTEGER NOT NULL)",
  );
  const files = (await readdir(directory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  let applied = 0;
  for (const name of files) {
    const sql = (await readFile(new URL(name, directory), "utf8")).replaceAll(
      "\r\n",
      "\n",
    );
    const checksum = createHash("sha256").update(sql).digest("hex");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    const transaction = await client.transaction("write");
    try {
      const prior = await transaction.execute({
        sql: "SELECT checksum FROM _app_migrations WHERE name=?",
        args: [name],
      });
      if (prior.rows.length) {
        if (prior.rows[0].checksum !== checksum)
          throw new Error(
            `Applied migration ${name} has changed. Add a new migration instead.`,
          );
      } else {
        await transaction.batch(statements);
        await transaction.execute({
          sql: "INSERT INTO _app_migrations VALUES(?,?,?)",
          args: [name, checksum, Date.now()],
        });
        applied++;
      }
      await transaction.commit();
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
  }
  return { applied, total: files.length };
}
