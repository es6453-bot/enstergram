"use client";
import { useState } from "react";
import { RESPONSE_AWARDS, RESPONSE_REACTIONS, type Reaction } from "../lib/response-engagement";

async function updateResponse(body: object) {
  const response = await fetch("/api/game", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.json()).error || "Could not save your change.");
}

export function VotingReactions({ submissionId, initial }: {
  submissionId: string;
  initial: Reaction[];
}) {
  const [reactions, setReactions] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="response-engagement">
      <div className="response-engagement-options" role="group" aria-label="Reactions">
        {RESPONSE_REACTIONS.map(({ key, label, icon }) => {
          const current = reactions.find((entry) => entry.reaction === key);
          const own = current?.own ?? false;
          const total = current?.total ?? 0;
          return (
            <button type="button" className="secondary" key={key} disabled={pending}
              aria-label={label} aria-pressed={own} title={label} onClick={async () => {
                setPending(true);
                setError("");
                try {
                  await updateResponse({ action: "responseReaction", submissionId, reaction: key, enabled: !own });
                  setReactions([
                    ...reactions.filter((entry) => entry.reaction !== key),
                    { reaction: key, own: !own, total: total + (own ? -1 : 1) },
                  ]);
                } catch (cause) {
                  setError((cause as Error).message);
                } finally {
                  setPending(false);
                }
              }}>
              <span aria-hidden="true">{icon}</span>{total > 0 && <span aria-label={`${total} reactions`}>{total}</span>}
            </button>
          );
        })}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function ResponseAwards({ submissionId, initial, canManage = false }: {
  submissionId?: string;
  initial: string[];
  canManage?: boolean;
}) {
  const [awards, setAwards] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const earned = RESPONSE_AWARDS.filter(({ key }) => awards.includes(key));
  if (!earned.length && !canManage) return null;
  return (
    <div className="response-engagement">
      {!!earned.length && (
        <ul className="response-engagement-options" aria-label="Response awards">
          {earned.map(({ key, label, icon }) => (
            <li className="effect-badge" key={key}><span aria-hidden="true">{icon}</span> {label}</li>
          ))}
        </ul>
      )}
      {canManage && submissionId && (
        <details>
          <summary>Manage response awards</summary>
          <div className="response-engagement-options" role="group" aria-label="Admin awards">
            {RESPONSE_AWARDS.map(({ key, label, icon }) => (
              <label className="checkbox" key={key}>
                <input type="checkbox" disabled={pending} checked={awards.includes(key)} onChange={async (event) => {
                  const enabled = event.target.checked;
                  setPending(true);
                  setError("");
                  try {
                    await updateResponse({ action: "responseAward", submissionId, award: key, enabled });
                    setAwards(enabled ? [...awards, key] : awards.filter((award) => award !== key));
                  } catch (cause) {
                    setError((cause as Error).message);
                  } finally {
                    setPending(false);
                  }
                }} />
                <span aria-hidden="true">{icon}</span> {label}
              </label>
            ))}
          </div>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
