import type { Adapter, AdapterUser } from "next-auth/adapters";
import type { GameDatabase, GameRow } from "./database";

export function normalizeEmail(value: string) {
  const email = value.normalize("NFKC").trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[^\s@,;<>"\\]+@[^\s@,;<>"\\]+\.[^\s@,;<>"\\]+$/.test(email)
  )
    throw new Error("Enter a valid email address.");
  return email;
}
export function normalizeUsername(value: string) {
  const name = value.trim().toLowerCase();
  if (
    !/^[a-z][a-z0-9_]{2,23}$/.test(name) ||
    ["admin", "owner", "system", "estergram", "support"].includes(name)
  )
    throw new Error(
      "Use 3–24 letters, numbers or underscores, starting with a letter.",
    );
  return name;
}
const user = (row: GameRow | null): AdapterUser | null =>
  row
    ? {
        id: row.id,
        name: row.name,
        email: row.email,
        emailVerified: row.email_verified ? new Date(row.email_verified) : null,
        image: row.image,
      }
    : null;

// The game profile remains the canonical ID. No provider tokens are retained.
export function authStore(
  db: GameDatabase,
  options: { googleEmail?: () => string | undefined } = {},
) {
  const stmt = (sql: string, ...args: (string | number | null)[]) =>
    db.prepare(sql).bind(...args);
  const getUser = async (id: string) =>
    user(await stmt("SELECT * FROM auth_users WHERE id=?", id).first());
  const adapter: Adapter = {
    async createUser(input) {
      const id = crypto.randomUUID();
      const username = `player_${id.replaceAll("-", "").slice(0, 16)}`;
      const email = input.email ? normalizeEmail(input.email) : null;
      await db.batch([
        stmt(
          "INSERT INTO profiles(id,name,role) VALUES(?,?,'player')",
          id,
          username,
        ),
        stmt(
          "INSERT INTO auth_users(id,name,email,email_verified,image) VALUES(?,?,?,?,?)",
          id,
          username,
          email,
          input.emailVerified?.getTime() ?? null,
          null,
        ),
        stmt("INSERT INTO player_handles VALUES(?,?,0)", id, username),
        ...(input.emailVerified && email
          ? [
              stmt(
                "INSERT INTO auth_identities VALUES('email',?,?,?)",
                email,
                id,
                Date.now(),
              ),
            ]
          : []),
      ]);
      return (await getUser(id))!;
    },
    getUser,
    async getUserByEmail(email) {
      return user(
        await stmt(
          "SELECT * FROM auth_users WHERE email=?",
          normalizeEmail(email),
        ).first(),
      );
    },
    async getUserByAccount({ provider, providerAccountId }) {
      return user(
        await stmt(
          "SELECT u.* FROM auth_users u JOIN auth_identities i ON i.user_id=u.id WHERE i.provider=? AND i.subject=?",
          provider,
          providerAccountId,
        ).first(),
      );
    },
    async updateUser(input) {
      // Auth.js only updates verification here. Names and IDs stay game-owned.
      if (input.email !== undefined) {
        const current = await getUser(input.id);
        if (input.email !== current?.email)
          throw new Error("Use the verified email linking flow.");
      }
      if (input.emailVerified)
        await db.batch([
          stmt(
            "UPDATE auth_users SET email_verified=? WHERE id=?",
            input.emailVerified.getTime(),
            input.id,
          ),
          stmt(
            "INSERT INTO auth_identities(provider,subject,user_id,created) SELECT 'email',email,id,? FROM auth_users WHERE id=? AND email IS NOT NULL ON CONFLICT(provider,subject) DO NOTHING",
            Date.now(),
            input.id,
          ),
        ]);
      return (await getUser(input.id))!;
    },
    async linkAccount(account) {
      if (!["github", "google"].includes(account.provider))
        throw new Error("Unsupported provider.");
      const existing = await stmt(
        "SELECT user_id FROM auth_identities WHERE provider=? AND subject=?",
        account.provider,
        account.providerAccountId,
      ).first();
      if (existing && existing.user_id !== account.userId)
        throw new Error("That sign-in belongs to another player.");
      const email =
        account.provider === "google" ? options.googleEmail?.() : undefined;
      if (email) {
        const occupied = await stmt(
          "SELECT id FROM auth_users WHERE email=? AND id<>?",
          email,
          account.userId,
        ).first();
        if (occupied)
          throw new Error(
            "That email belongs to another account. Sign in to it before linking Google.",
          );
      }
      await db.batch([
        stmt(
          "INSERT INTO auth_identities(provider,subject,user_id,created) VALUES(?,?,?,?) ON CONFLICT(provider,subject) DO UPDATE SET user_id=CASE WHEN auth_identities.user_id=excluded.user_id THEN auth_identities.user_id ELSE NULL END",
          account.provider,
          account.providerAccountId,
          account.userId,
          Date.now(),
        ),
        ...(email
          ? [
              stmt(
                "UPDATE auth_users SET email=COALESCE(email,?),email_verified=CASE WHEN email IS NULL OR email=? THEN ? ELSE email_verified END WHERE id=?",
                email,
                email,
                Date.now(),
                account.userId,
              ),
            ]
          : []),
      ]);
      return account;
    },
    async createVerificationToken(token) {
      await db.batch([
        stmt(
          "DELETE FROM auth_verification_tokens WHERE expires<?",
          Date.now(),
        ),
        stmt(
          "INSERT INTO auth_verification_tokens VALUES(?,?,?)",
          normalizeEmail(token.identifier),
          token.token,
          token.expires.getTime(),
        ),
      ]);
      return token;
    },
    async useVerificationToken({ identifier, token }) {
      const row = await stmt(
        "DELETE FROM auth_verification_tokens WHERE identifier=? AND token=? RETURNING *",
        normalizeEmail(identifier),
        token,
      ).first();
      return row && row.expires > Date.now()
        ? {
            identifier: row.identifier,
            token: row.token,
            expires: new Date(row.expires),
          }
        : null;
    },
  };
  return adapter;
}

export async function limitAuthRequest(
  db: GameDatabase,
  key: string,
  maximum = 5,
  windowMs = 3600000,
) {
  const now = Date.now();
  const row = await db
    .prepare(
      `INSERT INTO auth_rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET
    count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,
    expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING count`,
    )
    .bind(key, now + windowMs, now, now)
    .first();
  if (!row || row.count > maximum)
    throw new Error("Too many sign-in requests. Try again later.");
  await db
    .prepare("DELETE FROM auth_rate_limits WHERE expires<?")
    .bind(now)
    .run();
}

export async function chooseUsername(
  db: GameDatabase,
  userId: string,
  value: string,
) {
  const username = normalizeUsername(value);
  // A unique DB index arbitrates concurrent claims; either both updates commit or neither does.
  await db.batch([
    db
      .prepare(
        "UPDATE profiles SET name=? WHERE id=? AND EXISTS(SELECT 1 FROM player_handles WHERE user_id=? AND onboarded=0)",
      )
      .bind(username, userId, userId),
    db
      .prepare(
        "UPDATE player_handles SET username=?,onboarded=1 WHERE user_id=?",
      )
      .bind(username, userId),
  ]);
  return username;
}

export async function confirmEmailLink(
  db: GameDatabase,
  userId: string,
  hash: string,
) {
  const row = await db
    .prepare(
      "SELECT * FROM auth_link_tokens WHERE token=? AND user_id=? AND expires>?",
    )
    .bind(hash, userId, Date.now())
    .first();
  if (!row)
    throw new Error(
      "This link expired or was already used. Request a new one.",
    );
  const current = await db
    .prepare("SELECT email FROM auth_users WHERE id=?")
    .bind(userId)
    .first();
  if (!current || (current.email && current.email !== row.email))
    throw new Error(
      "This account already has a different email. Your account has not changed.",
    );
  const now = Date.now();
  const results = await db.batch([
    db
      .prepare(
        "UPDATE auth_users SET email=?,email_verified=? WHERE id=? AND EXISTS(SELECT 1 FROM auth_link_tokens WHERE token=? AND user_id=? AND expires>?)",
      )
      .bind(row.email, now, userId, hash, userId, now),
    db
      .prepare(
        "INSERT INTO auth_identities(provider,subject,user_id,created) SELECT 'email',?,?,? WHERE EXISTS(SELECT 1 FROM auth_link_tokens WHERE token=? AND user_id=? AND expires>?) ON CONFLICT(provider,subject) DO NOTHING",
      )
      .bind(row.email, userId, now, hash, userId, now),
    db
      .prepare(
        "DELETE FROM auth_link_tokens WHERE token=? AND user_id=? AND expires>? RETURNING token",
      )
      .bind(hash, userId, now),
  ]);
  const consumed = results[2] as { rows?: unknown[] };
  if (consumed.rows?.length !== 1)
    throw new Error("This link was already used.");
}
