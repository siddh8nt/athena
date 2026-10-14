import { AsyncLocalStorage } from "node:async_hooks";

// The run date (PRD §23.2 step 1, problem 2). Every Gemini call and every run reads today's date from here,
// so timing comes from the calendar, not the model's training cutoff. A run can be pinned to another date
// (`asOf`) to check that timing moves with it; ATHENA_AS_OF does the same for a whole dev server.

const DAY = 86_400_000;
const store = new AsyncLocalStorage<Date>();

/** Parses YYYY-MM-DD within two years of the real date, or undefined. */
export function parseAsOf(v: unknown): Date | undefined {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return undefined;
  return Math.abs(d.getTime() - Date.now()) <= 730 * DAY ? d : undefined;
}

/** Runs `fn` with the run date pinned to `asOf` (when given); everything it awaits sees that date. */
export function runAt<T>(asOf: Date | undefined, fn: () => T): T {
  return asOf ? store.run(asOf, fn) : fn();
}

/** The run date from a request: `?asOf=` or the `x-athena-as-of` header. */
export function asOfFrom(req: Request): Date | undefined {
  return parseAsOf(new URL(req.url).searchParams.get("asOf") ?? req.headers.get("x-athena-as-of"));
}

/** Now, for this run. */
export function now(): Date {
  return store.getStore() ?? parseAsOf(process.env.ATHENA_AS_OF) ?? new Date();
}

/** Today for this run, YYYY-MM-DD (UTC). */
export function today(): string {
  return now().toISOString().slice(0, 10);
}

/** Milliseconds since the epoch for this run; use in place of Date.now() where timing is judged, not measured. */
export function nowMs(): number {
  return now().getTime();
}

export type Season = "winter" | "spring" | "summer" | "autumn";

/** US (northern hemisphere) meteorological season. */
export function seasonOf(d: Date): Season {
  const m = d.getUTCMonth();
  return m <= 1 || m === 11 ? "winter" : m <= 4 ? "spring" : m <= 7 ? "summer" : "autumn";
}

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 12));
/** The n-th weekday (0 = Sunday) of a month; n = -1 for the last one. */
function nthWeekday(y: number, m: number, weekday: number, n: number): Date {
  if (n < 0) {
    const last = utc(y, m + 1, 0);
    return utc(y, m, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
  }
  const first = utc(y, m, 1);
  return utc(y, m, 1 + ((weekday - first.getUTCDay() + 7) % 7) + 7 * (n - 1));
}
/** Western Easter (anonymous Gregorian algorithm). */
function easter(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return utc(y, month - 1, ((h + l - 7 * m + 114) % 31) + 1);
}

/**
 * US retail moments whose dates follow a fixed calendar rule, so they're computed, never guessed. Moments
 * set each year by a company (Prime Day, the Super Bowl) or by a retailer's buying calendar come from live
 * lookups in step 5, with their sources.
 */
function retailMoments(y: number): { name: string; date: Date }[] {
  const thanksgiving = nthWeekday(y, 10, 4, 4);
  return [
    { name: "New Year's Day", date: utc(y, 0, 1) },
    { name: "Valentine's Day", date: utc(y, 1, 14) },
    { name: "St. Patrick's Day", date: utc(y, 2, 17) },
    { name: "Easter", date: easter(y) },
    { name: "Mother's Day", date: nthWeekday(y, 4, 0, 2) },
    { name: "Memorial Day", date: nthWeekday(y, 4, 1, -1) },
    { name: "Father's Day", date: nthWeekday(y, 5, 0, 3) },
    { name: "Independence Day", date: utc(y, 6, 4) },
    { name: "Labor Day", date: nthWeekday(y, 8, 1, 1) },
    { name: "Halloween", date: utc(y, 9, 31) },
    { name: "Thanksgiving", date: thanksgiving },
    { name: "Black Friday", date: new Date(thanksgiving.getTime() + DAY) },
    { name: "Cyber Monday", date: new Date(thanksgiving.getTime() + 4 * DAY) },
    { name: "Christmas", date: utc(y, 11, 25) },
  ];
}

export type TimeContext = {
  date: string;
  weekday: string;
  season: Season;
  /** The next retail moments within a year, soonest first. */
  moments: { name: string; date: string; days: number }[];
};

/** Today's date, the season and the days to the coming retail moments. */
export function timeContext(at: Date = now(), count = 6): TimeContext {
  const day = utc(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  const y = day.getUTCFullYear();
  const moments = [...retailMoments(y), ...retailMoments(y + 1)]
    .map((m) => ({ name: m.name, date: m.date.toISOString().slice(0, 10), days: Math.round((m.date.getTime() - day.getTime()) / DAY) }))
    .filter((m) => m.days >= 0 && m.days <= 365)
    .sort((a, b) => a.days - b.days)
    .slice(0, count);
  return { date: day.toISOString().slice(0, 10), weekday: day.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }), season: seasonOf(day), moments };
}

const inDays = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

/** One line for a trace step: "Wednesday 14 Oct 2026, autumn. Next: Halloween in 17 days, ...". */
export function timeSummary(t: TimeContext = timeContext()): string {
  const d = new Date(`${t.date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${t.weekday} ${d}, ${t.season}. Next: ${t.moments.slice(0, 3).map((m) => `${m.name} ${inDays(m.days)}`).join(", ")}`;
}

/** The block every Gemini system instruction starts with. */
export function timePrompt(t: TimeContext = timeContext()): string {
  return [
    `Today is ${t.weekday}, ${t.date}. It is ${t.season} in the US.`,
    `Coming US retail moments: ${t.moments.map((m) => `${m.name} ${t.date === m.date ? "(today)" : `${m.date} (${m.days} days)`}`).join("; ")}.`,
    "Judge every timing question (what's soon, what's past, what to prepare for) from this date, not from your training data.",
  ].join("\n");
}

/** Wraps a route handler so its whole run, streams included, uses the request's `asOf` date. */
export function dated<R>(handler: (req: Request) => Promise<R>): (req: Request) => Promise<R> {
  return (req) => runAt(asOfFrom(req), () => handler(req));
}
