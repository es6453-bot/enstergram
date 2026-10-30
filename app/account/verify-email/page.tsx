import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/current-user";
import { database } from "../../../lib/database";
import { confirmEmailLink } from "../../../lib/auth-store";
import { tokenHash } from "../../../lib/email";
import AuthShell from "../../auth-shell";
export const dynamic = "force-dynamic";
export default async function Verify({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user)
    return (
      <AuthShell>
        <h1>Return to your browser.</h1>
        <p>
          Open this link in the browser where you requested it, while signed in
          to your existing account. This protects your progress.
        </p>
        <Link className="secondary" href="/signin">
          Sign in
        </Link>
      </AuthShell>
    );
  const { token } = await searchParams;
  if (!token || token.length > 100) redirect("/account?error=email");
  async function confirm() {
    "use server";
    const current = await getCurrentUser();
    if (!current) redirect("/signin");
    try {
      await confirmEmailLink(database(), current.userId, tokenHash(token!));
    } catch {
      redirect("/account?error=email");
    }
    redirect("/account?status=linked");
  }
  return (
    <AuthShell>
      <h1>
        One account.
        <br />
        Another way in.
      </h1>
      <p>
        Confirm this email for your current Estergram account. Your progress and
        existing sign-in stay with you.
      </p>
      <form action={confirm}>
        <button className="primary">Confirm email</button>
      </form>
      <Link className="auth-guest" href="/account">
        Cancel
      </Link>
    </AuthShell>
  );
}
