"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, @next/next/no-img-element, @next/next/no-html-link-for-pages, @next/next/no-location-assign-relative-destination */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  ProfileCard,
  ProfilePage,
  SocialAdmin,
  StreakPanel,
} from "./social-ui";
import {
  Flame,
  Home,
  PenLine,
  ThumbsUp,
  Trophy,
  ShoppingBag,
  Package,
  Settings2,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  Plus,
  Check,
  X,
  Zap,
  Shield,
  Briefcase,
  Type,
  Sparkles,
  Info,
  Clock,
  Heart,
  LockKeyhole,
  History,
  Search,
  SlidersHorizontal,
  LogOut,
  Menu,
  CalendarDays,
  Trash2,
  Pencil,
  Gift,
  Loader2,
} from "lucide-react";
import { words, EFFECTS, currencyCopy } from "../lib/rules";
import {
  easternDate,
  easternDeadline,
  easternDay,
  nextDay,
  nextPhaseDelay,
} from "../lib/time";
const icons: any = { Zap, Shield, Briefcase, Type, Sparkles };
const effectLabels: any = {
  word_limit: "WORD LIMIT",
  positive_multiplier: "SCORE BOOST",
  downvote_shield: "DAMAGE CONTROL",
  clout_multiplier: "LIKES MULTIPLIER",
};
const benefit = (x: any) =>
  x.effect === "word_limit"
    ? `${x.parameter} word limit`
    : x.effect === "positive_multiplier"
      ? `${x.parameter}× positive points`
      : x.effect === "downvote_shield"
        ? `Block ${x.parameter} downvote${x.parameter === 1 ? "" : "s"}`
        : `${x.parameter}× round Likes`;
const format = (n: number) => new Intl.NumberFormat("en-US").format(n || 0);
const date = easternDate;
const deadlineDate = easternDeadline;
const nav = [
  ["submit", Home, "Today’s discourse"],
  ["vote", ThumbsUp, "Voting booth"],
  ["results", Trophy, "The results"],
  ["shop", ShoppingBag, "The Algorithm™"],
  ["inventory", Package, "Your inventory"],
  ["profile", Sparkles, "Your profile"],
];
async function api(b?: any) {
  const r = await fetch(
    "/api/game",
    b
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(b),
        }
      : { cache: "no-store" },
  );
  const x: any = await r.json();
  if (!r.ok) throw new Error(x.error || "Something went wrong.");
  return x;
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={close}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function Game({ view = "shop" }: { view?: string }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("shop"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [modal, setModal] = useState<any>(null),
    [mobile, setMobile] = useState(false),
    [content, setContent] = useState(""),
    [feed, setFeed] = useState<any>(null),
    [roundId, setRoundId] = useState(""),
    [choices, setChoices] = useState<(string | null)[]>([
      null,
      null,
      null,
      null,
    ]);
  const load = useCallback(async () => {
    try {
      setData(await api());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) void load();
    }, 60000);
    const visible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [load]);
  useEffect(() => {
    if (!data?.serverNow) return;
    const delay = nextPhaseDelay(data.rounds, data.serverNow);
    if (delay === null) return;
    const timer = setTimeout(() => void load(), delay);
    return () => clearTimeout(timer);
  }, [data, load]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const act = async (b: any, msg: string) => {
    setBusy(true);
    try {
      await api(b);
      await load();
      setToast(msg);
      setModal(null);
      return true;
    } catch (e) {
      setToast((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const rounds = data?.rounds || [],
    current = rounds.find((r: any) => r.phase === "SUBMISSION"),
    voting = rounds.filter((r: any) => r.phase === "VOTING"),
    completed = rounds.filter((r: any) => r.phase === "RESULTS" && r.finalized),
    selected = rounds.find((r: any) => r.id === roundId);
  const currentId = current?.id;
  const initializedComposer = useRef("");
  useEffect(() => {
    const eligible =
      view === "vote"
        ? voting
        : view === "results"
          ? completed
          : current
            ? [current]
            : [];
    setRoundId((previous: string) =>
      eligible.some((r: any) => r.id === previous)
        ? previous
        : eligible[0]?.id || "",
    );
  }, [data, view]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!data) return;
    const key = `${view}:${currentId || ""}`;
    if (initializedComposer.current === key) return;
    initializedComposer.current = key;
    setContent(
      data.mine.find((entry: any) => entry.round_id === currentId)?.content ||
        "",
    );
  }, [data, view, currentId]);
  useEffect(() => {
    if (!roundId || !["vote", "results"].includes(view)) return;
    let active = true;
    fetch(`/api/game?round=${encodeURIComponent(roundId)}`)
      .then((r) => r.json() as Promise<any>)
      .then((x) => {
        if (active) {
          setFeed(x);
          setChoices(
            x.ballot ? JSON.parse(x.ballot.choices) : [null, null, null, null],
          );
        }
      })
      .catch(() => setToast("Unable to load round."));
    return () => {
      active = false;
    };
  }, [roundId, view]);
  const balance = data?.wallet?.balance || 0,
    stock = (id: string) =>
      data?.inventory.find((x: any) => x.item_id === id)?.quantity || 0,
    admin = data?.profile?.role === "admin",
    owned =
      data?.inventory.reduce((s: number, x: any) => s + x.quantity, 0) || 0;
  const activeEffect = data?.active.find(
      (a: any) => a.round_id === current?.id,
    ),
    limit =
      activeEffect?.type === "word_limit"
        ? activeEffect.parameter
        : current?.config.wordLimit || data?.rules?.wordLimit || 10;
  const items = (data?.catalog || []).filter(
    (x: any) =>
      x.enabled &&
      `${x.name} ${x.description}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "all" ||
        (filter === "affordable" && x.cost <= balance) ||
        (filter === "owned" && stock(x.id) > 0)),
  );
  const inventoryView = view === "inventory" || tab === "inventory";
  return (
    <div className="app-shell">
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {nav.map(([key, Icon]: any, i: number) => (
          <a
            key={key}
            href={`/${key}`}
            className={
              view === key || (key === "profile" && view === "profile-edit")
                ? "active"
                : ""
            }
          >
            <Icon size={19} />
            <span>
              {["Today", "Vote", "Results", "Shop", "Bag", "Profile"][i]}
            </span>
          </a>
        ))}
      </nav>
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a className="brand" href="/shop">
          <span>
            <Flame fill="currentColor" size={27} />
          </span>
          <span className="brand-name">Estergram</span>
        </a>
        <p className="tagline">Your 10 words of fame.</p>
        <div className="nav-label">YOUR DAILY DOSE</div>
        <nav>
          {nav.map(([key, Icon, label]: any) => (
            <a
              key={key}
              href={`/${key}`}
              className={
                view === key || (key === "profile" && view === "profile-edit")
                  ? "active"
                  : ""
              }
            >
              <Icon size={20} />
              <span>{label}</span>
              {key === "shop" && <span className="nav-new">NEW</span>}
            </a>
          ))}
        </nav>
        <a className="write-button" href="/submit">
          <PenLine size={17} /> Make your move <ArrowUpRight size={17} />
        </a>
        <div className="sidebar-bottom">
          <div className="fiction-note">
            <div className="mini-flame">
              <Flame size={16} />
            </div>
            <b>Fame is a game.</b>
            <p>
              Try not to take the internet
              <br />
              too seriously.
            </p>
          </div>
          <a
            href="/admin"
            className={view === "admin" ? "admin-link selected" : "admin-link"}
          >
            <Settings2 size={18} /> Creator studio <ArrowUpRight size={15} />
          </a>
          <div className="profile-mini">
            <div className="avatar">
              {(data?.profile.name || "Y").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <b>{data?.profile.name || "Your account"}</b>
              <small>
                {data?.social?.profile.tier.current?.name ||
                  (admin ? "Game owner" : "Player")}
              </small>
            </div>
            <a
              href="/signout-with-chatgpt?return_to=/"
              target="_top"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </a>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobile(!mobile)}
              aria-label="Toggle navigation"
            >
              <Menu size={21} />
            </button>
            <span>THE CREATOR ECONOMY</span>
            <ChevronRight size={13} />
            <b>
              {view.startsWith("profile")
                ? "Your profile"
                : view === "admin"
                  ? "Creator studio"
                  : view === "shop"
                    ? "The Algorithm™"
                    : view === "inventory"
                      ? "Your inventory"
                      : view === "submit"
                        ? "Today’s discourse"
                        : view === "vote"
                          ? "Voting booth"
                          : "The results"}
            </b>
          </div>
          <div className="top-right">
            <span className="live-dot" />{" "}
            <span className="fictional">FICTIONAL FAME. REAL COMPETITION.</span>
            <button
              className="balance-chip"
              onClick={() => {
                setTab("activity");
                if (view !== "shop") location.href = "/shop";
              }}
            >
              <Heart size={17} />
              {format(balance)} <span>Likes</span>
            </button>
            <a
              href="/profile"
              className="avatar small"
              aria-label="Open your profile"
            >
              {(data?.profile.name || "Y").slice(0, 1).toUpperCase()}
            </a>
          </div>
        </header>
        {error ? (
          <main className="status-page">
            <Flame size={38} />
            <h1>Welcome to Estergram.</h1>
            <p>{error}</p>
            <a
              className="primary"
              href="/signin-with-chatgpt?return_to=/shop"
              target="_top"
            >
              Sign in to play <ArrowRight size={16} />
            </a>
            <button onClick={load} className="secondary">
              Try again
            </button>
          </main>
        ) : !data ? (
          <main className="status-page">
            <Loader2 className="spin" />
            <p>Finding your place in the algorithm…</p>
          </main>
        ) : (
          <>
            {["shop", "inventory"].includes(view) ? (
              <div className="content-layout">
                <main className="shop-main">
                  <section className="shop-hero">
                    <div className="eyebrow">
                      <span className="tiny-spark">✦</span> THE INTERNET HAS
                      FAVORITES. BECOME ONE.
                    </div>
                    <h1>
                      The Algorithm<span className="tm">™</span>
                      <span className="hero-asterisk">✳</span>
                    </h1>
                    <p>
                      A little advantage. A lot of potential.
                      <br />
                      Spend your hard-earned Likes on your next big moment.
                    </p>
                    <div className="hero-pills">
                      <span>
                        <LockKeyhole size={13} /> Earned, never bought
                      </span>
                      <span>
                        <Zap size={13} /> One power-up per round
                      </span>
                    </div>
                    <div className="hero-watermark" aria-hidden="true">
                      a<span>✦</span>
                    </div>
                  </section>
                  <div className="tab-row">
                    <div className="tabs">
                      <button
                        className={
                          !inventoryView && tab === "shop" ? "selected" : ""
                        }
                        onClick={() => {
                          if (view === "inventory") location.href = "/shop";
                          else setTab("shop");
                        }}
                      >
                        The shop{" "}
                        <span>
                          {data.catalog
                            .filter((x: any) => x.enabled)
                            .length.toString()
                            .padStart(2, "0")}
                        </span>
                      </button>
                      <button
                        className={inventoryView ? "selected" : ""}
                        onClick={() => setTab("inventory")}
                      >
                        My inventory <span>{owned}</span>
                      </button>
                      <button
                        className={
                          tab === "activity" && !inventoryView ? "selected" : ""
                        }
                        onClick={() => setTab("activity")}
                      >
                        Likes activity
                      </button>
                    </div>
                    <span className="season">
                      SEASON 01 <span> / </span> THE BEGINNING
                    </span>
                  </div>
                  {inventoryView ? (
                    <>
                      <div className="section-heading">
                        <div>
                          <h2>Your unfair advantages.</h2>
                          <p>Yours until you use them. Choose your moment.</p>
                        </div>
                        <Package size={21} />
                      </div>
                      {data.inventory.length ? (
                        <div className="item-grid">
                          {data.inventory.map((x: any) => (
                            <Item
                              key={x.id}
                              item={{ ...x, id: x.item_id }}
                              quantity={x.quantity}
                              inventory
                              onClick={() =>
                                setModal({
                                  type: "activate",
                                  item: x,
                                  roundId: current?.id || "",
                                })
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <Empty
                          icon={Package}
                          title="Your next advantage starts here."
                          text="Purchased power-ups stay in your inventory until you activate them."
                          action={
                            <button
                              className="primary"
                              onClick={() => {
                                if (view === "inventory")
                                  location.href = "/shop";
                                else setTab("shop");
                              }}
                            >
                              Explore the shop <ArrowRight size={16} />
                            </button>
                          }
                        />
                      )}
                    </>
                  ) : tab === "activity" ? (
                    <>
                      <div className="section-heading">
                        <div>
                          <h2>Every bit of Likes, accounted for.</h2>
                          <p>An immutable record of what you earn and spend.</p>
                        </div>
                        <History size={22} />
                      </div>
                      <Ledger entries={data.ledger} />
                    </>
                  ) : (
                    <>
                      <div className="shop-tools">
                        <div>
                          <h2>Small boosts. Big main-character energy.</h2>
                          <p>Find your next competitive advantage.</p>
                        </div>
                        <div className="tool-controls">
                          <label className="search">
                            <Search size={15} />
                            <input
                              aria-label="Search power-ups"
                              placeholder="Find a power-up"
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                            />
                          </label>
                          <label className="filter">
                            <SlidersHorizontal size={15} />
                            <select
                              aria-label="Filter power-ups"
                              value={filter}
                              onChange={(e) => setFilter(e.target.value)}
                            >
                              <option value="all">All items</option>
                              <option value="affordable">Affordable</option>
                              <option value="owned">Owned</option>
                            </select>
                          </label>
                        </div>
                      </div>
                      <div className="item-grid">
                        {items.map((x: any, i: number) => (
                          <Item
                            key={x.id}
                            item={x}
                            index={i}
                            quantity={stock(x.id)}
                            onClick={() =>
                              setModal({
                                type: "purchase",
                                item: x,
                                key: crypto.randomUUID(),
                              })
                            }
                          />
                        ))}
                      </div>
                      {!items.length && (
                        <Empty
                          icon={ShoppingBag}
                          title="Nothing in this corner of the internet."
                          text="Try another filter or add a sample catalog in Creator studio."
                          action={
                            admin ? (
                              <button
                                className="primary"
                                disabled={busy}
                                onClick={() =>
                                  act(
                                    { action: "seed" },
                                    "Placeholder catalog added.",
                                  )
                                }
                              >
                                Load placeholder content
                              </button>
                            ) : null
                          }
                        />
                      )}
                    </>
                  )}
                  <div className="shop-footnote">
                    <Shield size={16} />
                    <p>
                      Likes is fictional, non-transferable, and has no monetary
                      value.
                      <br className="mobile-only" /> Power-ups never reveal
                      authors or change who can vote.
                    </p>
                    <span>PLAY FAIR. GET FAMOUS.</span>
                  </div>
                </main>
                <aside className="right-rail">
                  <section className="wallet-card">
                    <div className="rail-label">
                      <span>YOUR LIKES</span>
                      <Heart size={17} />
                    </div>
                    <div className="wallet-number">
                      {format(balance)}
                      <span>✦</span>
                    </div>
                    <p>Your next big moment starts here.</p>
                    <div className="wallet-separator" />
                    <div className="wallet-bottom">
                      <span>
                        <Package size={15} /> Power-ups in your bag
                      </span>
                      <b>{owned.toString().padStart(2, "0")}</b>
                    </div>
                    <button onClick={() => setTab("activity")}>
                      View Likes activity <ArrowUpRight size={15} />
                    </button>
                  </section>
                  <section className="earn-card">
                    <div className="rail-heading">
                      <h3>A little effort. A little Likes.</h3>
                      <Sparkles size={17} />
                    </div>
                    <p>Show up. Have a take. Get rewarded.</p>
                    <div className="earn-row">
                      <span className="earn-icon">
                        <PenLine size={16} />
                      </span>
                      <div>
                        <b>Post your response</b>
                        <small>One eligible entry per round</small>
                      </div>
                      <strong>+{data.rules.submissionClout}</strong>
                    </div>
                    <div className="earn-row">
                      <span className="earn-icon">
                        <ThumbsUp size={16} />
                      </span>
                      <div>
                        <b>Cast your ballot</b>
                        <small>Save an eligible vote</small>
                      </div>
                      <strong>+{data.rules.votingClout}</strong>
                    </div>
                    <div className="earn-row">
                      <span className="earn-icon gold">
                        <Trophy size={16} />
                      </span>
                      <div>
                        <b>Make the podium</b>
                        <small>1st / 2nd / 3rd place</small>
                      </div>
                      <strong>
                        {data.rules.podiumClout
                          .map((n: number) => `+${n}`)
                          .join(" / ")}
                      </strong>
                    </div>
                    <div className="rail-info">
                      <Info size={14} />
                      <span>
                        Rewards settle once the round ends. Podium bonuses need{" "}
                        {data.rules.minEntries}+ entries.
                      </span>
                    </div>
                  </section>
                  <section className="round-card">
                    <div className="rail-label">
                      <span>
                        <span className="live-dot" /> TODAY’S DISCOURSE
                      </span>
                      <span>
                        #{current?.number?.toString().padStart(3, "0") || "—"}
                      </span>
                    </div>
                    <h3>
                      {current?.prompt || "Your next prompt is on its way."}
                    </h3>
                    {current && (
                      <>
                        <p>
                          <Clock size={13} /> Closes{" "}
                          {deadlineDate(current.closes)} ET
                        </p>
                        <a href="/submit">
                          Have your {limit} words of fame{" "}
                          <ArrowRight size={16} />
                        </a>
                      </>
                    )}
                    {current?.placeholder === 1 && (
                      <small className="placeholder-label">
                        PLACEHOLDER PROMPT
                      </small>
                    )}
                  </section>
                  <div className="rail-bottom">
                    <Flame size={16} />
                    <span>Good takes are still free.</span>
                  </div>
                </aside>
              </div>
            ) : view.startsWith("profile") ? (
              <ProfilePage
                data={data}
                busy={busy}
                act={act}
                edit={view === "profile-edit"}
              />
            ) : view === "admin" ? (
              <Admin data={data} busy={busy} act={act} setModal={setModal} />
            ) : (
              <main className="game-main">
                <div className="eyebrow">YOUR 10 WORDS OF FAME</div>
                <h1>
                  {view === "submit"
                    ? "Today’s discourse."
                    : view === "vote"
                      ? "Time to judge strangers."
                      : "The algorithm has spoken."}
                </h1>
                {["submit", "vote"].includes(view) && (
                  <div className="info-bar daily-cycle">
                    <Clock size={18} />
                    <div>
                      <b>Eastern Time · 00:00–23:59 daily</b>
                      <p>
                        Submit today’s response and vote on yesterday’s round.
                        New York daylight saving time applies.
                      </p>
                      <div className="daily-cycle-actions">
                        {current && view !== "submit" && (
                          <a className="secondary" href="/submit">
                            Today’s new prompt <ArrowRight size={14} />
                          </a>
                        )}
                        {voting.length > 0 && view !== "vote" && (
                          <a className="secondary" href="/vote">
                            Vote on yesterday <ThumbsUp size={14} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {view === "submit" && (
                  <StreakPanel social={data.social} small />
                )}
                {view === "submit" ? (
                  current ? (
                    <>
                      <div className="prompt-panel">
                        <span className="pill">
                          ROUND #{current.number} · SUBMISSIONS OPEN
                        </span>
                        {!!current.placeholder && (
                          <span className="placeholder-label">PLACEHOLDER</span>
                        )}
                        <h2>{current.prompt}</h2>
                        <p>
                          <Clock size={14} /> Submissions close{" "}
                          {deadlineDate(current.closes)} ET
                        </p>
                      </div>
                      <section className="composer panel">
                        <div className="composer-person">
                          <div className="avatar">
                            {data.profile.name.slice(0, 1)}
                          </div>
                          <b>{data.profile.name}</b>
                          <span>Only you can see this until voting.</span>
                        </div>
                        <textarea
                          aria-label="Your response"
                          placeholder="Post something brilliant. Or don’t."
                          value={content}
                          maxLength={2000}
                          onChange={(e) => setContent(e.target.value)}
                        />
                        <div className="composer-footer">
                          <span
                            className={words(content) > limit ? "danger" : ""}
                          >
                            {words(content)} / {limit} words
                          </span>
                          <button
                            className="primary"
                            disabled={
                              busy || !words(content) || words(content) > limit
                            }
                            onClick={() =>
                              act(
                                {
                                  action: "submit",
                                  roundId: current.id,
                                  content,
                                },
                                "Your post is officially on the internet. Edits are open until the deadline.",
                              )
                            }
                          >
                            {busy ? (
                              <Loader2 className="spin" size={16} />
                            ) : (
                              <PenLine size={16} />
                            )}{" "}
                            {data.mine.some(
                              (s: any) => s.round_id === current.id,
                            )
                              ? "Update response"
                              : "Submit response"}
                          </button>
                        </div>
                        <p className="help">
                          Whitespace separates words. Standalone emoji don’t
                          count. Contractions and hyphenated words count as one.
                        </p>
                      </section>
                      <div className="panel activation-panel">
                        <Zap size={22} />
                        <div>
                          <h3>
                            {activeEffect
                              ? `${currencyCopy(activeEffect.name)} is active.`
                              : "Give this take an advantage."}
                          </h3>
                          <p>
                            {activeEffect
                              ? `One item consumed. This round’s activation slot is used. ${benefit({ ...activeEffect, effect: activeEffect.type })}.`
                              : "Save your response, then activate an owned power-up before submissions close. For Word Expansion, activate first and edit up to the new limit."}
                          </p>
                        </div>
                        <a className="secondary" href="/inventory">
                          Open inventory <ArrowUpRight size={15} />
                        </a>
                      </div>
                    </>
                  ) : (
                    <Empty
                      icon={CalendarDays}
                      title="No open submission round."
                      text="The game owner will schedule your next daily prompt."
                    />
                  )
                ) : view === "vote" ? (
                  <>
                    <RoundSelect
                      rounds={voting}
                      value={roundId}
                      change={setRoundId}
                    />
                    {selected ? (
                      <>
                        <p className="muted">{selected.prompt}</p>
                        <div className="panel voting-guide">
                          <Shield size={22} />
                          <div>
                            <b>Anonymous takes. Honest votes.</b>
                            <p>
                              Select one response per rank. You can save a
                              partial ballot and edit it until{" "}
                              {deadlineDate(selected.ends)} ET. Authors, totals,
                              and private ballots stay hidden.
                            </p>
                          </div>
                        </div>
                        <div className="vote-grid">
                          <div>
                            {feed?.entries?.map((s: any, i: number) => (
                              <div className="panel anonymous-card" key={s.id}>
                                <span className="anonymous-label">
                                  ANONYMOUS TAKE ·{" "}
                                  {String(i + 1).padStart(2, "0")}
                                </span>
                                <h3>{s.content}</h3>
                                {s.effect_name && (
                                  <span className="effect-badge">
                                    <Zap size={13} />
                                    {currencyCopy(s.effect_name)} ·{" "}
                                    {effectLabels[s.effect_type] ||
                                      s.effect_type}
                                    : {s.parameter}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                          <section className="panel ballot">
                            <h2>Your ballot</h2>
                            {[
                              "First favorite",
                              "Second favorite",
                              "Third favorite",
                              "Downvote",
                            ].map((name, i) => (
                              <label key={name}>
                                {name}
                                <span>
                                  {selected.config.votePoints[i] > 0 ? "+" : ""}
                                  {selected.config.votePoints[i]} vote points
                                </span>
                                <select
                                  aria-label={name}
                                  value={choices[i] || ""}
                                  onChange={(e) =>
                                    setChoices(
                                      choices.map((v, j) =>
                                        i === j ? e.target.value || null : v,
                                      ),
                                    )
                                  }
                                >
                                  <option value="">Leave empty</option>
                                  {feed?.entries?.map((s: any, j: number) => (
                                    <option
                                      key={s.id}
                                      disabled={choices.some(
                                        (v, k) => k !== i && v === s.id,
                                      )}
                                      value={s.id}
                                    >
                                      Take {j + 1}: {s.content.slice(0, 45)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ))}
                            <button
                              className="primary"
                              disabled={busy || !choices.some(Boolean)}
                              onClick={() =>
                                act(
                                  { action: "vote", roundId, choices },
                                  "Ballot saved. Your participation reward will settle once.",
                                )
                              }
                            >
                              Save ballot <Check size={16} />
                            </button>
                          </section>
                        </div>
                      </>
                    ) : (
                      <Empty
                        icon={ThumbsUp}
                        title="The voting booth is quiet."
                        text="Voting opens when a submission round closes."
                      />
                    )}
                  </>
                ) : (
                  <>
                    <RoundSelect
                      rounds={completed}
                      value={roundId}
                      change={setRoundId}
                    />
                    {selected ? (
                      <>
                        <p className="muted">{selected.prompt}</p>
                        <div className="info-bar">
                          <Info size={17} />
                          {feed?.entries?.length < selected.config.minEntries
                            ? `Unranked round: fewer than ${selected.config.minEntries} entries. No podium Likes or follower rewards.`
                            : "Raw votes are counted first. Every score effect is shown below."}
                        </div>
                        {feed?.entries?.map((s: any) => (
                          <div
                            className="panel result-card"
                            key={s.submission_id}
                          >
                            <span className={`rank rank-${s.rank}`}>
                              {s.rank <= 3 ? <Trophy size={22} /> : s.rank}
                            </span>
                            <div>
                              <small>
                                {s.rank === 1
                                  ? "MOST VIRAL"
                                  : s.rank === 2
                                    ? "TRENDING"
                                    : s.rank === 3
                                      ? "RISING STAR"
                                      : s.rank === feed.entries.length &&
                                          s.rank > 3
                                        ? "BIGGEST FLOP"
                                        : `PLACE ${s.rank}`}{" "}
                                · {s.name}
                              </small>
                              <button
                                className="result-profile-button"
                                onClick={() =>
                                  setModal({
                                    type: "resultProfile",
                                    profile: s.profile,
                                  })
                                }
                              >
                                <Sparkles size={14} /> View profile
                              </button>
                              <h3>{s.content}</h3>
                              <div className="score-breakdown">
                                <span>Raw {s.raw}</span>
                                <span>Bonus +{s.bonus}</span>
                                <span>
                                  Final <b>{s.score}</b> points
                                </span>
                                <span>+{s.followers} followers</span>
                              </div>
                              <details>
                                <summary>Full scoring breakdown</summary>
                                <p>
                                  {JSON.parse(s.breakdown).counts.join(" / ")}{" "}
                                  votes (1st / 2nd / 3rd / down). Positive{" "}
                                  {JSON.parse(s.breakdown).positive}; negative{" "}
                                  {JSON.parse(s.breakdown).negative}; shield +
                                  {JSON.parse(s.breakdown).shield}; boost +
                                  {JSON.parse(s.breakdown).boost}.
                                </p>
                              </details>
                            </div>
                          </div>
                        ))}
                        <Ledger
                          entries={data.ledger.filter(
                            (x: any) => x.round_id === roundId,
                          )}
                        />
                      </>
                    ) : (
                      <Empty
                        icon={Trophy}
                        title="Fame takes a little time."
                        text="Finalized rounds will reveal authors, scores, bonuses, and earned rewards here."
                      />
                    )}
                  </>
                )}
              </main>
            )}
          </>
        )}
        <footer className="site-footer">
          <span>© Estergram 2026</span>
          <span>A fictional social experiment. Have a little fun with it.</span>
          <span>
            YOUR 10 WORDS OF FAME. <span className="pink">✦</span>
          </span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Info size={18} />
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal?.type === "purchase" && (
        <Modal title="Make it yours." close={() => !busy && setModal(null)}>
          <div className="modal-item">
            <ItemArt item={modal.item} />
            <div>
              <span className="placeholder-label">
                {modal.item.placeholder ? "PLACEHOLDER ITEM" : "POWER-UP"}
              </span>
              <h3>{modal.item.name}</h3>
              <p>{modal.item.description}</p>
            </div>
          </div>
          <div className="confirm-lines">
            <p>
              <span>One consumable power-up</span>
              <b>{modal.item.cost} Likes</b>
            </p>
            <p>
              <span>Your balance after purchase</span>
              <b>{balance - modal.item.cost} Likes</b>
            </p>
          </div>
          <div className="info-bar">
            <Info size={18} />
            Purchasing adds one item to your inventory. It is consumed only when
            you confirm activation in an eligible round.
          </div>
          <button
            className="primary full"
            disabled={busy || balance < modal.item.cost}
            onClick={() =>
              act(
                {
                  action: "purchase",
                  itemId: modal.item.id,
                  key: modal.key,
                  revision: modal.item.revision,
                },
                `${modal.item.name} is in your inventory.`,
              )
            }
          >
            {balance < modal.item.cost
              ? "Earn more Likes to purchase"
              : busy
                ? "Purchasing…"
                : `Confirm · ${modal.item.cost} Likes`}
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
      {modal?.type === "resultProfile" && (
        <Modal title="Behind the take." close={() => setModal(null)}>
          <ProfileCard
            profile={modal.profile}
            allowAnimations={data?.social.profile.appearance.animations}
          />
          <p className="help">
            Profile revealed after this round’s voting ended.
          </p>
        </Modal>
      )}
      {modal?.type === "activate" && (
        <Modal
          title="Choose your moment."
          close={() => !busy && setModal(null)}
        >
          <h3>{modal.item.name}</h3>
          <p className="muted">{modal.item.description}</p>
          <div className="info-bar">
            <Zap size={18} />
            {benefit(modal.item)}. Consumes 1 item immediately and uses your one
            activation for the round. This cannot be undone. Other inventory
            stays yours.
          </div>
          <label className="form-label">
            Choose an eligible response
            <select
              value={modal.roundId}
              onChange={(e) => setModal({ ...modal, roundId: e.target.value })}
            >
              <option value="">Select a round</option>
              {rounds
                .filter(
                  (r: any) =>
                    r.phase === "SUBMISSION" &&
                    data.mine.some((s: any) => s.round_id === r.id) &&
                    !data.active.some((a: any) => a.round_id === r.id),
                )
                .map((r: any) => (
                  <option key={r.id} value={r.id}>
                    Round #{r.number} · {r.prompt}
                  </option>
                ))}
            </select>
          </label>
          {data.mine.find((s: any) => s.round_id === modal.roundId) && (
            <blockquote>
              {data.mine.find((s: any) => s.round_id === modal.roundId).content}
            </blockquote>
          )}
          <p className="help">
            Only saved responses in open submission rounds are eligible. Submit
            a response first if this list is empty. Disabled or unavailable
            items cannot be activated.
          </p>
          <button
            className="primary full"
            disabled={
              busy ||
              !rounds.some(
                (r: any) =>
                  r.id === modal.roundId &&
                  r.phase === "SUBMISSION" &&
                  data.mine.some((s: any) => s.round_id === r.id) &&
                  !data.active.some((a: any) => a.round_id === r.id),
              )
            }
            onClick={() =>
              act(
                {
                  action: "activate",
                  roundId: modal.roundId,
                  submissionId: data.mine.find(
                    (s: any) => s.round_id === modal.roundId,
                  )?.id,
                  itemId: modal.item.item_id,
                  revision: modal.item.revision,
                },
                "Power-up activated. One item consumed.",
              )
            }
          >
            Confirm activation <Zap size={16} />
          </button>
        </Modal>
      )}
      {modal?.type === "item" && (
        <ItemEditor
          item={modal.item}
          busy={busy}
          close={() => setModal(null)}
          save={(item: any) =>
            act(
              { action: "item", item },
              "Shop item saved. Existing activations retain their snapshots.",
            )
          }
        />
      )}
      {modal?.type === "prompt" && (
        <PromptEditor
          prompt={modal.prompt}
          busy={busy}
          close={() => setModal(null)}
          save={(x: any) => act({ action: "prompt", ...x }, "Prompt saved.")}
        />
      )}
      {modal?.type === "schedule" && (
        <ScheduleEditor
          prompt={modal.prompt}
          busy={busy}
          close={() => setModal(null)}
          save={(x: any) =>
            act(
              { action: "publishPrompt", id: modal.prompt.id, ...x },
              "Round scheduled. Its rules are now snapshotted.",
            )
          }
        />
      )}
    </div>
  );
}
function ItemArt({ item }: { item: any }) {
  const Icon = icons[item.icon] || Zap;
  return (
    <div className={`item-art art-${item.effect}`} aria-hidden="true">
      <div className="art-grid" />
      <div className="orbit one" />
      <div className="orbit two" />
      <span className="art-star s1">✦</span>
      <span className="art-star s2">+</span>
      {item.image ? (
        <img src={item.image} alt="" />
      ) : (
        <div className="object">
          <Icon strokeWidth={1.5} />
          {item.effect === "word_limit" && (
            <span className="word-plus">{item.parameter}</span>
          )}
        </div>
      )}
      <span className="art-bottom">{effectLabels[item.effect]}</span>
    </div>
  );
}
function Item({
  item,
  index = 0,
  quantity,
  inventory = false,
  onClick,
}: {
  item: any;
  index?: number;
  quantity: number;
  inventory?: boolean;
  onClick: () => void;
}) {
  return (
    <article className={`item-card card-${item.effect}`}>
      <div className="art-wrap">
        <ItemArt item={item} />
        <span className="item-number">0{index + 1} / POWER-UP</span>
        {quantity >= 0 && (
          <span className="owned-pill">
            <Package size={12} /> {quantity} owned
          </span>
        )}
      </div>
      <div className="item-content">
        <div className="item-title">
          <h3>{item.name}</h3>
          <ArrowUpRight size={18} />
        </div>
        <p>{item.description}</p>
        <div className="benefit">
          <Check size={13} />
          {benefit(item)}
          <span>1 ROUND</span>
        </div>
        <div className="item-actions">
          <div className="price">
            <Heart size={18} />
            <b>{item.cost !== undefined ? item.cost : quantity}</b>
            <span>{item.cost !== undefined ? "Likes" : "owned"}</span>
          </div>
          <button disabled={inventory && !item.enabled} onClick={onClick}>
            {inventory ? "Activate" : "Get power-up"}
            <Plus size={15} />
          </button>
        </div>
        <small className="card-placeholder">
          {item.placeholder === 0 ? "CONSUMABLE" : "PLACEHOLDER CONTENT"}{" "}
          <span>· NON-TRANSFERABLE</span>
        </small>
      </div>
    </article>
  );
}
function Empty({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: any;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Ledger({ entries }: { entries: any[] }) {
  return (
    <section className="ledger panel">
      {entries.length ? (
        entries.map((x) => (
          <div key={x.id}>
            <span
              className={x.amount >= 0 ? "ledger-icon positive" : "ledger-icon"}
            >
              {x.amount >= 0 ? (
                <ArrowUpRight size={18} />
              ) : (
                <ShoppingBag size={17} />
              )}
            </span>
            <div>
              <b>{currencyCopy(x.note)}</b>
              <small>{date(x.created)} ET</small>
            </div>
            <strong className={x.amount >= 0 ? "positive" : ""}>
              {x.amount > 0 ? "+" : ""}
              {x.amount} <small>Likes</small>
            </strong>
          </div>
        ))
      ) : (
        <Empty
          icon={History}
          title="A clean slate."
          text="Your earned rewards and purchases will appear here. Participation rewards settle at finalization."
        />
      )}
    </section>
  );
}
function RoundSelect({
  rounds,
  value,
  change,
}: {
  rounds: any[];
  value: string;
  change: (s: string) => void;
}) {
  return rounds.length ? (
    <label className="round-select">
      Round
      <select value={value} onChange={(e) => change(e.target.value)}>
        {rounds.map((r) => (
          <option key={r.id} value={r.id}>
            #{r.number} · {r.prompt}
          </option>
        ))}
      </select>
    </label>
  ) : null;
}
function Admin({
  data,
  busy,
  act,
  setModal,
}: {
  data: any;
  busy: boolean;
  act: any;
  setModal: any;
}) {
  const [tab, setTab] = useState("prompts"),
    [rules, setRules] = useState(data.rules),
    [user, setUser] = useState(data.profile.id),
    [item, setItem] = useState(data.catalog[0]?.id || ""),
    [delta, setDelta] = useState(1),
    [amount, setAmount] = useState(100),
    [note, setNote] = useState("");
  if (data.profile.role !== "admin")
    return (
      <main className="game-main">
        <Empty
          icon={LockKeyhole}
          title="Creator studio is owner-only."
          text="Your player account does not have administrator access."
        />
      </main>
    );
  const number = (label: string, key: string) => (
    <label className="form-label" key={key}>
      {label}
      <input
        type="number"
        value={rules[key]}
        onChange={(e) => setRules({ ...rules, [key]: Number(e.target.value) })}
      />
    </label>
  );
  return (
    <main className="admin-main">
      <div className="eyebrow">OWNER WORKSPACE</div>
      <div className="admin-title">
        <div>
          <h1>Creator studio.</h1>
          <p>Your game. Your rules. No source code required.</p>
        </div>
        <span className="owner-badge">
          <LockKeyhole size={14} /> ADMIN ACCESS
        </span>
      </div>
      <div className="info-bar">
        <Info size={18} />
        All sample prompts and items are placeholders. Published rounds and
        activated effects keep their original settings.
      </div>
      <div className="tabs admin-tabs">
        {[
          "prompts",
          "catalog",
          "economy",
          "inventory",
          "profiles",
          "rounds",
          "audit",
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "selected" : ""}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === "prompts" ? (
        <>
          <div className="section-heading">
            <div>
              <h2>The next big conversation.</h2>
              <p>Draft, edit, and schedule your own daily prompts.</p>
            </div>
            <button
              className="primary"
              onClick={() =>
                setModal({
                  type: "prompt",
                  prompt: { content: "", scheduled: "", placeholder: 0 },
                })
              }
            >
              <Plus size={16} /> New prompt
            </button>
          </div>
          {data.prompts.map((p: any) => (
            <div className="panel admin-row" key={p.id}>
              <CalendarDays size={22} />
              <div>
                <span className="pill">
                  {p.state} {p.placeholder ? "· PLACEHOLDER" : ""}
                </span>
                <h3>{p.content}</h3>
                <p>
                  {p.scheduled
                    ? `${p.scheduled} · America/New_York`
                    : p.state === "published"
                      ? "Published test or legacy round"
                      : "Unscheduled draft"}
                </p>
              </div>
              <div className="row-actions">
                <button
                  className="icon-button"
                  onClick={() => setModal({ type: "prompt", prompt: p })}
                  aria-label="Edit prompt"
                >
                  <Pencil size={17} />
                </button>
                <button
                  className="secondary"
                  disabled={busy || p.state === "published"}
                  onClick={() => setModal({ type: "schedule", prompt: p })}
                >
                  Schedule <ArrowUpRight size={15} />
                </button>
                <button
                  className="icon-button"
                  disabled={busy}
                  onClick={() =>
                    act(
                      { action: "deletePrompt", id: p.id },
                      "Prompt deleted. Published round copies are preserved.",
                    )
                  }
                  aria-label="Delete prompt"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
          ))}
          {!data.prompts.length && (
            <Empty
              icon={CalendarDays}
              title="A blank page, in a good way."
              text="Create your first prompt or load a small set of placeholders."
            />
          )}
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              act(
                { action: "seed" },
                "Placeholder samples loaded. Existing edits preserved.",
              )
            }
          >
            Load placeholder samples <Plus size={15} />
          </button>
        </>
      ) : tab === "catalog" ? (
        <>
          <div className="section-heading">
            <div>
              <h2>The Algorithm™ catalog</h2>
              <p>
                Names, visuals, availability, prices, and four configurable
                effect types.
              </p>
            </div>
            <button
              className="primary"
              onClick={() =>
                setModal({
                  type: "item",
                  item: {
                    name: "",
                    description: "",
                    icon: "Zap",
                    cost: 80,
                    effect: "word_limit",
                    parameter: 15,
                    enabled: 1,
                    placeholder: 0,
                  },
                })
              }
            >
              <Plus size={16} /> New item
            </button>
          </div>
          {data.catalog.map((x: any) => (
            <div className="panel admin-row" key={x.id}>
              <div className={`catalog-icon art-${x.effect}`}>
                {(() => {
                  const I = icons[x.icon] || Zap;
                  return <I size={25} />;
                })()}
              </div>
              <div>
                <h3>
                  {x.name}{" "}
                  {x.placeholder ? (
                    <span className="placeholder-label">PLACEHOLDER</span>
                  ) : null}
                </h3>
                <p>
                  {x.cost} Likes · {benefit(x)} ·{" "}
                  {x.enabled ? "Enabled" : "Disabled"}
                </p>
              </div>
              <div className="row-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    act(
                      { action: "item", item: { ...x, enabled: !x.enabled } },
                      "Item availability updated.",
                    )
                  }
                >
                  {x.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  className="icon-button"
                  onClick={() => setModal({ type: "item", item: x })}
                  aria-label={`Edit ${x.name}`}
                >
                  <Pencil size={18} />
                </button>
              </div>
            </div>
          ))}
        </>
      ) : tab === "economy" ? (
        <>
          <div className="section-heading">
            <div>
              <h2>Balance the playing field.</h2>
              <p>These values apply only to rounds published after you save.</p>
            </div>
          </div>
          <form
            className="panel settings-form"
            onSubmit={(e) => {
              e.preventDefault();
              act(
                { action: "settings", rules },
                "Economy saved. Existing round snapshots are unchanged.",
              );
            }}
          >
            <h3>Likes earning rates</h3>
            <div className="form-grid">
              {number("New player starting Likes", "startingLikes")}
            </div>
            <p className="help">
              Starting Likes are granted once per player. Updating this amount
              applies to future players.
            </p>
            <div className="form-grid">
              {number("Eligible response", "submissionClout")}
              {number("Voting participation", "votingClout")}
              {rules.podiumClout.map((n: number, i: number) => (
                <label className="form-label" key={i}>
                  Place {i + 1} Likes
                  <input
                    type="number"
                    min="0"
                    value={n}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        podiumClout: rules.podiumClout.map(
                          (v: number, j: number) =>
                            j === i ? Number(e.target.value) : v,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <h3>Competition defaults</h3>
            <div className="form-grid">
              {number("Default word limit", "wordLimit")}
              {number("Minimum entries for ranked rewards", "minEntries")}
              {rules.votePoints.map((n: number, i: number) => (
                <label className="form-label" key={i}>
                  {
                    [
                      "First favorite",
                      "Second favorite",
                      "Third favorite",
                      "Downvote",
                    ][i]
                  }{" "}
                  points
                  <input
                    type="number"
                    value={n}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        votePoints: rules.votePoints.map(
                          (v: number, j: number) =>
                            j === i ? Number(e.target.value) : v,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <h3>Exclusive follower rewards</h3>
            <div className="form-grid">
              {rules.followers.map((n: number, i: number) => (
                <label className="form-label" key={i}>
                  {
                    [
                      "First",
                      "Second",
                      "Third",
                      "Top 10%",
                      "Top 25%",
                      "Participation",
                      "Last place",
                    ][i]
                  }
                  <input
                    type="number"
                    min="0"
                    value={n}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        followers: rules.followers.map(
                          (v: number, j: number) =>
                            j === i ? Number(e.target.value) : v,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <button className="primary" disabled={busy}>
              Save economy <Check size={16} />
            </button>
          </form>
        </>
      ) : tab === "inventory" ? (
        <>
          <div className="section-heading">
            <div>
              <h2>A little behind-the-scenes management.</h2>
              <p>
                Adjust inventory and issue auditable Likes grants for testing or
                support.
              </p>
            </div>
          </div>
          <div className="panel settings-form">
            <label className="form-label">
              Player
              <select value={user} onChange={(e) => setUser(e.target.value)}>
                {data.players.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="stock-summary">
              {data.adminInventory
                .filter((x: any) => x.user_id === user)
                .map((x: any) => (
                  <span key={x.item_id}>
                    {x.name}
                    <b>{x.quantity} owned</b>
                  </span>
                ))}
              {!data.adminInventory.some((x: any) => x.user_id === user) && (
                <p>No inventory yet.</p>
              )}
            </div>
            <h3>Inventory adjustment</h3>
            <div className="form-grid">
              <label className="form-label">
                Shop item
                <select value={item} onChange={(e) => setItem(e.target.value)}>
                  <option value="">Select item</option>
                  {data.catalog.map((x: any) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                Quantity change (−100 to +100)
                <input
                  type="number"
                  min="-100"
                  max="100"
                  value={delta}
                  onChange={(e) => setDelta(Number(e.target.value))}
                />
              </label>
            </div>
            <button
              className="secondary"
              disabled={busy || !item}
              onClick={() =>
                act(
                  { action: "inventory", userId: user, itemId: item, delta },
                  "Inventory adjusted and audited.",
                )
              }
            >
              <Package size={16} /> Apply adjustment
            </button>
            <h3>Auditable Likes grant</h3>
            <div className="form-grid">
              <label className="form-label">
                Amount
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              </label>
              <label className="form-label">
                Reason
                <input
                  required
                  value={note}
                  maxLength={200}
                  placeholder="e.g. Placeholder economy testing"
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            </div>
            <button
              className="secondary"
              disabled={busy || !note.trim()}
              onClick={() =>
                act(
                  { action: "grant", userId: user, amount, note },
                  "Likes granted with an immutable ledger entry.",
                )
              }
            >
              <Gift size={16} /> Issue grant
            </button>
          </div>
        </>
      ) : tab === "profiles" ? (
        <SocialAdmin data={data} busy={busy} act={act} />
      ) : tab === "rounds" ? (
        <>
          <div className="section-heading">
            <div>
              <h2>Round control.</h2>
              <p>
                Deadlines enforce phases automatically. Eligible rounds finalize
                on the next game request.
              </p>
            </div>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => act({ action: "refresh" }, "Rounds refreshed.")}
            >
              Retry finalization
            </button>
          </div>
          {data.rounds.map((r: any) => (
            <div className="panel admin-row" key={r.id}>
              <div>
                <span className="pill">
                  #{r.number} · {r.phase}
                </span>
                <h3>{r.prompt}</h3>
                <p>
                  Opens {date(r.opens)} ET · submissions close{" "}
                  {deadlineDate(r.closes)} ET · voting ends{" "}
                  {deadlineDate(r.ends)} ET
                </p>
                <small>
                  {r.finalized
                    ? "Finalized once · rewards settled"
                    : "Awaiting finalization"}{" "}
                  · settings frozen
                </small>
              </div>
              <button
                className="secondary"
                disabled={busy || r.finalized || r.cancelled}
                onClick={() =>
                  act(
                    { action: "cancel", id: r.id },
                    "Round cancelled. No competitive rewards will settle.",
                  )
                }
              >
                Cancel round
              </button>
            </div>
          ))}
        </>
      ) : (
        <>
          <div className="section-heading">
            <div>
              <h2>A record you can trust.</h2>
              <p>Owner changes are timestamped and immutable.</p>
            </div>
          </div>
          {data.audit.map((a: any, i: number) => (
            <details className="panel audit-row" key={i}>
              <summary>
                {a.action}
                <span>{date(a.created)} ET</span>
              </summary>
              <pre>{a.payload}</pre>
            </details>
          ))}
        </>
      )}
    </main>
  );
}
function ItemEditor({ item, busy, close, save }: any) {
  const [x, setX] = useState(item);
  const change = (key: string, value: any) => setX({ ...x, [key]: value });
  return (
    <Modal title={x.id ? "Edit shop item" : "Create shop item"} close={close}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          save(x);
        }}
      >
        <label className="form-label">
          Item name
          <input
            required
            maxLength={80}
            value={x.name}
            onChange={(e) => change("name", e.target.value)}
          />
        </label>
        <label className="form-label">
          Description
          <textarea
            required
            maxLength={1000}
            value={x.description}
            onChange={(e) => change("description", e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label className="form-label">
            Price in Likes
            <input
              type="number"
              required
              min="0"
              max="100000"
              value={x.cost}
              onChange={(e) => change("cost", Number(e.target.value))}
            />
          </label>
          <label className="form-label">
            Icon
            <select
              value={x.icon}
              onChange={(e) => change("icon", e.target.value)}
            >
              {Object.keys(icons).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="form-label">
          Image URL (optional, HTTPS)
          <input
            type="url"
            value={x.image || ""}
            onChange={(e) => change("image", e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label className="form-label">
            Supported effect
            <select
              value={x.effect}
              onChange={(e) => change("effect", e.target.value)}
            >
              {EFFECTS.map((k) => (
                <option key={k} value={k}>
                  {effectLabels[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            {x.effect === "word_limit"
              ? "Word limit"
              : x.effect === "downvote_shield"
                ? "Downvotes negated"
                : "Multiplier"}
            <input
              type="number"
              required
              min="1"
              max="100"
              value={x.parameter}
              onChange={(e) => change("parameter", Number(e.target.value))}
            />
          </label>
        </div>
        <div className="form-grid">
          <label className="form-label">
            Available from (your browser’s time zone)
            <input
              type="datetime-local"
              defaultValue={
                x.available_from ? localInput(x.available_from) : ""
              }
              onChange={(e) =>
                change(
                  "available_from",
                  e.target.value ? new Date(e.target.value).getTime() : null,
                )
              }
            />
          </label>
          <label className="form-label">
            Available until
            <input
              type="datetime-local"
              defaultValue={
                x.available_until ? localInput(x.available_until) : ""
              }
              onChange={(e) =>
                change(
                  "available_until",
                  e.target.value ? new Date(e.target.value).getTime() : null,
                )
              }
            />
          </label>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={!!x.enabled}
            onChange={(e) => change("enabled", e.target.checked ? 1 : 0)}
          />{" "}
          Enabled in shop and available for activation
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={!!x.placeholder}
            onChange={(e) => change("placeholder", e.target.checked ? 1 : 0)}
          />{" "}
          Clearly mark as placeholder content
        </label>
        <div className="info-bar">
          <Info size={16} />
          Changing this item affects future activations. Existing active effects
          retain their original parameters.
        </div>
        <button className="primary full" disabled={busy}>
          Save item <Check size={16} />
        </button>
      </form>
    </Modal>
  );
}
function PromptEditor({ prompt, busy, close, save }: any) {
  const [x, setX] = useState(prompt);
  return (
    <Modal title="Write tomorrow’s discourse." close={close}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          save(x);
        }}
      >
        <label className="form-label">
          Prompt
          <textarea
            required
            value={x.content}
            maxLength={1000}
            onChange={(e) => setX({ ...x, content: e.target.value })}
          />
        </label>
        <label className="form-label">
          Planned daily date (America/New_York)
          <input
            type="date"
            value={x.scheduled || ""}
            onChange={(e) => setX({ ...x, scheduled: e.target.value })}
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={!!x.placeholder}
            onChange={(e) =>
              setX({ ...x, placeholder: e.target.checked ? 1 : 0 })
            }
          />{" "}
          Mark as placeholder
        </label>
        <p className="help">
          Saving keeps a draft or planned prompt. Use Schedule to publish its
          actual round and freeze that round’s rules.
        </p>
        <button className="primary full" disabled={busy}>
          Save prompt <Check size={16} />
        </button>
      </form>
    </Modal>
  );
}
function ScheduleEditor({ prompt, busy, close, save }: any) {
  const [day, setDay] = useState(prompt.scheduled || nextDay(easternDay(), 1)),
    [sandbox, setSandbox] = useState(false);
  return (
    <Modal title="Schedule a round." close={close}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          save(sandbox ? { mode: "test" } : { mode: "daily", day });
        }}
      >
        <p>{prompt.content}</p>
        <label className="form-label">
          Submission date · 00:00–23:59 Eastern
          <input
            required={!sandbox}
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
        <div className="info-bar">
          <Clock size={17} />
          Submissions open at 00:00 and remain open through 23:59 Eastern on the
          selected day. Voting runs 00:00–23:59 the next day, alongside that
          day’s new prompt. Queue one prompt per day in advance; the server
          calculates all deadlines using New York’s clock.
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={sandbox}
            onChange={(e) => setSandbox(e.target.checked)}
          />{" "}
          Test-only exception: 2-minute submissions + 2-minute voting
        </label>
        <button className="primary full" disabled={busy}>
          Schedule & snapshot rules <CalendarDays size={16} />
        </button>
      </form>
    </Modal>
  );
}

function localInput(epoch: number) {
  const d = new Date(epoch);
  return new Date(epoch - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
