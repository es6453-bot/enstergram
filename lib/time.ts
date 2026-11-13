export const GAME_TIME_ZONE = "America/New_York";
export const DEFAULT_SCHEDULE = {
  submissionOpens: "00:00",
  votingOpens: "00:00",
  resultsAt: "22:00",
};
export type DailySchedule = typeof DEFAULT_SCHEDULE;
const wallClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: GAME_TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
export function validateDay(day: string) {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day))
    throw new Error("Choose a valid Eastern calendar date.");
  const epoch = Date.parse(`${day}T00:00:00Z`);
  if (
    !Number.isFinite(epoch) ||
    new Date(epoch).toISOString().slice(0, 10) !== day
  )
    throw new Error("Choose a valid Eastern calendar date.");
  return day;
}
// Choose the first occurrence of repeated times and shift skipped times forward.
export function nyTime(day: string, time: string) {
  validateDay(day);
  const target = Date.parse(`${day}T${time}:00Z`);
  const wallTime = (epoch: number) => {
    const p = wallClock.formatToParts(epoch);
    const v = (k: string) => p.find((x) => x.type === k)!.value;
    return Date.parse(
      `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}:00Z`,
    );
  };
  const dayMs = 86400000;
  const candidates = [target - dayMs, target + dayMs]
    .map((epoch) => target + epoch - wallTime(epoch));
  return Math.min(...candidates.filter((epoch) => wallTime(epoch) >= target));
}
export function nyMidnight(day: string) {
  return nyTime(day, "00:00");
}
export function nextDay(day: string, n: number) {
  validateDay(day);
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function easternDay(epoch = Date.now()) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: GAME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(epoch);
  const v = (key: string) => p.find((part) => part.type === key)!.value;
  return `${v("year")}-${v("month")}-${v("day")}`;
}
export function validateSchedule(value: unknown): DailySchedule {
  const input = value as Partial<DailySchedule> | null;
  const values = Object.keys(DEFAULT_SCHEDULE) as (keyof DailySchedule)[];
  if (!input || !values.every((key) => typeof input[key] === "string" &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(input[key])))
    throw new Error("Enter all three Eastern times in HH:MM format.");
  const { submissionOpens, votingOpens, resultsAt } = input as DailySchedule;
  if (submissionOpens < votingOpens)
    throw new Error("Submissions for the next prompt must open at or after the previous prompt’s voting starts.");
  if (resultsAt <= votingOpens)
    throw new Error("Results must be scheduled after voting opens on Day 2.");
  // Check spring-forward ordering as well as ordinary local clock ordering.
  if (nyTime("2026-03-08", resultsAt) <= nyTime("2026-03-08", votingOpens) ||
      nyTime("2026-03-08", submissionOpens) < nyTime("2026-03-08", votingOpens))
    throw new Error("Choose times that remain in order when Eastern clocks spring forward.");
  return { submissionOpens, votingOpens, resultsAt };
}
export function dailyWindow(day: string, schedule = DEFAULT_SCHEDULE) {
  const votingDay = nextDay(day, 1);
  return {
    dailyDate: day,
    opens: nyTime(day, schedule.submissionOpens),
    closes: nyTime(votingDay, schedule.votingOpens),
    ends: nyTime(votingDay, schedule.resultsAt),
  };
}
export function easternDate(epoch: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: GAME_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(epoch);
}
export function easternDeadline(exclusiveEpoch: number) {
  return easternDate(exclusiveEpoch);
}
export function nextPhaseDelay(
  rounds: {
    opens: number;
    closes: number;
    ends: number;
    cancelled: number;
    finalized?: number | null;
  }[],
  serverNow: number,
) {
  const future = rounds
    .filter((r) => !r.cancelled && !r.finalized)
    .flatMap((r) => [r.opens, r.closes, r.ends])
    .filter((n) => n > serverNow);
  return future.length
    ? Math.min(Math.max(Math.min(...future) - serverNow + 50, 50), 2147480000)
    : null;
}
