import type { BrandBrief } from "@/lib/brief/types";
import type { Journey } from "@/lib/journey/types";
import { execPlan, followDue, statesOf, waitOf } from "@/lib/exec/plan";
import { emptyTeam } from "@/lib/team/types";
import { calendarEntries } from "./calendar";

// This week (PRD §23.6 j): the top of the Overview tab. Three short lists from what the plan already holds, never a
// guess: the pitches with no reply after their wait, what falls due in the next seven days (follow-ups as their wait
// runs out, apply-by deadlines, moments, a launch with an exact date), and the next events. A row is listed once, in
// the first list that holds it. Each line opens its row in Execute Plan, or its source when it has no row. Pure, so
// the dashboard and the MCP server's "what changed since last week" read the same thing.

const DAY = 24 * 60 * 60 * 1000;

export type WeekLine = { key: string; title: string; sub: string; date?: string; row?: string; url?: string };
export type Week = { brand: string; today: string; quiet: WeekLine[]; due: WeekLine[]; events: WeekLine[] };

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const niceDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

/** How many upcoming events This week shows. */
const NEXT_EVENTS = 3;

export function thisWeek(saved: { brief?: BrandBrief; journey?: Journey }, now = Date.now()): Week {
  const team = saved.journey?.team ?? emptyTeam();
  const plan = execPlan(team);
  const state = statesOf(team);
  const today = dayOf(now);
  const end = dayOf(now + 7 * DAY);
  const promo = team.works.promoter?.shared?.promo;
  const brand = saved.brief?.name?.value || promo?.brand.name || "Your brand";
  const seen = new Set<string>();
  const take = (l: WeekLine) => {
    const k = l.row ?? l.key;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  };

  const quiet: WeekLine[] = [];
  for (const it of plan.items) {
    const st = state(it.id);
    if (it.left || !(st.mark === "no_reply" || followDue(it, st, team.exec, now))) continue;
    const wait = waitOf(it, team.exec).days;
    const sub = st.at != null ? `Pitched ${shortDay(dayOf(st.at))}, no reply after ${wait} day${wait === 1 ? "" : "s"}. Time to follow up.` : "No reply yet. Time to follow up.";
    const l: WeekLine = { key: `follow:${it.id}`, title: it.name, sub, row: it.id, ...(st.at != null ? { date: dayOf(st.at) } : {}) };
    if (take(l)) quiet.push(l);
  }

  const entries = calendarEntries(saved);
  const due: WeekLine[] = [];
  for (const e of entries) {
    if (e.date < today || e.date >= end || e.uid.startsWith("event-")) continue;
    const title = e.uid.startsWith("apply-") ? e.title.replace(/^Apply by today: /, "Apply: ") : e.title;
    const l: WeekLine = { key: e.uid, title, sub: `${niceDay(e.date)}. ${e.lines[0] ?? ""}`.trim(), date: e.date, ...(e.row ? { row: e.row } : {}), ...(e.url ? { url: e.url } : {}) };
    if (take(l)) due.push(l);
  }

  const events: WeekLine[] = [];
  for (const e of entries) {
    if (events.length >= NEXT_EVENTS) break;
    if (e.date < today || !e.uid.startsWith("event-")) continue;
    const where = e.lines.find((x) => x.startsWith("Where: "))?.slice(7);
    const l: WeekLine = { key: e.uid, title: e.title, sub: `${niceDay(e.date)}${where ? `, ${where}` : ""}`, date: e.date, ...(e.row ? { row: e.row } : {}), ...(e.url ? { url: e.url } : {}) };
    if (take(l)) events.push(l);
  }

  return { brand, today, quiet, due, events };
}

export const weekEmpty = (w: Week) => !w.quiet.length && !w.due.length && !w.events.length;

/** A row's link in Execute Plan. */
export const rowHref = (id: string, base = "") => `${base}/plan?tab=executive&item=${encodeURIComponent(id)}`;

/** This week as plain text, for the founder's AI tool (and a mail app body). Links only where `base` is given. */
export function weekText(w: Week, base?: string): string {
  const part = (head: string, ls: WeekLine[]) =>
    ls.length ? [`${head}`, ...ls.map((l) => `- ${l.title}: ${l.sub}${l.row && base ? ` ${rowHref(l.row, base)}` : l.url ? ` ${l.url}` : ""}`), ""] : [];
  const body = [...part("No reply yet", w.quiet), ...part("Due this week", w.due), ...part("Next events", w.events)];
  return [`${w.brand}: this week (from ${niceDay(w.today)})`, "", ...(body.length ? body : ["Nothing is due this week, and no pitch is waiting on a reply.", ""])].join("\n").trimEnd() + "\n";
}
