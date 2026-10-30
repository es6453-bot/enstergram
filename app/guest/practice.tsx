"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import Link from "next/link";
import { useState, useEffect } from "react";
import { Flame, ArrowUpRight } from "lucide-react";
import { words } from "../../lib/rules";
import { easternDeadline } from "../../lib/time";
type GuestData = Awaited<
  ReturnType<typeof import("../../lib/guest").guestData>
>;
export default function Guest({ data }: { data: GuestData }) {
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const item = JSON.parse(
        localStorage.getItem("estergram-practice") || "null",
      );
      if (item?.roundId === data.practice.id)
        setDraft(String(item.content).slice(0, 2000));
    } catch {}
    setReady(true);
  }, [data.practice.id]);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(
          "estergram-practice",
          JSON.stringify({ roundId: data.practice.id, content: draft }),
        );
      } catch {}
    }
  }, [draft, ready, data.practice.id]);
  return (
    <div className="guest-page">
      <header className="guest-header">
        <Link className="brand" href="/">
          <Flame fill="currentColor" />
          <span className="brand-name">Estergram</span>
        </Link>
        <Link className="primary" href="/signin">
          Join the game <ArrowUpRight size={16} />
        </Link>
      </header>
      <main className="guest-main">
        <div className="eyebrow">GUEST PASS · NO ACCOUNT NEEDED</div>
        <h1>
          A little taste
          <br />
          of internet fame.
        </h1>
        <p className="muted">
          Explore the game. Try a take. Sign in when you’re ready to compete.
        </p>
        <div className="guest-columns">
          <section className="panel">
            <span className="pill">
              {data.current
                ? `TODAY’S PROMPT · ROUND #${data.current.number}`
                : "PRACTICE MODE"}
            </span>
            <h2>{data.practice.prompt || "Your practice space."}</h2>
            {data.current && (
              <p className="muted">
                Closes {easternDeadline(data.current.closes)} ET
              </p>
            )}
            <p className="muted">
              Practice only. Your draft stays in this browser and is never
              entered in the competition.
            </p>
            <label htmlFor="practice">Your practice response</label>
            <textarea
              id="practice"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setSaved(false);
              }}
              maxLength={2000}
              placeholder="Your ten words of fame…"
            />
            <div className="composer-footer">
              <span
                className={words(draft) > data.practice.limit ? "over" : ""}
              >
                {words(draft)} / {data.practice.limit} words
              </span>
              <button
                className="secondary"
                disabled={!draft.trim() || words(draft) > data.practice.limit}
                onClick={() => setSaved(true)}
              >
                Try this response
              </button>
            </div>
            {saved && (
              <p role="status">
                Practice complete. Your draft will be here when you sign in.
              </p>
            )}
          </section>
          <aside className="panel">
            <div className="eyebrow">READY FOR YOUR NEXT ERA?</div>
            <h2>Make it official.</h2>
            <p>
              Sign in to submit responses, vote, earn followers and Likes, and
              use the shop.
            </p>
            <Link className="primary" href="/signin">
              Continue to sign in →
            </Link>
            <small>Your voting identity stays private.</small>
          </aside>
        </div>
        <section className="guest-results">
          <div className="eyebrow">THE INTERNET HAS SPOKEN</div>
          <h2>Completed results.</h2>
          {data.results.length === 0 ? (
            <p className="muted">
              The first results will appear after a round is finalized.
            </p>
          ) : (
            data.results.map((round) => (
              <details className="panel" key={round.id}>
                <summary>
                  Round #{round.number} · {round.prompt}
                </summary>
                {round.entries.length ? (
                  round.entries.map((entry, index) => (
                    <article className="guest-result" key={index}>
                      <span className="pill">
                        #{entry.rank} · {entry.name}
                      </span>
                      <h3>{entry.content}</h3>
                      <p>
                        Raw {entry.raw} + bonus {entry.bonus} ={" "}
                        <b>{entry.score} points</b> · +{entry.followers}{" "}
                        followers
                      </p>
                      {entry.effect_name && <small>{entry.effect_name}</small>}
                    </article>
                  ))
                ) : (
                  <p>No responses were submitted.</p>
                )}
              </details>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
