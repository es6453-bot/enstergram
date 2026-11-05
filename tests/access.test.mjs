import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import ts from "typescript";
import { createClient } from "@libsql/client";
import { adaptClient } from "../lib/database.ts";
import { migrate } from "../scripts/migrations.mjs";
import {
  bootstrapOwner,
  grantAdmin,
  revokeAdmin,
  inviteAdmin,
  cancelAdminInvitation,
  recordGoogleLogin,
  roleFor,
  moderatePlayer,
  requireActive,
  accessState,
} from "../lib/access.ts";
let server, handlersFactory;
before(async () => {
  mkdirSync(".test-runtime/access", { recursive: true });
  for (const name of [
    "access",
    "auth-store",
    "access-api",
    "rules",
    "time",
    "progression",
    "social-seed",
    "social",
    "server",
  ]) {
    const source = readFileSync(`lib/${name}.ts`, "utf8")
      .replace(
        /import\s*\{\s*database\s*\}\s*from\s*["']\.\/database["'];?/,
        "const database=()=>globalThis.__roleDb;",
      )
      .replace(
        /from\s*["']\.\/(access|auth-store|rules|time|progression|social-seed|social)["']/g,
        (_, n) => `from './${n}.mjs'`,
      );
    writeFileSync(
      `.test-runtime/access/${name}.mjs`,
      ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    );
  }
  server = await import("../.test-runtime/access/server.mjs");
  handlersFactory = (await import("../.test-runtime/access/access-api.mjs"))
    .accessHandlers;
});
async function fresh() {
  const client = createClient({ url: "file::memory:" });
  await migrate(client);
  const db = adaptClient(client);
  globalThis.__roleDb = db;
  for (const [id, email] of [
    ["owner", "owner@example.com"],
    ["admin", "admin@example.com"],
    ["player", "player@example.com"],
  ]) {
    await client.batch(
      [
        { sql: "INSERT INTO profiles(id,name) VALUES(?,?)", args: [id, id] },
        {
          sql: "INSERT INTO auth_users(id,email,email_verified) VALUES(?,?,?)",
          args: [id, email, Date.now()],
        },
        {
          sql: "INSERT INTO player_handles VALUES(?,?,1)",
          args: [id, "name_" + id],
        },
        {
          sql: "INSERT INTO auth_identities VALUES('google',?,?,?)",
          args: ["google-" + id, id, Date.now()],
        },
      ],
      "write",
    );
    await recordGoogleLogin(db, id, "google-" + id, email);
  }
  await client.execute(
    "INSERT INTO auth_identities VALUES('github','123','owner',1)",
  );
  await bootstrapOwner(db, "123");
  await grantAdmin(db, "owner", "admin");
  await server.setup({ userId: "owner", displayName: "owner" });
  await server.setup({ userId: "admin", displayName: "admin" });
  await server.setup({ userId: "player", displayName: "player" });
  return { client, db };
}
const request = (body) =>
  new Request("https://game.example/api/admin/access", {
    method: "POST",
    headers: {
      origin: "https://game.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
const identity = (userId) => async () =>
  userId ? { userId, onboarded: true } : null;

test("only the configured Google-linked account can bootstrap ownership; existing ownership survives configuration changes", async () => {
  const { client, db } = await fresh();
  try {
    assert.equal(await bootstrapOwner(db, "999"), "owner");
    assert.equal(await roleFor(db, "owner"), "owner");
    assert.equal(await roleFor(db, "admin"), "admin");
    assert.equal(
      (
        await server.setup({
          userId: "player",
          githubId: "123",
          displayName: "Forged owner",
        })
      ).role,
      "player",
    );
  } finally {
    client.close();
  }
});
test("ordinary players and admins cannot grant, revoke, invite, cancel, or read owner-only account lists", async () => {
  const { client, db } = await fresh();
  try {
    for (const actor of ["player", "admin"]) {
      await assert.rejects(grantAdmin(db, actor, "player"), /Only the Owner/);
      await assert.rejects(revokeAdmin(db, actor, "admin"), /Only the Owner/);
      await assert.rejects(
        inviteAdmin(db, actor, "new@example.com"),
        /Only the Owner/,
      );
      await assert.rejects(
        cancelAdminInvitation(db, actor, "anything"),
        /Only the Owner/,
      );
      await assert.rejects(accessState(db, actor), /Only the Owner/);
    }
  } finally {
    client.close();
  }
});
test("server-side game mutations ignore forged role properties and old profile-role columns", async () => {
  const { client } = await fresh();
  try {
    await client.execute("UPDATE profiles SET role='owner' WHERE id='player'");
    for (const action of [
      "prompt",
      "deletePrompt",
      "publishPrompt",
      "item",
      "settings",
      "inventory",
      "grant",
      "cancel",
      "socialSettings",
      "tier",
      "cosmetic",
      "assignCosmetic",
      "streakMilestone",
      "moderatePlayer",
      "seed",
    ])
      await assert.rejects(
        server.mutate(
          action,
          {},
          { id: "player", role: "owner", email: "owner@example.com" },
        ),
        /Administrator access/,
      );
    const state = await server.state("player", true);
    assert.equal(state.profile.role, "player");
    assert.deepEqual(state.prompts, []);
    assert.deepEqual(state.players, []);
    assert.deepEqual(state.audit, []);
    assert.equal(state.social.admin, null);
  } finally {
    client.close();
  }
});
test("admins can manage prompts and rounds but lose access on the next request after revocation", async () => {
  const { client, db } = await fresh();
  try {
    await server.mutate(
      "prompt",
      {
        id: "admin-prompt",
        content: "An admin-created placeholder",
        placeholder: true,
      },
      { id: "admin", role: "player" },
    );
    assert.equal(
      (
        await client.execute(
          "SELECT content FROM prompts WHERE id='admin-prompt'",
        )
      ).rows[0].content,
      "An admin-created placeholder",
    );
    await server.mutate(
      "publishPrompt",
      { id: "admin-prompt", mode: "test" },
      { id: "admin" },
    );
    assert.equal(
      (
        await client.execute(
          "SELECT count(*) AS n FROM rounds WHERE prompt_id='admin-prompt'",
        )
      ).rows[0].n,
      1,
    );
    await revokeAdmin(db, "owner", "admin");
    await assert.rejects(
      server.mutate(
        "deletePrompt",
        { id: "admin-prompt" },
        { id: "admin", role: "admin" },
      ),
      /Administrator access/,
    );
    assert.equal((await server.state("admin", true)).profile.role, "player");
  } finally {
    client.close();
  }
});
test("last Owner cannot revoke themselves, be demoted, deleted, replaced, or suspended", async () => {
  const { client, db } = await fresh();
  try {
    await assert.rejects(revokeAdmin(db, "owner", "owner"), /Owner access/);
    await assert.rejects(grantAdmin(db, "owner", "owner"), /Owner access/);
    await assert.rejects(
      client.execute("DELETE FROM staff_roles WHERE user_id='owner'"),
      /last_owner_protected/,
    );
    await assert.rejects(
      client.execute(
        "UPDATE staff_roles SET role='admin' WHERE user_id='owner'",
      ),
      /last_owner_protected/,
    );
    await assert.rejects(
      client.execute(
        "UPDATE staff_roles SET role='owner' WHERE user_id='admin'",
      ),
      /owner_promotion_forbidden/,
    );
    await assert.rejects(
      client.execute(
        "DELETE FROM auth_identities WHERE provider='google' AND user_id='owner'",
      ),
      /staff_google_identity_protected/,
    );
    await assert.rejects(
      client.execute(
        "UPDATE staff_roles SET user_id='player' WHERE user_id='owner'",
      ),
      /staff_identity_immutable/,
    );
    await assert.rejects(
      moderatePlayer(db, "admin", "owner", true, "Attempted lockout"),
      /Staff accounts/,
    );
    assert.equal(await roleFor(db, "owner"), "owner");
  } finally {
    client.close();
  }
});
test("authorization binds to canonical player and Google IDs, not a later client email or username", async () => {
  const { client, db } = await fresh();
  try {
    await client.execute(
      "UPDATE profiles SET name='owner@example.com' WHERE id='player'",
    );
    assert.equal(await roleFor(db, "player"), "player");
    await recordGoogleLogin(
      db,
      "admin",
      "google-admin",
      "renamed-admin@example.com",
    );
    assert.equal(await roleFor(db, "admin"), "admin");
    await assert.rejects(
      recordGoogleLogin(db, "player", "google-admin", "admin@example.com"),
      /does not match/,
    );
  } finally {
    client.close();
  }
});
test("pending email enrollment requires matching verified Google identity and cancellation prevents activation", async () => {
  const { client, db } = await fresh();
  try {
    await inviteAdmin(db, "owner", "pending@example.com");
    await inviteAdmin(db, "owner", "pending@example.com");
    assert.equal(
      (
        await client.execute(
          "SELECT count(*) AS n FROM admin_invitations WHERE status='pending'",
        )
      ).rows[0].n,
      1,
    );
    await recordGoogleLogin(db, "player", "google-player", "other@example.com");
    assert.equal(await roleFor(db, "player"), "player");
    await recordGoogleLogin(
      db,
      "player",
      "google-player",
      "pending@example.com",
    );
    assert.equal(await roleFor(db, "player"), "admin");
    await revokeAdmin(db, "owner", "player");
    await recordGoogleLogin(
      db,
      "player",
      "google-player",
      "pending@example.com",
    );
    assert.equal(await roleFor(db, "player"), "player");
    await inviteAdmin(db, "owner", "cancel@example.com");
    const pending = (
      await client.execute(
        "SELECT id FROM admin_invitations WHERE email='cancel@example.com'",
      )
    ).rows[0];
    await cancelAdminInvitation(db, "owner", pending.id);
    await recordGoogleLogin(
      db,
      "player",
      "google-player",
      "cancel@example.com",
    );
    assert.equal(await roleFor(db, "player"), "player");
  } finally {
    client.close();
  }
});
test("moderation blocks participation and preserves economic records; admins cannot target staff", async () => {
  const { client, db } = await fresh();
  try {
    const before = (
      await client.execute("SELECT balance FROM wallets WHERE user_id='player'")
    ).rows[0].balance;
    await moderatePlayer(
      db,
      "admin",
      "player",
      true,
      "Spam in submitted content",
    );
    await assert.rejects(requireActive(db, "player"), /suspended/);
    await assert.rejects(
      server.mutate("submit", {}, { id: "player" }),
      /suspended/,
    );
    await assert.rejects(
      server.setup({ userId: "player", displayName: "player" }),
      /suspended/,
    );
    await assert.rejects(server.feed("sample-round", "player"), /suspended/);
    await assert.rejects(grantAdmin(db, "owner", "player"), /suspended/);
    await assert.rejects(
      moderatePlayer(db, "admin", "admin", true, "Self"),
      /Staff accounts/,
    );
    await moderatePlayer(db, "admin", "player", false, "Reviewed and restored");
    await requireActive(db, "player");
    assert.equal(
      (
        await client.execute(
          "SELECT balance FROM wallets WHERE user_id='player'",
        )
      ).rows[0].balance,
      before,
    );
  } finally {
    client.close();
  }
});
test("direct administrative API calls reject anonymous users, forged roles, non-owners, cross-origin requests, and owner promotion", async () => {
  const { client, db } = await fresh();
  try {
    for (const who of [null, "player", "admin"]) {
      const h = handlersFactory({
        database: () => db,
        identity: identity(who),
      });
      assert.equal((await h.GET()).status, who ? 403 : 401);
      assert.equal(
        (
          await h.POST(
            request({
              action: "grant",
              userId: "player",
              actor: "owner",
              role: "owner",
            }),
          )
        ).status,
        who ? 403 : 401,
      );
    }
    const h = handlersFactory({
      database: () => db,
      identity: identity("owner"),
    });
    assert.equal(
      (
        await h.POST(
          new Request("https://game.example/api/admin/access", {
            method: "POST",
            headers: { origin: "https://attacker.example" },
            body: "{}",
          }),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await h.POST(
          request({ action: "grant", userId: "player", role: "owner" }),
        )
      ).status,
      403,
    );
    assert.equal(
      (await h.POST(request({ action: "revoke", userId: "owner" }))).status,
      403,
    );
    assert.equal(
      (await h.POST(request({ action: "grant", userId: "player" }))).status,
      200,
    );
    assert.equal(await roleFor(db, "player"), "admin");
    assert.equal(
      (await h.POST(request({ action: "revoke", userId: "player" }))).status,
      200,
    );
    assert.equal(await roleFor(db, "player"), "player");
  } finally {
    client.close();
  }
});
test("repeated/concurrent grants do not duplicate role rows or audit entries and revocation is idempotent", async () => {
  const { client, db } = await fresh();
  try {
    await Promise.all([
      grantAdmin(db, "owner", "player"),
      grantAdmin(db, "owner", "player"),
    ]);
    assert.equal(
      (
        await client.execute(
          "SELECT count(*) AS n FROM staff_roles WHERE user_id='player'",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await client.execute(
          "SELECT count(*) AS n FROM audit WHERE action='admin_granted' AND json_extract(payload,'$.userId')='player'",
        )
      ).rows[0].n,
      1,
    );
    await revokeAdmin(db, "owner", "player");
    await revokeAdmin(db, "owner", "player");
    assert.equal(await roleFor(db, "player"), "player");
    assert.equal(
      (
        await client.execute(
          "SELECT count(*) AS n FROM audit WHERE action='admin_revoked' AND json_extract(payload,'$.userId')='player'",
        )
      ).rows[0].n,
      1,
    );
  } finally {
    client.close();
  }
});
