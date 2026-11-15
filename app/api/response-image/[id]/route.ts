import { getCurrentUser } from "../../../../lib/current-user";
import { database } from "../../../../lib/database";
import { imageResponse, readResponseImage } from "../../../../lib/response-media";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id.length > 100) return imageResponse(null);
  const user = await getCurrentUser();
  return imageResponse(await readResponseImage(database(), id, user?.onboarded ? user.userId : undefined));
}
