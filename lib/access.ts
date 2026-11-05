import type { GameDatabase } from "./database";

export type Role = "owner" | "admin" | "player";
export class AccessError extends Error {
  readonly status = 403;
  constructor(message = "Administrator access is required.") {
    super(message);
    this.name = "AccessError";
  }
}
export const isStaff = (role: unknown) => role === "owner" || role === "admin";
export async function roleFor(db: GameDatabase, userId: string): Promise<Role> {
  const row = await db
    .prepare(
      "SELECT r.role FROM staff_roles r JOIN auth_identities i ON i.user_id=r.user_id AND i.provider='google' AND i.subject=r.google_subject WHERE r.user_id=?",
    )
    .bind(userId)
    .first();
  return row?.role === "owner"
    ? "owner"
    : row?.role === "admin"
      ? "admin"
      : "player";
}
export async function requireOwner(db: GameDatabase, userId: string) {
  if ((await roleFor(db, userId)) !== "owner")
    throw new AccessError("Only the Owner can manage administrator access.");
}
export async function requireStaff(db: GameDatabase, userId: string) {
  if (!isStaff(await roleFor(db, userId))) throw new AccessError();
  await requireActive(db, userId);
}
export async function requireActive(db: GameDatabase, userId: string) {
  if (
    await db
      .prepare("SELECT user_id FROM player_suspensions WHERE user_id=?")
      .bind(userId)
      .first()
  )
    throw new AccessError(
      "Your game participation is suspended. Contact the game owner.",
    );
}
const adminEmail = (value: unknown) => {
  if (typeof value !== "string")
    throw new Error("Enter the player's Google email address.");
  const email = value.normalize("NFKC").trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[^\s@,;<>"\\]+@[^\s@,;<>"\\]+\.[^\s@,;<>"\\]+$/.test(email)
  )
    throw new Error("Enter a valid Google email address.");
  return email;
};
const audit = (
  db: GameDatabase,
  actor: string,
  action: string,
  payload: object,
) =>
  db
    .prepare("INSERT INTO audit VALUES(?,?,?,?,?)")
    .bind(
      crypto.randomUUID(),
      actor,
      action,
      JSON.stringify(payload),
      Date.now(),
    );

// Called from deployment/verified Google sign-in, never from a client role claim.
// Once initialized, changing OWNER_GITHUB_ID cannot displace an existing Owner.
export async function bootstrapOwner(db: GameDatabase, githubId: string) {
  if (!/^[1-9]\d*$/.test(githubId))
    throw new Error("The bootstrap owner must have a numeric GitHub identity.");
  const owner = await db
    .prepare("SELECT user_id FROM staff_roles WHERE role='owner'")
    .first();
  if (owner) return owner.user_id as string;
  const identity = await db
    .prepare(
      `SELECT g.user_id,g.subject FROM google_accounts g JOIN auth_identities i ON i.user_id=g.user_id AND i.provider='github' WHERE i.subject=?`,
    )
    .bind(githubId)
    .first();
  if (!identity) return null;
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO staff_roles(user_id,role,google_subject,granted_by,created) SELECT ?,'owner',?,?,? WHERE NOT EXISTS(SELECT 1 FROM staff_roles WHERE role='owner')",
      )
      .bind(identity.user_id, identity.subject, identity.user_id, Date.now()),
    db
      .prepare(
        "INSERT INTO audit(id,actor,action,payload,created) SELECT ?,?,'owner_bootstrap',?,? WHERE changes()>0",
      )
      .bind(
        crypto.randomUUID(),
        identity.user_id,
        JSON.stringify({ userId: identity.user_id }),
        Date.now(),
      ),
  ]);
  return (
    ((
      await db
        .prepare("SELECT user_id FROM staff_roles WHERE role='owner'")
        .first()
    )?.user_id as string) || null
  );
}

export async function grantAdmin(
  db: GameDatabase,
  actor: string,
  userId: string,
) {
  await requireOwner(db, actor);
  if (typeof userId !== "string" || userId.length > 150)
    throw new Error("Choose a registered Google account.");
  if ((await roleFor(db, userId)) === "owner")
    throw new AccessError("Owner access cannot be changed here.");
  const google = await db
    .prepare(
      "SELECT g.subject FROM google_accounts g JOIN auth_identities i ON i.provider='google' AND i.subject=g.subject AND i.user_id=g.user_id WHERE g.user_id=?",
    )
    .bind(userId)
    .first();
  if (!google)
    throw new Error(
      "That player must sign in with Google before receiving administrator access.",
    );
  await requireActive(db, userId);
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO staff_roles(user_id,role,google_subject,granted_by,created) SELECT ?,'admin',?,?,? WHERE EXISTS(SELECT 1 FROM staff_roles WHERE user_id=? AND role='owner')",
      )
      .bind(userId, google.subject, actor, Date.now(), actor),
    db
      .prepare(
        "INSERT INTO audit(id,actor,action,payload,created) SELECT ?,?,'admin_granted',?,? WHERE changes()>0",
      )
      .bind(crypto.randomUUID(), actor, JSON.stringify({ userId }), Date.now()),
  ]);
}
export async function revokeAdmin(
  db: GameDatabase,
  actor: string,
  userId: string,
) {
  await requireOwner(db, actor);
  if (userId === actor || (await roleFor(db, userId)) === "owner")
    throw new AccessError(
      "Owner access cannot be removed. You cannot revoke your own Owner role.",
    );
  await db.batch([
    db
      .prepare(
        "DELETE FROM staff_roles WHERE user_id=? AND role='admin' AND EXISTS(SELECT 1 FROM staff_roles WHERE user_id=? AND role='owner')",
      )
      .bind(userId, actor),
    db
      .prepare(
        "INSERT INTO audit(id,actor,action,payload,created) SELECT ?,?,'admin_revoked',?,? WHERE changes()>0",
      )
      .bind(crypto.randomUUID(), actor, JSON.stringify({ userId }), Date.now()),
  ]);
}
export async function inviteAdmin(
  db: GameDatabase,
  actor: string,
  value: unknown,
) {
  await requireOwner(db, actor);
  const email = adminEmail(value);
  const registered = await db
    .prepare("SELECT user_id FROM google_accounts WHERE email=?")
    .bind(email)
    .first();
  if (registered) {
    await grantAdmin(db, actor, registered.user_id);
    return { status: "active" };
  }
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO admin_invitations(id,email,created_by,created,status) SELECT ?,?,?,?,'pending' WHERE EXISTS(SELECT 1 FROM staff_roles WHERE user_id=? AND role='owner')",
      )
      .bind(crypto.randomUUID(), email, actor, Date.now(), actor),
    db
      .prepare(
        "INSERT INTO audit(id,actor,action,payload,created) SELECT ?,?,'admin_invited',?,? WHERE changes()>0",
      )
      .bind(crypto.randomUUID(), actor, JSON.stringify({ email }), Date.now()),
  ]);
  return { status: "pending" };
}
export async function cancelAdminInvitation(
  db: GameDatabase,
  actor: string,
  id: string,
) {
  await requireOwner(db, actor);
  await db.batch([
    db
      .prepare(
        "UPDATE admin_invitations SET status='cancelled',resolved=? WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM staff_roles WHERE user_id=? AND role='owner')",
      )
      .bind(Date.now(), id, actor),
    db
      .prepare(
        "INSERT INTO audit(id,actor,action,payload,created) SELECT ?,?,'admin_invitation_cancelled',?,? WHERE changes()>0",
      )
      .bind(
        crypto.randomUUID(),
        actor,
        JSON.stringify({ invitationId: id }),
        Date.now(),
      ),
  ]);
}

// Only call after Auth.js has verified Google's OIDC response and account linking.
export async function recordGoogleLogin(
  db: GameDatabase,
  userId: string,
  subject: string,
  emailValue: string,
) {
  const email = adminEmail(emailValue);
  const identity = await db
    .prepare(
      "SELECT user_id FROM auth_identities WHERE provider='google' AND subject=?",
    )
    .bind(subject)
    .first();
  if (!identity || identity.user_id !== userId)
    throw new AccessError("Google identity does not match this account.");
  await db
    .prepare(
      "INSERT INTO google_accounts(subject,user_id,email,verified_at) VALUES(?,?,?,?) ON CONFLICT(subject) DO UPDATE SET email=excluded.email,verified_at=excluded.verified_at WHERE google_accounts.user_id=excluded.user_id",
    )
    .bind(subject, userId, email, Date.now())
    .run();
  const pending = await db
    .prepare(
      "SELECT id,created_by FROM admin_invitations WHERE email=? AND status='pending'",
    )
    .bind(email)
    .first();
  if (!pending) return;
  const eligible = `EXISTS(SELECT 1 FROM admin_invitations v JOIN staff_roles o ON o.user_id=v.created_by AND o.role='owner' WHERE v.id=? AND v.status='pending') AND NOT EXISTS(SELECT 1 FROM player_suspensions WHERE user_id=?)`;
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO staff_roles(user_id,role,google_subject,granted_by,created) SELECT ?,'admin',?,?,? WHERE ${eligible}`,
      )
      .bind(
        userId,
        subject,
        pending.created_by,
        Date.now(),
        pending.id,
        userId,
      ),
    db
      .prepare(
        "INSERT INTO audit(id,actor,action,payload,created) SELECT ?,?,'admin_invitation_accepted',?,? WHERE changes()>0",
      )
      .bind(
        crypto.randomUUID(),
        userId,
        JSON.stringify({ invitationId: pending.id, userId }),
        Date.now(),
      ),
    db
      .prepare(
        `UPDATE admin_invitations SET status='accepted',accepted_user=?,accepted_subject=?,resolved=? WHERE id=? AND ${eligible} AND EXISTS(SELECT 1 FROM staff_roles WHERE user_id=? AND google_subject=?)`,
      )
      .bind(
        userId,
        subject,
        Date.now(),
        pending.id,
        pending.id,
        userId,
        userId,
        subject,
      ),
  ]);
}
export async function accessState(db: GameDatabase, actor: string) {
  await requireOwner(db, actor);
  return {
    staff: (
      await db
        .prepare(
          "SELECT r.user_id,r.role,r.google_subject,r.created,p.name,h.username,g.email FROM staff_roles r JOIN profiles p ON p.id=r.user_id LEFT JOIN player_handles h ON h.user_id=r.user_id JOIN google_accounts g ON g.subject=r.google_subject ORDER BY r.role DESC,p.name",
        )
        .all()
    ).results,
    invitations: (
      await db
        .prepare(
          "SELECT id,email,created FROM admin_invitations WHERE status='pending' ORDER BY created DESC",
        )
        .all()
    ).results,
    accounts: (
      await db
        .prepare(
          "SELECT g.user_id,g.subject,g.email,p.name,h.username FROM google_accounts g JOIN profiles p ON p.id=g.user_id LEFT JOIN player_handles h ON h.user_id=p.id ORDER BY p.name",
        )
        .all()
    ).results,
    audit: (
      await db
        .prepare(
          "SELECT action,payload,created FROM audit WHERE action LIKE 'admin_%' OR action='owner_bootstrap' ORDER BY created DESC LIMIT 50",
        )
        .all()
    ).results,
  };
}
export async function moderatePlayer(
  db: GameDatabase,
  actor: string,
  userId: string,
  suspended: boolean,
  reason: string,
) {
  await requireStaff(db, actor);
  if (userId === actor || isStaff(await roleFor(db, userId)))
    throw new AccessError(
      "Staff accounts are protected. Only the Owner can change administrator permissions.",
    );
  if (typeof reason !== "string" || !reason.trim() || reason.length > 500)
    throw new Error("Enter a moderation reason up to 500 characters.");
  if (
    !(await db
      .prepare("SELECT id FROM profiles WHERE id=?")
      .bind(userId)
      .first())
  )
    throw new Error("Player not found.");
  await db.batch([
    suspended
      ? db
          .prepare(
            "INSERT INTO player_suspensions(user_id,reason,actor,created) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason,actor=excluded.actor,created=excluded.created",
          )
          .bind(userId, reason.trim(), actor, Date.now())
      : db
          .prepare("DELETE FROM player_suspensions WHERE user_id=?")
          .bind(userId),
    audit(db, actor, suspended ? "player_suspended" : "player_reinstated", {
      userId,
      reason: reason.trim(),
    }),
  ]);
}
