import type { GameDatabase } from "./database";

export const RESPONSE_AWARDS = [
  { key: "reddit_gold", label: "Reddit Gold", icon: "🏅" },
  { key: "top_tier", label: "Top Tier", icon: "🏆" },
  { key: "skull", label: "Skull", icon: "💀" },
] as const;

export const RESPONSE_REACTIONS = [
  { key: "heart", label: "Heart", icon: "❤️" },
  { key: "thumbs_up", label: "Thumbs up", icon: "👍" },
  { key: "skull", label: "Skull", icon: "💀" },
  { key: "crying", label: "Crying", icon: "😭" },
  { key: "talking", label: "Talking", icon: "🗣️" },
] as const;

export type Reaction = { reaction: string; total: number; own: boolean };

export async function roundReactions(db: GameDatabase, roundId: string, userId: string) {
  const { results } = await db.prepare(
    `SELECT rr.submission_id,rr.reaction,COUNT(*) AS total,MAX(rr.user_id=?) AS own
     FROM response_reactions rr JOIN submissions s ON s.id=rr.submission_id
     WHERE s.round_id=? AND s.user_id<>? GROUP BY rr.submission_id,rr.reaction`,
  ).bind(userId, roundId, userId).all();
  const bySubmission = new Map<string, Reaction[]>();
  for (const row of results) {
    const list = bySubmission.get(row.submission_id) ?? [];
    list.push({ reaction: row.reaction, total: row.total, own: !!row.own });
    bySubmission.set(row.submission_id, list);
  }
  return bySubmission;
}

export async function setResponseReaction(
  db: GameDatabase, userId: string, submissionId: unknown, reaction: unknown, enabled: unknown,
) {
  if (typeof submissionId !== "string" || submissionId.length > 100 ||
      !RESPONSE_REACTIONS.some((item) => item.key === reaction) || typeof enabled !== "boolean")
    throw new Error("Choose a valid reaction.");
  const allowed = `SELECT s.id FROM submissions s JOIN rounds r ON r.id=s.round_id
    WHERE s.id=? AND s.user_id<>? AND r.cancelled=0 AND r.finalized IS NULL
    AND r.closes<=unixepoch('subsec')*1000 AND r.ends>unixepoch('subsec')*1000
    AND NOT EXISTS(SELECT 1 FROM player_suspensions WHERE user_id=?)`;
  const sql = enabled
    ? `INSERT OR IGNORE INTO response_reactions(submission_id,user_id,reaction)
       SELECT id,?,? FROM (${allowed})`
    : `DELETE FROM response_reactions WHERE user_id=? AND reaction=? AND submission_id IN (${allowed})`;
  if (!(await db.prepare(allowed).bind(submissionId, userId, userId).first()))
    throw new Error("Reactions are available on other players’ responses during voting.");
  await db.prepare(sql).bind(userId, String(reaction), submissionId, userId, userId).run();
}

export async function setResponseAward(
  db: GameDatabase, userId: string, submissionId: unknown, award: unknown, enabled: unknown,
) {
  if (typeof submissionId !== "string" || submissionId.length > 100 ||
      !RESPONSE_AWARDS.some((item) => item.key === award) || typeof enabled !== "boolean")
    throw new Error("Choose a valid award.");
  const allowed = `SELECT f.submission_id AS id FROM results f JOIN rounds r ON r.id=f.round_id
    WHERE f.submission_id=? AND r.cancelled=0 AND r.finalized IS NOT NULL
    AND r.ends<=unixepoch('subsec')*1000`;
  if (!(await db.prepare(allowed).bind(submissionId).first()))
    throw new Error("Awards are available on finalized responses.");
  const staff = "EXISTS(SELECT 1 FROM staff_roles WHERE user_id=? AND role IN ('owner','admin'))";
  if (enabled)
    await db.prepare(
      `INSERT OR IGNORE INTO response_awards(submission_id,award,granted_by,created)
       SELECT id,?,?,? FROM (${allowed}) WHERE ${staff}`,
    ).bind(String(award), userId, Date.now(), submissionId, userId).run();
  else
    await db.prepare(
      `DELETE FROM response_awards WHERE award=? AND submission_id IN (${allowed}) AND ${staff}`,
    ).bind(String(award), submissionId, userId).run();
}
