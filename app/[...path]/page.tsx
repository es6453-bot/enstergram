import Game from "../ui";
import { getCurrentUser } from "../../lib/current-user";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  if (!user.onboarded) redirect("/onboarding");
  return (
    <Game
      view={
        path[0] === "profile" && path[1] === "edit" ? "profile-edit" : path[0]
      }
    />
  );
}
