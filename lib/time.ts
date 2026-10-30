export const GAME_TIME_ZONE = "America/New_York";
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
// Resolve named-zone midnight rather than assuming every day is 24 hours.
export function nyMidnight(day: string) {
  validateDay(day);
  const target = Date.parse(`${day}T00:00:00Z`);
  let t = target;
  for (let i = 0; i < 3; i++) {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: GAME_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(t);
    const v = (k: string) => p.find((x) => x.type === k)!.value;
    const wall = Date.parse(
      `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}:${v("second")}Z`,
    );
    t += target - wall;
  }
  return t;
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
export function dailyWindow(day: string) {
  validateDay(day);
  return {
    dailyDate: day,
    opens: nyMidnight(day),
    closes: nyMidnight(nextDay(day, 1)),
    ends: nyMidnight(nextDay(day, 2)),
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
// Exclusive midnight boundaries include the complete preceding 23:59 minute.
export function easternDeadline(exclusiveEpoch: number) {
  return easternDate(exclusiveEpoch - 1);
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
