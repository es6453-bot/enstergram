import { database } from "../../lib/database";
import { guestData } from "../../lib/guest";
import Guest from "./practice";
export const dynamic = "force-dynamic";
export default async function Page() {
  return <Guest data={await guestData(database())} />;
}
