import { database } from "../../lib/database";
import { guestData } from "../../lib/guest";
import { finalizeDueRounds } from "../../lib/server";
import Guest from "./practice";
export const dynamic = "force-dynamic";
export default async function Page() {
  await finalizeDueRounds();
  return <Guest data={await guestData(database())} />;
}
