import { auth, signIn } from "../../auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const configured = !!(
    process.env.AUTH_SECRET &&
    process.env.AUTH_GITHUB_ID &&
    process.env.AUTH_GITHUB_SECRET &&
    process.env.OWNER_GITHUB_ID
  );
  if (configured && (await auth())) redirect("/shop");
  const { error } = await searchParams;
  return (
    <main className="status-page">
      <div className="eyebrow">ESTERGRAM</div>
      <h1>Your next era starts here.</h1>
      <p>
        {configured
          ? "Sign in to join the daily discourse."
          : "Sign-in is being set up. Please check back shortly."}
      </p>
      {error && (
        <p role="alert">
          Sign-in wasn’t completed. Your account may need an invitation from the
          game owner.
        </p>
      )}
      {configured && (
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/shop" });
          }}
        >
          <button className="primary">Sign in with GitHub</button>
        </form>
      )}
    </main>
  );
}
