"use client";
import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
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
  const dropdown = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const received = RESPONSE_REACTIONS.flatMap((option) => {
    const total = reactions.find((entry) => entry.reaction === option.key)?.total ?? 0;
    return total > 0 ? [{ ...option, total }] : [];
  });

  function closeDropdown() {
    if (dropdown.current) dropdown.current.open = false;
    trigger.current?.focus();
  }

  async function toggleReaction(key: string) {
    const current = reactions.find((entry) => entry.reaction === key);
    const enabled = !current?.own;
    setPending(true);
    setError("");
    try {
      await updateResponse({ action: "responseReaction", submissionId, reaction: key, enabled });
      setReactions([
        ...reactions.filter((entry) => entry.reaction !== key),
        { reaction: key, own: enabled, total: (current?.total ?? 0) + (enabled ? 1 : -1) },
      ]);
      closeDropdown();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="voting-reactions">
      {!!received.length && (
        <ul className="voting-reaction-counts" aria-label="Reactions received">
          {received.map(({ key, label, icon, total }) => (
            <li key={key} aria-label={`${label}, ${total}`}>
              <span aria-hidden="true">{icon} {total}</span>
            </li>
          ))}
        </ul>
      )}
      <details className="voting-reaction-dropdown" ref={dropdown} onKeyDown={(event) => {
        if (event.key === "Escape" && dropdown.current?.open) {
          event.preventDefault();
          closeDropdown();
        }
      }}>
        <summary className="secondary" ref={trigger} aria-label="Choose a reaction" title="Choose a reaction">
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <div className="response-engagement-options" role="group" aria-label="Choose a reaction">
          {RESPONSE_REACTIONS.map(({ key, label, icon }) => (
            <button type="button" className="secondary" key={key} disabled={pending}
              aria-label={label} title={label}
              aria-pressed={reactions.some((entry) => entry.reaction === key && entry.own)}
              onClick={() => void toggleReaction(key)}>
              <span aria-hidden="true">{icon}</span>
            </button>
          ))}
        </div>
      </details>
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
