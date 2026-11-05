import type { GameDatabase } from "./database";
import {
  AccessError,
  requireOwner,
  accessState,
  inviteAdmin,
  grantAdmin,
  revokeAdmin,
  cancelAdminInvitation,
} from "./access";
import { limitAuthRequest } from "./auth-store";
type Dependencies = {
  database: () => GameDatabase;
  identity: () => Promise<{ userId: string; onboarded: boolean } | null>;
};
const response = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export function accessHandlers(deps: Dependencies) {
  async function actor() {
    const identity = await deps.identity();
    if (!identity) return null;
    await requireOwner(deps.database(), identity.userId);
    if (!identity.onboarded)
      throw new AccessError("Complete account onboarding first.");
    return identity.userId;
  }
  function failure(error: unknown) {
    return response(
      {
        error:
          error instanceof Error ? error.message : "Unable to manage access.",
      },
      error instanceof AccessError ? 403 : 400,
    );
  }
  return {
    async GET() {
      try {
        const id = await actor();
        if (!id) return response({ error: "Sign in to continue." }, 401);
        return response(await accessState(deps.database(), id));
      } catch (error) {
        return failure(error);
      }
    },
    async POST(request: Request) {
      try {
        if (request.headers.get("origin") !== new URL(request.url).origin)
          return response({ error: "Invalid request origin." }, 403);
        const id = await actor();
        if (!id) return response({ error: "Sign in to continue." }, 401);
        const text = await request.text();
        if (text.length > 4000) throw new Error("Request too large.");
        const body = JSON.parse(text);
        if (!body || typeof body !== "object" || Array.isArray(body))
          throw new Error("Invalid access request.");
        if (body.role !== undefined)
          throw new AccessError(
            "This interface grants Admin permissions only. Owner permissions cannot be assigned here.",
          );
        await limitAuthRequest(deps.database(), `access:${id}`, 30, 60000);
        switch (body.action) {
          case "invite":
            return response({
              ok: true,
              ...(await inviteAdmin(deps.database(), id, body.email)),
            });
          case "grant":
            await grantAdmin(deps.database(), id, body.userId);
            break;
          case "revoke":
            await revokeAdmin(deps.database(), id, body.userId);
            break;
          case "cancel":
            if (typeof body.id !== "string")
              throw new Error("Choose an invitation.");
            await cancelAdminInvitation(deps.database(), id, body.id);
            break;
          default:
            throw new Error("Unknown access action.");
        }
        return response({ ok: true });
      } catch (error) {
        return failure(error);
      }
    },
  };
}
