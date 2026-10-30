import type { GameDatabase, GameStatement } from "./database";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { easternDay, nextDay } from "./time";
import { SOCIAL_PLACEHOLDERS } from "./social-seed";
import {
  SOCIAL_DEFAULTS,
  APPEARANCE_DEFAULTS,
  advanceStreak,
  tierProgress,
  validateAppearance,
  validateCosmetic,
  validateTier,
  validateSocialSettings,
  shortText,
  integer,
} from "./progression";

function access(db: GameDatabase) {
  const stmt = (sql: string, ...v: any[]) => db.prepare(sql).bind(...v);
  const all = async (sql: string, ...v: any[]): Promise<any[]> =>
    (await stmt(sql, ...v).all()).results;
  const one = async (sql: string, ...v: any[]): Promise<any> =>
    stmt(sql, ...v).first();
  return { stmt, all, one };
}
export async function ensureSocialProfile(
  db: GameDatabase,
  userId: string,
  now = Date.now(),
) {
  const { stmt } = access(db),
    today = easternDay(now);
  await initializeSocial(db);
  await db.batch([
    stmt(
      "INSERT OR IGNORE INTO profile_styles(user_id,data) VALUES(?,?)",
      userId,
      JSON.stringify(APPEARANCE_DEFAULTS),
    ),
    stmt(
      "INSERT OR IGNORE INTO streak_state(user_id,created_day,last_day) VALUES(?,?,?)",
      userId,
      today,
      nextDay(today, -1),
    ),
  ]);
}
export async function initializeSocial(db: GameDatabase) {
  const { stmt, one } = access(db);
  if (
    await one(
      "SELECT id FROM economy_updates WHERE id='social-placeholders-v1'",
    )
  )
    return;
  await db.batch([
    ...SOCIAL_PLACEHOLDERS.map((sql) =>
      stmt(sql.replace(/^INSERT INTO /, "INSERT OR IGNORE INTO ")),
    ),
    stmt(
      "INSERT OR IGNORE INTO economy_updates(id,created) VALUES('social-placeholders-v1',?)",
      Date.now(),
    ),
  ]);
}
// Include this statement in the same batch as the validated submission/ballot.
export function activityStatement(
  db: GameDatabase,
  userId: string,
  source: string,
  roundId: string,
  now: number,
) {
  return db
    .prepare(
      "INSERT OR IGNORE INTO daily_activity(user_id,day,source,round_id,created) VALUES(?,?,?,?,?)",
    )
    .bind(userId, easternDay(now), source, roundId, now);
}
export async function socialConfiguration(
  db: GameDatabase,
  today = easternDay(),
) {
  const { all, one } = access(db);
  const versions = (
    await all(
      "SELECT * FROM social_settings_versions ORDER BY effective_day,revision",
    )
  ).map((x) => ({ ...x, rules: JSON.parse(x.data) }));
  const latest = await one("SELECT * FROM social_settings WHERE id=1");
  return {
    current:
      versions.filter((x) => x.effective_day <= today).at(-1)?.rules ||
      SOCIAL_DEFAULTS,
    latest: latest ? JSON.parse(latest.data) : SOCIAL_DEFAULTS,
    revision: latest?.revision || 1,
    effectiveDay: versions.at(-1)?.effective_day,
    versions,
  };
}
export async function syncStreak(
  db: GameDatabase,
  userId: string,
  now = Date.now(),
) {
  await ensureSocialProfile(db, userId, now);
  const { one, all, stmt } = access(db),
    today = easternDay(now);
  const config = await socialConfiguration(db, today);
  for (let attempt = 0; attempt < 8; attempt++) {
    const previous = await one(
      "SELECT * FROM streak_state WHERE user_id=?",
      userId,
    );
    const throughDay =
      nextDay(previous.last_day, 30) < today
        ? nextDay(previous.last_day, 30)
        : today;
    const activities = await all(
      "SELECT day FROM daily_activity WHERE user_id=? AND day>=? AND day<=?",
      userId,
      nextDay(previous.last_day, 1),
      throughDay,
    );
    const pastGrants = await all(
      "SELECT period FROM freeze_grants WHERE user_id=?",
      userId,
    );
    const advance = advanceStreak(
      previous,
      new Set(activities.map((x) => x.day)),
      today,
      config.current,
      config.versions,
      new Set(pastGrants.map((x) => x.period)),
      throughDay,
    );
    const s = advance.state;
    if (
      !advance.days.length &&
      !advance.grants.length &&
      s.last_period === previous.last_period
    )
      return previous;
    const token = crypto.randomUUID();
    const guarded =
      "EXISTS(SELECT 1 FROM streak_state WHERE user_id=? AND token=?)";
    const ops = [
      stmt(
        "UPDATE streak_state SET last_day=?,current=?,longest=?,freeze_balance=?,last_period=?,active_days=?,revision=revision+1,token=? WHERE user_id=? AND revision=?",
        s.last_day,
        s.current,
        s.longest,
        s.freeze_balance,
        s.last_period,
        s.active_days,
        token,
        userId,
        previous.revision,
      ),
    ];
    for (const d of advance.days)
      ops.push(
        stmt(
          `INSERT OR IGNORE INTO streak_days(user_id,day,status,streak,rules) SELECT ?,?,?,?,? WHERE ${guarded}`,
          userId,
          d.day,
          d.status,
          d.streak,
          JSON.stringify(d.rules),
          userId,
          token,
        ),
      );
    for (const g of advance.grants)
      ops.push(
        stmt(
          `INSERT OR IGNORE INTO freeze_grants(user_id,period,day,amount,balance,rules) SELECT ?,?,?,?,?,? WHERE ${guarded}`,
          userId,
          g.period,
          g.day,
          g.amount,
          g.balance,
          JSON.stringify(g.rules),
          userId,
          token,
        ),
      );
    await db.batch(ops);
    const saved = await one(
      "SELECT * FROM streak_state WHERE user_id=?",
      userId,
    );
    if (saved.token === token) {
      if (throughDay < today) {
        attempt--;
        continue;
      }
      return saved;
    }
  }
  throw new Error("Your activity is updating. Please try again.");
}
export async function unlockCosmetics(
  db: GameDatabase,
  userId: string,
  now = Date.now(),
) {
  const { stmt } = access(db);
  await db.batch([
    stmt(
      "INSERT OR IGNORE INTO tier_awards(user_id,tier_id,earned) SELECT p.id,t.id,? FROM profiles p JOIN tiers t ON t.enabled=1 AND t.threshold<=p.followers WHERE p.id=?",
      now,
      userId,
    ),
    stmt(
      `INSERT OR IGNORE INTO cosmetic_ownership(user_id,item_id,source,earned)
      SELECT p.id,c.id,'unlock:'||c.unlock_type,? FROM profiles p JOIN streak_state s ON s.user_id=p.id JOIN cosmetics c ON c.enabled=1 WHERE p.id=? AND (
        c.unlock_type='all' OR (c.unlock_type='followers' AND p.followers>=c.unlock_value)
        OR (c.unlock_type='streak' AND s.longest>=c.unlock_value)
        OR (c.unlock_type='participation' AND s.active_days>=c.unlock_value)
        OR (c.unlock_type='tier' AND EXISTS(SELECT 1 FROM tier_awards t WHERE t.user_id=p.id AND t.tier_id=c.unlock_target)))`,
      now,
      userId,
    ),
    stmt(
      `INSERT OR IGNORE INTO cosmetic_ownership(user_id,item_id,source,earned)
      SELECT s.user_id,m.cosmetic_id,'milestone:'||m.id,? FROM streak_state s JOIN streak_milestones m ON m.enabled=1 AND m.days<=s.longest JOIN cosmetics c ON c.id=m.cosmetic_id AND c.enabled=1 WHERE s.user_id=?`,
      now,
      userId,
    ),
  ]);
}
export async function publicProfile(db: GameDatabase, userId: string) {
  const { one, all } = access(db);
  const p = await one(
    "SELECT p.id,p.name,p.followers,h.username FROM profiles p LEFT JOIN player_handles h ON h.user_id=p.id WHERE p.id=?",
    userId,
  );
  const style = await one(
    "SELECT data FROM profile_styles WHERE user_id=?",
    userId,
  );
  const appearance = style ? JSON.parse(style.data) : APPEARANCE_DEFAULTS;
  const equipped = await all(
    "SELECT e.slot,c.* FROM equipped_cosmetics e JOIN cosmetics c ON c.id=e.item_id WHERE e.user_id=? AND c.enabled=1 ORDER BY e.slot",
    userId,
  );
  const config = await socialConfiguration(db);
  let badgeCount = 0;
  const visible = equipped.filter(
    (x) => x.kind !== "badge" || badgeCount++ < config.current.maxBadges,
  );
  const tiers = await all(
    "SELECT * FROM tiers WHERE enabled=1 ORDER BY threshold,sort_order,id",
  );
  return {
    name: p.name,
    username: p.username || null,
    followers: p.followers,
    appearance: {
      ...APPEARANCE_DEFAULTS,
      ...appearance,
      _saveToken: undefined,
    },
    equipped: visible.map((x) => ({ ...x, params: JSON.parse(x.params) })),
    tier: tierProgress(tiers, p.followers),
  };
}
export async function socialState(
  db: GameDatabase,
  userId: string,
  admin: boolean,
) {
  const { all, one } = access(db),
    today = easternDay();
  const streak = await syncStreak(db, userId);
  await unlockCosmetics(db, userId);
  const config = await socialConfiguration(db);
  const history = await all(
    "SELECT day,status,streak FROM streak_days WHERE user_id=? AND day>=? ORDER BY day",
    userId,
    nextDay(today, -6),
  );
  const todayActivity = await one(
    "SELECT day FROM daily_activity WHERE user_id=? AND day=?",
    userId,
    today,
  );
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = nextDay(today, i - 6);
    const row = history.find((x) => x.day === day);
    return (
      row || {
        day,
        status:
          day < streak.created_day
            ? "before"
            : day === today
              ? todayActivity
                ? "active"
                : "pending"
              : "missed",
      }
    );
  });
  const milestones = await all(
    "SELECT m.*,c.name AS cosmetic_name,c.icon FROM streak_milestones m JOIN cosmetics c ON c.id=m.cosmetic_id WHERE m.enabled=1 ORDER BY m.days,m.id",
  );
  const style = await one(
    "SELECT revision FROM profile_styles WHERE user_id=?",
    userId,
  );
  return {
    profile: await publicProfile(db, userId),
    profileRevision: style.revision,
    cosmetics: (
      await all(
        admin
          ? "SELECT * FROM cosmetics ORDER BY kind,name"
          : "SELECT * FROM cosmetics WHERE enabled=1 ORDER BY kind,name",
      )
    ).map((x) => ({ ...x, params: JSON.parse(x.params) })),
    ownership: await all(
      "SELECT item_id,source,earned FROM cosmetic_ownership WHERE user_id=?",
      userId,
    ),
    tiers: await all("SELECT * FROM tiers ORDER BY sort_order,threshold,id"),
    celebration: await one(
      "SELECT t.* FROM tier_awards a JOIN tiers t ON t.id=a.tier_id WHERE a.user_id=? AND a.acknowledged=0 AND t.enabled=1 AND t.celebration=1 ORDER BY t.threshold DESC LIMIT 1",
      userId,
    ),
    streak: { ...streak, days, today, milestones },
    settings: config.current,
    admin: admin
      ? {
          settings: config.latest,
          settingsRevision: config.revision,
          effectiveDay: config.effectiveDay,
          milestones: await all(
            "SELECT * FROM streak_milestones ORDER BY days,id",
          ),
          ownership: await all(
            "SELECT o.user_id,o.item_id,o.source,o.earned,c.name FROM cosmetic_ownership o JOIN cosmetics c ON c.id=o.item_id ORDER BY earned DESC LIMIT 500",
          ),
        }
      : null,
  };
}
export async function socialMutation(
  db: GameDatabase,
  action: string,
  b: any,
  user: any,
) {
  const { stmt, all, one } = access(db),
    u = user.id,
    now = Date.now();
  if (action === "saveProfile") {
    await ensureSocialProfile(db, u);
    const appearance = validateAppearance(b.appearance),
      cfg = await socialConfiguration(db);
    integer(b.revision, 1, 1000000000, "Profile revision");
    if (
      !b.equipped ||
      typeof b.equipped !== "object" ||
      !Array.isArray(b.equipped.badges)
    )
      throw new Error("Choose your equipped cosmetics.");
    const pairs: [string, string][] = [];
    for (const kind of [
      "theme",
      "frame",
      "profile_effect",
      "banner_pattern",
      "title",
    ]) {
      if (b.equipped[kind])
        pairs.push([
          kind,
          shortText(b.equipped[kind], 100, "a cosmetic ID", true),
        ]);
    }
    if (b.equipped.badges.length > cfg.current.maxBadges)
      throw new Error(`Display up to ${cfg.current.maxBadges} badges.`);
    b.equipped.badges.forEach((item: any, i: number) =>
      pairs.push([`badge:${i}`, shortText(item, 100, "a badge ID", true)]),
    );
    if (new Set(pairs.map((x) => x[1])).size !== pairs.length)
      throw new Error("Choose each cosmetic only once.");
    for (const [slot, item] of pairs) {
      const owned = await one(
        "SELECT c.kind FROM cosmetic_ownership o JOIN cosmetics c ON c.id=o.item_id WHERE o.user_id=? AND o.item_id=? AND c.enabled=1",
        u,
        item,
      );
      if (!owned || owned.kind !== slot.split(":")[0])
        throw new Error(
          "You can equip only your own available cosmetics in matching slots.",
        );
    }
    const token = crypto.randomUUID(),
      json = JSON.stringify({ ...appearance, _saveToken: token });
    const guard =
      "EXISTS(SELECT 1 FROM profile_styles WHERE user_id=? AND json_extract(data,'$._saveToken')=?)";
    await db.batch([
      stmt(
        "UPDATE profile_styles SET data=?,revision=revision+1 WHERE user_id=? AND revision=?",
        json,
        u,
        b.revision,
      ),
      stmt(
        `UPDATE profiles SET name=? WHERE id=? AND ${guard}`,
        appearance.name,
        u,
        u,
        token,
      ),
      stmt(
        `DELETE FROM equipped_cosmetics WHERE user_id=? AND ${guard}`,
        u,
        u,
        token,
      ),
      ...pairs.map(([slot, item]) =>
        stmt(
          `INSERT INTO equipped_cosmetics(user_id,slot,item_id) SELECT ?,?,? WHERE ${guard}`,
          u,
          slot,
          item,
          u,
          token,
        ),
      ),
    ]);
    if (
      JSON.parse(
        (await one("SELECT data FROM profile_styles WHERE user_id=?", u)).data,
      )._saveToken !== token
    )
      throw new Error(
        "Your profile changed in another tab. Refresh before saving again.",
      );
    return true;
  }
  if (action === "dismissTier") {
    await stmt(
      "UPDATE tier_awards SET acknowledged=1 WHERE user_id=?",
      u,
    ).run();
    return true;
  }
  if (
    ![
      "socialSettings",
      "tier",
      "reorderTiers",
      "cosmetic",
      "assignCosmetic",
      "streakMilestone",
    ].includes(action)
  )
    return false;
  if (user.role !== "admin")
    throw new Error("Administrator access is required.");
  await initializeSocial(db);
  const ops: GameStatement[] = [];
  if (action === "socialSettings") {
    const rules = validateSocialSettings(b.settings);
    const effective = nextDay(easternDay(now), 1);
    // Versioned future effective dates preserve decisions for all earlier days.
    ops.push(
      stmt(
        "UPDATE social_settings SET data=?,revision=revision+1 WHERE id=1",
        JSON.stringify(rules),
      ),
      stmt(
        "INSERT INTO social_settings_versions(revision,effective_day,data,created) SELECT revision,?,data,? FROM social_settings WHERE id=1",
        effective,
        now,
      ),
    );
  } else if (action === "tier") {
    const x = validateTier(b.tier);
    ops.push(
      stmt(
        "INSERT INTO tiers(id,name,description,icon,image,color,color_end,threshold,sort_order,enabled,celebration,placeholder) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,icon=excluded.icon,image=excluded.image,color=excluded.color,color_end=excluded.color_end,threshold=excluded.threshold,sort_order=excluded.sort_order,enabled=excluded.enabled,celebration=excluded.celebration,placeholder=excluded.placeholder",
        x.id || crypto.randomUUID(),
        x.name,
        x.description,
        x.icon,
        x.image,
        x.color,
        x.color_end,
        x.threshold,
        x.sort_order,
        x.enabled,
        x.celebration,
        x.placeholder,
      ),
    );
  } else if (action === "reorderTiers") {
    const tiers = await all("SELECT id FROM tiers");
    if (
      !Array.isArray(b.ids) ||
      b.ids.length !== tiers.length ||
      new Set(b.ids).size !== tiers.length ||
      !tiers.every((x) => b.ids.includes(x.id))
    )
      throw new Error("Reorder the complete tier list.");
    b.ids.forEach((id: string, i: number) =>
      ops.push(stmt("UPDATE tiers SET sort_order=? WHERE id=?", i, id)),
    );
  } else if (action === "cosmetic") {
    const x = validateCosmetic(b.cosmetic);
    if (
      x.unlock_type === "tier" &&
      !(await one("SELECT id FROM tiers WHERE id=?", x.unlock_target))
    )
      throw new Error("Choose an existing tier for the unlock.");
    if (x.id) {
      const previous = await one("SELECT kind FROM cosmetics WHERE id=?", x.id);
      if (previous && previous.kind !== x.kind)
        throw new Error(
          "A cosmetic’s item type cannot change. Create a new item instead.",
        );
    }
    ops.push(
      stmt(
        "INSERT INTO cosmetics(id,name,description,kind,effect,params,icon,image,enabled,unlock_type,unlock_value,unlock_target,placeholder) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,effect=excluded.effect,params=excluded.params,icon=excluded.icon,image=excluded.image,enabled=excluded.enabled,unlock_type=excluded.unlock_type,unlock_value=excluded.unlock_value,unlock_target=excluded.unlock_target,placeholder=excluded.placeholder,revision=cosmetics.revision+1",
        x.id || crypto.randomUUID(),
        x.name,
        x.description,
        x.kind,
        x.effect,
        JSON.stringify(x.params),
        x.icon,
        x.image,
        x.enabled,
        x.unlock_type,
        x.unlock_value,
        x.unlock_target,
        x.placeholder,
      ),
    );
  } else if (action === "assignCosmetic") {
    if (
      !(await one("SELECT id FROM profiles WHERE id=?", b.userId)) ||
      !(await one("SELECT id FROM cosmetics WHERE id=?", b.itemId))
    )
      throw new Error("Choose a player and a cosmetic.");
    const note = shortText(b.note, 200, "an assignment reason", true);
    ops.push(
      stmt(
        "INSERT OR IGNORE INTO cosmetic_ownership(user_id,item_id,source,earned) VALUES(?,?,?,?)",
        b.userId,
        b.itemId,
        `owner:${note}`,
        now,
      ),
    );
  } else if (action === "streakMilestone") {
    const x = b.milestone,
      name = shortText(x.name, 70, "a milestone name", true),
      description = shortText(x.description, 400, "a description"),
      days = integer(x.days, 1, 100000, "Milestone activity days");
    if (!(await one("SELECT id FROM cosmetics WHERE id=?", x.cosmetic_id)))
      throw new Error("Select a cosmetic reward.");
    ops.push(
      stmt(
        "INSERT INTO streak_milestones(id,name,description,days,cosmetic_id,enabled,placeholder) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,days=excluded.days,cosmetic_id=excluded.cosmetic_id,enabled=excluded.enabled,placeholder=excluded.placeholder",
        x.id || crypto.randomUUID(),
        name,
        description,
        days,
        x.cosmetic_id,
        x.enabled ? 1 : 0,
        x.placeholder ? 1 : 0,
      ),
    );
  }
  ops.push(
    stmt(
      "INSERT INTO audit VALUES(?,?,?,?,?)",
      crypto.randomUUID(),
      u,
      action,
      JSON.stringify(b),
      now,
    ),
  );
  await db.batch(ops);
  return true;
}
