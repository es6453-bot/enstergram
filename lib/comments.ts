import type { GameDatabase, GameRow } from "./database";
import { AccessError, isStaff, requireActive, roleFor } from "./access";

export const MAX_COMMENT_LENGTH = 1000;
const PAGE_SIZE = 20;
export type Comment = { id: number; content: string; own: boolean; canRemove: boolean; hasImage?: boolean };
export type CommentPage = { comments: Comment[]; next: number | null };
const visibleResponse = (submission: "?" | "c.submission_id") => `SELECT s.id FROM submissions s JOIN rounds r ON r.id=s.round_id
  WHERE s.id=${submission} AND r.cancelled=0 AND r.closes<=? AND (
    r.ends>? OR (r.finalized IS NOT NULL AND EXISTS(
      SELECT 1 FROM results WHERE submission_id=s.id
    ))
  )`;

function paginateComments(rows: GameRow[], staff: boolean): CommentPage {
  const comments = rows.slice(0, PAGE_SIZE).map((row) => ({
    id: row.id as number,
    content: row.content as string,
    own: !!row.own,
    canRemove: staff || !!row.own,
    ...(row.mime ? { hasImage: true } : {}),
  }));
  return { comments, next: rows.length > PAGE_SIZE ? comments.at(-1)!.id : null };
}

export async function roundCommentPages(db: GameDatabase, userId: string, roundId: string) {
  const staff = isStaff(await roleFor(db, userId));
  const { results } = await db.prepare(
    `SELECT c.submission_id,c.id,c.content,c.user_id=? AS own,c.mime
     FROM submissions s JOIN response_comments c ON c.id IN (
       SELECT id FROM response_comments WHERE submission_id=s.id ORDER BY id DESC LIMIT ?
     )
     WHERE s.round_id=? ORDER BY c.id DESC`,
  ).bind(userId, PAGE_SIZE + 1, roundId).all();
  const groups = new Map<string, GameRow[]>();
  for (const row of results) {
    const group = groups.get(row.submission_id) ?? [];
    group.push(row);
    groups.set(row.submission_id, group);
  }
  return new Map([...groups].map(([id, rows]) => [id, paginateComments(rows, staff)]));
}

export async function commentPage(
  db: GameDatabase, userId: string, submissionId: string, before?: number,
) {
  await requireActive(db, userId);
  const now = Date.now();
  if (!(await db.prepare(visibleResponse("?")).bind(submissionId, now, now).first()))
    return null;
  const staff = isStaff(await roleFor(db, userId));
  const { results } = await db.prepare(
    `SELECT id,content,user_id=? AS own,mime FROM response_comments
     WHERE submission_id=? AND id<? ORDER BY id DESC LIMIT ?`,
  ).bind(userId, submissionId, before ?? Number.MAX_SAFE_INTEGER, PAGE_SIZE + 1).all();
  return paginateComments(results, staff);
}

export async function addComment(
  db: GameDatabase, userId: string, submissionId: unknown, value: unknown,
  media?: { mime: string; image: Uint8Array },
) {
  if (typeof submissionId !== "string" || !submissionId || submissionId.length > 100)
    throw new Error("Choose a response.");
  const content = typeof value === "string" ? value.trim() : "";
  if ((!content && !media) || content.length > MAX_COMMENT_LENGTH || content.includes("\0"))
    throw new Error(`Write a comment of up to ${MAX_COMMENT_LENGTH} characters.`);
  const now = Date.now();
  const saved = await db.prepare(
    `INSERT INTO response_comments(submission_id,user_id,content,mime,image)
     SELECT response.id,?,?,?,? FROM (${visibleResponse("?")}) response
     WHERE NOT EXISTS(SELECT 1 FROM player_suspensions WHERE user_id=?)`,
  ).bind(userId, content, media?.mime ?? null, media?.image ?? null, submissionId, now, now, userId).run();
  if (!saved.changes) throw new Error("This response is unavailable for comments.");
}
export async function readCommentImage(db: GameDatabase, userId: string, id: number) {
  const now = Date.now();
  return db.prepare(
    `SELECT mime,image FROM response_comments c WHERE id=? AND mime IS NOT NULL
     AND submission_id IN (${visibleResponse("c.submission_id")})
     AND NOT EXISTS(SELECT 1 FROM player_suspensions WHERE user_id=?)`,
  ).bind(id, now, now, userId).first();
}

export async function removeComment(db: GameDatabase, userId: string, id: unknown) {
  if (!Number.isSafeInteger(id) || Number(id) < 1) throw new Error("Choose a comment.");
  const result = await db.prepare(
    `DELETE FROM response_comments WHERE id=? AND (
       user_id=? OR EXISTS(SELECT 1 FROM staff_roles WHERE user_id=? AND role IN ('owner','admin'))
     )`,
  ).bind(Number(id), userId, userId).run();
  if (!result.changes) throw new AccessError("This comment could not be removed.");
}
