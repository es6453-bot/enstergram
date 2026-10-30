import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import ts from "typescript";
import { adaptClient } from "../lib/database.ts";
import {
  githubSubject,
  isOwner,
  isAllowedPlayer,
} from "../lib/identity-policy.ts";
import { migrate } from "../scripts/migrations.mjs";
import { restoreSnapshot } from "../scripts/restore-core.mjs";
let server;
before(async () => {
  mkdirSync(".test-runtime/platform", { recursive: true });
  for (const name of [
    "rules",
    "time",
    "progression",
    "social-seed",
    "social",
    "identity-policy",
    "server",
  ]) {
    let code = readFileSync(`lib/${name}.ts`, "utf8")
      .replace(
        /import\s*\{\s*database\s*\}\s*from\s*["']\.\/database["'];?/,
        "const database=()=>globalThis.__platformDb;",
      )
      .replace(
        /from\s*["']\.\/(rules|time|progression|social-seed|social|identity-policy)["']/g,
        (_, moduleName) => `from './${moduleName}.mjs'`,
      );
    writeFileSync(
      `.test-runtime/platform/${name}.mjs`,
      ts.transpileModule(code, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    );
  }
  server = await import("../.test-runtime/platform/server.mjs");
});
async function fresh() {
  const client = createClient({ url: "file::memory:" });
  await migrate(client);
  globalThis.__platformDb = adaptClient(client);
  return client;
}
test("libSQL applies all migrations once and exposes fractional server timestamps", async () => {
  const client = await fresh();
  try {
    assert.equal(
      (await client.execute("SELECT COUNT(*) AS n FROM _app_migrations"))
        .rows[0].n,
      10,
    );
    assert.equal((await migrate(client)).applied, 0);
    const r = await client.execute("SELECT unixepoch('subsec') AS now");
    assert.ok(r.rows[0].now > 0);
    await assert.rejects(
      client.execute("INSERT INTO wallets VALUES('missing-user',1)"),
      /FOREIGN KEY/,
    );
  } finally {
    client.close();
  }
});
test("failed schema migration rolls back DDL and never records success", async () => {
  const directory = resolve(".test-runtime/platform/failing-migration");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, "0000_fail.sql"),
    "CREATE TABLE should_rollback(id INTEGER);\n--> statement-breakpoint\nTHIS IS INVALID SQL;",
  );
  const client = createClient({ url: "file::memory:" });
  try {
    await assert.rejects(migrate(client, pathToFileURL(directory + "/")));
    assert.equal(
      (
        await client.execute(
          "SELECT name FROM sqlite_master WHERE name='should_rollback'",
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (await client.execute("SELECT COUNT(*) AS n FROM _app_migrations"))
        .rows[0].n,
      0,
    );
  } finally {
    client.close();
  }
});
test("real libSQL write batches roll back all operations and reject concurrent overspending", async () => {
  const client = await fresh();
  const db = globalThis.__platformDb;
  try {
    await client.batch(
      [
        "INSERT INTO profiles VALUES('alice','alice','player',0)",
        "INSERT INTO wallets VALUES('alice',0)",
        "INSERT INTO ledger VALUES('grant','alice',NULL,'admin',100,'test',0)",
        "INSERT INTO catalog(id,name,description,icon,cost,effect,parameter) VALUES('word','word','placeholder','Type',80,'word_limit',15)",
      ],
      "write",
    );
    const outcomes = await Promise.allSettled(
      ["one", "two"].map((key) =>
        server.mutate(
          "purchase",
          { itemId: "word", key, revision: 1 },
          { id: "alice" },
        ),
      ),
    );
    assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      (
        await db
          .prepare("SELECT balance FROM wallets WHERE user_id=?")
          .bind("alice")
          .first()
      ).balance,
      20,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT SUM(amount) AS total FROM ledger WHERE user_id=?")
          .bind("alice")
          .first()
      ).total,
      20,
    );
    await assert.rejects(
      db.batch([
        db.prepare(
          "UPDATE profiles SET name='should rollback' WHERE id='alice'",
        ),
        db.prepare("INSERT INTO inventory VALUES('bad','alice','word',-1)"),
      ]),
      /CHECK/,
    );
    assert.equal(
      (await db.prepare("SELECT name FROM profiles WHERE id='alice'").first())
        .name,
      "alice",
    );
  } finally {
    client.close();
  }
});
test("server setup uses explicit GitHub owner configuration and never grants first-visitor ownership", async () => {
  const client = await fresh(),
    previous = process.env.OWNER_GITHUB_ID;
  process.env.OWNER_GITHUB_ID = "123";
  try {
    const stranger = await server.setup({
      userId: "github:999",
      githubId: "999",
      displayName: "First visitor",
    });
    assert.equal(stranger.role, "player");
    const owner = await server.setup({
      userId: "github:123",
      githubId: "123",
      displayName: "Owner",
    });
    assert.equal(owner.role, "admin");
    assert.equal(
      (
        await client.execute(
          "SELECT COUNT(*) AS n FROM profiles WHERE role='admin'",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await client.execute(
          "SELECT balance FROM wallets WHERE user_id='github:123'",
        )
      ).rows[0].balance,
      100,
    );
    await server.setup({
      userId: "github:123",
      githubId: "123",
      displayName: "Owner",
    });
    assert.equal(
      (
        await client.execute(
          "SELECT balance FROM wallets WHERE user_id='github:123'",
        )
      ).rows[0].balance,
      100,
    );
    process.env.OWNER_GITHUB_ID = "456";
    const retired = await server.setup({
      userId: "github:123",
      githubId: "123",
      displayName: "Former owner",
    });
    assert.equal(retired.role, "player");
  } finally {
    if (previous === undefined) delete process.env.OWNER_GITHUB_ID;
    else process.env.OWNER_GITHUB_ID = previous;
    client.close();
  }
});
test("GitHub access defaults to owner-only and uses stable numeric verified subjects", () => {
  const env = { OWNER_GITHUB_ID: "123" };
  assert.equal(githubSubject("es6453-bot"), null);
  assert.equal(githubSubject("123"), "123");
  assert.equal(isOwner("123", env), true);
  assert.equal(isOwner("456", env), false);
  assert.equal(isAllowedPlayer("456", env), false);
  assert.equal(
    isAllowedPlayer("456", { ...env, ALLOWED_GITHUB_IDS: "456,789" }),
    true,
  );
  assert.equal(
    isAllowedPlayer("456", { ...env, ALLOWED_GITHUB_IDS: "*" }),
    true,
  );
  assert.equal(isAllowedPlayer("456", { ALLOWED_GITHUB_IDS: "*" }), false);
});
async function snapshotOf(client) {
  const names = (
    await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_app_migrations','auth_identities','auth_users','player_handles','auth_verification_tokens','auth_link_tokens','auth_rate_limits')",
    )
  ).rows.map((x) => x.name);
  const tables = {};
  for (const name of names) {
    const result = await client.execute(`SELECT * FROM "${name}"`);
    tables[name] = {
      columns: result.columns,
      rows: result.rows.map((row) =>
        Object.fromEntries(result.columns.map((column, i) => [column, row[i]])),
      ),
    };
  }
  return {
    format: "estergram-sites-export-v1",
    project_id: "test-source",
    exported_at: new Date().toISOString(),
    tables,
  };
}
test("data restore preserves accounting, existing owner identity and immutable triggers; retries cannot merge", async () => {
  const source = await fresh(),
    oldOwner = process.env.OWNER_GITHUB_ID;
  process.env.OWNER_GITHUB_ID = "123";
  let target;
  try {
    await server.setup({
      userId: "legacy-owner",
      githubId: "123",
      displayName: "Existing owner",
    });
    const snapshot = await snapshotOf(source);
    target = createClient({ url: "file::memory:" });
    await migrate(target);
    const result = await restoreSnapshot(target, snapshot, "123");
    assert.ok(result.rows > 0);
    assert.equal(
      (
        await target.execute(
          "SELECT balance FROM wallets WHERE user_id='legacy-owner'",
        )
      ).rows[0].balance,
      100,
    );
    assert.equal(
      (
        await target.execute(
          "SELECT user_id FROM auth_identities WHERE provider='github' AND subject='123'",
        )
      ).rows[0].user_id,
      "legacy-owner",
    );
    await assert.rejects(
      target.execute("UPDATE ledger SET amount=999"),
      /immutable/,
    );
    await assert.rejects(
      restoreSnapshot(target, snapshot, "123"),
      /empty migrated database/,
    );
    assert.equal(
      (await target.execute("SELECT COUNT(*) AS n FROM ledger")).rows[0].n,
      1,
    );
  } finally {
    if (oldOwner === undefined) delete process.env.OWNER_GITHUB_ID;
    else process.env.OWNER_GITHUB_ID = oldOwner;
    source.close();
    target?.close();
  }
});
test("inconsistent backup restores roll back all copied data and restore target protections", async () => {
  const source = await fresh(),
    oldOwner = process.env.OWNER_GITHUB_ID;
  process.env.OWNER_GITHUB_ID = "123";
  let target;
  try {
    await server.setup({
      userId: "legacy",
      githubId: "123",
      displayName: "Owner",
    });
    const snapshot = await snapshotOf(source);
    snapshot.tables.wallets.rows[0].balance = 999;
    target = createClient({ url: "file::memory:" });
    await migrate(target);
    await assert.rejects(
      restoreSnapshot(target, snapshot, "123"),
      /balances do not match/,
    );
    assert.equal(
      (await target.execute("SELECT COUNT(*) AS n FROM profiles")).rows[0].n,
      0,
    );
    assert.ok(
      (
        await target.execute(
          "SELECT name FROM sqlite_master WHERE type='trigger' AND name='ledger_no_update'",
        )
      ).rows.length,
    );
  } finally {
    if (oldOwner === undefined) delete process.env.OWNER_GITHUB_ID;
    else process.env.OWNER_GITHUB_ID = oldOwner;
    source.close();
    target?.close();
  }
});
