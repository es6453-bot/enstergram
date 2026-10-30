import { randomUUID } from "node:crypto";
const quote = (name) => `"${name.replaceAll('"', '""')}"`;
export async function restoreSnapshot(client, snapshot, ownerSubject) {
  if (
    snapshot?.format !== "estergram-sites-export-v1" ||
    !snapshot.tables ||
    !/^[1-9]\d*$/.test(ownerSubject || "")
  )
    throw new Error(
      "Provide a valid Sites export and numeric OWNER_GITHUB_ID.",
    );
  const definition = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'_app_migrations'",
  );
  const targetTables = definition.rows.map((x) => x.name);
  const sourceNames = Object.keys(snapshot.tables);
  const expected = targetTables.filter((name) => name !== "auth_identities");
  if (
    sourceNames.length !== expected.length ||
    !expected.every((name) => sourceNames.includes(name))
  )
    throw new Error(
      "The export does not contain the complete expected application schema.",
    );
  const dependencies = new Map();
  for (const name of expected) {
    const columns = await client.execute(`PRAGMA table_info(${quote(name)})`);
    const names = columns.rows.map((x) => x.name);
    const table = snapshot.tables[name];
    if (
      !Array.isArray(table.columns) ||
      table.columns.length !== names.length ||
      !names.every((column) => table.columns.includes(column)) ||
      !Array.isArray(table.rows)
    )
      throw new Error(`Invalid exported table ${name}.`);
    if (
      !table.rows.every(
        (row) =>
          Object.keys(row).length === names.length &&
          names.every((column) => Object.hasOwn(row, column)),
      )
    )
      throw new Error(`An exported row in ${name} is incomplete.`);
    const keys = await client.execute(
      `PRAGMA foreign_key_list(${quote(name)})`,
    );
    dependencies.set(name, [...new Set(keys.rows.map((x) => x.table))]);
  }
  const ordered = [],
    pending = new Set(expected);
  while (pending.size) {
    const ready = [...pending].filter((name) =>
      dependencies.get(name).every((parent) => !pending.has(parent)),
    );
    if (!ready.length)
      throw new Error("Unexpected cyclic database dependencies.");
    for (const name of ready) {
      ordered.push(name);
      pending.delete(name);
    }
  }
  const owners = snapshot.tables.profiles.rows.filter(
    (x) => x.role === "admin",
  );
  if (owners.length !== 1)
    throw new Error(
      "The export must identify exactly one existing owner for automatic account mapping.",
    );
  const transaction = await client.transaction("write");
  try {
    const counts = await transaction.execute(
      targetTables
        .map(
          (name) =>
            `SELECT '${name.replaceAll("'", "''")}' AS name,COUNT(*) AS count FROM ${quote(name)}`,
        )
        .join(" UNION ALL "),
    );
    if (counts.rows.some((x) => x.count !== 0))
      throw new Error(
        "Restore requires an empty migrated database. Existing game data will never be overwritten or merged automatically.",
      );
    const triggers = await transaction.execute(
      "SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name",
    );
    // The target is empty. Temporarily suspend insert-side accounting so copied
    // ledgers, wallets, followers and inventory retain their exact recorded values.
    // All trigger changes and imported data live in this single transaction.
    await transaction.batch(
      triggers.rows.map((x) => `DROP TRIGGER ${quote(x.name)}`),
    );
    const inserts = [];
    for (const name of ordered) {
      const table = snapshot.tables[name],
        columns = table.columns;
      const sql = `INSERT INTO ${quote(name)}(${columns.map(quote).join(",")}) VALUES(${columns.map(() => "?").join(",")})`;
      for (const row of table.rows)
        inserts.push({ sql, args: columns.map((column) => row[column]) });
    }
    if (inserts.length) await transaction.batch(inserts);
    await transaction.execute({
      sql: "INSERT INTO auth_identities(provider,subject,user_id,created) VALUES('github',?,?,?)",
      args: [ownerSubject, owners[0].id, Date.now()],
    });
    await transaction.batch(triggers.rows.map((x) => x.sql));
    const violations = await transaction.execute("PRAGMA foreign_key_check");
    if (violations.rows.length)
      throw new Error("The export failed its foreign-key integrity check.");
    const balances = await transaction.execute(
      "SELECT w.user_id FROM wallets w LEFT JOIN ledger l ON l.user_id=w.user_id GROUP BY w.user_id HAVING w.balance<>COALESCE(SUM(l.amount),0)",
    );
    if (balances.rows.length)
      throw new Error(
        "The export is inconsistent: wallet balances do not match the immutable ledger. Take a fresh export after stopping gameplay.",
      );
    const followers = await transaction.execute(
      "SELECT p.id FROM profiles p LEFT JOIN follower_awards a ON a.user_id=p.id GROUP BY p.id HAVING p.followers<>COALESCE(SUM(a.amount),0)",
    );
    if (followers.rows.length)
      throw new Error(
        "The export is inconsistent: follower totals do not match their awards.",
      );
    await transaction.execute({
      sql: "INSERT INTO audit VALUES(?,?,?,?,?)",
      args: [
        randomUUID(),
        owners[0].id,
        "platform_migration",
        JSON.stringify({
          source: snapshot.project_id,
          exported_at: snapshot.exported_at,
          rows: inserts.length,
        }),
        Date.now(),
      ],
    });
    await transaction.commit();
    return { tables: expected.length, rows: inserts.length, ownerLinked: true };
  } catch (error) {
    if (!transaction.closed) await transaction.rollback();
    throw error;
  } finally {
    transaction.close();
  }
}
