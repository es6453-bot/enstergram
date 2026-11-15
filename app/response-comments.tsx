"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { MAX_RESPONSE_IMAGE_BYTES, RESPONSE_IMAGE_ACCEPT } from "../lib/media-limits";

type Comment = { id: number; content: string; own: boolean; canRemove: boolean; hasImage?: boolean };
type CommentPage = { comments: Comment[]; next: number | null };

export function ResponseComments({ submissionId }: { submissionId: string }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [attachmentVersion, setAttachmentVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load(before?: number) {
    const query = new URLSearchParams({ response: submissionId });
    if (before) query.set("before", String(before));
    const response = await fetch(`/api/comments?${query}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load comments.");
    const page: CommentPage = data;
    setComments((current) => before ? [...current, ...page.comments] : page.comments);
    setNext(page.next);
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function change(body: object | FormData) {
    const multipart = body instanceof FormData;
    const response = await fetch("/api/game", {
      method: "POST",
      headers: multipart ? undefined : { "Content-Type": "application/json" },
      body: multipart ? body : JSON.stringify(body),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Could not update comments.");
    }
  }

  return (
    <div className="response-comments">
      <button type="button" className="secondary" aria-expanded={open} disabled={busy}
        onClick={() => {
          setOpen(!open);
          if (!open) void run(() => load());
        }}>
        <MessageCircle size={16} /> Comments
      </button>
      {open && (
        <div className="comment-thread" aria-label="Response comments" aria-busy={busy}>
          <form onSubmit={(event) => {
            event.preventDefault();
            if ((!draft.trim() && !image) || busy) return;
            void run(async () => {
              if (image) {
                const form = new FormData();
                form.set("action", "addComment");
                form.set("submissionId", submissionId);
                form.set("content", draft);
                form.set("image", image);
                await change(form);
              } else {
                await change({ action: "addComment", submissionId, content: draft });
              }
              setDraft("");
              setImage(null);
              setAttachmentVersion((previous) => previous + 1);
              await load();
            });
          }}>
            <label className="form-label">
              Add an anonymous comment
              <textarea maxLength={1000} rows={2} value={draft} disabled={busy}
                onChange={(event) => setDraft(event.target.value)} />
            </label>
            <label className="form-label">
              Attach a GIF or image (up to 2 MB)
              <input key={attachmentVersion} type="file" accept={RESPONSE_IMAGE_ACCEPT} disabled={busy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file && (!file.size || file.size > MAX_RESPONSE_IMAGE_BYTES)) {
                    setError("Choose an image up to 2 MB.");
                    event.currentTarget.value = "";
                    setImage(null);
                    return;
                  }
                  setError("");
                  setImage(file ?? null);
                }} />
            </label>
            {image && <button type="button" className="secondary" disabled={busy} onClick={() => {
              setImage(null);
              setAttachmentVersion((previous) => previous + 1);
            }}>Remove attachment</button>}
            <button className="primary" disabled={busy || (!draft.trim() && !image)}>Post comment</button>
          </form>
          {error && <p role="alert">{error}</p>}
          {comments.length ? (
            <ul>
              {comments.map((comment) => (
                <li key={comment.id}>
                  <small>{comment.own ? "You" : "Anonymous"}</small>
                  {comment.content && <p>{comment.content}</p>}
                  {comment.hasImage && (
                    <img className="response-image" src={`/api/comments/${comment.id}/image`} alt="Comment attachment" loading="lazy" />
                  )}
                  {comment.canRemove && (
                    <button type="button" className="secondary" disabled={busy} onClick={() => {
                      if (!comment.own && !window.confirm("Remove this comment?")) return;
                      void run(async () => {
                        await change({ action: "removeComment", commentId: comment.id });
                        setComments((current) => current.filter((entry) => entry.id !== comment.id));
                      });
                    }}>Delete comment</button>
                  )}
                </li>
              ))}
            </ul>
          ) : !busy && !error && <p className="muted">No comments yet.</p>}
          {next !== null && (
            <button type="button" className="secondary" disabled={busy}
              onClick={() => void run(() => load(next))}>Load older comments</button>
          )}
        </div>
      )}
    </div>
  );
}
