import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { adaptClient } from "../lib/database.ts";
import {
  authStore,
  chooseUsername,
  confirmEmailLink,
  normalizeEmail,
  limitAuthRequest,
} from "../lib/auth-store.ts";
import { migrate } from "../scripts/migrations.mjs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
// Load the same guest projection as production without requiring TS module resolution.
mkdirSync(".test-runtime/auth", { recursive: true });
writeFileSync(
  ".test-runtime/auth/rules.mjs",
  ts.transpileModule(readFileSync("lib/rules.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
);
writeFileSync(
  ".test-runtime/auth/guest.mjs",
  ts.transpileModule(
    readFileSync("lib/guest.ts", "utf8").replace('"./rules"', '"./rules.mjs"'),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
);
const { guestData } = await import("../.test-runtime/auth/guest.mjs");
async function fresh() {
  const client = createClient({ url: "file::memory:" });
  await migrate(client);
  const db = adaptClient(client);
  return { client, db, adapter: authStore(db) };
}
const input = (email) => ({
  email,
  emailVerified: null,
  name: "Provider Name",
});
const account = (userId, provider, providerAccountId) => ({
  userId,
  provider,
  providerAccountId,
  type: "oauth",
});
test("migration preserves existing IDs, names, balances, ledger and identity, and skips onboarding for existing players", async () => {
  const client = createClient({ url: "file::memory:" });
  try {
    for (const f of readdirSync("drizzle")
      .filter((f) => /^000[0-8]_.*\.sql$/.test(f))
      .sort())
      await client.batch(
        readFileSync("drizzle/" + f, "utf8")
          .split("--> statement-breakpoint")
          .map((s) => s.trim())
          .filter(Boolean),
        "write",
      );
    await client.batch(
      [
        "INSERT INTO profiles VALUES('legacy','Original display name','admin',0)",
        "INSERT INTO wallets VALUES('legacy',0)",
        "INSERT INTO ledger VALUES('original','legacy',NULL,'starting',110,'original grant',1)",
        "INSERT INTO auth_identities VALUES('github','123','legacy',1)",
      ],
      "write",
    );
    await client.batch(
      readFileSync("drizzle/0009_frictionless_auth.sql", "utf8")
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean),
      "write",
    );
    assert.equal(
      (
        await authStore(adaptClient(client)).getUserByAccount({
          provider: "github",
          providerAccountId: "123",
        })
      ).id,
      "legacy",
    );
    assert.equal(
      (await client.execute("SELECT name FROM profiles WHERE id='legacy'"))
        .rows[0].name,
      "Original display name",
    );
    assert.equal(
      (
        await client.execute(
          "SELECT balance FROM wallets WHERE user_id='legacy'",
        )
      ).rows[0].balance,
      110,
    );
    assert.equal(
      (
        await client.execute(
          "SELECT onboarded FROM player_handles WHERE user_id='legacy'",
        )
      ).rows[0].onboarded,
      1,
    );
    assert.equal(
      (await client.execute("SELECT COUNT(*) AS n FROM ledger")).rows[0].n,
      1,
    );
  } finally {
    client.close();
  }
});
test("new verified email profiles use generated usernames and start incomplete; case variants cannot create duplicates", async () => {
  const { client, adapter } = await fresh();
  try {
    const outcomes = await Promise.allSettled([
      adapter.createUser({
        ...input("Player@Example.com"),
        emailVerified: new Date(),
      }),
      adapter.createUser({
        ...input("player@example.com"),
        emailVerified: new Date(),
      }),
    ]);
    assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
    const user = await adapter.getUserByEmail("PLAYER@EXAMPLE.COM");
    assert.ok(user.id);
    assert.match(user.name, /^player_/);
    assert.equal(
      (await client.execute("SELECT COUNT(*) AS n FROM profiles")).rows[0].n,
      1,
    );
    assert.equal(
      (await client.execute("SELECT onboarded FROM player_handles")).rows[0]
        .onboarded,
      0,
    );
    assert.equal(
      (
        await adapter.getUserByAccount({
          provider: "email",
          providerAccountId: "player@example.com",
        })
      ).id,
      user.id,
    );
  } finally {
    client.close();
  }
});
test("linking Google preserves the profile; conflicting identities cannot move or replace existing accounts", async () => {
  const { client, adapter } = await fresh();
  try {
    const a = await adapter.createUser(input("a@example.com")),
      b = await adapter.createUser(input("b@example.com"));
    await adapter.linkAccount(account(a.id, "github", "123"));
    await adapter.linkAccount(account(a.id, "google", "google-123"));
    await adapter.linkAccount(account(a.id, "google", "google-123"));
    await assert.rejects(
      adapter.linkAccount(account(b.id, "google", "google-123")),
      /another player/,
    );
    await assert.rejects(
      adapter.linkAccount(account(a.id, "google", "different-google")),
      /UNIQUE/,
    );
    assert.equal(
      (
        await adapter.getUserByAccount({
          provider: "google",
          providerAccountId: "google-123",
        })
      ).id,
      a.id,
    );
    assert.equal(
      (
        await adapter.getUserByAccount({
          provider: "github",
          providerAccountId: "123",
        })
      ).id,
      a.id,
    );
    assert.equal(
      (await client.execute("SELECT COUNT(*) AS n FROM profiles")).rows[0].n,
      2,
    );
  } finally {
    client.close();
  }
});
test("concurrent username claims are case insensitive and roll back profile name changes on conflict", async () => {
  const { client, db, adapter } = await fresh();
  try {
    const a = await adapter.createUser(input("a@example.com")),
      b = await adapter.createUser(input("b@example.com"));
    const results = await Promise.allSettled([
      chooseUsername(db, a.id, "Cool_Player"),
      chooseUsername(db, b.id, "cool_player"),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    const rows = (
      await client.execute(
        "SELECT p.name,h.username,h.onboarded FROM profiles p JOIN player_handles h ON h.user_id=p.id",
      )
    ).rows;
    assert.equal(
      rows.filter(
        (r) =>
          r.username === "cool_player" &&
          r.name === "cool_player" &&
          r.onboarded === 1,
      ).length,
      1,
    );
    assert.equal(
      rows.filter((r) => r.name.startsWith("player_") && r.onboarded === 0)
        .length,
      1,
    );
    await assert.rejects(chooseUsername(db, a.id, "admin"), /3–24/);
  } finally {
    client.close();
  }
});
test("email sign-in tokens are consumed atomically once and expired links cannot sign in", async () => {
  const { client, adapter } = await fresh();
  try {
    await adapter.createVerificationToken({
      identifier: "a@example.com",
      token: "hashed-secret",
      expires: new Date(Date.now() + 60000),
    });
    const results = await Promise.all([
      adapter.useVerificationToken({
        identifier: "a@example.com",
        token: "hashed-secret",
      }),
      adapter.useVerificationToken({
        identifier: "a@example.com",
        token: "hashed-secret",
      }),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    await adapter.createVerificationToken({
      identifier: "a@example.com",
      token: "expired",
      expires: new Date(Date.now() - 1),
    });
    assert.equal(
      await adapter.useVerificationToken({
        identifier: "a@example.com",
        token: "expired",
      }),
      null,
    );
  } finally {
    client.close();
  }
});
test("email linking requires the matching signed-in player, expires, and cannot be replayed", async () => {
  const { client, db, adapter } = await fresh();
  try {
    const a = await adapter.createUser(input(null)),
      b = await adapter.createUser(input(null));
    await client.execute({
      sql: "INSERT INTO auth_link_tokens VALUES(?,?,?,?)",
      args: ["hash", a.id, "owner@example.com", Date.now() + 60000],
    });
    await assert.rejects(confirmEmailLink(db, b.id, "hash"), /expired/);
    assert.equal((await adapter.getUser(a.id)).email, null);
    const outcomes = await Promise.allSettled([
      confirmEmailLink(db, a.id, "hash"),
      confirmEmailLink(db, a.id, "hash"),
    ]);
    assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal((await adapter.getUserByEmail("owner@example.com")).id, a.id);
    assert.equal(
      (
        await adapter.getUserByAccount({
          provider: "email",
          providerAccountId: "owner@example.com",
        })
      ).id,
      a.id,
    );
    await client.execute({
      sql: "INSERT INTO auth_link_tokens VALUES(?,?,?,?)",
      args: ["expired", b.id, "b@example.com", Date.now() - 1],
    });
    await assert.rejects(confirmEmailLink(db, b.id, "expired"), /expired/);
  } finally {
    client.close();
  }
});
test("linking an occupied email rolls back and cannot overwrite either account", async () => {
  const { client, db, adapter } = await fresh();
  try {
    const a = await adapter.createUser(input("existing@example.com")),
      b = await adapter.createUser(input(null));
    await client.execute({
      sql: "INSERT INTO auth_link_tokens VALUES(?,?,?,?)",
      args: ["hash", b.id, "existing@example.com", Date.now() + 60000],
    });
    await assert.rejects(confirmEmailLink(db, b.id, "hash"), /UNIQUE/);
    assert.equal((await adapter.getUser(a.id)).email, "existing@example.com");
    assert.equal((await adapter.getUser(b.id)).email, null);
    assert.equal(
      (
        await client.execute(
          "SELECT COUNT(*) AS n FROM auth_link_tokens WHERE token='hash'",
        )
      ).rows[0].n,
      1,
    );
  } finally {
    client.close();
  }
});
test("verification creates an email identity on the existing Google profile; it cannot change the account address", async () => {
  const { client, adapter } = await fresh();
  try {
    const a = await adapter.createUser(input("a@example.com"));
    await adapter.linkAccount(account(a.id, "google", "google-123"));
    await adapter.updateUser({ id: a.id, emailVerified: new Date() });
    assert.equal(
      (
        await adapter.getUserByAccount({
          provider: "email",
          providerAccountId: "a@example.com",
        })
      ).id,
      a.id,
    );
    await assert.rejects(
      adapter.updateUser({ id: a.id, email: "attacker@example.com" }),
      /verified email linking/,
    );
    assert.equal(
      (await client.execute("SELECT COUNT(*) AS n FROM profiles")).rows[0].n,
      1,
    );
  } finally {
    client.close();
  }
});
test("email normalization rejects multiple recipients, control characters and parser confusion", () => {
  assert.equal(normalizeEmail(" Player@Example.com "), "player@example.com");
  for (const address of [
    "a@example.com,b@example.com",
    "a@example.com\nb@example.com",
    '"a"@example.com',
    "a＠b＠example.com",
    "bad",
    "a@example.com;",
  ])
    assert.throws(() => normalizeEmail(address));
});
test("email request limits persist in the database and reject excess parallel sends", async () => {
  const { client, db } = await fresh();
  try {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => limitAuthRequest(db, "email:hash", 3)),
    );
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 3);
    await client.execute(
      "UPDATE auth_rate_limits SET expires=0 WHERE key='email:hash'",
    );
    await limitAuthRequest(db, "email:hash", 3);
  } finally {
    client.close();
  }
});
test("guest projection hides drafts, future prompts, unfinished results, auth IDs and live submissions without writes", async () => {
  const { client, db } = await fresh();
  try {
    const cfg = JSON.stringify({ wordLimit: 12 });
    const now = Date.now();
    await client.execute({
      sql: "INSERT INTO rounds(id,number,prompt,opens,closes,ends,config) VALUES('today',1,'Public prompt',?,?,?,?)",
      args: [now - 1000, now + 1000, now + 2000, cfg],
    });
    await client.execute({
      sql: "INSERT INTO rounds(id,number,prompt,opens,closes,ends,config) VALUES('tomorrow',2,'Secret future prompt',?,?,?,?)",
      args: [now + 1000, now + 2000, now + 3000, cfg],
    });
    await client.execute(
      "INSERT INTO prompts(id,content,state) VALUES('draft','Secret draft','draft')",
    );
    await client.batch(
      [
        "INSERT INTO profiles VALUES('private-id','private name','player',0)",
        `INSERT INTO submissions VALUES('private-entry','today','private-id','Secret live response',0)`,
      ],
      "write",
    );
    const before = (await client.execute("SELECT total_changes() AS n")).rows[0]
      .n;
    const result = await guestData(db, now);
    const json = JSON.stringify(result);
    assert.equal(result.practice.limit, 12);
    assert.equal(result.current.prompt, "Public prompt");
    assert.deepEqual(result.results, []);
    for (const secret of [
      "Secret future",
      "Secret draft",
      "Secret live",
      "private-id",
      "private-entry",
      "private name",
      "email",
      "subject",
      "choices",
    ])
      assert.equal(json.includes(secret), false);
    assert.equal(
      (await client.execute("SELECT total_changes() AS n")).rows[0].n,
      before,
    );
    await client.execute({sql:"INSERT INTO rounds(id,number,prompt,opens,closes,ends,finalized,config) VALUES('completed',3,'Completed public prompt',?,?,?,?,?)",args:[now-3000,now-2000,now-1000,now-500,cfg]});
    const completed = await guestData(db,now);
    assert.equal(completed.results.length,1);
    assert.deepEqual(completed.results[0].entries,[]);
  } finally {
    client.close();
  }
});

test("Google linking claims a verified email atomically and refuses an email owned by another profile", async () => {
  const { client, db, adapter } = await fresh();
  try {
    const a = await adapter.createUser(input(null));
    const trusted = authStore(db, { googleEmail: () => "google@example.com" });
    await trusted.linkAccount(account(a.id, "google", "google-sub"));
    assert.equal((await adapter.getUserByEmail("google@example.com")).id, a.id);
    assert.ok((await adapter.getUser(a.id)).emailVerified);
    const b = await adapter.createUser(input(null));
    await assert.rejects(
      trusted.linkAccount(account(b.id, "google", "another-sub")),
      /belongs to another account/,
    );
    assert.equal(
      await adapter.getUserByAccount({
        provider: "google",
        providerAccountId: "another-sub",
      }),
      null,
    );
  } finally {
    client.close();
  }
});

test("real Auth.js passwordless flow verifies once, preserves its profile, issues secure cookies and does not create an account when sending mail", async () => {
  const require = createRequire(import.meta.url);
  const { Auth } = await import(
    pathToFileURL(
      require.resolve("@auth/core", {
        paths: [dirname(require.resolve("next-auth"))],
      }),
    ).href
  );
  const { client, adapter } = await fresh();
  try {
    const outbox = [];
    const config = {
      trustHost: true,
      secret: "test-only-secret-at-least-thirty-two-characters",
      basePath: "/api/auth",
      adapter,
      session: { strategy: "jwt" },
      providers: [
        {
          id: "email",
          type: "email",
          name: "Email",
          from: "test@example.com",
          maxAge: 900,
          normalizeIdentifier: normalizeEmail,
          sendVerificationRequest: async ({ url }) => {
            outbox.push(url);
          },
        },
      ],
      logger: {
        error(e) {
          throw e;
        },
        warn() {},
        debug() {},
      },
    };
    const csrfResponse = await Auth(
      new Request("https://game.example/api/auth/csrf"),
      config,
    );
    const csrf = (await csrfResponse.json()).csrfToken;
    const cookie = csrfResponse.headers
      .getSetCookie()
      .map((x) => x.split(";")[0])
      .join("; ");
    const request = new Request("https://game.example/api/auth/signin/email", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie },
      body: new URLSearchParams({
        csrfToken: csrf,
        email: "player@example.com",
        callbackUrl: "https://game.example/submit",
      }),
    });
    const sent = await Auth(request, config);
    assert.equal(sent.status, 302);
    assert.equal(outbox.length, 1);
    assert.equal(
      (await client.execute("SELECT count(*) AS n FROM profiles")).rows[0].n,
      0,
    );
    const tokenRows = (
      await client.execute("SELECT token FROM auth_verification_tokens")
    ).rows;
    assert.equal(tokenRows.length, 1);
    assert.equal(outbox[0].includes(tokenRows[0].token), false);
    const signed = await Auth(new Request(outbox[0]), config);
    assert.equal(signed.status, 302);
    assert.equal(new URL(signed.headers.get("location")).pathname, "/submit");
    const sessionCookie = signed.headers
      .getSetCookie()
      .find((x) => x.startsWith("__Secure-authjs.session-token="));
    assert.ok(sessionCookie);
    assert.match(sessionCookie, /HttpOnly/);
    assert.match(sessionCookie, /Secure/);
    assert.match(sessionCookie, /SameSite=Lax/);
    const user = await adapter.getUserByEmail("player@example.com");
    assert.ok(user.emailVerified);
    const replay = await Auth(new Request(outbox[0]), {
      ...config,
      logger: { error() {}, warn() {}, debug() {} },
    });
    assert.match(replay.headers.get("location"), /Verification/);
    assert.equal(
      (await client.execute("SELECT count(*) AS n FROM profiles")).rows[0].n,
      1,
    );
  } finally {
    client.close();
  }
});
