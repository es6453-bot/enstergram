import { database } from "../../../lib/database";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  try {
    if (
      ![
        "AUTH_SECRET",
        "AUTH_GITHUB_ID",
        "AUTH_GITHUB_SECRET",
        "OWNER_GITHUB_ID",
      ].every((key) => process.env[key])
    )
      return Response.json(
        { ok: false, code: "setup_required" },
        { status: 503 },
      );
    const result = await database()
      .prepare("SELECT COUNT(*) AS count FROM _app_migrations")
      .first();
    if (!result || result.count < 10)
      return Response.json(
        { ok: false, code: "database_not_ready" },
        { status: 503 },
      );
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false, code: "database_unavailable" },
      { status: 503 },
    );
  }
}
