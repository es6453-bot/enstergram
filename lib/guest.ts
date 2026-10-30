import type { GameDatabase } from "./database";
import { DEFAULTS } from "./rules";
// Explicit allowlist: no drafts, ballots, live responses, account IDs or auth data.
export async function guestData(db: GameDatabase, now = Date.now()) {
  const rounds = (
    await db
      .prepare(
        "SELECT id,number,prompt,opens,closes,ends,finalized,config FROM rounds WHERE cancelled=0 AND opens<=? ORDER BY opens DESC LIMIT 40",
      )
      .bind(now)
      .all()
  ).results;
  const setting = await db
    .prepare("SELECT data FROM settings WHERE id=1")
    .first();
  const rules = setting ? JSON.parse(setting.data) : DEFAULTS;
  const current = rounds.find((r) => r.opens <= now && r.closes > now);
  const completed = rounds.filter((r) => r.finalized && r.ends <= now);
  const results = [];
  for (const round of completed) {
    const entries = (
      await db
        .prepare(
        `SELECT s.content,p.name,r.rank,r.raw,r.bonus,r.score,r.followers,r.breakdown,e.name AS effect_name
      FROM results r JOIN submissions s ON s.id=r.submission_id JOIN profiles p ON p.id=r.user_id
      LEFT JOIN effects e ON e.submission_id=s.id WHERE r.round_id=? ORDER BY r.rank`,
        )
        .bind(round.id)
        .all()
    ).results;
    results.push({
      id: round.id,
      number: round.number,
      prompt: round.prompt,
      entries,
    });
  }
  const prompt = current || completed[0];
  return {
    current: current
      ? {
          id: current.id,
          number: current.number,
          prompt: current.prompt,
          closes: current.closes,
        }
      : null,
    practice: {
      id: prompt?.id || "free-practice",
      prompt: prompt?.prompt || null,
      limit: prompt ? JSON.parse(prompt.config).wordLimit : rules.wordLimit,
    },
    results,
  };
}
