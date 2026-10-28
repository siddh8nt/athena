import type { BrandBrief } from "@/lib/brief/types";
import type { Journey } from "@/lib/journey/types";
import { execPlan, statesOf, waitOf } from "@/lib/exec/plan";
import { emptyTeam } from "@/lib/team/types";

// The founder's calendar (PRD §23.6 g): the plan's dated things as an .ics, to subscribe to (a live feed at
// /cal/<secret>.ics that follows the plan) or download once. What goes in is only what the plan already dates: the
// Promoter's events and moments, each event's apply-by deadline, the follow-up due on each pitched row (the day its
// wait runs out), and the founder's launch when they gave an exact date. Nothing is dated by guess: a launch given as
// a window ("in 1 to 3 months") stays out. Each entry carries its source link and, for the founder's own calendar, a
// link back to its row in Execute Plan. Pure, so the browser builds the download and the server the feed from it.

export const CAL_FILE = "athena-calendar.ics";

const DAY = 24 * 60 * 60 * 1000;

/** One all-day entry. `row`: the Execute Plan item it opens; `alarm`: days before to remind. */
export type CalEntry = { uid: string; date: string; title: string; lines: string[]; url?: string; row?: string; alarm?: number };

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const nice = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);
/** A stable UID per entry, so a calendar app updates it in place; ids that already start with their kind keep one. */
const uidOf = (kind: string, id: string) => {
  const slug = id.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug.startsWith(`${kind}-`) ? slug : `${kind}-${slug}`}@athena`;
};
const list = (xs: string[]) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The plan's dated things, earliest first. Skipped and left-out items stay out. */
export function calendarEntries(saved: { brief?: BrandBrief; journey?: Journey }): CalEntry[] {
  const team = saved.journey?.team ?? emptyTeam();
  const plan = execPlan(team);
  const state = statesOf(team);
  const out: CalEntry[] = [];
  const gone = new Set(plan.leftOut.map((l) => l.id));
  const live = (id: string) => !gone.has(id) && state(id).mark !== "no" && state(id).status !== "skipped";
  const rowOf = (id: string) => (plan.byId.has(id) ? id : undefined);

  const promo = team.works.promoter?.shared?.promo;
  const crowdName = new Map((promo?.crowds ?? []).map((c) => [c.id, c.name]));
  const crowds = (ids: string[]) => ids.map((c) => crowdName.get(c)).filter((c): c is string => !!c);

  for (const e of promo?.events ?? []) {
    if (!isDay(e.date) || !live(e.id)) continue;
    const who = crowds(e.crowds);
    const where = [e.venue, e.hood?.name, e.city].filter(Boolean).join(", ");
    out.push({
      uid: uidOf("event", e.id),
      date: e.date,
      title: `${e.name}${e.city ? ` (${e.city})` : ""}`,
      lines: [
        where && `Where: ${where}`,
        who.length ? `For ${list(who)}` : "",
        e.why,
        e.formats.length ? `Ways in: ${e.formats.join(", ")}` : "",
        e.fee ? `Fee: ${e.fee.text} (${e.fee.url})` : "",
        e.applyBy ? `Apply by ${nice(e.applyBy)}${e.applyUrl ? `: ${e.applyUrl}` : ""}` : "",
        e.moved ? `Moved from ${nice(e.moved.from)}: ${e.moved.reason}` : "",
        `Date from ${e.site}: ${e.url}`,
      ].filter(Boolean),
      url: e.url,
      row: rowOf(e.id),
    });
    if (isDay(e.applyBy) && e.applyBy <= e.date) {
      const lead = daysBetween(e.applyBy, e.date);
      out.push({
        uid: uidOf("apply", e.id),
        date: e.applyBy,
        title: `Apply by today: ${e.name}`,
        lines: [`Applications close ${lead} day${lead === 1 ? "" : "s"} before ${e.name} on ${nice(e.date)}${e.city ? ` in ${e.city}` : ""}.`, e.applyUrl ? `Apply: ${e.applyUrl}` : "", `Date from ${e.site}: ${e.url}`].filter(Boolean),
        url: e.applyUrl ?? e.url,
        row: rowOf(e.id),
        alarm: 7,
      });
    }
  }

  for (const m of promo?.moments ?? []) {
    if (!isDay(m.date) || !live(m.id)) continue;
    const who = crowds(m.crowds);
    out.push({
      uid: uidOf("moment", m.id),
      date: m.date,
      title: m.kind === "own" ? m.name : `${m.name} (a moment for ${promo?.brand.name || "the brand"})`,
      lines: [who.length ? `For ${list(who)}` : "", m.why, m.url ? `Date from ${m.site}: ${m.url}` : `Date from ${m.site}`].filter(Boolean),
      ...(m.url ? { url: m.url } : {}),
      row: rowOf(m.id),
    });
  }

  // A pitch's follow-up falls due the day its wait runs out, counted from when the founder marked it Pitched.
  for (const it of plan.items) {
    const st = state(it.id);
    if (st.mark !== "pitched" || st.at == null || it.left) continue;
    const wait = waitOf(it, team.exec).days;
    out.push({
      uid: uidOf("follow", it.id),
      date: dayOf(st.at + wait * DAY),
      title: `Follow up: ${it.name}`,
      lines: [`Pitched ${nice(dayOf(st.at))}; no reply after ${wait} day${wait === 1 ? "" : "s"} is the time to follow up. Athena has the follow-up drafted.`],
      row: it.id,
    });
  }

  if (isDay(promo?.launch.date)) {
    out.push({ uid: uidOf("launch", promo!.launch.date!), date: promo!.launch.date!, title: `${promo!.brand.name || "Your"} launch`, lines: [`From your answer: "${promo!.launch.text ?? promo!.launch.date}"`], alarm: 14 });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

// ---- iCalendar (RFC 5545)

/** TEXT values escape backslash, semicolon, comma and line breaks. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Content lines are folded at 75 octets; each continuation starts with one space. */
function fold(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateVal = (d: string) => d.replace(/-/g, "");
const nextDay = (d: string) => dateVal(dayOf(Date.parse(`${d}T12:00:00Z`) + DAY));

/**
 * The .ics text. `base`: the app's origin, for each entry's link back to its row; left out where no row can open (the
 * public demo feed, whose rows live in no one's browser).
 */
export function icsOf(entries: CalEntry[], o: { name: string; base?: string; now?: number; replaced?: boolean }): string {
  const now = o.now ?? Date.now();
  // A replaced link still answers, with no entries and a name that says where the current one is.
  const calName = o.replaced ? "Athena: this link was replaced" : `${o.name} · Athena`;
  const calDesc = o.replaced ? "Open Athena, then Share your plan › Calendar, for the current link." : `The dated steps of Athena's plan for ${o.name}: events, deadlines, follow-ups and launches.`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Athena//Growth plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calName)}`,
    `X-WR-CALDESC:${esc(calDesc)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const e of entries) {
    const back = o.base && e.row ? `Open in Athena: ${o.base}/plan?tab=executive&item=${encodeURIComponent(e.row)}` : "";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${dateVal(e.date)}`,
      `DTEND;VALUE=DATE:${nextDay(e.date)}`,
      `SUMMARY:${esc(e.title)}`,
      `DESCRIPTION:${esc([...e.lines, back].filter(Boolean).join("\n"))}`,
      ...(e.url ? [`URL:${e.url}`] : []),
      "TRANSP:TRANSPARENT",
      ...(e.alarm ? ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-P${e.alarm}D`, "END:VALARM"] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** The workspace's calendar as .ics text. */
export function calendarFile(saved: { brief?: BrandBrief; journey?: Journey }, o: { base?: string; now?: number } = {}): string {
  const now = o.now ?? Date.now();
  const name = saved.brief?.name?.value ?? saved.journey?.team?.works.promoter?.shared?.promo?.brand.name ?? "Your brand";
  return icsOf(calendarEntries(saved), { name, base: o.base, now });
}
