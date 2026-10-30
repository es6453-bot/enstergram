import { signOut } from "../../auth";
import Link from "next/link";
export default function SignOut() {
  return (
    <main className="status-page">
      <h1>Taking a little offline time?</h1>
      <p>Your progress will be here when you return.</p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/signin" });
        }}
      >
        <button className="primary">Sign out</button>
      </form>
      <Link className="secondary" href="/shop">
        Back to the game
      </Link>
    </main>
  );
}
