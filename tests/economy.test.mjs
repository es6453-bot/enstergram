import { test, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULTS, words, transform, followers, phase } from "../lib/rules.ts";
import {
  nyMidnight,
  nextDay,
  dailyWindow,
  easternDeadline,
  easternDate,
  easternDay,
  nextPhaseDelay,
} from "../lib/time.ts";
import { currencyCopy } from "../lib/rules.ts";
let APPEARANCE_DEFAULTS,
  SOCIAL_DEFAULTS,
  tierProgress,
  initialStreak,
  advanceStreak,
  validateCosmetic,
  validateAppearance;
let server;
let social;
let socialPlaceholders;
let socialUI;
const schema =
  readFileSync("drizzle/0000_bored_namora.sql", "utf8") +
  readFileSync("drizzle/0001_atomic_economy.sql", "utf8") +
  readFileSync("drizzle/0002_catalog_revision.sql", "utf8") +
  readFileSync("drizzle/0003_confirmation_guards.sql", "utf8") +
  readFileSync("drizzle/0004_scheduled_prompt_identity.sql", "utf8") +
  readFileSync("drizzle/0005_starting_likes.sql", "utf8") +
  readFileSync("drizzle/0006_daily_eastern_schedule.sql", "utf8") +
  readFileSync("drizzle/0007_social_profiles_streaks.sql", "utf8") +
  readFileSync("drizzle/0008_vercel_identity_links.sql", "utf8");
class Adapter {
  constructor(raw) {
    this.raw = raw;
    this.queue = Promise.resolve();
  }
  prepare(sql) {
    const raw = this.raw;
    return {
      sql,
      values: [],
      bind(...values) {
        this.values = values;
        return this;
      },
      async first() {
        return raw.prepare(sql).get(...this.values) || null;
      },
      async all() {
        return { results: raw.prepare(sql).all(...this.values) };
      },
      async run() {
        return raw.prepare(sql).run(...this.values);
      },
    };
  }
  async batch(statements) {
    const execute = async () => {
      this.raw.exec("BEGIN IMMEDIATE");
      try {
        const out = [];
        for (const s of statements) out.push(await s.run());
        this.raw.exec("COMMIT");
        return out;
      } catch (e) {
        this.raw.exec("ROLLBACK");
        throw e;
      }
    };
    const result = this.queue.then(execute);
    this.queue = result.catch(() => {});
    return result;
  }
}
function fresh(path = ":memory:") {
  const raw = new DatabaseSync(path);
  raw.exec("PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;");
  raw.exec(schema);
  for (const sql of socialPlaceholders) raw.exec(sql);
  for (const u of ["alice", "bob", "cara", "dave", "erin", "owner"]) {
    raw
      .prepare("INSERT INTO profiles VALUES(?,?,?,0)")
      .run(u, u, u === "owner" ? "admin" : "player");
    raw.prepare("INSERT INTO wallets VALUES(?,0)").run(u);
  }
  raw
    .prepare("INSERT INTO settings VALUES(1,?,1)")
    .run(JSON.stringify(DEFAULTS));
  for (const [id, effect, cost, parameter] of [
    ["word", "word_limit", 80, 15],
    ["boost", "positive_multiplier", 200, 2],
    ["shield", "downvote_shield", 100, 1],
    ["brand", "clout_multiplier", 120, 2],
  ])
    raw
      .prepare(
        "INSERT INTO catalog(id,name,description,icon,cost,effect,parameter) VALUES(?,?,?,'Zap',?,?,?)",
      )
      .run(id, id, "Placeholder", cost, effect, parameter);
  return raw;
}
function round(raw, id = "r", stage = "SUBMISSION", rules = DEFAULTS) {
  const n = Date.now();
  raw
    .prepare(
      "INSERT INTO rounds(id,number,prompt,opens,closes,ends,config) VALUES(?,1,'Placeholder prompt',?,?,?,?)",
    )
    .run(
      id,
      n - 100000,
      stage === "SUBMISSION" ? n + 100000 : n - 2000,
      stage === "RESULTS" ? n - 1000 : n + 200000,
      JSON.stringify(rules),
    );
  return raw.prepare("SELECT * FROM rounds WHERE id=?").get(id);
}
function grant(raw, u = "alice", amount = 400) {
  raw
    .prepare("INSERT INTO ledger VALUES(?,?,NULL,'admin',?,'Test grant',?)")
    .run(crypto.randomUUID(), u, amount, Date.now());
}
function stock(raw, u, item, n = 1) {
  raw
    .prepare("INSERT INTO inventory VALUES(?,?,?,?)")
    .run(`${u}:${item}`, u, item, n);
}
function submit(raw, u = "alice", r = "r") {
  raw
    .prepare("INSERT INTO submissions VALUES(?,?,?,?,?)")
    .run(`${r}:${u}`, r, u, "A placeholder take.", Date.now());
}
before(async () => {
  mkdirSync(".test-runtime/tests", { recursive: true });
  const options = {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  };
  writeFileSync(
    ".test-runtime/tests/rules.mjs",
    ts.transpileModule(readFileSync("lib/rules.ts", "utf8"), options)
      .outputText,
  );
  writeFileSync(
    ".test-runtime/tests/time.mjs",
    ts.transpileModule(readFileSync("lib/time.ts", "utf8"), options).outputText,
  );
  for (const moduleName of [
    "progression",
    "social-seed",
    "social",
    "identity-policy",
  ]) {
    const source = readFileSync(`lib/${moduleName}.ts`, "utf8").replace(
      /from\s*["']\.\/(time|progression|social-seed)["']/g,
      (_, name) => `from './${name}.mjs'`,
    );
    writeFileSync(
      `.test-runtime/tests/${moduleName}.mjs`,
      ts.transpileModule(source, options).outputText,
    );
  }
  const source = readFileSync("lib/server.ts", "utf8")
    .replace(
      /import\s*\{\s*database\s*\}\s*from\s*['"]\.\/database['"];?/,
      "const database=()=>globalThis.__testDb;",
    )
    .replace(/from\s*['"]\.\/rules['"]/, "from './rules.mjs'")
    .replace(/from\s*['"]\.\/time['"]/, "from './time.mjs'")
    .replace(/from\s*['"]\.\/social['"]/, "from './social.mjs'")
    .replace(
      /from\s*['"]\.\/identity-policy['"]/,
      "from './identity-policy.mjs'",
    );
  writeFileSync(
    ".test-runtime/tests/server.mjs",
    ts.transpileModule(source, options).outputText,
  );
  server = await import("../.test-runtime/tests/server.mjs");
  social = await import("../.test-runtime/tests/social.mjs");
  ({ SOCIAL_PLACEHOLDERS: socialPlaceholders } = await import(
    "../.test-runtime/tests/social-seed.mjs"
  ));
  ({
    APPEARANCE_DEFAULTS,
    SOCIAL_DEFAULTS,
    tierProgress,
    initialStreak,
    advanceStreak,
    validateCosmetic,
    validateAppearance,
  } = await import("../.test-runtime/tests/progression.mjs"));
  const uiSource = readFileSync("app/social-ui.tsx", "utf8").replace(
    'from "../lib/progression"',
    'from "./progression.mjs"',
  );
  writeFileSync(
    ".test-runtime/tests/social-ui.mjs",
    ts.transpileModule(uiSource, {
      compilerOptions: { ...options.compilerOptions, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
  );
  socialUI = await import("../.test-runtime/tests/social-ui.mjs");
});
function bind(raw) {
  globalThis.__testDb = new Adapter(raw);
  return raw;
}
test("Unicode-aware words and whitespace match the documented policy", () => {
  assert.equal(words("  hello\nworld   "), 2);
  assert.equal(words("don’t re-enter café 你好 🔥"), 4);
  assert.equal(words("🔥 ✨"), 0);
  assert.equal(words("one-two"), 1);
});
test("positive multiplication leaves all negative points intact", () => {
  assert.deepEqual(
    transform([2, 1, 3, 5], [3, 2, 1, -1], {
      type: "positive_multiplier",
      parameter: 2,
    }),
    {
      raw: 6,
      positive: 11,
      negative: -5,
      shield: 0,
      boost: 11,
      bonus: 11,
      score: 17,
      counts: [2, 1, 3, 5],
    },
  );
  assert.equal(
    transform([0, 0, 0, 4], DEFAULTS.votePoints, {
      type: "positive_multiplier",
      parameter: 2,
    }).score,
    -4,
  );
});
test("PR Team negates only the permitted downvote amount", () => {
  assert.equal(
    transform([0, 0, 0, 4], DEFAULTS.votePoints, {
      type: "downvote_shield",
      parameter: 1,
    }).score,
    -3,
  );
  assert.equal(
    transform([1, 0, 0, 0], DEFAULTS.votePoints, {
      type: "downvote_shield",
      parameter: 1,
    }).bonus,
    0,
  );
});
test("follower table is exclusive, small rounds unranked, last priority", () => {
  assert.equal(followers(1, 4, DEFAULTS), 0);
  assert.equal(followers(1, 5, DEFAULTS), 100);
  assert.equal(followers(4, 100, DEFAULTS), 25);
  assert.equal(followers(20, 100, DEFAULTS), 15);
  assert.equal(followers(5, 5, DEFAULTS), 0);
});
test("purchases preserve conservation and retries cannot double spend", async () => {
  const raw = bind(fresh());
  grant(raw, "alice", 100);
  await server.mutate(
    "purchase",
    { revision: 1, itemId: "word", key: "a" },
    { id: "alice" },
  );
  await server.mutate(
    "purchase",
    { revision: 1, itemId: "word", key: "a" },
    { id: "alice" },
  );
  assert.equal(
    raw.prepare("SELECT balance FROM wallets WHERE user_id='alice'").get()
      .balance,
    20,
  );
  assert.equal(raw.prepare("SELECT quantity FROM inventory").get().quantity, 1);
  assert.equal(
    raw
      .prepare("SELECT SUM(amount) AS total FROM ledger WHERE user_id='alice'")
      .get().total,
    20,
  );
  await assert.rejects(
    server.mutate(
      "purchase",
      { revision: 1, itemId: "word", key: "b" },
      { id: "alice" },
    ),
    /insufficient/i,
  );
  assert.equal(raw.prepare("SELECT count(*) AS n FROM purchases").get().n, 1);
  assert.throws(() => raw.exec("UPDATE ledger SET amount=999"), /immutable/);
});
test("real concurrent database purchases cannot overdraw", async () => {
  const path = resolve(".test-runtime/tests/concurrency.sqlite");
  try {
    unlinkSync(path);
  } catch {}
  const raw = fresh(path);
  grant(raw, "alice", 100);
  raw.close();
  const gate = new SharedArrayBuffer(4);
  const workers = [0, 1].map(
    (n) =>
      new Worker(
        `const {workerData,parentPort}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(workerData.path);db.exec('PRAGMA busy_timeout=5000;');Atomics.wait(new Int32Array(workerData.gate),0,0);try{db.prepare('INSERT INTO purchases (id,user_id,item_id,created) VALUES(?,?,?,?)').run('p'+workerData.n,'alice','word',Date.now());parentPort.postMessage(true);}catch(e){parentPort.postMessage(false);}db.close();`,
        { eval: true, workerData: { path, n, gate } },
      ),
  );
  const jobs = workers.map(
    (w) =>
      new Promise((res, rej) => {
        w.on("message", res);
        w.on("error", rej);
      }),
  );
  Atomics.store(new Int32Array(gate), 0, 1);
  Atomics.notify(new Int32Array(gate), 0, 2);
  const values = await Promise.all(jobs);
  assert.equal(values.filter(Boolean).length, 1);
  const check = new DatabaseSync(path);
  assert.equal(
    check.prepare("SELECT balance FROM wallets WHERE user_id='alice'").get()
      .balance,
    20,
  );
  assert.equal(check.prepare("SELECT count(*) AS n FROM purchases").get().n, 1);
  check.close();
});
test("activation consumes exactly once, tracks submission, snapshots parameters", async () => {
  const raw = bind(fresh());
  round(raw);
  submit(raw);
  stock(raw, "alice", "word", 2);
  const b = {
    revision: 1,
    roundId: "r",
    submissionId: "r:alice",
    itemId: "word",
  };
  await server.mutate("activate", b, { id: "alice" });
  await server.mutate("activate", b, { id: "alice" });
  assert.equal(raw.prepare("SELECT quantity FROM inventory").get().quantity, 1);
  raw.exec("UPDATE catalog SET parameter=20 WHERE id='word'");
  assert.equal(
    raw.prepare("SELECT parameter FROM effects").get().parameter,
    15,
  );
  await server.mutate(
    "submit",
    {
      roundId: "r",
      content:
        "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen",
    },
    { id: "alice" },
  );
  assert.equal(
    words(raw.prepare("SELECT content FROM submissions").get().content),
    15,
  );
  await assert.rejects(
    server.mutate("activate", { ...b, itemId: "shield" }, { id: "alice" }),
    /already used/,
  );
});
test("conflicting, unauthorized, disabled, and late activations fail", async () => {
  const raw = bind(fresh());
  round(raw);
  submit(raw);
  stock(raw, "alice", "shield");
  stock(raw, "bob", "shield");
  await assert.rejects(
    server.mutate(
      "activate",
      { revision: 1, roundId: "r", submissionId: "r:alice", itemId: "shield" },
      { id: "bob" },
    ),
    /unauthorized/,
  );
  raw.exec("UPDATE catalog SET enabled=0 WHERE id='shield'");
  await assert.rejects(
    server.mutate(
      "activate",
      { revision: 1, roundId: "r", submissionId: "r:alice", itemId: "shield" },
      { id: "alice" },
    ),
    /unavailable/,
  );
  round(raw, "closed", "VOTING");
  stock(raw, "cara", "shield");
  assert.equal(
    raw.prepare("SELECT SUM(quantity) AS n FROM inventory").get().n,
    3,
  );
});
test("submission edits have one receipt, deadlines and word limits are server-enforced", async () => {
  const raw = bind(fresh());
  round(raw);
  await server.mutate(
    "submit",
    { roundId: "r", content: "one two three" },
    { id: "alice" },
  );
  await server.mutate(
    "submit",
    { roundId: "r", content: "edited entry" },
    { id: "alice" },
  );
  assert.equal(raw.prepare("SELECT count(*) AS n FROM submissions").get().n, 1);
  assert.equal(raw.prepare("SELECT count(*) AS n FROM receipts").get().n, 1);
  await assert.rejects(
    server.mutate(
      "submit",
      {
        roundId: "r",
        content: "one two three four five six seven eight nine ten eleven",
      },
      { id: "alice" },
    ),
    /1–10/,
  );
  round(raw, "closed", "VOTING");
  await assert.rejects(
    server.mutate(
      "submit",
      { roundId: "closed", content: "hello" },
      { id: "alice" },
    ),
    /closed/,
  );
});
test("ballots allow partial edits, reject repeats and self-votes, anonymous feed is safe", async () => {
  const raw = bind(fresh());
  round(raw);
  submit(raw, "alice");
  submit(raw, "bob"); // transition fixture clock without altering a published snapshot
  raw.exec("DROP TRIGGER round_snapshot");
  raw.prepare("UPDATE rounds SET closes=?").run(Date.now() - 1000);
  await assert.rejects(
    server.mutate(
      "vote",
      { roundId: "r", choices: ["r:alice", null, null, null] },
      { id: "alice" },
    ),
    /Self-voting/,
  );
  await assert.rejects(
    server.mutate(
      "vote",
      { roundId: "r", choices: ["r:bob", "r:bob", null, null] },
      { id: "alice" },
    ),
    /repeats/,
  );
  await server.mutate(
    "vote",
    { roundId: "r", choices: ["r:bob", null, null, null] },
    { id: "alice" },
  );
  await server.mutate(
    "vote",
    { roundId: "r", choices: [null, "r:bob", null, null] },
    { id: "alice" },
  );
  assert.equal(raw.prepare("SELECT count(*) AS n FROM ballots").get().n, 1);
  assert.equal(raw.prepare("SELECT count(*) AS n FROM receipts").get().n, 1);
  const feed = await server.feed("r", "alice");
  assert.deepEqual(Object.keys(feed.entries[0]).sort(), [
    "content",
    "effect_name",
    "effect_type",
    "id",
    "parameter",
  ]);
  assert.equal(feed.entries[0].id, "r:bob");
  assert.ok(!JSON.stringify(feed).includes("user_id"));
  assert.ok(!JSON.stringify(feed).includes("voter_id"));
});
test("finalization, Brand Deal, follower awards, and reward issuance are idempotent", async () => {
  const raw = bind(fresh());
  round(raw);
  for (const u of ["alice", "bob", "cara", "dave", "erin"]) {
    submit(raw, u);
    raw
      .prepare("INSERT INTO receipts VALUES(?,?,?,?)")
      .run("receipt:" + u, u, "r", "submission");
  }
  raw
    .prepare("INSERT INTO receipts VALUES(?,?,?,?)")
    .run("receipt:alice:vote", "alice", "r", "voting");
  stock(raw, "alice", "brand");
  await server.mutate(
    "activate",
    { revision: 1, roundId: "r", submissionId: "r:alice", itemId: "brand" },
    { id: "alice" },
  );
  raw.exec("DROP TRIGGER round_snapshot");
  raw
    .prepare("UPDATE rounds SET closes=?,ends=?")
    .run(Date.now() - 2000, Date.now() - 1000);
  await server.initializeLikes();
  const r = raw.prepare("SELECT * FROM rounds").get();
  await server.finalize(r);
  await server.finalize(r);
  assert.equal(raw.prepare("SELECT count(*) AS n FROM results").get().n, 5);
  assert.equal(
    raw.prepare("SELECT followers FROM profiles WHERE id='alice'").get()
      .followers,
    100,
  );
  assert.equal(
    raw.prepare("SELECT balance FROM wallets WHERE user_id='alice'").get()
      .balance,
    190,
  );
  assert.equal(
    raw.prepare("SELECT amount FROM ledger WHERE kind='brand'").get().amount,
    45,
  );
  assert.throws(() => raw.exec("UPDATE results SET score=900"), /immutable/);
  assert.throws(() => raw.exec("UPDATE effects SET parameter=99"), /immutable/);
  raw.exec("UPDATE settings SET data='{}'");
  await server.finalize(r);
  assert.equal(
    raw.prepare("SELECT balance FROM wallets WHERE user_id='alice'").get()
      .balance,
    190,
  );
});
test("cancelled rounds settle no rewards and admin mutations reject players", async () => {
  const raw = bind(fresh());
  const r = round(raw, "cancelled", "RESULTS");
  raw.exec("UPDATE rounds SET cancelled=1");
  await server.finalize({ ...r, cancelled: 1 });
  assert.equal(raw.prepare("SELECT count(*) AS n FROM ledger").get().n, 0);
  await assert.rejects(
    server.mutate(
      "grant",
      { userId: "alice", amount: 100, note: "x" },
      { id: "bob", role: "player" },
    ),
    /Administrator/,
  );
  assert.equal(phase({ ...r, cancelled: 1 }), "CANCELLED");
});
test("stale purchase and activation confirmations fail without spending or consumption", async () => {
  const raw = bind(fresh());
  grant(raw);
  round(raw);
  submit(raw);
  stock(raw, "alice", "word");
  raw.exec("UPDATE catalog SET revision=2,cost=90 WHERE id='word'");
  await assert.rejects(
    server.mutate(
      "purchase",
      { itemId: "word", key: "stale", revision: 1 },
      { id: "alice" },
    ),
    /changed/,
  );
  await assert.rejects(
    server.mutate(
      "activate",
      { roundId: "r", submissionId: "r:alice", itemId: "word", revision: 1 },
      { id: "alice" },
    ),
    /changed/,
  );
  assert.equal(
    raw.prepare("SELECT balance FROM wallets WHERE user_id='alice'").get()
      .balance,
    400,
  );
  assert.equal(raw.prepare("SELECT quantity FROM inventory").get().quantity, 1);
  assert.equal(raw.prepare("SELECT count(*) AS n FROM activations").get().n, 0);
});
test("New York daily boundaries correctly handle both DST changes", () => {
  assert.equal(
    new Date(nyMidnight("2026-03-08")).toISOString(),
    "2026-03-08T05:00:00.000Z",
  );
  assert.equal(
    (nyMidnight("2026-03-09") - nyMidnight("2026-03-08")) / 3600000,
    23,
  );
  assert.equal(
    (nyMidnight("2026-11-02") - nyMidnight("2026-11-01")) / 3600000,
    25,
  );
  assert.equal(nextDay("2026-12-31", 1), "2027-01-01");
});
test("rate limiter rejects excess mutations atomically", () => {
  const raw = bind(fresh());
  const q = raw.prepare(
    "INSERT INTO rate_limits VALUES('alice:1',1,1) ON CONFLICT(id) DO UPDATE SET count=count+1",
  );
  for (let i = 0; i < 60; i++) q.run();
  assert.throws(() => q.run(), /request_limit/);
  assert.equal(raw.prepare("SELECT count FROM rate_limits").get().count, 60);
});
test("owner catalog, inventory, scheduling, and settings work without rewriting history", async () => {
  const raw = bind(fresh()),
    owner = { id: "owner", role: "admin" };
  await server.mutate(
    "item",
    {
      item: {
        id: "word",
        name: "Owner name",
        description: "Owner description",
        effect: "word_limit",
        parameter: 17,
        cost: 75,
        enabled: 1,
        placeholder: 0,
      },
    },
    owner,
  );
  assert.equal(
    raw.prepare("SELECT revision FROM catalog WHERE id='word'").get().revision,
    2,
  );
  await server.mutate(
    "inventory",
    { userId: "alice", itemId: "word", delta: 2 },
    owner,
  );
  await server.mutate(
    "inventory",
    { userId: "alice", itemId: "word", delta: -1 },
    owner,
  );
  assert.equal(raw.prepare("SELECT quantity FROM inventory").get().quantity, 1);
  await assert.rejects(
    server.mutate(
      "inventory",
      { userId: "alice", itemId: "word", delta: -2 },
      owner,
    ),
    /no_negative_stock/,
  );
  assert.equal(raw.prepare("SELECT quantity FROM inventory").get().quantity, 1);
  await server.mutate(
    "prompt",
    {
      id: "p",
      content: "Owner-designed prompt",
      scheduled: "2028-01-01",
      placeholder: 0,
    },
    owner,
  );
  await server.mutate(
    "publishPrompt",
    { id: "p", mode: "daily", day: "2028-01-01" },
    owner,
  );
  await server.mutate(
    "publishPrompt",
    { id: "p", mode: "daily", day: "2028-01-01" },
    owner,
  );
  assert.equal(raw.prepare("SELECT count(*) AS n FROM rounds").get().n, 1);
  await server.mutate(
    "settings",
    { rules: { ...DEFAULTS, submissionClout: 99 } },
    owner,
  );
  assert.equal(
    JSON.parse(raw.prepare("SELECT config FROM rounds").get().config)
      .submissionClout,
    10,
  );
  await server.mutate("deletePrompt", { id: "p" }, owner);
  assert.equal(
    raw.prepare("SELECT state FROM prompts").get().state,
    "archived",
  );
  assert.equal(
    raw.prepare("SELECT prompt FROM rounds").get().prompt,
    "Owner-designed prompt",
  );
});

test("existing players receive exactly one added 100-Like grant without resetting history", async () => {
  const raw = bind(fresh());
  const oldRules = { ...DEFAULTS };
  delete oldRules.startingLikes;
  raw.prepare("UPDATE settings SET data=?").run(JSON.stringify(oldRules));
  grant(raw, "alice", 37);
  round(raw);
  const config = raw.prepare("SELECT config FROM rounds").get().config;
  raw.exec(
    "UPDATE catalog SET name='Clout Partner',description='Double Clout rewards' WHERE id='brand'",
  );
  await server.initializeLikes();
  await server.initializeLikes();
  assert.equal(
    raw.prepare("SELECT balance FROM wallets WHERE user_id='alice'").get()
      .balance,
    137,
  );
  assert.equal(
    raw.prepare("SELECT balance FROM wallets WHERE user_id='bob'").get()
      .balance,
    100,
  );
  assert.equal(
    raw.prepare("SELECT count(*) AS n FROM ledger WHERE kind='starting'").get()
      .n,
    6,
  );
  assert.equal(
    raw.prepare("SELECT count(*) AS n FROM economy_updates").get().n,
    1,
  );
  assert.equal(
    raw.prepare("SELECT name FROM catalog WHERE id='brand'").get().name,
    "Likes Partner",
  );
  assert.equal(raw.prepare("SELECT config FROM rounds").get().config, config);
  assert.equal(
    JSON.parse(raw.prepare("SELECT data FROM settings").get().data)
      .startingLikes,
    100,
  );
  assert.throws(
    () =>
      raw
        .prepare(
          "INSERT INTO ledger VALUES('another-key','alice',NULL,'starting',100,'duplicate',0)",
        )
        .run(),
    /UNIQUE/,
  );
  assert.equal(
    raw.prepare("SELECT balance FROM wallets WHERE user_id='alice'").get()
      .balance,
    137,
  );
});
test("new players start with 100 Likes and repeated account setup does not mint more", async () => {
  const raw = bind(fresh());
  await server.setup({ userId: "new-player", displayName: "New player" });
  await server.setup({ userId: "new-player", displayName: "New player" });
  assert.equal(
    raw.prepare("SELECT balance FROM wallets WHERE user_id='new-player'").get()
      .balance,
    100,
  );
  assert.equal(
    raw
      .prepare(
        "SELECT count(*) AS n FROM ledger WHERE user_id='new-player' AND kind='starting'",
      )
      .get().n,
    1,
  );
  await server.mutate(
    "settings",
    { rules: { ...DEFAULTS, startingLikes: 250 } },
    { id: "owner", role: "admin" },
  );
  await server.setup({ userId: "next-player", displayName: "Next player" });
  await server.setup({ userId: "new-player", displayName: "New player" });
  assert.equal(
    raw.prepare("SELECT balance FROM wallets WHERE user_id='next-player'").get()
      .balance,
    250,
  );
  assert.equal(
    raw.prepare("SELECT balance FROM wallets WHERE user_id='new-player'").get()
      .balance,
    100,
  );
});
test("legacy currency copy is displayed as Likes without changing stored history", () => {
  assert.equal(
    currencyCopy("Earn Clout. YOUR CLOUT. round clout."),
    "Earn Likes. YOUR LIKES. round likes.",
  );
  assert.equal(currencyCopy("clout_multiplier"), "clout_multiplier");
});

test("daily Eastern windows include 23:59 and overlap next-day voting with a new prompt", () => {
  for (const day of [
    "2026-03-07",
    "2026-03-08",
    "2026-10-31",
    "2026-11-01",
    "2026-12-31",
  ]) {
    const a = { ...dailyWindow(day), cancelled: 0 };
    const b = { ...dailyWindow(nextDay(day, 1)), cancelled: 0 };
    assert.equal(a.closes, b.opens);
    assert.equal(a.ends, b.closes);
    assert.equal(phase(a, a.opens - 1), "SCHEDULED");
    assert.equal(phase(a, a.opens), "SUBMISSION");
    assert.equal(phase(a, a.closes - 1), "SUBMISSION");
    assert.equal(phase(a, a.closes), "VOTING");
    assert.equal(phase(b, a.closes), "SUBMISSION");
    assert.equal(phase(a, a.ends - 1), "VOTING");
    assert.equal(phase(a, a.ends), "RESULTS");
    assert.match(easternDate(a.opens), /00:00/);
    assert.match(easternDeadline(a.closes), /23:59/);
    assert.equal(easternDay(a.closes - 1), day);
  }
  assert.equal(
    (dailyWindow("2026-03-08").closes - dailyWindow("2026-03-08").opens) /
      3600000,
    23,
  );
  assert.equal(
    (dailyWindow("2026-11-01").closes - dailyWindow("2026-11-01").opens) /
      3600000,
    25,
  );
});

test("daily scheduling calculates deadlines on the server and reserves one Eastern date", async () => {
  const raw = bind(fresh());
  const owner = { id: "owner", role: "admin" };
  for (const id of ["p1", "p2", "p3"])
    await server.mutate(
      "prompt",
      { id, content: "Owner daily prompt " + id, placeholder: 0 },
      owner,
    );
  await server.mutate(
    "publishPrompt",
    {
      id: "p1",
      mode: "daily",
      day: "2028-03-12",
      opens: 1,
      closes: 2,
      ends: 3,
    },
    owner,
  );
  const a = raw.prepare("SELECT * FROM rounds WHERE prompt_id='p1'").get();
  assert.equal(a.opens, nyMidnight("2028-03-12"));
  assert.equal(a.closes, nyMidnight("2028-03-13"));
  assert.equal(a.ends, nyMidnight("2028-03-14"));
  assert.equal(
    raw.prepare("SELECT scheduled FROM prompts WHERE id='p1'").get().scheduled,
    "2028-03-12",
  );
  await assert.rejects(
    server.mutate(
      "publishPrompt",
      { id: "p2", mode: "daily", day: "2028-03-12" },
      owner,
    ),
    /UNIQUE/,
  );
  assert.equal(
    raw.prepare("SELECT state FROM prompts WHERE id='p2'").get().state,
    "draft",
  );
  await server.mutate(
    "publishPrompt",
    { id: "p2", mode: "daily", day: "2028-03-13" },
    owner,
  );
  const b = raw.prepare("SELECT * FROM rounds WHERE prompt_id='p2'").get();
  assert.equal(a.closes, b.opens);
  await assert.rejects(
    server.mutate("publishPrompt", { id: "p3", day: "2028-02-30" }, owner),
    /valid Eastern/,
  );
  await assert.rejects(
    server.mutate("publishPrompt", { id: "p3", day: "2020-01-01" }, owner),
    /Queue daily/,
  );
  await server.mutate("cancel", { id: a.id }, owner);
  await server.mutate("publishPrompt", { id: "p3", day: "2028-03-12" }, owner);
  assert.equal(
    raw
      .prepare(
        "SELECT count(*) AS n FROM rounds WHERE daily_date='2028-03-12' AND cancelled=0",
      )
      .get().n,
    1,
  );
});

test("a player can vote on the previous round and submit to the next round simultaneously", async () => {
  const raw = bind(fresh());
  round(raw, "yesterday");
  submit(raw, "bob", "yesterday");
  raw.exec("DROP TRIGGER round_snapshot");
  raw
    .prepare("UPDATE rounds SET closes=? WHERE id='yesterday'")
    .run(Date.now() - 1000);
  round(raw, "today");
  await server.mutate(
    "vote",
    { roundId: "yesterday", choices: ["yesterday:bob", null, null, null] },
    { id: "alice" },
  );
  await server.mutate(
    "submit",
    { roundId: "today", content: "A fresh response today." },
    { id: "alice" },
  );
  assert.equal(
    raw.prepare("SELECT round_id FROM ballots WHERE user_id='alice'").get()
      .round_id,
    "yesterday",
  );
  assert.equal(
    raw.prepare("SELECT round_id FROM submissions WHERE user_id='alice'").get()
      .round_id,
    "today",
  );
  await assert.rejects(
    server.mutate(
      "submit",
      { roundId: "yesterday", content: "Too late." },
      { id: "alice" },
    ),
    /closed/,
  );
  await assert.rejects(
    server.mutate(
      "vote",
      { roundId: "today", choices: ["yesterday:bob", null, null, null] },
      { id: "alice" },
    ),
    /closed/,
  );
});

test("boundary refresh uses server time and ignores completed or cancelled rounds", () => {
  const r = { ...dailyWindow("2028-01-01"), cancelled: 0 };
  assert.equal(nextPhaseDelay([r], r.closes - 1000), 1050);
  assert.equal(nextPhaseDelay([r], r.closes), r.ends - r.closes + 50);
  assert.equal(nextPhaseDelay([{ ...r, cancelled: 1 }], r.opens), null);
  assert.equal(nextPhaseDelay([{ ...r, finalized: r.ends }], r.opens), null);
  assert.equal(nextPhaseDelay([r], r.ends), null);
});

function midday(day) {
  return nyMidnight(day) + 12 * 3600000;
}
function fixtureActivity(raw, userId, day) {
  raw
    .prepare("INSERT OR IGNORE INTO receipts VALUES(?,?,?,'submission')")
    .run(`activity:${userId}`, userId, "r");
  raw
    .prepare(
      "INSERT OR IGNORE INTO daily_activity VALUES(?,?,'submission','r',?)",
    )
    .run(userId, day, midday(day));
}
function profilePayload(socialData, name = "A new era") {
  return {
    appearance: { ...APPEARANCE_DEFAULTS, name },
    equipped: {
      theme: "",
      frame: "",
      profile_effect: "",
      banner_pattern: "",
      title: "",
      badges: [],
    },
    revision: socialData.profileRevision,
  };
}
test("configurable tier progression handles exact thresholds, disabled tiers and a top tier", () => {
  const tiers = [
    { id: "a", threshold: 0, enabled: 1, sort_order: 0 },
    { id: "b", threshold: 100, enabled: 1, sort_order: 1 },
    { id: "c", threshold: 200, enabled: 0, sort_order: 2 },
  ];
  assert.equal(tierProgress(tiers, 50).progress, 50);
  assert.equal(tierProgress(tiers, 100).current.id, "b");
  assert.equal(tierProgress(tiers, 200).next, null);
  assert.equal(tierProgress([], 0).current, null);
});
test("only owned, enabled cosmetics equip; profile saves cannot target another player or overwrite newer edits", async () => {
  const raw = bind(fresh());
  let data = await social.socialState(server.db(), "alice", false);
  const payload = profilePayload(data);
  payload.userId = "bob";
  payload.appearance.role = "admin";
  payload.equipped.theme = "sample-theme-dusk";
  payload.equipped.frame = "sample-frame";
  payload.equipped.badges = ["sample-tier-badge"];
  await server.mutate("saveProfile", payload, { id: "alice", role: "player" });
  assert.equal(
    raw.prepare("SELECT name FROM profiles WHERE id='alice'").get().name,
    "A new era",
  );
  assert.equal(
    raw.prepare("SELECT name FROM profiles WHERE id='bob'").get().name,
    "bob",
  );
  assert.equal(
    raw.prepare("SELECT role FROM profiles WHERE id='alice'").get().role,
    "player",
  );
  await assert.rejects(
    server.mutate("saveProfile", payload, { id: "alice" }),
    /another tab/,
  );
  data = await social.socialState(server.db(), "alice", false);
  const bad = profilePayload(data);
  bad.equipped.badges = ["sample-streak-badge"];
  await assert.rejects(
    server.mutate("saveProfile", bad, { id: "alice" }),
    /own available cosmetics/,
  );
  bad.equipped.badges = [];
  bad.equipped.frame = "sample-theme-dusk";
  await assert.rejects(
    server.mutate("saveProfile", bad, { id: "alice" }),
    /matching slots/,
  );
  bad.equipped.frame = "sample-frame";
  raw.exec("UPDATE cosmetics SET enabled=0 WHERE id='sample-frame'");
  await assert.rejects(
    server.mutate("saveProfile", bad, { id: "alice" }),
    /own available/,
  );
  assert.equal(
    raw
      .prepare(
        "SELECT count(*) AS n FROM equipped_cosmetics WHERE user_id='alice'",
      )
      .get().n,
    3,
  );
  await server.mutate("saveProfile", profilePayload(data), { id: "alice" });
  assert.equal(
    raw
      .prepare(
        "SELECT count(*) AS n FROM equipped_cosmetics WHERE user_id='alice'",
      )
      .get().n,
    0,
  );
});
test("cosmetic assignment and automatic tier/participation/milestone unlocks are permanent and idempotent", async () => {
  const raw = bind(fresh());
  round(raw);
  await social.ensureSocialProfile(server.db(), "alice", midday("2026-10-19"));
  for (let n = 0; n < 7; n++)
    fixtureActivity(raw, "alice", nextDay("2026-10-19", n));
  await social.syncStreak(server.db(), "alice", midday("2026-10-25"));
  await social.unlockCosmetics(server.db(), "alice");
  await social.unlockCosmetics(server.db(), "alice");
  for (const id of [
    "sample-tier-badge",
    "sample-activity-badge",
    "sample-streak-badge",
  ])
    assert.equal(
      raw
        .prepare(
          "SELECT count(*) AS n FROM cosmetic_ownership WHERE user_id='alice' AND item_id=?",
        )
        .get(id).n,
      1,
    );
  const owner = { id: "owner", role: "admin" };
  for (let i = 0; i < 2; i++)
    await server.mutate(
      "assignCosmetic",
      { userId: "bob", itemId: "sample-streak-badge", note: "Sample event" },
      owner,
    );
  assert.equal(
    raw
      .prepare(
        "SELECT count(*) AS n FROM cosmetic_ownership WHERE user_id='bob'",
      )
      .get().n,
    1,
  );
  await assert.rejects(
    server.mutate(
      "assignCosmetic",
      { userId: "bob", itemId: "sample-frame", note: "Sneaky" },
      { id: "alice", role: "player" },
    ),
    /Administrator/,
  );
  await social.syncStreak(server.db(), "alice", midday("2026-11-10"));
  assert.equal(
    raw
      .prepare(
        "SELECT count(*) AS n FROM cosmetic_ownership WHERE user_id='alice' AND item_id='sample-streak-badge'",
      )
      .get().n,
    1,
  );
  assert.throws(
    () => raw.exec("DELETE FROM cosmetic_ownership WHERE user_id='alice'"),
    /permanent/,
  );
});
test("profile inputs and cosmetic definitions reject scripts and arbitrary styles; badge selection is capped", async () => {
  assert.throws(
    () =>
      validateAppearance({
        ...APPEARANCE_DEFAULTS,
        name: "hi",
        avatar: "javascript:alert(1)",
      }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      validateAppearance({
        ...APPEARANCE_DEFAULTS,
        name: "hi",
        accent: "red;position:fixed",
      }),
    /hex color/,
  );
  const raw = bind(fresh()),
    c = raw.prepare("SELECT * FROM cosmetics WHERE id='sample-glow'").get();
  c.params = JSON.parse(c.params);
  c.params.css = "body{display:none}";
  assert.ok(!("css" in validateCosmetic(c).params));
  assert.throws(
    () => validateCosmetic({ ...c, effect: "script" }),
    /supported cosmetic effect/,
  );
  assert.throws(
    () => validateCosmetic({ ...c, params: { ...c.params, speed: 0 } }),
    /Animation duration/,
  );
  const data = await social.socialState(server.db(), "alice", false),
    payload = profilePayload(data);
  payload.equipped.badges = ["a", "b", "c", "d"];
  await assert.rejects(
    server.mutate("saveProfile", payload, { id: "alice" }),
    /up to 3 badges/,
  );
  payload.equipped.badges = ["sample-tier-badge", "sample-tier-badge"];
  await assert.rejects(
    server.mutate("saveProfile", payload, { id: "alice" }),
    /only once/,
  );
});
test("decorated profiles appear only in finalized results, never in anonymous voting", async () => {
  const raw = bind(fresh());
  round(raw);
  submit(raw, "alice");
  submit(raw, "bob");
  const data = await social.socialState(server.db(), "bob", false),
    payload = profilePayload(data, "Decorated Bob");
  payload.appearance.bio = "A private identity signal";
  payload.equipped.frame = "sample-frame";
  await server.mutate("saveProfile", payload, { id: "bob" });
  raw.exec("DROP TRIGGER round_snapshot");
  raw.prepare("UPDATE rounds SET closes=? WHERE id='r'").run(Date.now() - 2000);
  const anonymous = await server.feed("r", "alice");
  assert.deepEqual(
    Object.keys(anonymous.entries[0]).sort(),
    ["id", "content", "effect_name", "effect_type", "parameter"].sort(),
  );
  for (const term of [
    "Decorated Bob",
    "private identity",
    "sample-frame",
    "profile",
    "user_id",
    "avatar",
    "tier",
  ])
    assert.ok(!JSON.stringify(anonymous).includes(term));
  raw.prepare("UPDATE rounds SET ends=? WHERE id='r'").run(Date.now() - 1000);
  const results = await server.feed("r", "alice");
  const bob = results.entries.find((x) => x.user_id === "bob");
  assert.equal(bob.profile.name, "Decorated Bob");
  assert.equal(bob.profile.equipped[0].id, "sample-frame");
});
test("daily streaks continue, a freeze preserves rather than increments, and an unprotected gap expires", () => {
  let s = initialStreak("2026-10-20");
  s = advanceStreak(
    s,
    new Set(["2026-10-20", "2026-10-21"]),
    "2026-10-22",
    SOCIAL_DEFAULTS,
  ).state;
  assert.equal(s.current, 2);
  assert.equal(s.longest, 2);
  assert.equal(s.freeze_balance, 1);
  let result = advanceStreak(s, new Set(), "2026-10-23", SOCIAL_DEFAULTS);
  assert.equal(result.days[0].status, "frozen");
  assert.equal(result.state.current, 2);
  assert.equal(result.state.active_days, 2);
  result = advanceStreak(
    result.state,
    new Set(["2026-10-23"]),
    "2026-10-23",
    SOCIAL_DEFAULTS,
  );
  assert.equal(result.state.current, 3);
  result = advanceStreak(
    result.state,
    new Set(),
    "2026-10-25",
    SOCIAL_DEFAULTS,
  );
  assert.equal(result.days[0].status, "missed");
  assert.equal(result.state.current, 0);
  assert.equal(result.state.longest, 3);
});
test("weekly freezes refill Monday, cap banking, and never add activity or currency", async () => {
  const raw = bind(fresh());
  round(raw);
  grant(raw, "alice", 50);
  await social.ensureSocialProfile(server.db(), "alice", midday("2026-10-25"));
  fixtureActivity(raw, "alice", "2026-10-25");
  await social.syncStreak(server.db(), "alice", midday("2026-10-25"));
  const s = await social.syncStreak(server.db(), "alice", midday("2026-10-27"));
  assert.equal(s.current, 1);
  assert.equal(s.active_days, 1);
  assert.equal(s.freeze_balance, 0);
  assert.equal(
    raw.prepare("SELECT status FROM streak_days WHERE day='2026-10-26'").get()
      .status,
    "frozen",
  );
  assert.equal(
    raw
      .prepare(
        "SELECT amount FROM freeze_grants WHERE period='week:2026-10-26'",
      )
      .get().amount,
    0,
  );
  await social.syncStreak(server.db(), "alice", midday("2026-12-28"));
  assert.equal(
    raw.prepare("SELECT MAX(freeze_balance) AS n FROM streak_state").get().n,
    1,
  );
  assert.equal(
    raw.prepare("SELECT balance FROM wallets WHERE user_id='alice'").get()
      .balance,
    50,
  );
  assert.equal(
    raw.prepare("SELECT followers FROM profiles WHERE id='alice'").get()
      .followers,
    0,
  );
});
test("a valid response and ballot and all their edits count as just one daily activity", async () => {
  const raw = bind(fresh());
  round(raw);
  round(raw, "vote", "VOTING");
  // Create someone else's eligible response in the voting fixture.
  raw.exec("DROP TRIGGER submission_insert_window");
  submit(raw, "bob", "vote");
  for (let i = 0; i < 2; i++) {
    await server.mutate(
      "submit",
      { roundId: "r", content: `Take ${i}` },
      { id: "alice" },
    );
    await server.mutate(
      "vote",
      { roundId: "vote", choices: ["vote:bob", null, null, null] },
      { id: "alice" },
    );
  }
  const result = await social.socialState(server.db(), "alice", false);
  assert.equal(
    raw
      .prepare("SELECT count(*) AS n FROM daily_activity WHERE user_id='alice'")
      .get().n,
    1,
  );
  assert.equal(result.streak.current, 1);
  assert.equal(result.streak.active_days, 1);
  await assert.rejects(
    server.mutate(
      "vote",
      { roundId: "vote", choices: [null, null, null, null] },
      { id: "cara" },
    ),
    /at least one/,
  );
  assert.equal(
    raw
      .prepare("SELECT count(*) AS n FROM daily_activity WHERE user_id='cara'")
      .get().n,
    0,
  );
});
test("automatic freezes and daily decisions remain idempotent under concurrent refreshes", async () => {
  const raw = bind(fresh());
  round(raw);
  await social.ensureSocialProfile(server.db(), "alice", midday("2026-10-20"));
  fixtureActivity(raw, "alice", "2026-10-20");
  await social.syncStreak(server.db(), "alice", midday("2026-10-20"));
  await Promise.all(
    Array.from({ length: 5 }, () =>
      social.syncStreak(server.db(), "alice", midday("2026-10-22")),
    ),
  );
  assert.equal(
    raw
      .prepare("SELECT count(*) AS n FROM streak_days WHERE status='frozen'")
      .get().n,
    1,
  );
  assert.equal(
    raw
      .prepare("SELECT freeze_balance FROM streak_state WHERE user_id='alice'")
      .get().freeze_balance,
    0,
  );
  assert.equal(
    raw.prepare("SELECT count(*) AS n FROM freeze_grants").get().n,
    1,
  );
  assert.equal(raw.prepare("SELECT count(*) AS n FROM streak_days").get().n, 2);
});
test("New York DST spring and repeated fall hours map to one activity day and calendar-based streaks", () => {
  assert.equal(easternDay(Date.parse("2026-03-08T06:59:59Z")), "2026-03-08");
  assert.equal(easternDay(Date.parse("2026-03-08T07:00:00Z")), "2026-03-08");
  assert.equal(easternDay(Date.parse("2026-11-01T05:30:00Z")), "2026-11-01");
  assert.equal(easternDay(Date.parse("2026-11-01T06:30:00Z")), "2026-11-01");
  assert.equal(easternDay(Date.parse("2026-11-02T04:59:59Z")), "2026-11-01");
  assert.equal(easternDay(Date.parse("2026-11-02T05:00:00Z")), "2026-11-02");
  for (const start of ["2026-03-07", "2026-10-31"]) {
    const dates = Array.from({ length: 3 }, (_, i) => nextDay(start, i));
    const result = advanceStreak(
      initialStreak(start),
      new Set(dates),
      dates.at(-1),
      SOCIAL_DEFAULTS,
    );
    assert.equal(result.state.current, 3);
    assert.equal(result.days.length, 3);
  }
});
test("streak settings have future effective dates and past decisions remain auditable", async () => {
  const raw = bind(fresh()),
    owner = { id: "owner", role: "admin" };
  await assert.rejects(
    server.mutate(
      "socialSettings",
      { settings: SOCIAL_DEFAULTS },
      { id: "alice", role: "player" },
    ),
    /Administrator/,
  );
  const updated = {
    ...SOCIAL_DEFAULTS,
    freezeFrequency: "monthly",
    freezesPerPeriod: 2,
    freezeBankLimit: 2,
  };
  await server.mutate("socialSettings", { settings: updated }, owner);
  const cfg = await social.socialConfiguration(server.db());
  assert.equal(cfg.current.freezeFrequency, "weekly");
  assert.equal(cfg.latest.freezeFrequency, "monthly");
  assert.equal(cfg.effectiveDay, nextDay(easternDay(), 1));
  assert.equal(
    raw.prepare("SELECT count(*) AS n FROM social_settings_versions").get().n,
    2,
  );
  assert.throws(
    () => raw.exec("UPDATE social_settings_versions SET data='{}'"),
    /immutable/,
  );
  const history = [
    { effective_day: "0001-01-01", rules: SOCIAL_DEFAULTS },
    {
      effective_day: "2026-10-23",
      rules: { ...SOCIAL_DEFAULTS, freezesPerPeriod: 0, freezeBankLimit: 0 },
    },
  ];
  const result = advanceStreak(
    initialStreak("2026-10-20"),
    new Set(["2026-10-20"]),
    "2026-10-24",
    SOCIAL_DEFAULTS,
    history,
  );
  assert.equal(
    result.days.find((x) => x.day === "2026-10-21").status,
    "frozen",
  );
  assert.equal(
    result.days.find((x) => x.day === "2026-10-21").rules.freezeBankLimit,
    1,
  );
});
test("admin tier, cosmetic, milestone and reorder controls validate and never change competition snapshots", async () => {
  const raw = bind(fresh());
  const r = round(raw),
    owner = { id: "owner", role: "admin" };
  const tier = raw
    .prepare("SELECT * FROM tiers WHERE id='sample-tier-1'")
    .get();
  for (const action of ["tier", "cosmetic", "reorderTiers", "streakMilestone"])
    await assert.rejects(
      server.mutate(action, {}, { id: "alice", role: "player" }),
      /Administrator/,
    );
  await server.mutate(
    "tier",
    { tier: { ...tier, name: "Owner designed", threshold: 42 } },
    owner,
  );
  const cosmetic = raw
    .prepare("SELECT * FROM cosmetics WHERE id='sample-glow'")
    .get();
  await server.mutate(
    "cosmetic",
    {
      cosmetic: {
        ...cosmetic,
        params: JSON.parse(cosmetic.params),
        name: "My effect",
        effect: "sparkle",
      },
    },
    owner,
  );
  await server.mutate(
    "streakMilestone",
    {
      milestone: {
        id: "new",
        name: "My milestone",
        description: "Cosmetic only",
        days: 5,
        cosmetic_id: "sample-glow",
        enabled: 1,
        placeholder: 0,
      },
    },
    owner,
  );
  const ids = raw
    .prepare("SELECT id FROM tiers ORDER BY sort_order")
    .all()
    .map((x) => x.id)
    .reverse();
  await server.mutate("reorderTiers", { ids }, owner);
  assert.equal(
    raw.prepare("SELECT id FROM tiers ORDER BY sort_order LIMIT 1").get().id,
    ids[0],
  );
  assert.equal(
    raw.prepare("SELECT config FROM rounds WHERE id='r'").get().config,
    r.config,
  );
  assert.equal(raw.prepare("SELECT SUM(balance) AS n FROM wallets").get().n, 0);
  assert.equal(
    raw.prepare("SELECT SUM(followers) AS n FROM profiles").get().n,
    0,
  );
  assert.equal(raw.prepare("SELECT count(*) AS n FROM audit").get().n, 4);
});
test("game state integrates private progression without leaking other players or administrative controls", async () => {
  bind(fresh());
  const state = await server.state("alice", false);
  assert.equal(state.social.profile.name, "alice");
  assert.equal(state.social.settings.freezeFrequency, "weekly");
  assert.equal(state.social.admin, null);
  assert.deepEqual(state.players, []);
  assert.equal(state.social.streak.days.length, 7);
  assert.equal(state.social.streak.current, 0);
  const profile = renderToStaticMarkup(
    createElement(socialUI.ProfilePage, {
      data: state,
      busy: false,
      act: async () => true,
    }),
  );
  const editor = renderToStaticMarkup(
    createElement(socialUI.ProfilePage, {
      data: state,
      busy: false,
      act: async () => true,
      edit: true,
    }),
  );
  assert.ok(profile.includes("Your online persona"));
  assert.ok(editor.includes("LIVE PREVIEW"));
  assert.ok(editor.includes("Save profile"));
  const owner = await server.state("owner", true);
  const admin = renderToStaticMarkup(
    createElement(socialUI.SocialAdmin, {
      data: owner,
      busy: false,
      act: async () => true,
    }),
  );
  assert.ok(admin.includes("Add tier"));
});
test("profile cards escape names and support viewer animation preferences", () => {
  const params = {
    primary: "#bba2ff",
    secondary: "#ed68bb",
    size: 3,
    speed: 6,
    opacity: 20,
  };
  const profile = {
    name: "<script>alert(1)</script>",
    followers: 0,
    appearance: { ...APPEARANCE_DEFAULTS },
    equipped: [
      { id: "test", kind: "profile_effect", effect: "sparkle", params },
    ],
    tier: { current: null },
  };
  const rendered = renderToStaticMarkup(
    createElement(socialUI.ProfileCard, { profile, allowAnimations: false }),
  );
  assert.ok(rendered.includes("&lt;script&gt;"));
  assert.ok(!rendered.includes("<script>"));
  assert.ok(rendered.includes("motion-off"));
});
