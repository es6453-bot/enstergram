import { getCurrentUser } from "../../../../../lib/current-user";
import { database } from "../../../../../lib/database";
import { imageResponse } from "../../../../../lib/response-media";
import { readCommentImage } from "../../../../../lib/comments";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return imageResponse(null);
  const user = await getCurrentUser();
  if (!user?.onboarded) return imageResponse(null);
  return imageResponse(await readCommentImage(database(), user.userId, id));
}
