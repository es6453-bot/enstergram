"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, @next/next/no-img-element */
import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Check,
  Flame,
  Pencil,
  Plus,
  Snowflake,
  Sparkles,
  Trophy,
  X,
  ArrowUp,
  ArrowDown,
  Gift,
  Eye,
} from "lucide-react";
import {
  APPEARANCE_DEFAULTS,
  COSMETIC_EFFECTS,
  UNLOCK_TYPES,
} from "../lib/progression";

const labels: Record<string, string> = {
  theme: "Themes",
  frame: "Avatar frames",
  profile_effect: "Profile effects",
  banner_pattern: "Banner patterns",
  badge: "Badges",
  title: "Profile titles",
};
const friendly = (s: string) => s.replaceAll("_", " ");
function Mark({ item }: any) {
  return item.image ? (
    <img
      className="cosmetic-mark"
      src={item.image}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  ) : (
    <span aria-hidden="true">{item.icon}</span>
  );
}
export function ProfileCard({
  profile,
  compact = false,
  allowAnimations = true,
}: any) {
  const a = profile.appearance || APPEARANCE_DEFAULTS;
  const equipped = profile.equipped || [];
  const find = (kind: string) => equipped.find((x: any) => x.kind === kind);
  const theme = find("theme"),
    frame = find("frame"),
    effect = find("profile_effect"),
    pattern = find("banner_pattern"),
    title = find("title");
  const safeEffect = COSMETIC_EFFECTS.profile_effect.includes(effect?.effect)
    ? effect?.effect
    : "none";
  const safePattern = COSMETIC_EFFECTS.banner_pattern.includes(pattern?.effect)
    ? pattern?.effect
    : "none";
  const safeFrame = COSMETIC_EFFECTS.frame.includes(frame?.effect)
    ? frame?.effect
    : "none";
  const primary = theme?.params.primary || a.primary,
    secondary =
      theme?.effect === "solid"
        ? primary
        : theme?.params.secondary || a.secondary;
  const vars = {
    "--profile-primary": primary,
    "--profile-secondary": secondary,
    "--profile-accent": theme?.params.accent || a.accent,
    "--username-color": a.usernameColor,
    "--frame-color": frame?.params.primary || a.accent,
    "--frame-second": frame?.params.secondary || a.accent,
    "--frame-size": `${frame?.params.size || 2}px`,
    "--effect-color": effect?.params.primary || a.accent,
    "--effect-opacity": (effect?.params.opacity || 20) / 100,
    "--effect-duration": `${effect?.params.speed || 6}s`,
    "--pattern-color": pattern?.params.primary || a.accent,
    "--pattern-size": `${(pattern?.params.size || 3) * 6}px`,
    "--pattern-opacity": (pattern?.params.opacity || 20) / 100,
  } as CSSProperties;
  const tier = profile.tier?.current;
  return (
    <article
      className={`creator-card ${compact ? "compact" : ""} ${a.animations && allowAnimations ? "" : "motion-off"}`}
      style={vars}
    >
      <div className="profile-banner">
        {a.banner && (
          <img
            src={a.banner}
            alt="Profile banner"
            referrerPolicy="no-referrer"
          />
        )}
        <div
          className={`banner-pattern pattern-${safePattern}`}
          aria-hidden="true"
        />
      </div>
      <div
        className={`profile-visual-effect effect-${safeEffect}`}
        aria-hidden="true"
      >
        <span>✦</span>
        <span>✧</span>
        <span>✦</span>
      </div>
      <div className="creator-card-body">
        <div className="profile-identity-row">
          <div className={`profile-avatar frame-${safeFrame}`}>
            {a.avatar ? (
              <img
                src={a.avatar}
                alt={`${profile.name}’s avatar`}
                referrerPolicy="no-referrer"
              />
            ) : (
              <span>{profile.name?.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <div className="profile-badges" aria-label="Displayed badges">
            {equipped
              .filter((x: any) => x.kind === "badge")
              .map((x: any) => (
                <span
                  key={x.id}
                  title={x.name}
                  aria-label={x.name}
                  style={{ color: x.params.primary }}
                >
                  <Mark item={x} />
                </span>
              ))}
          </div>
        </div>
        <h2 className="profile-display-name">{profile.name}</h2>
        {title && (
          <p className="profile-title" style={{ color: title.params.primary }}>
            {title.name}
          </p>
        )}
        {tier && (
          <div className="tier-label" style={{ color: tier.color }}>
            <Mark item={tier} />
            <b>{tier.name}</b>
          </div>
        )}
        {!compact && (
          <>
            <p className="profile-bio">
              {a.bio || "Your bio is waiting for its main-character moment."}
            </p>
            <div className="profile-followers">
              <b>
                {new Intl.NumberFormat("en-US").format(profile.followers || 0)}
              </b>{" "}
              followers
            </div>
          </>
        )}
      </div>
    </article>
  );
}
export function TierMeter({ tier, celebration, dismiss }: any) {
  return (
    <section className="panel tier-panel">
      <div className="eyebrow">YOUR INFLUENCE</div>
      <h2>{tier.current?.name || "Your story starts here"}</h2>
      <p>
        {tier.current?.description || "Play a round and find your audience."}
      </p>
      <div
        className="tier-track"
        role="progressbar"
        aria-label="Progress toward next influencer tier"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(tier.progress)}
      >
        <span
          style={{
            width: `${tier.progress}%`,
            background: `linear-gradient(90deg,${tier.current?.color || "#bba2ff"},${tier.current?.color_end || "#ed68bb"})`,
          }}
        />
      </div>
      <p className="help">
        {tier.next
          ? `${tier.remaining.toLocaleString()} followers to ${tier.next.name}`
          : "You’ve reached the highest enabled tier."}
      </p>
      {celebration && (
        <div className="tier-celebration" role="status">
          <Trophy size={20} />
          <div>
            <b>A new signal: {celebration.name}</b>
            <p>Your audience grew. Your voting power stays the same.</p>
          </div>
          <button
            className="icon-button"
            onClick={dismiss}
            aria-label="Dismiss tier celebration"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
export function StreakPanel({ social, small = false }: any) {
  const s = social.streak,
    upcoming = s.milestones.find((x: any) => x.days > s.longest);
  return (
    <section className={`panel streak-panel ${small ? "small-streak" : ""}`}>
      <div className="section-heading">
        <div>
          <div className="eyebrow">CONSISTENTLY A LITTLE ONLINE</div>
          <h2>
            <Flame size={20} /> {s.current} day streak
          </h2>
        </div>
        <span className="freeze-chip">
          <Snowflake size={15} /> {s.freeze_balance}{" "}
          {s.freeze_balance === 1 ? "freeze" : "freezes"}
        </span>
      </div>
      <p>
        Longest: <b>{s.longest}</b> · Participation days: <b>{s.active_days}</b>
      </p>
      <div
        className="activity-week"
        aria-label="Seven-day participation calendar"
      >
        {s.days.map((d: any) => (
          <div
            key={d.day}
            className={`activity-day day-${d.status}`}
            title={`${d.day}: ${d.status}`}
          >
            <span>
              {new Date(`${d.day}T12:00:00Z`).toLocaleDateString("en-US", {
                weekday: "short",
                timeZone: "UTC",
              })}
            </span>
            <b aria-label={d.status}>
              {d.status === "active" ? (
                <Check size={17} />
              ) : d.status === "frozen" ? (
                <Snowflake size={16} />
              ) : d.status === "missed" ? (
                "–"
              ) : (
                "·"
              )}
            </b>
            <small>{d.day.slice(8)}</small>
          </div>
        ))}
      </div>
      <p className="help">
        {s.days.at(-1)?.status === "active"
          ? "You showed up. The algorithm noticed."
          : "Submit a valid take or save a valid ballot to check in today."}{" "}
        Both count as one day.
      </p>
      {!small && (
        <>
          <div className="streak-legend">
            <span>
              <Check size={13} /> Active
            </span>
            <span>
              <Snowflake size={13} /> Protected
            </span>
            <span>– Missed</span>
          </div>
          <p className="help">
            {social.settings.freezesPerPeriod} free{" "}
            {social.settings.freezeFrequency === "weekly"
              ? "every Monday"
              : "on the first of each month"}{" "}
            · bank limit {social.settings.freezeBankLimit}. Freezes preserve
            your streak count, without adding activity days. Today stays open
            until 23:59 Eastern.
          </p>
          <div className="milestone-next">
            <Sparkles size={18} />
            <div>
              <b>
                {upcoming
                  ? `Next: ${upcoming.name}`
                  : "All current milestones unlocked."}
              </b>
              <p>
                {upcoming
                  ? `${upcoming.days - s.longest} more active days in a protected streak · ${upcoming.cosmetic_name}`
                  : "The owner can add more cosmetic milestones."}
              </p>
            </div>
          </div>
          <p className="help">
            Your followers, Likes, and earned cosmetics stay yours when life
            happens.
          </p>
        </>
      )}
    </section>
  );
}
function selectionFrom(profile: any) {
  const equipped: any = {
    theme: "",
    frame: "",
    profile_effect: "",
    banner_pattern: "",
    title: "",
    badges: [],
  };
  for (const x of profile.equipped) {
    if (x.kind === "badge") equipped.badges.push(x.id);
    else equipped[x.kind] = x.id;
  }
  return equipped;
}
export function ProfilePage({ data, busy, act, edit = false }: any) {
  const social = data.social;
  const [appearance, setAppearance] = useState({
    ...social.profile.appearance,
    name: social.profile.name,
  });
  const [equipped, setEquipped] = useState<any>(selectionFrom(social.profile));
  const [preview, setPreview] = useState<any>(null),
    [category, setCategory] = useState("theme"),
    [editing, setEditing] = useState(edit);
  useEffect(() => {
    setAppearance({ ...social.profile.appearance, name: social.profile.name });
    setEquipped(selectionFrom(social.profile));
    setPreview(null);
  }, [social.profileRevision]); // eslint-disable-line react-hooks/exhaustive-deps
  const owned = new Set(social.ownership.map((x: any) => x.item_id));
  const selectedIds = [
    ...Object.values(equipped).filter((x) => typeof x === "string" && x),
    ...equipped.badges,
  ];
  let items = social.cosmetics.filter((x: any) => selectedIds.includes(x.id));
  if (preview)
    items = [
      ...items.filter(
        (x: any) =>
          x.id !== preview.id &&
          (x.kind !== preview.kind || x.kind === "badge"),
      ),
      preview,
    ];
  const profile = {
    ...social.profile,
    name: appearance.name,
    appearance,
    equipped: items,
  };
  const reset = () => {
    setAppearance({ ...social.profile.appearance, name: social.profile.name });
    setEquipped(selectionFrom(social.profile));
    setPreview(null);
  };
  const choose = (x: any) => {
    setPreview(null);
    if (x.kind === "badge")
      setEquipped({
        ...equipped,
        badges: equipped.badges.includes(x.id)
          ? equipped.badges.filter((id: string) => id !== x.id)
          : equipped.badges.length < social.settings.maxBadges
            ? [...equipped.badges, x.id]
            : equipped.badges,
      });
    else
      setEquipped({
        ...equipped,
        [x.kind]: equipped[x.kind] === x.id ? "" : x.id,
      });
  };
  return (
    <main className="profile-main">
      <div className="eyebrow">YOUR CORNER OF ESTERGRAM</div>
      <div className="section-heading">
        <div>
          <h1>{editing ? "Make it feel like you." : "Your online persona."}</h1>
          <p>A little personality. Zero extra voting power.</p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setEditing(!editing);
            if (editing) reset();
          }}
        >
          <Pencil size={16} />
          {editing ? "Back to profile" : "Edit profile"}
        </button>
      </div>
      <div className="profile-layout">
        <aside className="profile-preview">
          <span className="eyebrow">
            {editing ? "LIVE PREVIEW" : "PROFILE CARD"}
          </span>
          <ProfileCard profile={editing ? profile : social.profile} />
          {preview && (
            <div className="info-bar">
              <Eye size={16} />
              <div>
                Previewing {preview.name}.{" "}
                {owned.has(preview.id)
                  ? "Use Equip to save this look."
                  : "Unlock this item before equipping."}
                <button
                  className="text-button"
                  onClick={() => setPreview(null)}
                >
                  Clear preview
                </button>
              </div>
            </div>
          )}
          <TierMeter
            tier={social.profile.tier}
            celebration={social.celebration}
            dismiss={() =>
              act({ action: "dismissTier" }, "Your next era awaits.")
            }
          />
        </aside>
        <div className="profile-controls">
          {editing ? (
            <>
              <form
                className="panel profile-editor"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await act(
                      {
                        action: "saveProfile",
                        appearance,
                        equipped,
                        revision: social.profileRevision,
                      },
                      "Profile saved. Main-character energy, secured.",
                    )
                  )
                    setPreview(null);
                }}
              >
                <div className="section-heading">
                  <h2>The basics.</h2>
                  <span className="pill">ONLY YOUR PROFILE</span>
                </div>
                <label className="form-label">
                  Display name
                  <input
                    required
                    maxLength={48}
                    value={appearance.name}
                    onChange={(e) =>
                      setAppearance({ ...appearance, name: e.target.value })
                    }
                  />
                </label>
                <label className="form-label">
                  Bio
                  <textarea
                    maxLength={300}
                    value={appearance.bio}
                    placeholder="Ten words of fame, a few more words of personality."
                    onChange={(e) =>
                      setAppearance({ ...appearance, bio: e.target.value })
                    }
                  />
                </label>
                <div className="form-grid">
                  {["avatar", "banner"].map((k) => (
                    <label key={k} className="form-label">
                      {k === "avatar" ? "Avatar" : "Banner"} HTTPS image URL
                      <input
                        type="url"
                        maxLength={1500}
                        value={appearance[k]}
                        placeholder="https://…"
                        onChange={(e) =>
                          setAppearance({ ...appearance, [k]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                </div>
                <p className="help">
                  Use a direct HTTPS image link. Leave it blank for your initial
                  or the theme background.
                </p>
                <div className="profile-colors">
                  {[
                    ["primary", "Background start"],
                    ["secondary", "Background end"],
                    ["accent", "Accent"],
                    ["usernameColor", "Name color"],
                  ].map(([key, label]) => (
                    <label className="form-label" key={key}>
                      {label}
                      <input
                        type="color"
                        value={appearance[key]}
                        onChange={(e) =>
                          setAppearance({
                            ...appearance,
                            [key]: e.target.value,
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <p className="help">
                  An equipped theme overrides background and accent colors.
                  Unequip it to use your custom palette.
                </p>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={appearance.animations}
                    onChange={(e) =>
                      setAppearance({
                        ...appearance,
                        animations: e.target.checked,
                      })
                    }
                  />
                  Enable subtle animations on your profile and profiles you
                  view. Your device’s reduced-motion preference always takes
                  priority.
                </label>
                <div className="profile-save">
                  <button className="primary" disabled={busy}>
                    Save profile <Check size={16} />
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={reset}
                  >
                    Reset changes
                  </button>
                </div>
              </form>
              <section className="panel cosmetic-wardrobe">
                <div className="section-heading">
                  <div>
                    <h2>Your cosmetic wardrobe.</h2>
                    <p>Preview anything. Equip what you own.</p>
                  </div>
                  <span className="pill">
                    {social.ownership.length} COLLECTED
                  </span>
                </div>
                <div className="tabs wardrobe-tabs">
                  {Object.keys(labels).map((k) => (
                    <button
                      key={k}
                      onClick={() => {
                        setCategory(k);
                        setPreview(null);
                      }}
                      className={category === k ? "selected" : ""}
                    >
                      {labels[k]}
                    </button>
                  ))}
                </div>
                {category === "badge" && (
                  <p className="help">
                    Select up to {social.settings.maxBadges} badges ·{" "}
                    {equipped.badges.length} selected.
                  </p>
                )}
                <div className="cosmetic-grid">
                  {social.cosmetics
                    .filter((x: any) => x.enabled && x.kind === category)
                    .map((x: any) => {
                      const isOwned = owned.has(x.id),
                        selected = selectedIds.includes(x.id);
                      return (
                        <article
                          key={x.id}
                          className={`cosmetic-card ${selected ? "equipped" : ""}`}
                        >
                          <div
                            className="cosmetic-art"
                            style={{
                              background: `linear-gradient(135deg,${x.params.primary},${x.params.secondary})`,
                            }}
                          >
                            <Mark item={x} />
                            {selected && <Check size={17} />}
                          </div>
                          <h3>{x.name}</h3>
                          <p>{x.description}</p>
                          <small>
                            {isOwned
                              ? "Owned · permanent cosmetic"
                              : `Unlock: ${x.unlock_type === "manual" ? "owner assignment or milestone" : `${friendly(x.unlock_type)} ${x.unlock_value || ""}`}`}
                          </small>
                          <div className="row-actions">
                            <button
                              className="secondary"
                              onClick={() => setPreview(x)}
                            >
                              <Eye size={14} />
                              Preview
                            </button>
                            <button
                              className="secondary"
                              disabled={
                                !isOwned ||
                                (!selected &&
                                  x.kind === "badge" &&
                                  equipped.badges.length >=
                                    social.settings.maxBadges)
                              }
                              onClick={() => choose(x)}
                            >
                              {selected ? "Unequip" : "Equip"}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                </div>
                {!social.cosmetics.some(
                  (x: any) => x.enabled && x.kind === category,
                ) && (
                  <p className="muted">
                    No {labels[category].toLowerCase()} are available yet.
                  </p>
                )}
                <p className="help">
                  Selections are saved with the Save profile button above.
                  Cosmetics are hidden on anonymous voting cards.
                </p>
              </section>
            </>
          ) : (
            <>
              <StreakPanel social={social} />
              <section className="panel cosmetic-wardrobe">
                <h2>Your collection.</h2>
                <p>
                  {social.ownership.length} permanent cosmetics. Earned looks
                  stay yours, even if you skip a day.
                </p>
                <div className="collection-icons">
                  {social.cosmetics
                    .filter((x: any) => owned.has(x.id))
                    .map((x: any) => (
                      <span key={x.id} title={x.name} aria-label={x.name}>
                        <Mark item={x} />
                      </span>
                    ))}
                </div>
                <button className="secondary" onClick={() => setEditing(true)}>
                  Open wardrobe <ArrowRight size={15} />
                </button>
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

const defaultParams = {
  primary: "#bba2ff",
  secondary: "#252039",
  accent: "#ed68bb",
  size: 3,
  speed: 6,
  opacity: 20,
};
const newCosmetic = (kind: string) => ({
  name: "",
  description: "",
  kind,
  effect: COSMETIC_EFFECTS[kind][0],
  params: { ...defaultParams },
  icon: "✦",
  image: "",
  enabled: 1,
  unlock_type: "manual",
  unlock_value: 0,
  unlock_target: "",
  placeholder: 1,
});
export function SocialAdmin({ data, busy, act }: any) {
  const social = data.social,
    [section, setSection] = useState("tiers"),
    [editor, setEditor] = useState<any>(null),
    [settings, setSettings] = useState(social.admin.settings),
    [userId, setUserId] = useState(data.profile.id),
    [itemId, setItemId] = useState(social.cosmetics[0]?.id || ""),
    [note, setNote] = useState("");
  const set = (key: string, value: any) =>
    setEditor({ ...editor, value: { ...editor.value, [key]: value } });
  const check = (key: string, label: string) => (
    <label className="checkbox">
      <input
        type="checkbox"
        checked={!!editor.value[key]}
        onChange={(e) => set(key, e.target.checked ? 1 : 0)}
      />
      {label}
    </label>
  );
  const text = (key: string, label: string, max = 400) => (
    <label className="form-label">
      {label}
      <input
        required={key === "name"}
        maxLength={max}
        value={editor.value[key] || ""}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );
  const number = (key: string, label: string, max = 1000000000, min = 0) => (
    <label className="form-label">
      {label}
      <input
        type="number"
        required
        min={min}
        max={max}
        value={editor.value[key]}
        onChange={(e) => set(key, Number(e.target.value))}
      />
    </label>
  );
  const kind =
    section === "badges" ? "badge" : section === "themes" ? "theme" : null;
  return (
    <section className="social-admin">
      <div className="section-heading">
        <div>
          <h2>Personality, configured by you.</h2>
          <p>Tiers, cosmetics, and streaks never change competition scores.</p>
        </div>
      </div>
      <div className="tabs wardrobe-tabs">
        {[
          "tiers",
          "cosmetics",
          "badges",
          "themes",
          "streaks",
          "assignments",
        ].map((s) => (
          <button
            key={s}
            className={s === section ? "selected" : ""}
            onClick={() => {
              setSection(s);
              setEditor(null);
            }}
          >
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      {editor ? (
        <form
          className="panel social-admin-editor"
          onSubmit={async (e) => {
            e.preventDefault();
            const payload =
              editor.type === "tier"
                ? { tier: editor.value }
                : editor.type === "cosmetic"
                  ? { cosmetic: editor.value }
                  : { milestone: editor.value };
            if (
              await act(
                { action: editor.type, ...payload },
                "Saved. Existing earned cosmetics and competition rewards stay intact.",
              )
            )
              setEditor(null);
          }}
        >
          <div className="section-heading">
            <h2>
              {editor.value.id ? "Edit" : "Create"} {editor.type}
            </h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close editor"
              onClick={() => setEditor(null)}
            >
              <X size={18} />
            </button>
          </div>
          {text("name", "Name", 70)}
          {text(
            "description",
            "Description",
            editor.type === "cosmetic" ? 500 : 400,
          )}
          {editor.type === "tier" ? (
            <>
              <div className="form-grid">
                {number("threshold", "Follower threshold")}
                {number("sort_order", "Display order", 1000)}
              </div>
              <div className="form-grid">
                {text("icon", "Badge icon (short text or emoji)", 8)}
                {text("image", "Optional HTTPS badge image", 1500)}
              </div>
              <div className="profile-colors">
                {["color", "color_end"].map((k) => (
                  <label key={k} className="form-label">
                    {friendly(k)}
                    <input
                      type="color"
                      value={editor.value[k]}
                      onChange={(e) => set(k, e.target.value)}
                    />
                  </label>
                ))}
              </div>
              {check(
                "celebration",
                "Celebrate when this tier is first reached",
              )}
            </>
          ) : editor.type === "streakMilestone" ? (
            <>
              <div className="form-grid">
                {number("days", "Protected streak: active days", 100000, 1)}
                <label className="form-label">
                  Cosmetic reward
                  <select
                    required
                    value={editor.value.cosmetic_id}
                    onChange={(e) => set("cosmetic_id", e.target.value)}
                  >
                    {social.cosmetics.map((x: any) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="help">
                Milestones grant cosmetics once. Freeze days preserve the streak
                but add no activity days.
              </p>
            </>
          ) : (
            <>
              <div className="form-grid">
                <label className="form-label">
                  Item type
                  <select
                    disabled={!!editor.value.id}
                    value={editor.value.kind}
                    onChange={(e) => {
                      const k = e.target.value;
                      setEditor({
                        ...editor,
                        value: {
                          ...editor.value,
                          kind: k,
                          effect: COSMETIC_EFFECTS[k][0],
                        },
                      });
                    }}
                  >
                    {Object.keys(labels).map((k) => (
                      <option key={k} value={k}>
                        {labels[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-label">
                  Supported effect
                  <select
                    value={editor.value.effect}
                    onChange={(e) => set("effect", e.target.value)}
                  >
                    {COSMETIC_EFFECTS[editor.value.kind].map((k) => (
                      <option key={k} value={k}>
                        {friendly(k)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-grid">
                {text("icon", "Icon (short text or emoji)", 8)}
                {text("image", "Optional HTTPS icon image", 1500)}
              </div>
              <div className="profile-colors">
                {["primary", "secondary", "accent"].map((k) => (
                  <label key={k} className="form-label">
                    {k} color
                    <input
                      type="color"
                      value={editor.value.params[k]}
                      onChange={(e) =>
                        set("params", {
                          ...editor.value.params,
                          [k]: e.target.value,
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="form-grid">
                {[
                  ["size", "Size / density", 1, 8],
                  ["speed", "Animation seconds", 2, 20],
                  ["opacity", "Effect opacity %", 5, 60],
                ].map(([k, label, min, max]: any) => (
                  <label className="form-label" key={k}>
                    {label}
                    <input
                      type="number"
                      min={min}
                      max={max}
                      required
                      value={editor.value.params[k]}
                      onChange={(e) =>
                        set("params", {
                          ...editor.value.params,
                          [k]: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <div
                className="cosmetic-art admin-effect-preview"
                style={{
                  background: `linear-gradient(135deg,${editor.value.params.primary},${editor.value.params.secondary})`,
                  color: editor.value.params.accent,
                }}
              >
                <Mark item={editor.value} />
                <span>
                  {friendly(editor.value.effect)} · safe built-in renderer
                </span>
              </div>
              <div className="form-grid">
                <label className="form-label">
                  Unlock rule
                  <select
                    value={editor.value.unlock_type}
                    onChange={(e) => set("unlock_type", e.target.value)}
                  >
                    {UNLOCK_TYPES.map((k) => (
                      <option key={k} value={k}>
                        {friendly(k)}
                      </option>
                    ))}
                  </select>
                </label>
                {number(
                  "unlock_value",
                  "Follower / streak / activity threshold",
                )}
              </div>
              {editor.value.unlock_type === "tier" ? (
                <label className="form-label">
                  Required tier
                  <select
                    required
                    value={editor.value.unlock_target}
                    onChange={(e) => set("unlock_target", e.target.value)}
                  >
                    <option value="">Choose tier</option>
                    {social.tiers.map((x: any) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                text(
                  "unlock_target",
                  "Optional event / achievement / future shop reference",
                  100,
                )
              )}
              <p className="help">
                All, follower, tier, streak and participation unlocks run
                automatically. Manual, achievement, event and shop references
                use owner assignment for now; shop references reserve future
                integration. No cosmetic purchase charges are implemented.
              </p>
            </>
          )}
          {check("enabled", "Enabled")}
          {check("placeholder", "Clearly label as placeholder content")}
          <button className="primary" disabled={busy}>
            Save {editor.type} <Check size={16} />
          </button>
        </form>
      ) : section === "tiers" ? (
        <>
          <div className="section-heading">
            <p>
              Follower thresholds determine progression; arrows arrange the tier
              list.
            </p>
            <button
              className="primary"
              onClick={() =>
                setEditor({
                  type: "tier",
                  value: {
                    name: "",
                    description: "",
                    icon: "✦",
                    image: "",
                    color: "#bba2ff",
                    color_end: "#ed68bb",
                    threshold: 0,
                    sort_order: social.tiers.length,
                    enabled: 1,
                    celebration: 1,
                    placeholder: 1,
                  },
                })
              }
            >
              <Plus size={16} />
              Add tier
            </button>
          </div>
          {social.tiers.map((t: any, i: number) => (
            <div className="panel admin-row" key={t.id}>
              <span className="tier-admin-icon" style={{ color: t.color }}>
                <Mark item={t} />
              </span>
              <div>
                <h3>{t.name}</h3>
                <p>
                  {t.threshold.toLocaleString()} followers ·{" "}
                  {t.enabled ? "Enabled" : "Disabled"}
                  {t.placeholder ? " · PLACEHOLDER" : ""}
                </p>
                <small>{t.description}</small>
              </div>
              <div className="row-actions">
                <button
                  className="icon-button"
                  disabled={busy || i === 0}
                  aria-label={`Move ${t.name} up`}
                  onClick={() => {
                    const ids = social.tiers.map((x: any) => x.id);
                    [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                    act({ action: "reorderTiers", ids }, "Tier order saved.");
                  }}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  className="icon-button"
                  disabled={busy || i === social.tiers.length - 1}
                  aria-label={`Move ${t.name} down`}
                  onClick={() => {
                    const ids = social.tiers.map((x: any) => x.id);
                    [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
                    act({ action: "reorderTiers", ids }, "Tier order saved.");
                  }}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  className="secondary"
                  onClick={() => setEditor({ type: "tier", value: t })}
                >
                  <Pencil size={15} />
                  Edit
                </button>
              </div>
            </div>
          ))}
        </>
      ) : ["cosmetics", "badges", "themes"].includes(section) ? (
        <>
          <div className="section-heading">
            <p>
              Editable placeholders · theme presets and badges share the
              cosmetic catalog.
            </p>
            <button
              className="primary"
              onClick={() =>
                setEditor({
                  type: "cosmetic",
                  value: newCosmetic(kind || "frame"),
                })
              }
            >
              <Plus size={16} />
              Add {kind || "cosmetic"}
            </button>
          </div>
          <div className="cosmetic-grid">
            {social.cosmetics
              .filter((x: any) => !kind || x.kind === kind)
              .map((x: any) => (
                <article className="panel cosmetic-card" key={x.id}>
                  <div
                    className="cosmetic-art"
                    style={{
                      background: `linear-gradient(135deg,${x.params.primary},${x.params.secondary})`,
                    }}
                  >
                    <Mark item={x} />
                  </div>
                  <h3>{x.name}</h3>
                  <p>{x.description}</p>
                  <small>
                    {friendly(x.kind)} · {x.enabled ? "Enabled" : "Disabled"}
                    {x.placeholder ? " · PLACEHOLDER" : ""}
                  </small>
                  <small>
                    {friendly(x.unlock_type)} {x.unlock_value || ""}
                  </small>
                  <button
                    className="secondary"
                    onClick={() => setEditor({ type: "cosmetic", value: x })}
                  >
                    <Pencil size={15} />
                    Edit configuration
                  </button>
                </article>
              ))}
          </div>
        </>
      ) : section === "streaks" ? (
        <>
          <form
            className="panel social-admin-editor"
            onSubmit={(e) => {
              e.preventDefault();
              act(
                { action: "socialSettings", settings },
                "Settings saved for tomorrow Eastern. Past streak decisions remain unchanged.",
              );
            }}
          >
            <h2>Forgiving by default.</h2>
            <div className="form-grid">
              <label className="form-label">
                Freeze refill frequency
                <select
                  value={settings.freezeFrequency}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      freezeFrequency: e.target.value,
                    })
                  }
                >
                  <option value="weekly">Weekly · Monday</option>
                  <option value="monthly">Monthly · first day</option>
                </select>
              </label>
              {[
                ["freezesPerPeriod", "Free freezes per refill", 0, 5],
                ["freezeBankLimit", "Maximum banked freezes", 0, 10],
                ["maxBadges", "Prominent badge limit", 0, 6],
              ].map(([k, label, min, max]: any) => (
                <label className="form-label" key={k}>
                  {label}
                  <input
                    required
                    type="number"
                    min={min}
                    max={max}
                    value={settings[k]}
                    onChange={(e) =>
                      setSettings({ ...settings, [k]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
            </div>
            <p className="help">
              Changes start tomorrow at 00:00 Eastern. Refills cap the bank;
              unused freezes never accumulate without limit. Existing decisions
              and earned cosmetics are permanent.
            </p>
            <button className="primary" disabled={busy}>
              Save settings <Check size={16} />
            </button>
            {social.admin.effectiveDay > social.streak.today && (
              <p className="help">
                Latest settings are queued for {social.admin.effectiveDay}.
              </p>
            )}
          </form>
          <div className="section-heading">
            <h2>Cosmetic streak milestones.</h2>
            <button
              className="secondary"
              disabled={!social.cosmetics.length}
              onClick={() =>
                setEditor({
                  type: "streakMilestone",
                  value: {
                    name: "",
                    description: "",
                    days: 7,
                    cosmetic_id: social.cosmetics[0]?.id,
                    enabled: 1,
                    placeholder: 1,
                  },
                })
              }
            >
              <Plus size={16} />
              Add milestone
            </button>
          </div>
          {social.admin.milestones.map((m: any) => (
            <div className="panel admin-row" key={m.id}>
              <Sparkles size={20} />
              <div>
                <h3>{m.name}</h3>
                <p>
                  {m.days} active days · {m.enabled ? "Enabled" : "Disabled"}
                  {m.placeholder ? " · PLACEHOLDER" : ""}
                </p>
                <small>{m.description}</small>
              </div>
              <button
                className="secondary"
                onClick={() => setEditor({ type: "streakMilestone", value: m })}
              >
                Edit
              </button>
            </div>
          ))}
        </>
      ) : (
        <>
          <form
            className="panel social-admin-editor"
            onSubmit={(e) => {
              e.preventDefault();
              act(
                { action: "assignCosmetic", userId, itemId, note },
                "Cosmetic assigned once. It belongs to this player permanently.",
              );
            }}
          >
            <h2>A little extra personality.</h2>
            <p>
              Assign event badges, achievements, support grants, or cosmetics
              reserved for future shop integration.
            </p>
            <div className="form-grid">
              <label className="form-label">
                Player
                <select
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                >
                  {data.players.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                Cosmetic
                <select
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                >
                  {social.cosmetics.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="form-label">
              Reason
              <input
                required
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Placeholder event achievement"
              />
            </label>
            <button
              className="primary"
              disabled={busy || !itemId || !note.trim()}
            >
              <Gift size={16} />
              Assign cosmetic
            </button>
          </form>
          <h3>Owned cosmetics for selected player</h3>
          <div className="stock-summary">
            {social.admin.ownership
              .filter((x: any) => x.user_id === userId)
              .map((x: any) => (
                <span key={x.item_id}>
                  {x.name}
                  <b>{x.source}</b>
                </span>
              ))}
          </div>
        </>
      )}
    </section>
  );
}
