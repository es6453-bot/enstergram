"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Shield, UserPlus, ArrowLeft } from "lucide-react";
type Account = {
  user_id: string;
  subject?: string;
  google_subject?: string;
  name: string;
  email: string;
  username?: string;
  role?: string;
};
type AccessData = {
  staff: Account[];
  invitations: { id: string; email: string; created: number }[];
  accounts: Account[];
  audit: { action: string; payload: string; created: number }[];
};
export default function AccessManagement() {
  const [data, setData] = useState<AccessData | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""),
    [selected, setSelected] = useState(""),
    [confirm, setConfirm] = useState<Account | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/access", { cache: "no-store" }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setData(d);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/access", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const next = await r.json();
        if (!r.ok) throw new Error(next.error);
        if (!controller.signal.aborted) setData(next);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      });
    return () => controller.abort();
  }, []);
  async function act(body: object) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
      setMessage(
        d.status === "pending"
          ? "Authorization saved. It activates after Google verifies this address on the player's next sign-in. No invitation email has been sent."
          : "Administrator permissions updated.",
      );
      setEmail("");
      setSelected("");
      setConfirm(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      className="admin-main access-management"
      style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 24px" }}
    >
      <Link className="secondary" href="/admin">
        <ArrowLeft size={16} /> Creator studio
      </Link>
      <div className="eyebrow" style={{ marginTop: 32 }}>
        OWNER WORKSPACE
      </div>
      <h1>Administrator access.</h1>
      <p className="muted">
        Individual Google accounts. Permissions controlled by the Owner.
      </p>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="auth-success" role="status">
          {message}
        </p>
      )}
      <section
        className="panel editor-form"
        style={{ padding: 24, marginTop: 24 }}
      >
        <h2>
          <UserPlus size={20} /> Add an administrator
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act({ action: "invite", email });
          }}
        >
          <label className="form-label">
            Google email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
              placeholder="player@example.com"
            />
          </label>
          <p className="muted">
            Existing verified Google accounts receive Admin access. New accounts
            remain pending until a matching verified Google sign-in.
          </p>
          <button className="primary" disabled={busy || !email.trim()}>
            Authorize Admin
          </button>
        </form>
        {data && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act({ action: "grant", userId: selected });
            }}
          >
            <label className="form-label">
              Or choose a registered Google account
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                required
              >
                <option value="">Choose a player</option>
                {data.accounts
                  .filter(
                    (a) => !data.staff.some((s) => s.user_id === a.user_id),
                  )
                  .map((a) => (
                    <option key={a.user_id} value={a.user_id}>
                      {a.name} · {a.email}
                    </option>
                  ))}
              </select>
            </label>
            <button className="secondary" disabled={busy || !selected}>
              Grant Admin to selected account
            </button>
          </form>
        )}
      </section>
      <section style={{ marginTop: 32 }}>
        <h2>Authorized accounts</h2>
        {data?.staff.map((a) => (
          <article className="panel admin-row" key={a.user_id}>
            <div>
              <strong>{a.name}</strong>
              <p>{a.email}</p>
              <span className="pill">
                {a.role === "owner" ? "OWNER · PROTECTED" : "ADMIN"}
              </span>
              <details>
                <summary>Authenticated account identity</summary>
                <p>
                  Player ID: <code>{a.user_id}</code>
                </p>
                <p>
                  Google account ID: <code>{a.google_subject}</code>
                </p>
              </details>
            </div>
            {a.role === "admin" && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setConfirm(a)}
              >
                Revoke Admin
              </button>
            )}
          </article>
        ))}
      </section>
      {confirm && (
        <section className="panel" style={{ padding: 24 }} role="alert">
          <h3>Revoke access for {confirm.email}?</h3>
          <p>
            Their game account and progress stay intact. Administrative access
            ends immediately for subsequent requests.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void act({ action: "revoke", userId: confirm.user_id })
            }
          >
            Confirm revocation
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => setConfirm(null)}
          >
            Cancel
          </button>
        </section>
      )}
      <section style={{ marginTop: 32 }}>
        <h2>Pending authorizations</h2>
        {data?.invitations.length === 0 && (
          <p className="muted">No pending authorizations.</p>
        )}
        {data?.invitations.map((invite) => (
          <article className="panel admin-row" key={invite.id}>
            <div>
              <strong>{invite.email}</strong>
              <p>Waiting for verified Google sign-in.</p>
            </div>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void act({ action: "cancel", id: invite.id })}
            >
              Cancel authorization
            </button>
          </article>
        ))}
      </section>
      <div className="info-bar" style={{ marginTop: 32 }}>
        <Shield size={20} />
        <p>
          Admins manage content and moderation. They cannot grant roles or
          change Owner access. The Owner cannot be removed through this
          interface.
        </p>
      </div>
      <details className="panel" style={{ padding: 24, marginTop: 24 }}>
        <summary>Access audit history</summary>
        {data?.audit.map((a, i) => (
          <article key={i}>
            <strong>{a.action}</strong>
            <p>
              {new Date(a.created).toLocaleString("en-US", {
                timeZone: "America/New_York",
              })}{" "}
              ET
            </p>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {a.payload}
            </pre>
          </article>
        ))}
      </details>
    </main>
  );
}
