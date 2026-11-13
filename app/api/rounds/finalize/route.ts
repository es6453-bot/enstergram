import { createRemoteJWKSet, jwtVerify } from "jose";
import { finalizeDueRounds, nextResultsDeadline } from "../../../../lib/server";

const issuer = "https://token.actions.githubusercontent.com";
const keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`));
const repository = "es6453-bot/enstergram";
const ref = "refs/heads/main";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    return Response.json({ error: "Scheduler authentication required." }, { status: 401, headers });
  try {
    const { payload } = await jwtVerify(authorization.slice(7), keys, {
      algorithms: ["RS256"],
      issuer,
      audience: "https://estergram.vercel.app/api/rounds/finalize",
      requiredClaims: ["exp", "iat"],
      maxTokenAge: "5m",
      clockTolerance: 30,
    });
    if (
      payload.repository_id !== "1436066967" ||
      payload.ref !== ref ||
      String(payload.workflow_ref).toLowerCase() !== `${repository}/.github/workflows/finalize-rounds.yml@${ref}` ||
      !["schedule", "workflow_dispatch"].includes(String(payload.event_name))
    )
      return Response.json({ error: "Scheduler access denied." }, { status: 403, headers });
  } catch (error) {
    console.warn("Scheduler token rejected", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Invalid scheduler token." }, { status: 401, headers });
  }
  await finalizeDueRounds();
  return Response.json({ nextDeadline: await nextResultsDeadline() }, { headers });
}
