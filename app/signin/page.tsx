import Link from "next/link";
import { signIn } from "../../auth";
import { AuthError } from "next-auth";
import { getCurrentUser } from "../../lib/current-user";
import { emailReady, googleReady } from "../../lib/email";
import AuthShell from "../auth-shell";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const current = await getCurrentUser();
  if (current) redirect(current.onboarded ? "/submit" : "/onboarding");
  const { error } = await searchParams;
  async function login(provider: string, form?: FormData) {
    "use server";
    if (
      (provider === "google" && !googleReady()) ||
      (provider === "email" && !emailReady())
    )
      redirect("/signin?error=SetupRequired");
    try {
      await signIn(provider, {
        redirectTo: "/submit",
        ...(provider === "email"
          ? { email: String(form?.get("email") || "") }
          : {}),
      });
    } catch (e) {
      if (e instanceof AuthError)
        redirect(`/signin?error=${encodeURIComponent(e.type)}`);
      throw e;
    }
  }
  return (
    <AuthShell>
      <h1>
        Your next era
        <br />
        starts here.
      </h1>
      <p>One daily prompt. Ten words. A little internet fame.</p>
      {error && (
        <p className="auth-error" role="alert">
          {error === "OAuthAccountNotLinked"
            ? "This email already has an account. Sign in with your original method, then link Google in Account settings."
            : error === "SetupRequired"
              ? "This sign-in option is being set up. Try GitHub or explore as a guest."
              : "Sign-in wasn’t completed. Try again, or use your original sign-in method. GitHub accounts may need an invitation."}
        </p>
      )}
      <form action={login.bind(null, "google")}>
        <button className="auth-google" disabled={!googleReady()}>
          <span className="google-letter" aria-hidden="true">
            G
          </span>
          Continue with Google
        </button>
      </form>
      {!googleReady() && (
        <small className="auth-caption">Google sign-in coming soon</small>
      )}
      <details className="auth-email">
        <summary>
          Continue with Email <span aria-hidden="true">↗</span>
        </summary>
        {emailReady() ? (
          <form action={login.bind(null, "email")}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              name="email"
              required
              autoComplete="email"
              maxLength={254}
              placeholder="you@example.com"
            />
            <button className="primary">Send sign-in link</button>
            <small>We’ll email a secure link. No password needed.</small>
          </form>
        ) : (
          <p>Email sign-in coming soon.</p>
        )}
      </details>
      <div className="auth-divider">
        <span>or</span>
      </div>
      <Link className="auth-guest" href="/guest">
        Play as Guest <span aria-hidden="true">→</span>
      </Link>
      <form action={login.bind(null, "github")}>
        <button className="auth-github">Continue with GitHub</button>
      </form>
      <p className="auth-small">
        Already playing? Use your original sign-in to keep your progress. Your
        identity stays hidden during voting.
      </p>
    </AuthShell>
  );
}
