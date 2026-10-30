import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  check,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const profiles = sqliteTable("profiles", {
  id: text().primaryKey(),
  name: text().notNull(),
  role: text().notNull().default("player"),
  followers: integer().notNull().default(0),
});
export const authIdentities = sqliteTable(
  "auth_identities",
  {
    provider: text().notNull(),
    subject: text().notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id),
    created: integer().notNull(),
  },
  (t) => [
    uniqueIndex("one_oauth_identity").on(t.provider, t.subject),
    uniqueIndex("one_provider_per_profile").on(t.userId, t.provider),
  ],
);
export const authUsers = sqliteTable(
  "auth_users",
  {
    id: text()
      .primaryKey()
      .references(() => profiles.id),
    name: text(),
    email: text(),
    emailVerified: integer("email_verified"),
    image: text(),
  },
  (t) => [uniqueIndex("auth_user_email").on(sql`lower(${t.email})`)],
);
export const playerHandles = sqliteTable(
  "player_handles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => profiles.id),
    username: text().notNull(),
    onboarded: integer().notNull().default(0),
  },
  (t) => [
    uniqueIndex("unique_player_username").on(sql`lower(${t.username})`),
    check("onboarding_state", sql`${t.onboarded} IN (0,1)`),
  ],
);
export const authVerificationTokens = sqliteTable(
  "auth_verification_tokens",
  {
    identifier: text().notNull(),
    token: text().notNull(),
    expires: integer().notNull(),
  },
  (t) => [uniqueIndex("unique_auth_verification").on(t.identifier, t.token)],
);
export const authLinkTokens = sqliteTable("auth_link_tokens", {
  token: text().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => profiles.id),
  email: text().notNull(),
  expires: integer().notNull(),
});
export const authRateLimits = sqliteTable("auth_rate_limits", {
  key: text().primaryKey(),
  count: integer().notNull(),
  expires: integer().notNull(),
});
export const settings = sqliteTable("settings", {
  id: integer().primaryKey(),
  data: text().notNull(),
  revision: integer().notNull().default(1),
});
export const prompts = sqliteTable("prompts", {
  id: text().primaryKey(),
  content: text().notNull(),
  scheduled: text(),
  state: text().notNull().default("draft"),
  placeholder: integer().notNull().default(1),
});
export const rounds = sqliteTable(
  "rounds",
  {
    id: text().primaryKey(),
    promptId: text("prompt_id").references(() => prompts.id),
    dailyDate: text("daily_date"),
    number: integer().notNull(),
    prompt: text().notNull(),
    opens: integer().notNull(),
    closes: integer().notNull(),
    ends: integer().notNull(),
    cancelled: integer().notNull().default(0),
    finalized: integer(),
    config: text().notNull(),
    placeholder: integer().notNull().default(1),
  },
  (t) => [
    uniqueIndex("one_prompt_round").on(t.promptId),
    uniqueIndex("one_daily_round")
      .on(t.dailyDate)
      .where(sql`${t.cancelled} = 0`),
  ],
);
export const submissions = sqliteTable(
  "submissions",
  {
    id: text().primaryKey(),
    roundId: text("round_id")
      .notNull()
      .references(() => rounds.id),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id),
    content: text().notNull(),
    updated: integer().notNull(),
  },
  (t) => [uniqueIndex("one_entry").on(t.roundId, t.userId)],
);
export const ballots = sqliteTable(
  "ballots",
  {
    id: text().primaryKey(),
    roundId: text("round_id")
      .notNull()
      .references(() => rounds.id),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id),
    choices: text().notNull(),
    updated: integer().notNull(),
  },
  (t) => [uniqueIndex("one_ballot").on(t.roundId, t.userId)],
);
export const catalog = sqliteTable(
  "catalog",
  {
    id: text().primaryKey(),
    revision: integer().notNull().default(1),
    name: text().notNull(),
    description: text().notNull(),
    icon: text().notNull(),
    image: text(),
    cost: integer().notNull(),
    effect: text().notNull(),
    parameter: integer().notNull(),
    enabled: integer().notNull().default(1),
    availableFrom: integer("available_from"),
    availableUntil: integer("available_until"),
    placeholder: integer().notNull().default(1),
  },
  (t) => [check("positive_cost", sql`${t.cost} >= 0`)],
);
export const wallets = sqliteTable(
  "wallets",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => profiles.id),
    balance: integer().notNull().default(0),
  },
  (t) => [check("no_overdraft", sql`${t.balance} >= 0`)],
);
export const ledger = sqliteTable(
  "ledger",
  {
    id: text().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id),
    roundId: text("round_id").references(() => rounds.id),
    kind: text().notNull(),
    amount: integer().notNull(),
    note: text().notNull(),
    created: integer().notNull(),
  },
  (t) => [
    uniqueIndex("one_starting_grant")
      .on(t.userId)
      .where(sql`${t.kind} = 'starting'`),
  ],
);
export const economyUpdates = sqliteTable("economy_updates", {
  id: text().primaryKey(),
  created: integer().notNull(),
});
export const purchases = sqliteTable("purchases", {
  id: text().primaryKey(),
  catalogRevision: integer("catalog_revision").notNull().default(1),
  userId: text("user_id")
    .notNull()
    .references(() => profiles.id),
  itemId: text("item_id")
    .notNull()
    .references(() => catalog.id),
  created: integer().notNull(),
});
export const inventory = sqliteTable(
  "inventory",
  {
    id: text().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id),
    itemId: text("item_id")
      .notNull()
      .references(() => catalog.id),
    quantity: integer().notNull().default(0),
  },
  (t) => [
    uniqueIndex("one_stock").on(t.userId, t.itemId),
    check("no_negative_stock", sql`${t.quantity} >= 0`),
  ],
);
export const activations = sqliteTable(
  "activations",
  {
    id: text().primaryKey(),
    catalogRevision: integer("catalog_revision").notNull().default(1),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id),
    roundId: text("round_id")
      .notNull()
      .references(() => rounds.id),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id),
    itemId: text("item_id")
      .notNull()
      .references(() => catalog.id),
    created: integer().notNull(),
  },
  (t) => [uniqueIndex("one_activation").on(t.userId, t.roundId)],
);
export const effects = sqliteTable("effects", {
  activationId: text("activation_id")
    .primaryKey()
    .references(() => activations.id),
  roundId: text("round_id")
    .notNull()
    .references(() => rounds.id),
  submissionId: text("submission_id")
    .notNull()
    .references(() => submissions.id),
  name: text().notNull(),
  type: text().notNull(),
  parameter: integer().notNull(),
});
export const receipts = sqliteTable(
  "receipts",
  {
    id: text().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id),
    roundId: text("round_id")
      .notNull()
      .references(() => rounds.id),
    kind: text().notNull(),
  },
  (t) => [uniqueIndex("one_receipt").on(t.userId, t.roundId, t.kind)],
);
export const results = sqliteTable("results", {
  submissionId: text("submission_id")
    .primaryKey()
    .references(() => submissions.id),
  roundId: text("round_id")
    .notNull()
    .references(() => rounds.id),
  userId: text("user_id")
    .notNull()
    .references(() => profiles.id),
  rank: integer().notNull(),
  raw: integer().notNull(),
  bonus: integer().notNull(),
  score: integer().notNull(),
  followers: integer().notNull(),
  breakdown: text().notNull(),
});
export const followerAwards = sqliteTable(
  "follower_awards",
  {
    id: text().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id),
    roundId: text("round_id")
      .notNull()
      .references(() => rounds.id),
    amount: integer().notNull(),
  },
  (t) => [uniqueIndex("one_followers").on(t.userId, t.roundId)],
);
export const audit = sqliteTable("audit", {
  id: text().primaryKey(),
  actor: text().notNull(),
  action: text().notNull(),
  payload: text().notNull(),
  created: integer().notNull(),
});

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    id: text().primaryKey(),
    bucket: integer().notNull(),
    count: integer().notNull(),
  },
  (t) => [check("request_limit", sql`${t.count} <= 60`)],
);

export const socialSettings = sqliteTable("social_settings", {
  id: integer().primaryKey(),
  data: text().notNull(),
  revision: integer().notNull().default(1),
});
export const socialSettingsVersions = sqliteTable("social_settings_versions", {
  revision: integer().primaryKey(),
  effectiveDay: text("effective_day").notNull(),
  data: text().notNull(),
  created: integer().notNull(),
});
export const tiers = sqliteTable(
  "tiers",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    description: text().notNull(),
    icon: text().notNull(),
    image: text().notNull().default(""),
    color: text().notNull(),
    colorEnd: text("color_end").notNull(),
    threshold: integer().notNull(),
    sortOrder: integer("sort_order").notNull(),
    enabled: integer().notNull().default(1),
    celebration: integer().notNull().default(1),
    placeholder: integer().notNull().default(1),
  },
  (t) => [check("tier_threshold", sql`${t.threshold} >= 0`)],
);
export const cosmetics = sqliteTable("cosmetics", {
  id: text().primaryKey(),
  name: text().notNull(),
  description: text().notNull(),
  kind: text().notNull(),
  effect: text().notNull(),
  params: text().notNull(),
  icon: text().notNull(),
  image: text().notNull().default(""),
  enabled: integer().notNull().default(1),
  unlockType: text("unlock_type").notNull(),
  unlockValue: integer("unlock_value").notNull().default(0),
  unlockTarget: text("unlock_target").notNull().default(""),
  placeholder: integer().notNull().default(1),
  revision: integer().notNull().default(1),
});
export const cosmeticOwnership = sqliteTable(
  "cosmetic_ownership",
  {
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id),
    itemId: text("item_id")
      .notNull()
      .references(() => cosmetics.id),
    source: text().notNull(),
    earned: integer().notNull(),
  },
  (t) => [uniqueIndex("one_cosmetic_owner").on(t.userId, t.itemId)],
);
export const profileStyles = sqliteTable("profile_styles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => profiles.id),
  data: text().notNull(),
  revision: integer().notNull().default(1),
});
export const equippedCosmetics = sqliteTable(
  "equipped_cosmetics",
  {
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id),
    slot: text().notNull(),
    itemId: text("item_id")
      .notNull()
      .references(() => cosmetics.id),
  },
  (t) => [
    uniqueIndex("one_equipped_slot").on(t.userId, t.slot),
    uniqueIndex("one_equipped_item").on(t.userId, t.itemId),
  ],
);
export const tierAwards = sqliteTable(
  "tier_awards",
  {
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id),
    tierId: text("tier_id")
      .notNull()
      .references(() => tiers.id),
    earned: integer().notNull(),
    acknowledged: integer().notNull().default(0),
  },
  (t) => [uniqueIndex("one_tier_award").on(t.userId, t.tierId)],
);
export const dailyActivity = sqliteTable(
  "daily_activity",
  {
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id),
    day: text().notNull(),
    source: text().notNull(),
    roundId: text("round_id")
      .notNull()
      .references(() => rounds.id),
    created: integer().notNull(),
  },
  (t) => [uniqueIndex("one_activity_day").on(t.userId, t.day)],
);
export const streakState = sqliteTable(
  "streak_state",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => profiles.id),
    createdDay: text("created_day").notNull(),
    lastDay: text("last_day").notNull(),
    current: integer().notNull().default(0),
    longest: integer().notNull().default(0),
    freezeBalance: integer("freeze_balance").notNull().default(0),
    lastPeriod: text("last_period").notNull().default(""),
    activeDays: integer("active_days").notNull().default(0),
    revision: integer().notNull().default(0),
    token: text().notNull().default(""),
  },
  (t) => [
    check(
      "streak_nonnegative",
      sql`${t.current} >= 0 AND ${t.longest} >= ${t.current} AND ${t.freezeBalance} >= 0`,
    ),
  ],
);
export const streakDays = sqliteTable(
  "streak_days",
  {
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id),
    day: text().notNull(),
    status: text().notNull(),
    streak: integer().notNull(),
    rules: text().notNull(),
  },
  (t) => [uniqueIndex("one_streak_day").on(t.userId, t.day)],
);
export const freezeGrants = sqliteTable(
  "freeze_grants",
  {
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id),
    period: text().notNull(),
    day: text().notNull(),
    amount: integer().notNull(),
    balance: integer().notNull(),
    rules: text().notNull(),
  },
  (t) => [uniqueIndex("one_freeze_refill").on(t.userId, t.period)],
);
export const streakMilestones = sqliteTable("streak_milestones", {
  id: text().primaryKey(),
  name: text().notNull(),
  description: text().notNull(),
  days: integer().notNull(),
  cosmeticId: text("cosmetic_id")
    .notNull()
    .references(() => cosmetics.id),
  enabled: integer().notNull().default(1),
  placeholder: integer().notNull().default(1),
});
