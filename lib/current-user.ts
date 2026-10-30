import "server-only";
import { auth } from "../auth";
import { database } from "./database";
import { isOwner, isAllowedPlayer } from "./identity-policy";
export async function getCurrentUser() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const db = database();
  const profile = await db
    .prepare(
      "SELECT p.id,p.name,h.username,h.onboarded FROM profiles p JOIN player_handles h ON h.user_id=p.id JOIN auth_users a ON a.id=p.id WHERE p.id=?",
    )
    .bind(userId)
    .first();
  if (!profile) return null;
  const identities = (
    await db
      .prepare("SELECT provider,subject FROM auth_identities WHERE user_id=?")
      .bind(userId)
      .all()
  ).results;
  const github = identities.find((i) => i.provider === "github")?.subject;
  const account = await db
    .prepare("SELECT email_verified FROM auth_users WHERE id=?")
    .bind(userId)
    .first();
  const permanent =
    identities.some((i) => i.provider === "google") ||
    !!account?.email_verified;
  if (!permanent && (!github || !isAllowedPlayer(github))) return null;
  return {
    userId,
    githubId: github,
    displayName: profile.name,
    username: profile.username,
    onboarded: !!profile.onboarded,
    isOwner: isOwner(github),
  };
}
