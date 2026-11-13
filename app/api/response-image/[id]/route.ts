import { getCurrentUser } from "../../../../lib/current-user";
import { database } from "../../../../lib/database";
import { readResponseImage } from "../../../../lib/response-media";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = { "Cache-Control": "private, no-store" };
  if (id.length > 100) return new Response(null, { status: 404, headers });
  const user = await getCurrentUser();
  const media = await readResponseImage(database(), id, user?.onboarded ? user.userId : undefined);
  if (!media) return new Response(null, { status: 404, headers });
  return new Response(new Uint8Array(media.image), {
    headers: {
      ...headers,
      "Content-Type": media.mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
