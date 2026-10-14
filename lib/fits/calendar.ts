import { MONTHS, nextPeak, peaksOf } from "./score";
import type { Calendar, Horizon, Moment, Recurring } from "./types";

// All three calendars (PRD §23.2 step 5f, problem 2), computed for the run date: retail moments (dates by calendar
// rule, lead times only when a source gives one), the brand's category seasons and each crowd's cultural moments
// (recurring peaks from every year of pageviews since 2015, with the ramp before each peak as the lead time; dated
// events from Ticketmaster). Nothing comes from a fixed list of dates. Pure.

const DAY = 86_400_000;

export type SeasonIn = { title: string; url?: string; index: number[]; years: number };
export type CalendarIn = {
  date: string;
  /** Retail moments within a year of the run date, by calendar rule (lib/time/now.ts). */
  retail: { name: string; date: string; days: number }[];
  /** Buying lead times the agent found, each with what it was read from. */
  leadTimes?: { moment: string; days: number; basis: string }[];
  /** The brand's category articles and their yearly profiles. */
  categories?: SeasonIn[];
  /** Each crowd's yearly profile (all its articles together) and its dated events. */
  crowds?: { id: string; name: string; season?: SeasonIn; events?: { name: string; date: string; days: number; artist: string; metro: string; url?: string }[] }[];
};

const addDays = (date: string, n: number) => new Date(new Date(`${date}T12:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);

const horizonOf = (days: number): Horizon => (days <= 30 ? "now" : days <= 90 ? "next_quarter" : days <= 183 ? "season" : "year");

/** A peak as a moment: dated to the first of its month, started when attention starts climbing. */
function peakMoment(s: SeasonIn, date: string, kind: Moment["kind"], name: string, crowd?: string): Moment | undefined {
  const p = nextPeak(s.index, date);
  if (!p) return undefined;
  const lead = p.rampDays ? { days: p.rampDays, basis: `attention to “${s.title}” starts climbing ${p.rampDays / 30} month${p.rampDays === 30 ? "" : "s"} before, in ${s.years} years of Wikipedia pageviews` } : undefined;
  return {
    name,
    kind,
    date: p.date,
    days: p.days,
    lead,
    startBy: lead ? addDays(p.date, -lead.days) : undefined,
    crowd,
    url: s.url,
    detail: `${MONTHS[p.month]} runs ${p.index}× its usual month (median of ${s.years} years)`,
  };
}

export function buildCalendar(input: CalendarIn): Calendar {
  // Two category names can land on the same article ("Canned fish", "Tinned fish"); each season counts once.
  const c = { ...input, categories: input.categories?.filter((s, i, all) => all.findIndex((x) => x.title === s.title) === i) };
  const moments: Moment[] = [];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const r of c.retail) {
    if (r.days < 0 || r.days > 365) continue;
    const lt = (c.leadTimes ?? []).find((l) => norm(l.moment) === norm(r.name) && l.days > 0 && l.days <= 365);
    moments.push({ name: r.name, kind: "retail", date: r.date, days: r.days, lead: lt ? { days: lt.days, basis: lt.basis } : undefined, startBy: lt ? addDays(r.date, -lt.days) : undefined });
  }
  for (const s of c.categories ?? []) {
    const m = peakMoment(s, c.date, "category", `${s.title} season`);
    if (m) moments.push(m);
  }
  for (const cr of c.crowds ?? []) {
    if (cr.season) {
      const m = peakMoment(cr.season, c.date, "crowd", `${cr.name}: attention peaks`, cr.id);
      if (m) moments.push({ ...m, detail: `${m.detail}, across ${cr.season.title}` });
    }
    for (const e of cr.events ?? []) if (e.days >= 0) moments.push({ name: e.name, kind: "event", date: e.date, days: e.days, crowd: cr.id, url: e.url, detail: `${e.artist} in ${e.metro}` });
  }
  // A moment's "when to act" is its start-by date when there is one; the horizon follows the moment itself.
  const horizons: Record<Horizon, Moment[]> = { now: [], next_quarter: [], season: [], year: [] };
  for (const m of moments.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name))) horizons[horizonOf(m.days)].push(m);
  const recurring: Recurring[] = [
    ...(c.categories ?? []).map((s) => ({ title: s.title, peaks: peaksOf(s.index), years: s.years })),
    ...(c.crowds ?? []).filter((cr) => cr.season).map((cr) => ({ title: cr.season!.title, crowd: cr.id, peaks: peaksOf(cr.season!.index), years: cr.season!.years })),
  ].filter((r) => r.peaks.length);
  return { date: c.date, horizons, recurring };
}
