/* eslint-disable @typescript-eslint/no-explicit-any */
import { nextDay, validateDay } from "./time";

export const SOCIAL_DEFAULTS = {
  freezeFrequency: "weekly" as "weekly" | "monthly",
  freezesPerPeriod: 1,
  freezeBankLimit: 1,
  maxBadges: 3,
};
export const APPEARANCE_DEFAULTS = {
  avatar: "",
  banner: "",
  bio: "",
  primary: "#252039",
  secondary: "#13161e",
  accent: "#ed68bb",
  usernameColor: "#f4f5f9",
  animations: true,
};
export const COSMETIC_EFFECTS: Record<string, string[]> = {
  theme: ["solid", "gradient"],
  frame: ["ring", "double_ring", "dashed"],
  profile_effect: ["glow", "sparkle", "float"],
  banner_pattern: ["dots", "stripes", "grid"],
  badge: ["emblem"],
  title: ["label"],
};
export const UNLOCK_TYPES = [
  "all",
  "manual",
  "followers",
  "tier",
  "streak",
  "participation",
  "achievement",
  "event",
  "shop",
];
export function integer(x: any, min: number, max: number, label: string) {
  if (!Number.isSafeInteger(x) || x < min || x > max)
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  return x as number;
}
export function shortText(
  x: any,
  max: number,
  label: string,
  required = false,
) {
  if (typeof x !== "string" || x.length > max || (required && !x.trim()))
    throw new Error(`Enter ${label} up to ${max} characters.`);
  return x.trim();
}
export function color(x: any) {
  if (typeof x !== "string" || !/^#[0-9a-f]{6}$/i.test(x))
    throw new Error("Choose a six-digit hex color.");
  return x;
}
export function imageUrl(x: any) {
  if (!x) return "";
  shortText(x, 1500, "an image URL");
  let url: URL;
  try {
    url = new URL(x);
  } catch {
    throw new Error("Images require a valid HTTPS URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Images require a valid HTTPS URL.");
  return url.href;
}
export function validateSocialSettings(x: any) {
  if (!x || !["weekly", "monthly"].includes(x.freezeFrequency))
    throw new Error("Choose weekly or monthly freeze refills.");
  return {
    freezeFrequency: x.freezeFrequency,
    freezesPerPeriod: integer(x.freezesPerPeriod, 0, 5, "Freeze refill"),
    freezeBankLimit: integer(x.freezeBankLimit, 0, 10, "Freeze bank limit"),
    maxBadges: integer(x.maxBadges, 0, 6, "Displayed badge limit"),
  };
}
export function validateTier(x: any) {
  return {
    id: x.id,
    name: shortText(x.name, 70, "a tier name", true),
    description: shortText(x.description, 400, "a description"),
    icon: shortText(x.icon, 8, "an icon", true),
    image: imageUrl(x.image),
    color: color(x.color),
    color_end: color(x.color_end),
    threshold: integer(x.threshold, 0, 1000000000, "Follower threshold"),
    sort_order: integer(x.sort_order, 0, 1000, "Display order"),
    enabled: x.enabled ? 1 : 0,
    celebration: x.celebration ? 1 : 0,
    placeholder: x.placeholder ? 1 : 0,
  };
}
export function validateCosmetic(x: any) {
  if (!COSMETIC_EFFECTS[x.kind]?.includes(x.effect))
    throw new Error("Choose a supported cosmetic effect for this item type.");
  if (!UNLOCK_TYPES.includes(x.unlock_type))
    throw new Error("Choose a supported unlock rule.");
  const p = typeof x.params === "string" ? JSON.parse(x.params) : x.params;
  if (!p || typeof p !== "object" || Array.isArray(p))
    throw new Error("Cosmetic parameters are required.");
  // Construct a fresh object: admin content can never supply CSS, HTML, or scripts.
  const params = {
    primary: color(p.primary),
    secondary: color(p.secondary),
    accent: color(p.accent),
    size: integer(p.size, 1, 8, "Effect size"),
    speed: integer(p.speed, 2, 20, "Animation duration"),
    opacity: integer(p.opacity, 5, 60, "Effect opacity"),
  };
  return {
    id: x.id,
    name: shortText(x.name, 70, "a cosmetic name", true),
    description: shortText(x.description, 500, "a description"),
    kind: x.kind,
    effect: x.effect,
    params,
    icon: shortText(x.icon, 8, "an icon", true),
    image: imageUrl(x.image),
    enabled: x.enabled ? 1 : 0,
    unlock_type: x.unlock_type,
    unlock_value: integer(x.unlock_value, 0, 1000000000, "Unlock threshold"),
    unlock_target: shortText(x.unlock_target || "", 100, "an unlock reference"),
    placeholder: x.placeholder ? 1 : 0,
  };
}
export function validateAppearance(x: any) {
  return {
    name: shortText(x.name, 48, "a display name", true),
    bio: shortText(x.bio, 300, "a bio"),
    avatar: imageUrl(x.avatar),
    banner: imageUrl(x.banner),
    primary: color(x.primary),
    secondary: color(x.secondary),
    accent: color(x.accent),
    usernameColor: color(x.usernameColor),
    animations: !!x.animations,
  };
}
export function tierProgress(tiers: any[], followers: number) {
  const enabled = tiers
    .filter((x) => x.enabled)
    .sort(
      (a, b) =>
        a.threshold - b.threshold ||
        a.sort_order - b.sort_order ||
        a.id.localeCompare(b.id),
    );
  const reached = enabled.filter((x) => x.threshold <= followers);
  const current = reached.at(-1) || null;
  const next = enabled.find((x) => x.threshold > followers) || null;
  const floor = current?.threshold || 0;
  return {
    current,
    next,
    progress: next
      ? Math.max(
          0,
          Math.min(100, ((followers - floor) / (next.threshold - floor)) * 100),
        )
      : 100,
    remaining: next ? next.threshold - followers : 0,
  };
}
export function freezePeriod(day: string, frequency: string) {
  validateDay(day);
  if (frequency === "monthly") return `month:${day.slice(0, 7)}`;
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return `week:${nextDay(day, -((weekday + 6) % 7))}`;
}
export function initialStreak(today: string) {
  return {
    last_day: nextDay(today, -1),
    current: 0,
    longest: 0,
    freeze_balance: 0,
    last_period: "",
    active_days: 0,
    revision: 0,
  };
}
// Input dates are named-zone calendar dates, never elapsed 24-hour intervals.
// Freeze days preserve the count; they do not increment activity or earn rewards.
export function advanceStreak(
  previous: any,
  activityDays: Set<string>,
  today: string,
  settings: typeof SOCIAL_DEFAULTS,
  history: any[] = [],
  grantedPeriods: Set<string> = new Set(),
  throughDay = today,
) {
  validateDay(today);
  const state = { ...previous };
  const days: any[] = [],
    grants: any[] = [];
  const rulesFor = (day: string) =>
    history.filter((x) => x.effective_day <= day).at(-1)?.rules || settings;
  const refill = (day: string, rules: typeof SOCIAL_DEFAULTS) => {
    const period = freezePeriod(day, rules.freezeFrequency);
    if (state.last_period !== period) {
      const before = state.freeze_balance;
      if (!grantedPeriods.has(period)) {
        state.freeze_balance = Math.min(
          rules.freezeBankLimit,
          before + rules.freezesPerPeriod,
        );
        grants.push({
          period,
          day,
          amount: Math.max(0, state.freeze_balance - before),
          balance: state.freeze_balance,
          rules,
        });
        grantedPeriods.add(period);
      }
      state.last_period = period;
    }
  };
  for (
    let day = nextDay(state.last_day, 1);
    day <= throughDay;
    day = nextDay(day, 1)
  ) {
    const rules = rulesFor(day);
    refill(day, rules);
    if (day === today && !activityDays.has(day)) break;
    let status = "missed";
    if (activityDays.has(day)) {
      status = "active";
      state.current++;
      state.active_days++;
      state.longest = Math.max(state.longest, state.current);
    } else if (state.current > 0 && state.freeze_balance > 0) {
      status = "frozen";
      state.freeze_balance--;
    } else state.current = 0;
    state.last_day = day;
    days.push({ day, status, streak: state.current, rules });
  }
  // Also refill on Monday/month-start when today's activity is already recorded.
  refill(throughDay, rulesFor(throughDay));
  return { state, days, grants };
}
