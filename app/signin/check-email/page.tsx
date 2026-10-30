import Link from "next/link";
import AuthShell from "../../auth-shell";
export default function CheckEmail() {
  return (
    <AuthShell>
      <h1>Check your inbox.</h1>
      <p>
        Your sign-in link expires in 15 minutes and works once. You can close
        this page after opening it.
      </p>
      <p className="auth-small">
        No email? Check spam, confirm your address, or try again in a minute.
      </p>
      <Link className="secondary" href="/signin">
        Back to sign in
      </Link>
      <Link className="auth-guest" href="/guest">
        Explore while you wait →
      </Link>
    </AuthShell>
  );
}
