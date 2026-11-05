import { bootstrapOwner } from "../lib/access.ts";
import { adaptClient } from "../lib/database.ts";
export async function ensureOwner(client, githubId) {
  return bootstrapOwner(adaptClient(client), githubId);
}
