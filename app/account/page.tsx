import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "../../auth";
import { getCurrentUser } from "../../lib/current-user";
import { database } from "../../lib/database";
import {
  normalizeEmail,
  chooseUsername,
  limitAuthRequest,
} from "../../lib/auth-store";
import {
  googleReady,
  emailReady,
  tokenHash,
  sendSignInEmail,
} from "../../lib/email";
import AuthShell from "../auth-shell";
export const dynamic = "force-dynamic";
export default async function Account({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  if (!user.onboarded) redirect("/onboarding");
  const db = database();
  const account = await db
    .prepare("SELECT email,email_verified FROM auth_users WHERE id=?")
    .bind(user.userId)
    .first();
  const identities = (
    await db
      .prepare("SELECT provider FROM auth_identities WHERE user_id=?")
      .bind(user.userId)
      .all()
  ).results;
  const { status, error } = await searchParams;
  async function linkGoogle() {
    "use server";
    const current = await getCurrentUser();
    if (!current) redirect("/signin");
    if (!googleReady()) redirect("/account?error=setup");
    try {
      await signIn("google", { redirectTo: "/account?status=linked" });
    } catch (e) {
      if (e instanceof AuthError) redirect("/account?error=conflict");
      throw e;
    }
  }
  async function linkEmail(form: FormData) {
    "use server";
    const current = await getCurrentUser();
    if (!current) redirect("/signin");
    if (!emailReady()) redirect("/account?error=setup");
    try {
      const email = normalizeEmail(String(form.get("email") || ""));
      const db = database();
      await limitAuthRequest(db, `link:${current.userId}`);
      const occupied = await db
        .prepare("SELECT id FROM auth_users WHERE email=? AND id<>?")
        .bind(email, current.userId)
        .first();
      const own = await db
        .prepare("SELECT email FROM auth_users WHERE id=?")
        .bind(current.userId)
        .first();
      if (occupied || (own?.email && own.email !== email))
        throw new Error("conflict");
      const token = crypto.randomUUID() + crypto.randomUUID();
      await db.batch([
        db
          .prepare("DELETE FROM auth_link_tokens WHERE expires<? OR user_id=?")
          .bind(Date.now(), current.userId),
        db
          .prepare("INSERT INTO auth_link_tokens VALUES(?,?,?,?)")
          .bind(tokenHash(token), current.userId, email, Date.now() + 900000),
      ]);
      const origin = process.env.AUTH_URL;
      if (
        !origin ||
        (process.env.VERCEL && new URL(origin).protocol !== "https:")
      )
        throw new Error("setup");
      const url = new URL("/account/verify-email", origin);
      url.searchParams.set("token", token);
      await sendSignInEmail(email, url.toString(), true);
    } catch {
      redirect("/account?error=email");
    }
    redirect("/account?status=sent");
  }
  async function rename(form: FormData) {
    "use server";
    const current = await getCurrentUser();
    if (!current) redirect("/signin");
    try {
      await limitAuthRequest(database(), `username:${current.userId}`, 10);
      await chooseUsername(
        database(),
        current.userId,
        String(form.get("username") || ""),
      );
    } catch {
      redirect("/account?error=username");
    }
    redirect("/account?status=username");
  }
  return (
    <AuthShell>
      <h1>Your account.</h1>
      <p>Keep your progress. Add another way in.</p>
      {status && (
        <p role="status" className="auth-success">
          {status === "sent"
            ? "Check your inbox. Open the confirmation link in this browser within 15 minutes."
            : "Your account is up to date."}
        </p>
      )}
      {error && (
        <p role="alert" className="auth-error">
          {error === "username"
            ? "That username is unavailable or invalid."
            : error === "setup"
              ? "This option is being set up."
              : "We couldn’t complete that change. The address or sign-in may already belong to another account. Your existing account is unchanged."}
        </p>
      )}
      <div className="account-methods">
        {identities.map((i, index) => (
          <span className="pill" key={index}>
            {i.provider === "github"
              ? "GitHub"
              : i.provider === "google"
                ? "Google"
                : "Email"}{" "}
            linked ✓
          </span>
        ))}
      </div>
      {!identities.some((i) => i.provider === "google") && (
        <form action={linkGoogle}>
          <button className="auth-google" disabled={!googleReady()}>
            Link Google to this account
          </button>
        </form>
      )}
      {!account?.email_verified && (
        <form className="auth-form" action={linkEmail}>
          <label htmlFor="link-email">
            Link an email for passwordless sign-in
          </label>
          <input
            type="email"
            id="link-email"
            name="email"
            required
            autoComplete="email"
            defaultValue={account?.email || ""}
            readOnly={!!account?.email}
            disabled={!emailReady()}
          />
          <button className="secondary" disabled={!emailReady()}>
            Send confirmation link
          </button>
          {!emailReady() && <small>Email sign-in coming soon.</small>}
        </form>
      )}
      <details className="auth-email">
        <summary>
          Your username <span>@{user.username}</span>
        </summary>
        <form className="auth-form" action={rename}>
          <label htmlFor="username">Unique username</label>
          <input
            id="username"
            name="username"
            defaultValue={user.username}
            minLength={3}
            maxLength={24}
            required
            autoCapitalize="none"
            pattern="[a-zA-Z][a-zA-Z0-9_]{2,23}"
          />
          <button className="secondary">Save username</button>
        </form>
      </details>
      <p className="auth-small">
        Link new sign-in methods here before using them on the login page.
        Accounts with different email addresses cannot be automatically
        identified as the same person.
      </p>
      <Link className="primary" href="/submit">
        Back to the game →
      </Link>
    </AuthShell>
  );
}
