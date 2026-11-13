"use client";
import { useState } from "react";
import { MessageCircle } from "lucide-react";

type Comment = { id: number; content: string; own: boolean; canRemove: boolean };
type CommentPage = { comments: Comment[]; next: number | null };

export function ResponseComments({ submissionId }: { submissionId: string }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
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

  async function change(body: object) {
    const response = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
            if (!draft.trim() || busy) return;
            void run(async () => {
              await change({ action: "addComment", submissionId, content: draft });
              setDraft("");
              await load();
            });
          }}>
            <label className="form-label">
              Add an anonymous comment
              <textarea maxLength={1000} rows={2} value={draft} disabled={busy}
                onChange={(event) => setDraft(event.target.value)} />
            </label>
            <button className="primary" disabled={busy || !draft.trim()}>Post comment</button>
          </form>
          {error && <p role="alert">{error}</p>}
          {comments.length ? (
            <ul>
              {comments.map((comment) => (
                <li key={comment.id}>
                  <small>{comment.own ? "You" : "Anonymous"}</small>
                  <p>{comment.content}</p>
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
