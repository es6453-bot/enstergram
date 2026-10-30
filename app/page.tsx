import { getCurrentUser } from "../lib/current-user";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getCurrentUser();
  redirect(user ? (user.onboarded ? "/submit" : "/onboarding") : "/signin");
}
