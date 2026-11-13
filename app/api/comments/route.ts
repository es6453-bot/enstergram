import { getCurrentUser } from "../../../lib/current-user";
import { database } from "../../../lib/database";
import { commentPage } from "../../../lib/comments";
import { AccessError } from "../../../lib/access";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await getCurrentUser();
  if (!user?.onboarded)
    return Response.json({ error: "Sign in to view comments." }, { status: 401, headers });
  const query = new URL(request.url).searchParams;
  const id = query.get("response");
  const cursor = query.get("before");
  const before = cursor === null ? undefined : Number(cursor);
  if (!id || id.length > 100 || (before !== undefined && (!Number.isSafeInteger(before) || before < 1)))
    return Response.json({ error: "Invalid response or comment page." }, { status: 400, headers });
  try {
    const page = await commentPage(database(), user.userId, id, before);
    return page
      ? Response.json(page, { headers })
      : Response.json({ error: "This response is unavailable for comments." }, { status: 404, headers });
  } catch (error) {
    return error instanceof AccessError
      ? Response.json({ error: error.message }, { status: 403, headers })
      : Response.json({ error: "Could not load comments." }, { status: 500, headers });
  }
}
