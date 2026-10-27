/* eslint-disable @typescript-eslint/no-explicit-any */
import { getChatGPTUser } from "../../chatgpt-auth";
import { setup, state, mutate, feed, stmt } from "../../../lib/server";
import { currencyCopy } from "../../../lib/rules";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const identity = await getChatGPTUser();
    if (!identity)
      return Response.json({ error: "Sign in to play." }, { status: 401 });
    const user = await setup(identity);
    const url = new URL(request.url);
    return Response.json(
      url.searchParams.has("round")
        ? await feed(url.searchParams.get("round")!, user.id)
        : await state(user.id, user.role === "admin"),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Unable to load game." },
      { status: 500 },
    );
  }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin)
      return Response.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    const identity = await getChatGPTUser();
    if (!identity)
      return Response.json({ error: "Sign in to play." }, { status: 401 });
    if (Number(request.headers.get("content-length") || 0) > 16000)
      throw new Error("Request too large.");
    const user = await setup(identity);
    const bucket = Math.floor(Date.now() / 60000);
    await stmt(
      "INSERT INTO rate_limits VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET count=count+1",
      `${user.id}:${bucket}`,
      bucket,
    ).run();
    const b: any = await request.json();
    await mutate(b.action, b, user);
    return Response.json({ ok: true });
  } catch (e) {
    const message = currencyCopy(
      e instanceof Error ? e.message : "Request failed.",
    );
    if (message.includes("request_limit"))
      return Response.json(
        { error: "Too many requests. Try again in a minute." },
        { status: 429 },
      );
    return Response.json(
      {
        error:
          message.includes("rounds.daily_date") ||
          message.includes("one_daily_round")
            ? "A prompt is already scheduled for that Eastern date. Choose another date."
            : message.includes("CHECK constraint")
              ? "Insufficient Likes or inventory."
              : message.includes("UNIQUE constraint")
                ? "This action has already been completed."
                : message,
      },
      { status: 400 },
    );
  }
}
