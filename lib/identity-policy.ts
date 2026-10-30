export function githubSubject(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const subject = String(value);
  return /^[1-9]\d*$/.test(subject) ? subject : null;
}
export function isOwner(subject: unknown, env = process.env) {
  const normalized = githubSubject(subject);
  return !!normalized && normalized === githubSubject(env.OWNER_GITHUB_ID);
}
export function isAllowedPlayer(subject: unknown, env = process.env) {
  const normalized = githubSubject(subject);
  if (!normalized || !githubSubject(env.OWNER_GITHUB_ID)) return false;
  if (isOwner(normalized, env)) return true;
  const allowlist = (env.ALLOWED_GITHUB_IDS || "")
    .split(",")
    .map((x) => x.trim());
  return allowlist.includes("*") || allowlist.includes(normalized);
}
