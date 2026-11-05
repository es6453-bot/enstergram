import { getCurrentUser } from "../../../../lib/current-user";
import { database } from "../../../../lib/database";
import { accessHandlers } from "../../../../lib/access-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const { GET, POST } = accessHandlers({
  database,
  identity: getCurrentUser,
});
