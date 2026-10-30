import "server-only";
import { auth } from "../auth";
import { database } from "./database";
import { githubSubject, isAllowedPlayer } from "./identity-policy";
export async function getCurrentUser() {
  const session = await auth();
  const subject = githubSubject(session?.user?.id?.replace(/^github:/, ""));
  if (!subject || !isAllowedPlayer(subject)) return null;
  const linked = await database()
    .prepare(
      "SELECT user_id FROM auth_identities WHERE provider='github' AND subject=?",
    )
    .bind(subject)
    .first();
  return {
    userId: linked?.user_id || `github:${subject}`,
    githubId: subject,
    displayName: session?.user?.name || "Player",
  };
}
