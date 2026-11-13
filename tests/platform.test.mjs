import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import ts from "typescript";
import sharp from "sharp";
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
    "access",
    "media-limits",
    "response-media",
    "comments",
    "server",
  ]) {
    let code = readFileSync(`lib/${name}.ts`, "utf8")
      .replace(
        /import\s*\{\s*database\s*\}\s*from\s*["']\.\/database["'];?/,
        "const database=()=>globalThis.__platformDb;",
      )
      .replace(
        /from\s*["']\.\/(rules|time|progression|social-seed|social|identity-policy|access|response-media|media-limits|comments)["']/g,
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
      14,
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
test("response API rejects long dashed and underscored tokens, including with Word Expansion", async () => {
  const client = await fresh();
  try {
    const now = Date.now();
    await client.batch([
      "INSERT INTO profiles VALUES('alice','alice','player',0)",
      { sql: "INSERT INTO rounds(id,number,prompt,opens,closes,ends,config) VALUES('round',1,'Prompt',?,?,?,'{\"wordLimit\":10}')", args: [now - 1000, now + 60_000, now + 120_000] },
      "INSERT INTO catalog(id,name,description,icon,cost,effect,parameter) VALUES('expand','Expand','Expand','Type',0,'word_limit',15)",
      "INSERT INTO inventory VALUES('expand-stock','alice','expand',1)",
    ], "write");
    const submit = (content) => server.mutate("submit", { roundId: "round", content }, { id: "alice" });
    await assert.rejects(submit("alpha_bravo_charlie_delta"), /20 characters/);
    await assert.rejects(submit("alpha-bravo-charlie-delta"), /20 characters/);
    await assert.rejects(submit("hello " + "-".repeat(21)), /20 characters/);
    await submit("abcdefghijklmnopqrst");
    const entry = await server.one("SELECT id FROM submissions");
    await server.mutate("activate", {
      roundId: "round", itemId: "expand", revision: 1, submissionId: entry.id,
    }, { id: "alice" });
    await assert.rejects(submit("é".repeat(21)), /20 characters/);
    await submit(`one two three four five six seven eight nine ten ${"e\u0301".repeat(20)}`);
    assert.equal((await server.one("SELECT COUNT(*) AS n FROM receipts")).n, 1);
  } finally {
    client.close();
  }
});
test("GIF power-up spends inventory once and exposes media only in the appropriate round phase", async () => {
  const client = await fresh();
  try {
    const { processResponseImage, readResponseImage } = await import("../.test-runtime/platform/response-media.mjs");
    const now = Date.now();
    await client.batch([
      "INSERT INTO profiles VALUES('alice','alice','player',0),('bob','bob','player',0),('eve','eve','player',0)",
      "INSERT INTO wallets VALUES('alice',0),('bob',0),('eve',0)",
      "INSERT INTO ledger VALUES('grant','alice',NULL,'admin',100,'test',0)",
      { sql: "INSERT INTO rounds(id,number,prompt,opens,closes,ends,config) VALUES('round',1,'Prompt',?,?,?,?)", args: [now - 1000, now + 60_000, now + 120_000, JSON.stringify({ wordLimit: 10, votePoints: [3, 2, 1, -1], minEntries: 5, submissionClout: 10, votingClout: 5, podiumClout: [30, 20, 10] })] },
      "INSERT INTO catalog(id,name,description,icon,cost,effect,parameter) VALUES('gif','GIF','GIF','Image',50,'media_response',1)",
    ], "write");
    const gif = await sharp(Buffer.concat([Buffer.alloc(12), Buffer.alloc(12, 255)]), {
      raw: { width: 2, height: 4, pageHeight: 2, channels: 3 },
    }).gif({ delay: [100, 100] }).toBuffer();
    const upload = (bytes = gif, itemId = "gif") => {
      const form = new FormData();
      form.set("roundId", "round");
      if (itemId) form.set("itemId", itemId);
      form.set("revision", "1");
      form.set("image", new File([bytes], "image.gif", { type: "image/gif" }));
      return form;
    };
    await assert.rejects(server.submitMedia(upload(), "bob"), /inventory/);
    await server.mutate("purchase", { itemId: "gif", revision: 1, key: "test" }, { id: "alice" });
    await server.mutate("submit", { roundId: "round", content: "Text draft" }, { id: "alice" });
    const entry = await server.one("SELECT id FROM submissions");
    await assert.rejects(server.mutate("activate", {
      roundId: "round", itemId: "gif", revision: 1, submissionId: entry.id,
    }, { id: "alice" }), /Choose a GIF or image/);
    await assert.rejects(server.submitMedia(upload(Buffer.from("<svg/>")), "alice"), /Choose a GIF/);
    assert.equal((await server.one("SELECT content FROM submissions")).content, "Text draft");
    assert.equal((await server.one("SELECT quantity FROM inventory")).quantity, 1);
    await Promise.all([server.submitMedia(upload(), "alice"), server.submitMedia(upload(), "alice")]);
    assert.equal((await server.one("SELECT quantity FROM inventory")).quantity, 0);
    assert.equal((await server.one("SELECT balance FROM wallets WHERE user_id='alice'")).balance, 50);
    assert.equal((await server.one("SELECT COUNT(*) AS n FROM activations")).n, 1);
    assert.equal((await server.one("SELECT COUNT(*) AS n FROM receipts")).n, 1);
    const db = globalThis.__platformDb;
    const saved = await readResponseImage(db, entry.id, "alice");
    assert.equal(saved.mime, "image/gif");
    assert.equal((await sharp(Buffer.from(saved.image), { animated: true }).metadata()).pages, 2);
    assert.equal(await readResponseImage(db, entry.id), null);
    assert.equal(await readResponseImage(db, entry.id, "bob"), null);
    await assert.rejects(server.mutate("submit", { roundId: "round", content: "Back to text" }, { id: "alice" }), /another GIF or image/);
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "orange" } }).png().toBuffer();
    assert.equal((await processResponseImage(png)).mime, "image/webp");
    await server.submitMedia(upload(png, null), "alice");
    await client.execute("DROP TRIGGER round_snapshot"); // Advance fixture through the round phases.
    await client.execute({ sql: "UPDATE rounds SET closes=? WHERE id='round'", args: [Date.now() - 100] });
    const voting = await server.feed("round", "bob");
    assert.deepEqual(voting.entries, [{
      id: entry.id, content: "", effect_name: "GIF", effect_type: "media_response", parameter: 1, has_media: 1,
    }]);
    assert.equal((await readResponseImage(db, entry.id, "bob")).mime, "image/webp");
    assert.equal(await readResponseImage(db, entry.id), null);
    await assert.rejects(server.submitMedia(upload(), "alice"), /closed/);
    await server.mutate("vote", { roundId: "round", choices: [entry.id, null, null, null] }, { id: "bob" });
    await client.execute({ sql: "UPDATE rounds SET ends=? WHERE id='round'", args: [Date.now() - 10] });
    const results = await server.feed("round", "bob");
    assert.equal(results.entries[0].score, 3);
    assert.equal(results.entries[0].bonus, 0);
    assert.equal(results.entries[0].has_media, 1);
    assert.equal((await readResponseImage(db, entry.id)).mime, "image/webp");
  } finally {
    client.close();
  }
});
test("anonymous comments support multiple pages, enforce round visibility, and allow owners and staff to remove them", async () => {
  const client = await fresh();
  try {
    const { commentPage } = await import("../.test-runtime/platform/comments.mjs");
    const now = Date.now();
    await client.batch([
      "INSERT INTO profiles VALUES('alice','alice','player',0),('bob','bob','player',0),('staff','staff','player',0)",
      "INSERT INTO auth_identities VALUES('google','staff-subject','staff',1)",
      "INSERT INTO google_accounts VALUES('staff-subject','staff','staff@example.com',1)",
      "INSERT INTO staff_roles VALUES('staff','owner','staff-subject','staff',1)",
      { sql: "INSERT INTO rounds(id,number,prompt,opens,closes,ends,config) VALUES('round',1,'Prompt',?,?,?,'{}')", args: [now - 1000, now + 60_000, now + 120_000] },
      "INSERT INTO submissions VALUES('entry','round','alice','My response',0)",
    ], "write");
    const db = globalThis.__platformDb;
    const add = (content) => server.mutate("addComment", { submissionId: "entry", content }, { id: "bob" });
    const remove = (commentId, id) => server.mutate("removeComment", { commentId }, { id });
    assert.equal(await commentPage(db, "bob", "entry"), null);
    await assert.rejects(add("Private"), /unavailable/);
    await client.execute("DROP TRIGGER round_snapshot");
    await client.execute({ sql: "UPDATE rounds SET closes=? WHERE id='round'", args: [Date.now() - 50] });
    await assert.rejects(add(" "), /up to 1000/);
    for (let i = 1; i <= 25; i++) await add(`Comment ${i}`);
    const first = await commentPage(db, "alice", "entry");
    assert.equal(first.comments.length, 20);
    assert.deepEqual(first.comments[0], { id: 25, content: "Comment 25", own: false, canRemove: false });
    const older = await commentPage(db, "bob", "entry", first.next);
    assert.equal(older.comments.length, 5);
    assert.equal(older.comments[0].own, true);
    assert.equal(older.next, null);
    await assert.rejects(remove(25, "alice"), /could not be removed/);
    await remove(25, "bob");
    assert.equal((await commentPage(db, "staff", "entry")).comments[0].canRemove, true);
    await remove(24, "staff");
    assert.equal((await commentPage(db, "alice", "entry")).comments[0].id, 23);
    await client.execute("UPDATE rounds SET cancelled=1");
    assert.equal(await commentPage(db, "bob", "entry"), null);
    await assert.rejects(add("Cancelled"), /unavailable/);
    assert.equal((await server.one("SELECT COUNT(*) AS n FROM receipts")).n, 0);
  } finally {
    client.close();
  }
});
test("open ballots ignore former downvotes and reject new ones while past rounds retain their scores", async () => {
  const client = await fresh();
  try {
    const { DEFAULTS } = await import("../.test-runtime/platform/rules.mjs");
    const now = Date.now();
    const rules = JSON.stringify({ ...DEFAULTS, votePoints: [3, 2, 1, -1] });
    await client.batch([
      "INSERT INTO profiles VALUES('alice','alice','player',0),('bob','bob','player',0)",
      "INSERT INTO wallets VALUES('alice',0),('bob',0)",
      "DROP TRIGGER ballot_positive_insert",
      "DROP TRIGGER round_snapshot",
      ...["open", "past"].flatMap((round) => [
        { sql: "INSERT INTO rounds(id,number,prompt,opens,closes,ends,config) VALUES(?,1,'Prompt',?,?,?,?)", args: [round, now - 200_000, now + 60_000, now + 120_000, rules] },
        { sql: "INSERT INTO submissions VALUES(?,?, 'alice','Response',0)", args: [`${round}-entry`, round] },
        { sql: "UPDATE rounds SET closes=? WHERE id=?", args: [now - 100_000, round] },
        { sql: "INSERT INTO ballots VALUES(?,?,'bob',?,0)", args: [round, round, JSON.stringify([null, null, null, `${round}-entry`])] },
      ]),
      { sql: "UPDATE rounds SET ends=? WHERE id='past'", args: [now - 60_000] },
    ], "write");
    await assert.rejects(server.mutate("vote", {
      roundId: "open", choices: [null, null, null, "open-entry"],
    }, { id: "bob" }), /three favorites/);
    assert.deepEqual(JSON.parse((await server.feed("open", "bob")).ballot.choices), [null, null, null]);
    await client.execute({ sql: "UPDATE economy_updates SET created=? WHERE id='positive-ballots-v1'", args: [now - 30_000] });
    await client.execute({ sql: "UPDATE rounds SET ends=? WHERE id='open'", args: [now - 1] });
    const open = (await server.feed("open", "bob")).entries[0];
    const past = (await server.feed("past", "bob")).entries[0];
    assert.equal(open.score, 0);
    assert.deepEqual(JSON.parse(open.breakdown).counts, [0, 0, 0]);
    assert.equal(past.score, -1);
    const { commentPage } = await import("../.test-runtime/platform/comments.mjs");
    await server.mutate("addComment", { submissionId: "open-entry", content: "After results" }, { id: "bob" });
    assert.equal((await commentPage(globalThis.__platformDb, "alice", "open-entry")).comments.length, 1);
  } finally {
    client.close();
  }
});
test("a delayed scheduler settles due rounds once after ballots become immutable", async () => {
  const client = await fresh();
  try {
    const { DEFAULTS } = await import("../.test-runtime/platform/rules.mjs");
    const now = Date.now();
    await client.batch([
      "INSERT INTO profiles VALUES('alice','alice','player',0),('bob','bob','player',0)",
      "INSERT INTO wallets VALUES('alice',0),('bob',0)",
      { sql: "INSERT INTO rounds(id,number,prompt,opens,closes,ends,config) VALUES('previous',1,'Prompt',?,?,?,?)",
        args: [now - 60000, now + 60000, now + 120000, JSON.stringify(DEFAULTS)] },
      "INSERT INTO submissions VALUES('entry','previous','alice','Anonymous until results',0)",
      "DROP TRIGGER round_snapshot",
      { sql: "UPDATE rounds SET closes=? WHERE id='previous'", args: [now - 1000] },
    ], "write");
    await server.mutate("vote", { roundId: "previous", choices: ["entry", null, null] }, { id: "bob" });
    const prior = await server.feed("previous", "bob");
    assert.equal(prior.entries[0].user_id, undefined);
    assert.equal(prior.entries[0].score, undefined);
    await server.finalizeDueRounds();
    assert.equal((await server.one("SELECT COUNT(*) AS n FROM results")).n, 0);
    await client.execute({ sql: "UPDATE rounds SET ends=? WHERE id='previous'", args: [now - 10] });
    await assert.rejects(server.mutate("vote", { roundId: "previous", choices: ["entry", null, null] }, { id: "bob" }), /Voting is closed/);
    await assert.rejects(client.execute("UPDATE ballots SET choices='[null,null,null]'"), /Voting window closed/);
    await Promise.all([server.finalizeDueRounds(), server.finalizeDueRounds()]);
    assert.deepEqual((await server.feed("previous", "bob", true)).entries, []);
    assert.equal((await server.feed("previous", "bob")).entries[0].score, 3);
    assert.equal((await server.one("SELECT COUNT(*) AS n FROM results")).n, 1);
    assert.equal((await server.one("SELECT COUNT(*) AS n FROM ledger WHERE kind='voting'")).n, 1);
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
    assert.equal(owner.role, "player");
    await client.batch(
      [
        "INSERT INTO auth_identities VALUES('github','123','github:123',1)",
        "INSERT INTO auth_identities VALUES('google','google-owner','github:123',1)",
        "INSERT INTO google_accounts VALUES('google-owner','github:123','owner@example.com',1)",
      ],
      "write",
    );
    const { bootstrapOwner } = await import("../lib/access.ts");
    await bootstrapOwner(adaptClient(client), "123");
    assert.equal(
      (
        await server.setup({
          userId: "github:123",
          githubId: "123",
          displayName: "Owner",
        })
      ).role,
      "owner",
    );
    assert.equal(
      (
        await client.execute(
          "SELECT COUNT(*) AS n FROM staff_roles WHERE role='owner'",
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
    assert.equal(retired.role, "owner");
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
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_app_migrations','auth_identities','auth_users','player_handles','auth_verification_tokens','auth_link_tokens','auth_rate_limits','google_accounts','staff_roles','admin_invitations','player_suspensions','submission_media','response_comments')",
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
    await source.execute("UPDATE profiles SET role='admin'"); // Original Sites backup marks the legacy owner as admin.
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
    await source.execute("UPDATE profiles SET role='admin'"); // Legacy Sites owner marker.
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
