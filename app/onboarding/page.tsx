import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/current-user";
import { database } from "../../lib/database";
import { chooseUsername } from "../../lib/auth-store";
import AuthShell from "../auth-shell";
export const dynamic = "force-dynamic";
export default async function Onboarding({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  if (user.onboarded) redirect("/submit");
  const { error } = await searchParams;
  async function save(form: FormData) {
    "use server";
    const current = await getCurrentUser();
    if (!current) redirect("/signin");
    if (current.onboarded) redirect("/submit");
    try {
      await chooseUsername(
        database(),
        current.userId,
        String(form.get("username") || ""),
      );
    } catch {
      redirect("/onboarding?error=username");
    }
    redirect("/submit");
  }
  return (
    <AuthShell>
      <h1>
        What should we
        <br />
        call you?
      </h1>
      <p>Keep this username or make it yours. Everything else can wait.</p>
      <form className="auth-form" action={save}>
        <label htmlFor="username">Your username</label>
        <input
          id="username"
          name="username"
          defaultValue={user.username}
          required
          autoComplete="username"
          autoCapitalize="none"
          minLength={3}
          maxLength={24}
          pattern="[a-zA-Z][a-zA-Z0-9_]{2,23}"
        />
        <small>3–24 letters, numbers or underscores. Unique to you.</small>
        {error && (
          <p className="auth-error" role="alert">
            That username is unavailable or invalid. Try another.
          </p>
        )}
        <button className="primary">Let’s play →</button>
      </form>
      <p className="auth-small">
        You can customize your profile later. Voting stays anonymous.
      </p>
    </AuthShell>
  );
}
