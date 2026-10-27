/* eslint-disable @typescript-eslint/no-explicit-any */
import { env } from "cloudflare:workers";
import { dailyWindow, GAME_TIME_ZONE, validateDay } from "./time";
import {
  socialState,
  socialMutation,
  ensureSocialProfile,
  activityStatement,
  publicProfile,
} from "./social";
import {
  DEFAULTS,
  Rules,
  phase,
  transform,
  followers,
  words,
  validateRules,
  validateItem,
} from "./rules";
export const db = () => {
  if (!env.DB) throw new Error("Database is not configured.");
  return env.DB;
};
export const stmt = (s: string, ...v: any[]) =>
  db()
    .prepare(s)
    .bind(...v);
export async function all(s: string, ...v: any[]): Promise<any[]> {
  return (await stmt(s, ...v).all()).results;
}
export async function one(s: string, ...v: any[]): Promise<any> {
  return stmt(s, ...v).first();
}
export const id = () => crypto.randomUUID();
export async function setup(user: { userId: string; displayName: string }) {
  await db().batch([
    stmt(
      "INSERT OR IGNORE INTO profiles(id,name,role) SELECT ?,?,CASE WHEN NOT EXISTS(SELECT 1 FROM profiles) THEN 'admin' ELSE 'player' END",
      user.userId,
      user.displayName.split("@")[0],
    ),
    stmt(
      "INSERT OR IGNORE INTO wallets(user_id,balance) VALUES(?,0)",
      user.userId,
    ),
  ]);
  const profile = await one("SELECT * FROM profiles WHERE id=?", user.userId);
  if (
    profile.role === "admin" &&
    !(await one("SELECT id FROM settings WHERE id=1"))
  )
    await seed(user.userId);
  await initializeLikes();
  await grantStartingLikes(user.userId);
  await ensureSocialProfile(db(), user.userId);
  return profile;
}
export async function grantStartingLikes(userId?: string) {
  const rules = await configuration();
  await stmt(
    `INSERT OR IGNORE INTO ledger(id,user_id,round_id,kind,amount,note,created)
     SELECT 'starting-likes:v1:' || w.user_id,w.user_id,NULL,'starting',?,
       'Starting Likes · welcome to Estergram',?
     FROM wallets w WHERE (? IS NULL OR w.user_id=?)
       AND NOT EXISTS(SELECT 1 FROM ledger l WHERE l.user_id=w.user_id AND l.kind='starting')`,
    rules.startingLikes,
    Date.now(),
    userId ?? null,
    userId ?? null,
  ).run();
}
export async function initializeLikes() {
  if (await one("SELECT id FROM economy_updates WHERE id='likes-start-v1'"))
    return;
  const now = Date.now();
  await db().batch([
    stmt(
      "UPDATE settings SET data=json_set(data,'$.startingLikes',100),revision=revision+1 WHERE id=1 AND json_type(data,'$.startingLikes') IS NULL",
    ),
    stmt(
      `INSERT OR IGNORE INTO ledger(id,user_id,round_id,kind,amount,note,created)
      SELECT 'starting-likes:v1:' || w.user_id,w.user_id,NULL,'starting',100,
        'Starting Likes · welcome to Estergram',? FROM wallets w
      WHERE NOT EXISTS(SELECT 1 FROM ledger l WHERE l.user_id=w.user_id AND l.kind='starting')`,
      now,
    ),
    stmt(`UPDATE catalog SET
      name=replace(replace(replace(name,'Clout','Likes'),'CLOUT','LIKES'),'clout','likes'),
      description=replace(replace(replace(description,'Clout','Likes'),'CLOUT','LIKES'),'clout','likes'),
      revision=revision+1
      WHERE instr(lower(name),'clout')>0 OR instr(lower(description),'clout')>0`),
    stmt(
      "INSERT OR IGNORE INTO audit VALUES('economy:likes-start-v1','system','economy_launch',?,?)",
      JSON.stringify({ currency: "Likes", startingGrant: 100 }),
      now,
    ),
    stmt(
      "INSERT OR IGNORE INTO economy_updates(id,created) VALUES('likes-start-v1',?)",
      now,
    ),
  ]);
}
export async function configuration(): Promise<Rules> {
  const stored = JSON.parse(
    (await one("SELECT data FROM settings WHERE id=1"))?.data ||
      JSON.stringify(DEFAULTS),
  );
  return { ...DEFAULTS, ...stored };
}
export async function seed(actor: string) {
  const items = [
    [
      "word-expansion",
      "Word Expansion",
      "A little more room for your next big idea. Raise your chosen submission’s word limit to 15.",
      "Type",
      80,
      "word_limit",
      15,
    ],
    [
      "algorithm-boost",
      "Algorithm Boost",
      "Give a good take a bigger stage. Double positive voting points; downvotes stay the same.",
      "Zap",
      200,
      "positive_multiplier",
      2,
    ],
    [
      "pr-team",
      "PR Team",
      "A little damage control. Negate the first downvote on your chosen submission.",
      "Shield",
      100,
      "downvote_shield",
      1,
    ],
    [
      "brand-deal",
      "Brand Deal",
      "Make your moment count twice. Double eligible Likes rewards in one round.",
      "Briefcase",
      120,
      "clout_multiplier",
      2,
    ],
  ];
  const now = Date.now();
  await db().batch([
    stmt(
      "INSERT OR IGNORE INTO settings(id,data) VALUES(1,?)",
      JSON.stringify(DEFAULTS),
    ),
    ...items.map((x) =>
      stmt(
        "INSERT OR IGNORE INTO catalog(id,name,description,icon,cost,effect,parameter) VALUES(?,?,?,?,?,?,?)",
        ...x,
      ),
    ),
    stmt(
      "INSERT OR IGNORE INTO prompts(id,content,state) VALUES('sample-1','Explain why you were fired from your job as a ghost.','draft')",
    ),
    stmt(
      "INSERT OR IGNORE INTO prompts(id,content,state) VALUES('sample-2','Give a terrible product an unexpectedly convincing slogan.','draft')",
    ),
    stmt(
      "INSERT OR IGNORE INTO rounds(id,number,prompt,opens,closes,ends,config) VALUES('sample-round',1,'Your search history just became public. Explain yourself.',?,?,?,?)",
      now - 3600000,
      now + 23 * 3600000,
      now + 47 * 3600000,
      JSON.stringify(DEFAULTS),
    ),
  ]);
  await stmt(
    "INSERT INTO audit VALUES(?,?,?,?,?)",
    id(),
    actor,
    "seed",
    "Placeholder catalog and round",
    now,
  ).run();
}
export async function finalize(r: any) {
  if (r.finalized || phase(r) !== "RESULTS") return;
  const rules: Rules = JSON.parse(r.config);
  const entries = await all("SELECT * FROM submissions WHERE round_id=?", r.id);
  const ballots = await all(
    "SELECT choices FROM ballots WHERE round_id=?",
    r.id,
  );
  const effects = await all("SELECT * FROM effects WHERE round_id=?", r.id);
  const scores = entries
    .map((s) => {
      const counts = [0, 0, 0, 0];
      for (const b of ballots)
        JSON.parse(b.choices).forEach((v: string | null, i: number) => {
          if (v === s.id) counts[i]++;
        });
      return {
        ...s,
        ...transform(
          counts,
          rules.votePoints,
          effects.find((e) => e.submission_id === s.id),
        ),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.counts[0] - a.counts[0] ||
        b.counts[1] - a.counts[1] ||
        b.counts[2] - a.counts[2] ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  const receipts = await all("SELECT * FROM receipts WHERE round_id=?", r.id);
  const ops: D1PreparedStatement[] = [];
  scores.forEach((s, i) => {
    const f = followers(i + 1, scores.length, rules);
    ops.push(
      stmt(
        "INSERT OR IGNORE INTO results VALUES(?,?,?,?,?,?,?,?,?)",
        s.id,
        r.id,
        s.user_id,
        i + 1,
        s.raw,
        s.bonus,
        s.score,
        f,
        JSON.stringify({
          positive: s.positive,
          negative: s.negative,
          shield: s.shield,
          boost: s.boost,
          counts: s.counts,
        }),
      ),
      stmt(
        "INSERT OR IGNORE INTO follower_awards VALUES(?,?,?,?)",
        `${r.id}:${s.user_id}`,
        s.user_id,
        r.id,
        f,
      ),
    );
  });
  const users = new Set(receipts.map((x) => x.user_id));
  for (const u of users) {
    const rank = scores.findIndex((s) => s.user_id === u);
    const awards = [
      [
        "submission",
        receipts.some((x) => x.user_id === u && x.kind === "submission")
          ? rules.submissionClout
          : 0,
      ],
      [
        "voting",
        receipts.some((x) => x.user_id === u && x.kind === "voting")
          ? rules.votingClout
          : 0,
      ],
      [
        "podium",
        rank >= 0 && rank < 3 && scores.length >= rules.minEntries
          ? rules.podiumClout[rank]
          : 0,
      ],
    ] as [string, number][];
    const effect = effects.find(
      (e) =>
        scores.find((s) => s.id === e.submission_id)?.user_id === u &&
        e.type === "clout_multiplier",
    );
    let base = 0;
    for (const [kind, amount] of awards) {
      base += amount;
      if (amount)
        ops.push(
          stmt(
            "INSERT OR IGNORE INTO ledger VALUES(?,?,?,?,?,?,?)",
            `${r.id}:${u}:${kind}`,
            u,
            r.id,
            kind,
            amount,
            `Round #${r.number} · ${kind}`,
            Date.now(),
          ),
        );
    }
    if (effect && base)
      ops.push(
        stmt(
          "INSERT OR IGNORE INTO ledger VALUES(?,?,?,?,?,?,?)",
          `${r.id}:${u}:brand`,
          u,
          r.id,
          "brand",
          base * (effect.parameter - 1),
          `Round #${r.number} · Brand Deal bonus`,
          Date.now(),
        ),
      );
  }
  ops.push(
    stmt(
      "UPDATE rounds SET finalized=? WHERE id=? AND finalized IS NULL AND cancelled=0",
      Date.now(),
      r.id,
    ),
  );
  await db().batch(ops);
}
export async function state(userId: string, admin: boolean) {
  const rounds = await all("SELECT * FROM rounds ORDER BY opens DESC");
  for (const r of rounds) await finalize(r);
  const rs = await all("SELECT * FROM rounds ORDER BY opens DESC");
  const catalog = await all(
    admin ? "SELECT * FROM catalog" : "SELECT * FROM catalog WHERE enabled=1",
  );
  const inventory = await all(
    "SELECT i.*,c.name,c.description,c.icon,c.effect,c.parameter,c.enabled,c.cost,c.revision,c.available_from,c.available_until FROM inventory i JOIN catalog c ON c.id=i.item_id WHERE user_id=? AND quantity>0",
    userId,
  );
  const mine = await all("SELECT * FROM submissions WHERE user_id=?", userId);
  const active = await all(
    "SELECT a.round_id,a.submission_id,e.* FROM activations a JOIN effects e ON e.activation_id=a.id WHERE a.user_id=?",
    userId,
  );
  const serverNow = Date.now();
  return {
    serverNow,
    timeZone: GAME_TIME_ZONE,
    social: await socialState(db(), userId, admin),
    profile: await one("SELECT * FROM profiles WHERE id=?", userId),
    wallet: await one("SELECT balance FROM wallets WHERE user_id=?", userId),
    catalog,
    inventory,
    rounds: rs.map((r) => ({
      ...r,
      phase: phase(r, serverNow),
      config: JSON.parse(r.config),
    })),
    mine,
    active,
    ledger: await all(
      "SELECT id,round_id,kind,amount,note,created FROM ledger WHERE user_id=? ORDER BY created DESC LIMIT 100",
      userId,
    ),
    rules: await configuration(),
    prompts: admin
      ? await all(
          "SELECT * FROM prompts WHERE state<>'archived' ORDER BY scheduled DESC",
        )
      : [],
    adminInventory: admin
      ? await all(
          "SELECT i.user_id,i.item_id,i.quantity,c.name FROM inventory i JOIN catalog c ON c.id=i.item_id",
        )
      : [],
    players: admin ? await all("SELECT id,name,role FROM profiles") : [],
    audit: admin
      ? await all(
          "SELECT action,payload,created FROM audit ORDER BY created DESC LIMIT 30",
        )
      : [],
  };
}
export async function feed(roundId: string, userId: string) {
  const r = await one("SELECT * FROM rounds WHERE id=?", roundId);
  if (!r) throw new Error("Round not found.");
  if (phase(r) === "RESULTS") {
    await finalize(r);
    const entries = await all(
      "SELECT s.content,p.name,r.*,e.name AS effect_name,e.type AS effect_type,e.parameter FROM results r JOIN submissions s ON s.id=r.submission_id JOIN profiles p ON p.id=r.user_id LEFT JOIN effects e ON e.submission_id=s.id WHERE r.round_id=? ORDER BY rank",
      roundId,
    );
    const profiles = new Map();
    for (const s of entries) {
      if (!profiles.has(s.user_id))
        profiles.set(s.user_id, await publicProfile(db(), s.user_id));
      s.profile = profiles.get(s.user_id);
    }
    return {
      round: r,
      entries,
    };
  }
  if (phase(r) !== "VOTING") return { entries: [] };
  // Only opaque submission IDs, content and public effect snapshots cross this boundary.
  const entries = await all(
    "SELECT s.id,s.content,e.name AS effect_name,e.type AS effect_type,e.parameter FROM submissions s LEFT JOIN effects e ON e.submission_id=s.id WHERE s.round_id=? AND s.user_id<>?",
    roundId,
    userId,
  );
  const shuffled = await Promise.all(
    entries.map(async (s) => ({
      entry: s,
      key: Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(`${userId}:${roundId}:${s.id}`),
          ),
        ),
      )
        .map((v) => v.toString(16).padStart(2, "0"))
        .join(""),
    })),
  );
  shuffled.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return {
    entries: shuffled.map((s) => s.entry),
    ballot: await one(
      "SELECT choices FROM ballots WHERE round_id=? AND user_id=?",
      roundId,
      userId,
    ),
  };
}
export async function mutate(action: string, b: any, user: any) {
  const u = user.id,
    now = Date.now();
  if (action === "refresh") {
    return;
  }
  if (await socialMutation(db(), action, b, user)) return;
  if (action === "purchase") {
    if (typeof b.key !== "string" || b.key.length > 100)
      throw new Error("A purchase key is required.");
    const prior = await one(
      "SELECT * FROM purchases WHERE id=?",
      `${u}:${b.key}`,
    );
    if (prior) {
      if (prior.user_id !== u || prior.item_id !== b.itemId)
        throw new Error("Purchase key conflict.");
      return;
    }
    try {
      await stmt(
        "INSERT INTO purchases(id,user_id,item_id,created,catalog_revision) VALUES(?,?,?,?,?)",
        `${u}:${b.key}`,
        u,
        b.itemId,
        now,
        b.revision,
      ).run();
    } catch (error) {
      const done = await one(
        "SELECT user_id,item_id FROM purchases WHERE id=?",
        `${u}:${b.key}`,
      );
      if (!done || done.user_id !== u || done.item_id !== b.itemId) throw error;
    }
    return;
  }
  if (action === "submit") {
    const r = await one("SELECT * FROM rounds WHERE id=?", b.roundId);
    if (!r || phase(r) !== "SUBMISSION")
      throw new Error("Submissions are closed.");
    const effect = await one(
      "SELECT parameter FROM effects e JOIN activations a ON a.id=e.activation_id WHERE a.user_id=? AND a.round_id=? AND e.type='word_limit'",
      u,
      r.id,
    );
    const limit = effect?.parameter || JSON.parse(r.config).wordLimit;
    if (
      typeof b.content !== "string" ||
      !words(b.content) ||
      words(b.content) > limit ||
      b.content.length > 2000
    )
      throw new Error(`Use 1–${limit} words and at most 2,000 characters.`);
    await db().batch([
      stmt(
        "INSERT INTO submissions VALUES(?,?,?,?,?) ON CONFLICT(round_id,user_id) DO UPDATE SET content=excluded.content,updated=excluded.updated",
        id(),
        r.id,
        u,
        b.content.trim(),
        now,
      ),
      stmt(
        "INSERT OR IGNORE INTO receipts VALUES(?,?,?,?)",
        `${r.id}:${u}:submission`,
        u,
        r.id,
        "submission",
      ),
      activityStatement(db(), u, "submission", r.id, now),
    ]);
    return;
  }
  if (action === "activate") {
    const prior = await one(
      "SELECT * FROM activations WHERE user_id=? AND round_id=?",
      u,
      b.roundId,
    );
    if (prior) {
      if (prior.item_id === b.itemId && prior.submission_id === b.submissionId)
        return;
      throw new Error("You already used this round’s activation.");
    }
    try {
      await stmt(
        "INSERT INTO activations(id,user_id,round_id,submission_id,item_id,created,catalog_revision) VALUES(?,?,?,?,?,?,?)",
        id(),
        u,
        b.roundId,
        b.submissionId,
        b.itemId,
        now,
        b.revision,
      ).run();
    } catch (error) {
      const done = await one(
        "SELECT item_id,submission_id FROM activations WHERE user_id=? AND round_id=?",
        u,
        b.roundId,
      );
      if (
        !done ||
        done.item_id !== b.itemId ||
        done.submission_id !== b.submissionId
      )
        throw error;
    }
    return;
  }
  if (action === "vote") {
    const r = await one("SELECT * FROM rounds WHERE id=?", b.roundId);
    if (!r || phase(r) !== "VOTING") throw new Error("Voting is closed.");
    if (
      !Array.isArray(b.choices) ||
      b.choices.length !== 4 ||
      b.choices.some((v: any) => v !== null && typeof v !== "string")
    )
      throw new Error("Choose up to four ranked responses.");
    const choices = b.choices.filter(Boolean);
    if (!choices.length || new Set(choices).size !== choices.length)
      throw new Error("Select at least one response, with no repeats.");
    for (const sid of choices) {
      const s = await one(
        "SELECT user_id,round_id FROM submissions WHERE id=?",
        sid,
      );
      if (!s || s.round_id !== r.id || s.user_id === u)
        throw new Error("Invalid selection. Self-voting is not allowed.");
    }
    await db().batch([
      stmt(
        "INSERT INTO ballots VALUES(?,?,?,?,?) ON CONFLICT(round_id,user_id) DO UPDATE SET choices=excluded.choices,updated=excluded.updated",
        id(),
        r.id,
        u,
        JSON.stringify(b.choices),
        now,
      ),
      stmt(
        "INSERT OR IGNORE INTO receipts VALUES(?,?,?,?)",
        `${r.id}:${u}:voting`,
        u,
        r.id,
        "voting",
      ),
      activityStatement(db(), u, "voting", r.id, now),
    ]);
    return;
  }
  if (user.role !== "admin")
    throw new Error("Administrator access is required.");
  const ops: D1PreparedStatement[] = [];
  if (action === "seed") {
    await seed(u);
    return;
  } else if (action === "settings") {
    const rules = validateRules(b.rules);
    ops.push(
      stmt(
        "INSERT INTO settings VALUES(1,?,1) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=revision+1",
        JSON.stringify(rules),
      ),
    );
  } else if (action === "item") {
    const x = validateItem(b.item);
    const it = b.item;
    ops.push(
      stmt(
        "INSERT INTO catalog(id,name,description,icon,image,cost,effect,parameter,enabled,available_from,available_until,placeholder) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,icon=excluded.icon,image=excluded.image,cost=excluded.cost,effect=excluded.effect,parameter=excluded.parameter,enabled=excluded.enabled,available_from=excluded.available_from,available_until=excluded.available_until,placeholder=excluded.placeholder,revision=catalog.revision+1",
        it.id || id(),
        x.name,
        x.description,
        it.icon || "Zap",
        it.image || null,
        x.cost,
        x.effect,
        x.parameter,
        it.enabled ? 1 : 0,
        it.available_from || null,
        it.available_until || null,
        it.placeholder ? 1 : 0,
      ),
    );
  } else if (action === "prompt") {
    if (
      typeof b.content !== "string" ||
      !b.content.trim() ||
      b.content.length > 1000
    )
      throw new Error("Enter a prompt up to 1,000 characters.");
    if (b.scheduled) validateDay(b.scheduled);
    ops.push(
      stmt(
        "INSERT INTO prompts VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content,scheduled=excluded.scheduled,state=excluded.state,placeholder=excluded.placeholder",
        b.id || id(),
        b.content,
        b.scheduled || null,
        b.scheduled ? "scheduled" : "draft",
        b.placeholder ? 1 : 0,
      ),
    );
  } else if (action === "deletePrompt") {
    ops.push(stmt("UPDATE prompts SET state='archived' WHERE id=?", b.id));
  } else if (action === "publishPrompt") {
    const p = await one("SELECT * FROM prompts WHERE id=?", b.id);
    if (!p) throw new Error("Prompt not found.");
    if (p.state === "published") return;
    if (b.mode && b.mode !== "daily" && b.mode !== "test")
      throw new Error("Choose daily scheduling or an explicit test round.");
    const window =
      b.mode === "test"
        ? {
            dailyDate: null,
            opens: now,
            closes: now + 120000,
            ends: now + 240000,
          }
        : dailyWindow(b.day);
    const { opens, closes, ends, dailyDate } = window;
    if (dailyDate && opens < now)
      throw new Error(
        "Queue daily prompts before their 00:00 Eastern opening. Choose a future date.",
      );
    ops.push(
      stmt(
        "INSERT INTO rounds(id,number,prompt,opens,closes,ends,config,placeholder,prompt_id,daily_date) SELECT ?,COALESCE(MAX(number),0)+1,?,?,?,?,?,?,?,? FROM rounds",
        id(),
        p.content,
        opens,
        closes,
        ends,
        JSON.stringify(await configuration()),
        p.placeholder,
        p.id,
        dailyDate,
      ),
      stmt(
        "UPDATE prompts SET state='published',scheduled=? WHERE id=?",
        dailyDate,
        p.id,
      ),
    );
  } else if (action === "inventory") {
    if (
      !Number.isInteger(b.delta) ||
      Math.abs(b.delta) > 100 ||
      !b.delta ||
      !(await one("SELECT id FROM profiles WHERE id=?", b.userId))
    )
      throw new Error("Choose a player and a nonzero adjustment of up to 100.");
    ops.push(
      stmt(
        "INSERT OR IGNORE INTO inventory VALUES(?,?,?,0)",
        `${b.userId}:${b.itemId}`,
        b.userId,
        b.itemId,
      ),
      stmt(
        "UPDATE inventory SET quantity=quantity+? WHERE user_id=? AND item_id=?",
        b.delta,
        b.userId,
        b.itemId,
      ),
    );
  } else if (action === "grant") {
    if (
      !Number.isInteger(b.amount) ||
      b.amount < 1 ||
      b.amount > 10000 ||
      !b.note?.trim()
    )
      throw new Error("Enter 1–10,000 Likes and an audit reason.");
    ops.push(
      stmt(
        "INSERT INTO ledger VALUES(?,?,NULL,?,?,?,?)",
        id(),
        b.userId,
        "admin",
        b.amount,
        `Admin adjustment: ${b.note.slice(0, 200)}`,
        now,
      ),
    );
  } else if (action === "cancel") {
    ops.push(
      stmt(
        "UPDATE rounds SET cancelled=1 WHERE id=? AND finalized IS NULL",
        b.id,
      ),
    );
  } else throw new Error("Unknown action.");
  ops.push(
    stmt(
      "INSERT INTO audit VALUES(?,?,?,?,?)",
      id(),
      u,
      action,
      JSON.stringify(b),
      now,
    ),
  );
  await db().batch(ops);
}
