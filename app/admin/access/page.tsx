import { getCurrentUser } from "../../../lib/current-user";
import { redirect, notFound } from "next/navigation";
import AccessManagement from "./ui";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  if (user.role !== "owner") notFound();
  if (!user.onboarded) redirect("/onboarding");
  return <AccessManagement />;
}
