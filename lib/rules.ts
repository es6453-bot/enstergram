export const DEFAULTS = {
  startingLikes: 100,
  submissionClout: 10,
  votingClout: 5,
  podiumClout: [30, 20, 10],
  wordLimit: 10,
  votePoints: [3, 2, 1, -1],
  followers: [100, 60, 40, 25, 15, 5, 0],
  minEntries: 5,
};
export type Rules = typeof DEFAULTS;
// Legacy config keys and effect IDs stay stable for historical round snapshots.
export function currencyCopy(text: string) {
  return text.replace(/\bclout\b/gi, (word) =>
    word === word.toUpperCase()
      ? "LIKES"
      : word[0] === word[0].toUpperCase()
        ? "Likes"
        : "likes",
  );
}
export const EFFECTS = [
  "word_limit",
  "positive_multiplier",
  "downvote_shield",
  "clout_multiplier",
] as const;
export type Effect = { type: string; parameter: number; name?: string };
export function words(s: string) {
  return s
    .trim()
    .split(/\s+/u)
    .filter((x) => /[\p{L}\p{N}]/u.test(x)).length;
}
export function phase(
  r: {
    opens: number;
    closes: number;
    ends: number;
    cancelled: number;
    finalized?: number | null;
  },
  now = Date.now(),
) {
  return r.cancelled
    ? "CANCELLED"
    : now < r.opens
      ? "SCHEDULED"
      : now < r.closes
        ? "SUBMISSION"
        : now < r.ends
          ? "VOTING"
          : "RESULTS";
}
export function transform(counts: number[], points: number[], effect?: Effect) {
  const positive = counts.slice(0, 3).reduce((s, c, i) => s + c * points[i], 0);
  const negative = counts[3] * points[3];
  const raw = positive + negative;
  const shield =
    effect?.type === "downvote_shield"
      ? Math.min(counts[3], effect.parameter) * -points[3]
      : 0;
  const boost =
    effect?.type === "positive_multiplier"
      ? positive * (effect.parameter - 1)
      : 0;
  return {
    raw,
    positive,
    negative,
    shield,
    boost,
    bonus: shield + boost,
    score: raw + shield + boost,
    counts,
  };
}
export function followers(rank: number, total: number, r: Rules) {
  if (total < r.minEntries) return 0;
  if (rank === total) return r.followers[6];
  if (rank <= 3) return r.followers[rank - 1];
  if (rank / total <= 0.1) return r.followers[3];
  if (rank / total <= 0.25) return r.followers[4];
  return r.followers[5];
}
export function validateRules(x: Rules) {
  const values = [
    x.startingLikes,
    x.submissionClout,
    x.votingClout,
    x.wordLimit,
    x.minEntries,
    ...(x.podiumClout || []),
    ...(x.votePoints || []),
    ...(x.followers || []),
  ];
  if (
    values.some((n) => !Number.isSafeInteger(n) || Math.abs(n) > 100000) ||
    x.startingLikes < 0 ||
    x.submissionClout < 0 ||
    x.votingClout < 0 ||
    x.wordLimit < 1 ||
    x.wordLimit > 100 ||
    x.minEntries < 5 ||
    x.podiumClout.length !== 3 ||
    x.votePoints.length !== 4 ||
    x.followers.length !== 7 ||
    x.votePoints.slice(0, 3).some((n) => n < 0) ||
    x.votePoints[3] > 0 ||
    x.podiumClout.some((n) => n < 0) ||
    x.followers.some((n) => n < 0)
  )
    throw new Error(
      "Enter valid nonnegative rewards, 1–100 words, and at least 5 ranked entries.",
    );
  return x;
}
export function validateItem(x: {
  effect: string;
  parameter: number;
  cost: number;
  name: string;
  description: string;
  image?: string;
}) {
  if (
    !EFFECTS.includes(x.effect as (typeof EFFECTS)[number]) ||
    !Number.isInteger(x.parameter) ||
    x.parameter < 1 ||
    x.parameter > 100 ||
    !Number.isInteger(x.cost) ||
    x.cost < 0 ||
    x.cost > 100000 ||
    !x.name?.trim() ||
    x.name.length > 80 ||
    !x.description?.trim() ||
    x.description.length > 1000 ||
    (x.image && !/^https:\/\//.test(x.image))
  )
    throw new Error(
      "Check the item fields, supported effect, and HTTPS image URL.",
    );
  return x;
}
