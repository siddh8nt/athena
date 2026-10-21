import type { QlooClient } from "@/lib/qloo/client";
import { results } from "@/lib/qloo/client";
import type { QlooEntity } from "@/lib/qloo/types";
import { locationParams } from "@/lib/places/location";
import { metroById } from "@/lib/playbook/metros";
import type { DateLookup, ShowLookup } from "@/lib/blocks/moments";
import type { CrowdCard } from "@/lib/journey/types";
import type { Outcome } from "@/lib/team/types";
import { TIER_ORDER, type Block, type CalItem, type CrowdPage, type CrowdTier, type Detail, type PageTab, type Row, type Section } from "@/lib/team/page";
import { now, timeContext, today } from "@/lib/time/now";
import { parseLooseDate } from "@/lib/enrich/festival-dates";
import { itemId, latest } from "./outcomes";
import { roles, ROLE_LABEL, type CityRead, type Role } from "./navigator";
import { FITS, founderLine, nearestHood, type Budget, type Shop } from "./rep";

// The Promoter (PRD §23.5 h): events, moments and online audiences for all three crowds; creators are the
// Matchmaker's. Every date links to the page that states it, a fee is the published one or "not published, ask", and
// an event too close to prepare for moves to its next date. Drafts are copied or opened in the mail app, never sent.

/** Fewer days than this to an event (or a passed application deadline), and it moves to its next date. */
export const LEAD_DAYS = 30;
const ARTISTS = 5;
const FESTIVALS = 4;
const DAY = 24 * 60 * 60 * 1000;

export type PromoFormat = "booth" | "popup" | "sampling" | "sponsorship" | "nearby";
export const FORMAT_LABEL: Record<PromoFormat, string> = {
  booth: "Booth",
  popup: "Pop-up",
  sampling: "Sampling",
  sponsorship: "Sponsorship",
  nearby: "Nearby presence",
};

export type Fee = { text: string; url: string; site: string };

/** An event a grounded search read from its own page. */
export type WebEvent = {
  name: string;
  kind: "market" | "festival" | "race" | "fair" | "expo";
  date: string;
  url: string;
  site: string;
  venue?: string;
  neighbourhood?: string;
  fee?: Fee;
  applyUrl?: string;
  applyBy?: string;
  email?: { value: string; src: string };
  formats: PromoFormat[];
  why?: string;
  /** The following edition, when its page is published. */
  next?: { date: string; url: string };
};

export type WebMoment = {
  name: string;
  date: string;
  url: string;
  site: string;
  why: string;
};

export type Audience = {
  id: string;
  kind: "subreddit" | "community" | "newsletter" | "hashtag";
  name: string;
  url?: string;
  size?: { text: string; src: string; url: string };
  how: string;
  cost?: { text: string; src: string; url: string };
  why: string;
  crowds: string[];
};

export type PromoCrowd = {
  id: string;
  name: string;
  tier: CrowdTier;
  nearMiss?: boolean;
  signal: string[];
  loves: string[];
  metros: string[];
};
export type PromoCity = { metroId: string; name: string; yours: boolean };

export type PromoEvent = {
  id: string;
  name: string;
  kind: "show" | "festival" | WebEvent["kind"];
  date: string;
  url: string;
  site: string;
  metroId: string;
  city: string;
  venue?: string;
  /** The Navigator's neighbourhood it's in, with its role. */
  hood?: { name: string; role: Role };
  crowds: string[];
  why: string;
  formats: PromoFormat[];
  fee?: Fee;
  applyUrl?: string;
  applyBy?: string;
  email?: { value: string; src: string };
  /** The Qloo artist or festival behind it. */
  act?: string;
  qlooId?: string;
  /** Its lead time had passed: the date it moved from, and why. */
  moved?: { from: string; reason: string };
};

export type PromoMoment = {
  id: string;
  name: string;
  date: string;
  kind: "cultural" | "retail" | "own";
  url?: string;
  site: string;
  why: string;
  crowds: string[];
};
export type Host = {
  name: string;
  city: string;
  hood?: string;
  crowds: string[];
};

/** The founder's next launch: an exact date, or a window in days from today, from their answer. */
export type Launch = {
  date?: string;
  window?: [number, number];
  text?: string;
};

export type PromoRead = {
  crowds: PromoCrowd[];
  cities: PromoCity[];
  events: PromoEvent[];
  moments: PromoMoment[];
  audiences: Audience[];
  hosts: Host[];
  budget: Budget;
  brand: { name: string; product: string };
  launch: Launch;
  /** Events whose lead time had passed, and where each went. */
  moved: string[];
  calls: number;
  callIds: string[];
  limits: string[];
  at: string;
};

export type PromoDeps = {
  brand: { name: string; product: string };
  budget: Budget;
  launch: Launch;
  /** The cities to work: the Navigator's, with its neighbourhoods when it has read them. */
  cities: (PromoCity & { read?: CityRead })[];
  /** The Rep's shops that host events. */
  hosts: Shop[];
  status?: (s: string) => void;
  shows?: ShowLookup;
  festivalDate?: DateLookup;
  findEvents?: (crowd: { name: string; loves: string[] }, city: string, brand: { name: string; product: string }) => Promise<WebEvent[]>;
  culturalMoments?: (crowd: { name: string; loves: string[] }, brand: { name: string; product: string }) => Promise<WebMoment[]>;
  onlineAudiences?: (crowd: { name: string; loves: string[] }, brand: { name: string; product: string }) => Promise<Omit<Audience, "id" | "crowds">[]>;
  /** When the read must be back (epoch ms): a lookup still running then is left out, and the page says so. */
  until?: number;
};

/** The crowds as the Promoter reads them: the Scout's tiers, each with the cities the Navigator gave it. */
export function promoCrowds(crowds: { crowd: CrowdCard; tier: CrowdTier }[], metros: Map<string, string[]>, fallback: string[]): PromoCrowd[] {
  return crowds.map(({ crowd, tier }) => ({
    id: crowd.id,
    name: crowd.name,
    tier,
    ...(crowd.nearMiss ? { nearMiss: true } : {}),
    signal: crowd.signal.map((x) => x.id).slice(0, 25),
    loves: crowd.loves.slice(0, 8).map((l) => l.name),
    metros: metros.get(crowd.id)?.length ? metros.get(crowd.id)! : fallback,
  }));
}

/** The founder's launch answer: an exact date when they wrote one, else the window they picked. */
export function launchOf(answers: { question: string; answer: string }[] = []): Launch {
  const a = answers.find((x) => /next launch or push/i.test(x.question))?.answer ?? "";
  const date = a ? parseLooseDate(a, today()) : undefined;
  if (date) return { date, text: a };
  if (/within a month/i.test(a)) return { window: [0, 30], text: a };
  if (/1 to 3 months/i.test(a)) return { window: [30, 90], text: a };
  return {};
}

/** p, or undefined once `until` passes. */
function by<T>(p: Promise<T>, until?: number): Promise<T | undefined> {
  if (!until) return p;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((r) => (timer = setTimeout(() => r(undefined), Math.max(0, until - Date.now()))));
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

const daysTo = (date: string, from: string) => Math.round((new Date(`${date}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / DAY);
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** The Navigator's neighbourhood an event is in: the nearest one to its point, else the one its page names. */
function hoodFor(city: CityRead | undefined, lat?: number, lon?: number, named?: string): PromoEvent["hood"] {
  if (!city?.hoods.length) return undefined;
  const role = roles(city);
  if (lat !== undefined && lon !== undefined) return nearestHood(city, role, lat, lon, named);
  const n = named ? norm(named) : "";
  const h = n ? city.hoods.find((x) => n.includes(norm(x.name)) || norm(x.name).includes(n)) : undefined;
  return h ? { name: h.name, role: role.get(h.name) ?? "online" } : undefined;
}

/** Reads the events, moments and online audiences for every crowd in the cities it was given. Never throws. */
export async function readPromo(qloo: QlooClient, crowds: PromoCrowd[], deps: PromoDeps): Promise<PromoRead> {
  const callIds: string[] = [];
  let calls = 0;
  const limits: string[] = [];
  const moved: string[] = [];
  const day = today();
  const insights = async (params: Record<string, unknown>) => {
    calls++;
    try {
      const res = await qloo.insights(params as never);
      callIds.push(res.call.id);
      return results(res).entities ?? [];
    } catch {
      return [] as QlooEntity[];
    }
  };
  const cityOf = new Map(deps.cities.map((c) => [c.metroId, c]));
  const nameOf = (m: string) => cityOf.get(m)?.name ?? metroById(m).name;
  const brand = deps.brand;
  // Every lookup races the deadline; one still running then stands in empty, and the page names what's still to come.
  const late = new Set<string>();
  const timed = async <T>(p: Promise<T>, empty: T, what: string): Promise<T> => {
    const r = await by(
      p.catch(() => empty),
      deps.until,
    );
    if (r !== undefined) return r;
    late.add(what);
    return empty;
  };

  const byKey = new Map<string, PromoEvent>();
  const add = (e: Omit<PromoEvent, "id" | "crowds">, crowd: string) => {
    const key = `${norm(e.name)}|${e.metroId}`;
    const prev = byKey.get(key);
    if (prev) {
      if (!prev.crowds.includes(crowd)) prev.crowds.push(crowd);
      return;
    }
    byKey.set(key, {
      ...e,
      id: itemId("event", `${e.name} ${e.city}`),
      crowds: [crowd],
    });
  };

  // The four reads run side by side: Qloo's shows and festivals, the web's events, cultural moments, online places.
  deps.status?.("Reading each crowd's shows, festivals, markets, moments and online places at once");
  const [, , cultural, online] = await Promise.all([qlooEvents(), webEvents(), culturalRead(), onlineRead()]);

  // ---- Qloo: the artists each crowd over-indexes on, and the festivals it loves in each of its cities.
  async function qlooEvents() {
    const artists = await Promise.all(
      crowds.map((c) =>
        c.signal.length
          ? insights({
              "filter.type": "urn:entity:artist",
              "signal.interests.entities": c.signal,
              take: 10,
            })
          : Promise.resolve([] as QlooEntity[]),
      ),
    );
    const fests = await Promise.all(
      crowds.flatMap((c) =>
        c.metros.map(async (m) => {
          if (!c.signal.length) return { c, m, list: [] as QlooEntity[] };
          const where = await locationParams(metroById(m)).catch(() => ({
            "filter.location.query": metroById(m).query,
          }));
          return {
            c,
            m,
            list: await insights({
              "filter.type": "urn:entity:place",
              "signal.interests.entities": c.signal,
              "filter.tags": "urn:tag:genre:place:festival",
              ...where,
              take: 8,
            }),
          };
        }),
      ),
    );

    // ---- Shows: the crowd's artists on Ticketmaster in its cities. Too close, and the same act's later date stands in.
    if (!deps.shows) limits.push("Shows: Ticketmaster isn't connected, so artists' dates weren't read");
    await Promise.all(
      crowds.flatMap((c, k) =>
        artists[k].slice(0, ARTISTS).flatMap((a) =>
          c.metros.map(async (m) => {
            const shows = deps.shows ? await timed(deps.shows(a.name, metroById(m)), [], "Some shows") : [];
            const dated = shows.filter((s) => s.date >= day).sort((x, y) => x.date.localeCompare(y.date));
            const soon = dated.find((s) => daysTo(s.date, day) < LEAD_DAYS);
            const ok = dated.find((s) => daysTo(s.date, day) >= LEAD_DAYS);
            if (soon && !ok) moved.push(`${a.name} in ${nameOf(m)} on ${dayOf(soon.date)}: too close to prepare for, and no later date is listed yet`);
            if (!ok) return;
            add(
              {
                name: ok.name,
                kind: "show",
                date: ok.date,
                url: ok.url,
                site: "Ticketmaster",
                metroId: m,
                city: nameOf(m),
                ...(ok.venue ? { venue: ok.venue } : {}),
                hood: hoodFor(cityOf.get(m)?.read, undefined, undefined, ok.venue),
                why: `${a.name}, an artist ${c.name} over-indexes on`,
                formats: ["nearby", "sampling"],
                act: a.name,
                qlooId: a.entity_id,
                ...(soon
                  ? {
                      moved: {
                        from: soon.date,
                        reason: "Under 30 days away: moved to the act's next date",
                      },
                    }
                  : {}),
              },
              c.id,
            );
          }),
        ),
      ),
    );

    // ---- Festivals Qloo places in each crowd's cities, dated from the page that states the date.
    if (!deps.festivalDate) limits.push("Festival dates: the web search isn't connected, so Qloo's festivals weren't dated");
    await Promise.all(
      fests.flatMap(({ c, m, list }) =>
        list.slice(0, FESTIVALS).map(async (e) => {
          const f = deps.festivalDate ? await timed(deps.festivalDate(e.name, metroById(m)), undefined, "Some festival dates") : undefined;
          if (!f?.date || !f.url) return;
          if (daysTo(f.date, day) < LEAD_DAYS) return void moved.push(`${e.name} on ${dayOf(f.date)}: too close to prepare for; its next date isn't published yet`);
          add(
            {
              name: e.name,
              kind: "festival",
              date: f.date,
              url: f.url,
              site: f.site ?? "web search",
              metroId: m,
              city: nameOf(m),
              hood: hoodFor(cityOf.get(m)?.read, e.location?.lat, e.location?.lon, e.properties?.neighborhood),
              why: `A festival ${c.name} over-indexes on, from Qloo`,
              formats: ["booth", "sampling"],
              act: e.name,
              qlooId: e.entity_id,
            },
            c.id,
          );
        }),
      ),
    );
  }

  // ---- Markets, festivals, races, fairs and expos a grounded search reads from their own pages.
  async function webEvents() {
    if (deps.findEvents) {
      await Promise.all(
        crowds.flatMap((c) =>
          c.metros.map(async (m) => {
            const found = await timed(deps.findEvents!({ name: c.name, loves: c.loves }, nameOf(m), brand), [] as WebEvent[], `Markets and fairs in ${nameOf(m)}`);
            for (const w of found) {
              let date = w.date;
              let url = w.url;
              let move: PromoEvent["moved"];
              const late = daysTo(w.date, day) < LEAD_DAYS || (!!w.applyBy && w.applyBy < day);
              if (late) {
                if (!w.next) {
                  moved.push(`${w.name} on ${dayOf(w.date)}: ${w.applyBy && w.applyBy < day ? "applications closed" : "too close to prepare for"}; its next date isn't published yet`);
                  continue;
                }
                move = {
                  from: w.date,
                  reason: w.applyBy && w.applyBy < day ? "Applications had closed: moved to its next edition" : "Under 30 days away: moved to its next edition",
                };
                moved.push(`${w.name}: moved from ${dayOf(w.date)} to ${dayOf(w.next.date)}`);
                date = w.next.date;
                url = w.next.url;
              }
              add(
                {
                  name: w.name,
                  kind: w.kind,
                  date,
                  url,
                  site: w.site,
                  metroId: m,
                  city: nameOf(m),
                  ...(w.venue ? { venue: w.venue } : {}),
                  hood: hoodFor(cityOf.get(m)?.read, undefined, undefined, w.neighbourhood ?? w.venue),
                  why: w.why ?? `A ${w.kind} ${c.name} goes to`,
                  formats: w.formats,
                  ...(w.fee ? { fee: w.fee } : {}),
                  ...(w.applyUrl ? { applyUrl: w.applyUrl } : {}),
                  ...(w.applyBy && !move ? { applyBy: w.applyBy } : {}),
                  ...(w.email ? { email: w.email } : {}),
                  ...(move ? { moved: move } : {}),
                },
                c.id,
              );
            }
          }),
        ),
      );
    } else limits.push("Markets, fairs and expos: the web search isn't connected");
  }

  async function culturalRead() {
    return deps.culturalMoments ? Promise.all(crowds.map((c) => timed(deps.culturalMoments!({ name: c.name, loves: c.loves }, brand), [] as WebMoment[], "Cultural moments"))) : undefined;
  }

  async function onlineRead() {
    return deps.onlineAudiences
      ? Promise.all(crowds.map((c) => timed(deps.onlineAudiences!({ name: c.name, loves: c.loves }, brand), [] as Omit<Audience, "id" | "crowds">[], "Online places")))
      : undefined;
  }

  // ---- Moments: the computed US retail calendar, each crowd's cultural moments, and the founder's own launch.
  const moments: PromoMoment[] = [];
  const all = crowds.map((c) => c.id);
  for (const m of timeContext(now(), 20).moments.filter((x) => x.days >= 0 && x.days <= 365)) {
    moments.push({
      id: itemId("moment", `${m.name} ${m.date.slice(0, 4)}`),
      name: m.name,
      date: m.date,
      kind: "retail",
      url: `https://www.timeanddate.com/holidays/us/${m.date.slice(0, 4)}`,
      site: "timeanddate.com",
      why: "A US retail moment",
      crowds: all,
    });
  }
  if (cultural) {
    cultural.forEach((list, k) => {
      for (const w of list) {
        const prev = moments.find((x) => x.kind === "cultural" && norm(x.name) === norm(w.name));
        if (prev) {
          if (!prev.crowds.includes(crowds[k].id)) prev.crowds.push(crowds[k].id);
          continue;
        }
        moments.push({
          id: itemId("moment", w.name),
          name: w.name,
          date: w.date,
          kind: "cultural",
          url: w.url,
          site: w.site,
          why: w.why || `A moment ${crowds[k].name} marks`,
          crowds: [crowds[k].id],
        });
      }
    });
  }
  if (deps.launch.date)
    moments.push({
      id: itemId("moment", "your launch"),
      name: "Your launch",
      date: deps.launch.date,
      kind: "own",
      site: "Your answer",
      why: "The launch date you gave",
      crowds: all,
    });
  moments.sort((a, b) => a.date.localeCompare(b.date));

  // ---- Online audiences: subreddits, communities, newsletters and hashtags, merged across crowds.
  const audiences: Audience[] = [];
  if (online) {
    online.forEach((list, k) => {
      for (const a of list) {
        const prev = audiences.find((x) => x.kind === a.kind && norm(x.name) === norm(a.name));
        if (prev) {
          if (!prev.crowds.includes(crowds[k].id)) prev.crowds.push(crowds[k].id);
          continue;
        }
        audiences.push({
          ...a,
          id: itemId("audience", a.name),
          crowds: [crowds[k].id],
        });
      }
    });
  } else limits.push("Online audiences: the web search isn't connected");

  // ---- Hosts: the Rep's shops that run events, for each crowd they fit.
  const hosts: Host[] = deps.hosts.map((s) => ({
    name: s.name,
    city: s.city,
    ...(s.hood ? { hood: s.hood } : {}),
    crowds: Object.entries(s.crowds)
      .filter(([, v]) => v >= FITS)
      .map(([k]) => k),
  }));

  for (const what of late) limits.push(`${what}: still being read when this page was written; ask for fresh events to add them`);

  const events = [...byKey.values()].sort((a, b) => b.crowds.length - a.crowds.length || a.date.localeCompare(b.date));
  return {
    crowds,
    cities: deps.cities.map(({ metroId, name, yours }) => ({
      metroId,
      name,
      yours,
    })),
    events,
    moments,
    audiences,
    hosts,
    budget: deps.budget,
    brand,
    launch: deps.launch,
    moved,
    calls,
    callIds,
    limits,
    at: day,
  };
}

// ---- The page ------------------------------------------------------------------------------------------------------

export type Inquiry = { subject: string; body: string };
type PageOpts = {
  outcomes: Outcome[];
  inquiries?: Record<string, Inquiry>;
  at?: number;
};

/** "2026-12-15" as the founder reads it, "Dec 15, 2026". */
export const dayOf = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
const and = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const CAP: Record<Budget, number> = { low: 1000, mid: 10_000, high: Infinity };

/** The fee as published, else "not published, ask". */
export const feeLine = (e: PromoEvent) => (e.fee ? `${e.fee.text} (${e.fee.site})` : "Fee not published, ask");

/** The published fee against the founder's three-month budget: a quarter of it fits, up to all of it is a stretch. */
export function costFit(e: PromoEvent, budget: Budget): string {
  const n = e.fee ? Number(/\$\s?([\d,]+(?:\.\d+)?)/.exec(e.fee.text)?.[1]?.replace(/,/g, "")) : NaN;
  if (!Number.isFinite(n)) return e.fee ? "See the fee" : "Ask";
  return n <= CAP[budget] / 4 ? "Fits your budget" : n <= CAP[budget] ? "A stretch" : "Beyond budget";
}

/** How the launch lines up: a pairing only with an exact launch date, else "within your launch window". */
export function pairing(launch: Launch, date: string, from: string): string | undefined {
  if (launch.date) {
    const d = daysTo(date, launch.date);
    return Math.abs(d) <= 14 ? (d === 0 ? "On your launch day" : `Pairs with your launch: ${Math.abs(d)} days ${d > 0 ? "after" : "before"} it`) : undefined;
  }
  if (launch.window) {
    const d = daysTo(date, from);
    return d >= launch.window[0] && d <= launch.window[1] ? "Within your launch window" : undefined;
  }
  return undefined;
}

const formatsOf = (e: PromoEvent) => e.formats.map((f) => FORMAT_LABEL[f]).join(", ");
const crowdNames = (read: PromoRead, ids: string[]) => ids.map((id) => read.crowds.find((c) => c.id === id)?.name ?? id);

/** The checklist for one event, each step tied to its published deadline or the event's own date. */
export function checklist(e: PromoEvent): string[] {
  const by = `before ${dayOf(e.date)}`;
  return [
    e.applyBy
      ? `Apply by ${dayOf(e.applyBy)}, the published deadline`
      : e.kind === "show"
        ? `Ask ${e.venue ?? "a shop next to the venue"} about sampling, ${by}`
        : "Apply: the deadline isn't published, so ask when you write",
    `Book your ${e.formats.includes("sponsorship") && !e.formats.includes("booth") ? "sponsorship" : e.formats.includes("booth") ? "booth" : "spot"} once accepted, ${by}`,
    `Ship stock to ${e.city} ${by}`,
    `Tell your partners from the Matchmaker you'll be there, ${by}`,
    `Post that you're going, ${by}`,
  ];
}

/** The application or pitch, from the founder: copied or opened in the mail app, never sent. */
export function inquiryFor(read: PromoRead, e: PromoEvent, written?: Inquiry): NonNullable<Detail["draft"]> {
  const ask =
    e.kind === "show"
      ? `run a sampling table near ${e.venue ?? "the venue"} on ${dayOf(e.date)}`
      : `take a ${e.formats.includes("booth") ? "booth" : e.formats.includes("popup") ? "pop-up" : e.formats.includes("sampling") ? "sampling table" : "sponsorship"} at ${e.name} on ${dayOf(e.date)}`;
  const fee = e.fee ? `I saw the ${e.fee.text} fee; what's the application process?` : "Could you share the vendor fee and how to apply?";
  const body =
    written?.body ??
    `Hi ${e.kind === "show" ? `${e.venue ?? e.name} team` : `${e.name} team`},\n\n${founderLine(read.brand.name, read.brand.product)} The people who come to ${e.name} are the people who love what we make, and we'd love to ${ask}. ${fee}\n\nThanks,\n${read.brand.name}`;
  return {
    subject: written?.subject ?? (e.kind === "show" ? `Sampling near ${e.venue ?? e.name}` : `Vendor inquiry: ${read.brand.name} at ${e.name}`),
    body,
    ...(e.email ? { to: e.email.value, toSrc: e.email.src } : {}),
    names: [e.name, read.brand.name, ...(e.venue ? [e.venue] : [])],
  };
}

function eventDetail(read: PromoRead, e: PromoEvent, opts: PageOpts): Detail {
  const lead = daysTo(e.date, read.at);
  const pair = pairing(read.launch, e.date, read.at);
  return {
    title: e.name,
    item: e.id,
    kind: "event",
    group: e.kind,
    facts: [
      { label: "When", value: `${dayOf(e.date)} (${e.site})` },
      { label: "Where", value: [e.venue, e.city].filter(Boolean).join(", ") },
      ...(e.hood
        ? [
            {
              label: "Neighbourhood",
              value: `${e.hood.name}, ${ROLE_LABEL[e.hood.role].toLowerCase()} on the Navigator's map`,
            },
          ]
        : []),
      { label: "For", value: and(crowdNames(read, e.crowds)) },
      { label: "Format", value: formatsOf(e) },
      { label: "Cost", value: feeLine(e) },
      { label: "Cost fit", value: costFit(e, read.budget) },
      { label: "Lead time", value: `${lead} days to prepare` },
      ...(e.moved
        ? [
            {
              label: "Moved",
              value: `From ${dayOf(e.moved.from)}. ${e.moved.reason}`,
            },
          ]
        : []),
      ...(e.email ? [{ label: "Contact", value: `${e.email.value} (${e.email.src})` }] : []),
    ],
    lines: [e.why, ...(pair ? [pair] : []), ...checklist(e)],
    draft: inquiryFor(read, e, opts.inquiries?.[e.id]),
    links: [
      { label: `Date: ${e.site}`, url: e.url },
      ...(e.fee && e.fee.url !== e.url ? [{ label: `Fee: ${e.fee.site}`, url: e.fee.url }] : []),
      ...(e.applyUrl ? [{ label: "Apply", url: e.applyUrl }] : []),
    ],
    ics: {
      name: e.name,
      date: e.date,
      url: e.url,
      location: [e.venue, e.city].filter(Boolean).join(", "),
    },
  };
}

function momentDetail(read: PromoRead, m: PromoMoment): Detail {
  const pair = pairing(read.launch, m.date, read.at);
  return {
    title: m.name,
    item: m.id,
    kind: "moment",
    group: m.kind,
    facts: [
      { label: "When", value: `${dayOf(m.date)} (${m.site})` },
      {
        label: "For",
        value: m.crowds.length === read.crowds.length ? "All three crowds" : and(crowdNames(read, m.crowds)),
      },
      { label: "Days away", value: String(daysTo(m.date, read.at)) },
    ],
    lines: [m.why, ...(pair ? [pair] : [])],
    links: m.url ? [{ label: `Date: ${m.site}`, url: m.url }] : [],
    ics: { name: m.name, date: m.date, ...(m.url ? { url: m.url } : {}) },
  };
}

function audienceDetail(read: PromoRead, a: Audience): Detail {
  return {
    title: a.name,
    item: a.id,
    kind: "audience",
    group: a.kind,
    facts: [
      { label: "Kind", value: AUDIENCE_LABEL[a.kind] },
      {
        label: "Size",
        value: a.size ? `${a.size.text} (${a.size.src})` : "Not published",
      },
      { label: "How to show up", value: a.how },
      {
        label: "Cost",
        value: a.cost ? `${a.cost.text} (${a.cost.src})` : a.kind === "newsletter" ? "Rate not published, ask" : "Free to post within its rules",
      },
      { label: "For", value: and(crowdNames(read, a.crowds)) },
    ],
    lines: a.why ? [a.why] : [],
    links: [
      ...(a.url ? [{ label: "Open", url: a.url }] : []),
      ...(a.size ? [{ label: `Size: ${a.size.src}`, url: a.size.url }] : []),
      ...(a.cost ? [{ label: `Cost: ${a.cost.src}`, url: a.cost.url }] : []),
    ],
  };
}

const AUDIENCE_LABEL: Record<Audience["kind"], string> = {
  subreddit: "Subreddit",
  community: "Community",
  newsletter: "Newsletter",
  hashtag: "Hashtag",
};
const EVENT_COLUMNS = ["Event", "Date", "City", "Format", "Cost", "Apply by"];
const AUDIENCE_COLUMNS = ["Where", "Kind", "Size", "How to show up", "Cost"];
const FACETS = ["City", "Format", "Cost fit"];

const eventRow = (read: PromoRead, e: PromoEvent, opts: PageOpts): Row => ({
  cells: [e.name, dayOf(e.date), e.hood ? `${e.city}, ${e.hood.name}` : e.city, formatsOf(e), e.fee ? e.fee.text : "Not published, ask", e.applyBy ? dayOf(e.applyBy) : "Ask"],
  detail: eventDetail(read, e, opts),
  facets: {
    City: [e.city],
    Format: e.formats.map((f) => FORMAT_LABEL[f]),
    "Cost fit": [costFit(e, read.budget)],
    Crowd: crowdNames(read, e.crowds),
  },
});

const audienceRow = (read: PromoRead, a: Audience): Row => ({
  cells: [a.name, AUDIENCE_LABEL[a.kind], a.size?.text ?? "Not published", a.how, a.cost?.text ?? (a.kind === "newsletter" ? "Ask" : "Free")],
  detail: audienceDetail(read, a),
  facets: { Kind: [AUDIENCE_LABEL[a.kind]], Crowd: crowdNames(read, a.crowds) },
});

/** Everything dated, for the calendar: events in their cities (●), the founder's own moments (◆), the rest online (○). */
function calendarItems(read: PromoRead, opts: PageOpts, crowd?: string): CalItem[] {
  const mine = (ids: string[]) => !crowd || ids.includes(crowd);
  return [
    ...read.events
      .filter((e) => mine(e.crowds))
      .map((e): CalItem => ({
        item: e.id,
        name: e.name,
        date: e.date,
        mark: "event",
        city: e.city,
        crowds: crowdNames(read, e.crowds),
        note: `${formatsOf(e)} · ${e.fee ? e.fee.text : "fee not published"}`,
        kind: "event",
        group: e.kind,
        detail: eventDetail(read, e, opts),
      })),
    ...read.moments
      .filter((m) => mine(m.crowds))
      .map((m): CalItem => ({
        item: m.id,
        name: m.name,
        date: m.date,
        mark: m.kind === "own" ? "own" : "moment",
        city: m.kind === "own" ? "All" : "US-wide",
        crowds: crowdNames(read, m.crowds),
        note: pairing(read.launch, m.date, read.at) ?? m.why,
        kind: "moment",
        group: m.kind,
        detail: momentDetail(read, m),
      })),
    ...read.audiences
      .filter((a) => mine(a.crowds))
      .map((a): CalItem => ({
        item: a.id,
        name: a.name,
        mark: "online",
        city: "Online",
        crowds: crowdNames(read, a.crowds),
        note: a.how,
        kind: "audience",
        group: a.kind,
        detail: audienceDetail(read, a),
      })),
  ];
}

const calendar = (read: PromoRead, opts: PageOpts, crowd?: string, label?: string): Block => {
  const items = calendarItems(read, opts, crowd);
  const cities = [...new Set(items.filter((i) => i.mark === "event").map((i) => i.city))];
  return {
    type: "calendar",
    ...(label ? { label } : {}),
    items,
    cities,
    today: read.at,
  };
};

function crowdTab(read: PromoRead, c: PromoCrowd, opts: PageOpts): PageTab {
  const events = read.events.filter((e) => e.crowds.includes(c.id)).sort((a, b) => a.date.localeCompare(b.date));
  const audiences = read.audiences.filter((a) => a.crowds.includes(c.id));
  const hosts = read.hosts.filter((h) => h.crowds.includes(c.id));
  const top = topEvent(read, c.id);
  const cities = c.metros.map((m) => read.cities.find((x) => x.metroId === m)?.name ?? metroById(m).name);
  const sections: Section[] = [
    {
      id: "profile",
      title: "Where they turn up",
      summary: `${plural(events.length, "dated event")} in ${and(cities) || "their cities"}`,
      blocks: [
        {
          type: "facts",
          rows: [
            {
              label: "Cities",
              value: and(cities) || "—",
              src: "From the Navigator",
            },
            {
              label: "What they love",
              value: c.loves.slice(0, 6).join(", ") || "—",
            },
            {
              label: "Lead time",
              value: `Events under ${LEAD_DAYS} days away move to their next date`,
            },
          ],
        },
      ],
    },
    {
      id: "calendar",
      title: "Calendar",
      summary: "Events, your moments and online, by date",
      blocks: [calendar(read, opts, c.id)],
    },
    {
      id: "events",
      title: "Events",
      summary: events.length ? `${plural(events.length, "event")}, ${events.filter((e) => e.fee).length} with a published fee` : "No dated event with time to prepare yet",
      blocks: events.length
        ? [
            {
              type: "table",
              columns: EVENT_COLUMNS,
              rows: events.map((e) => eventRow(read, e, opts)),
              facets: FACETS,
            },
          ]
        : [
            {
              type: "note",
              text: `No event in ${and(cities) || "these cities"} has a published date with ${LEAD_DAYS} days to prepare yet; the online audiences and moments below still work now`,
            },
          ],
    },
    ...(top
      ? [
          {
            id: "plan",
            title: `Plan for ${top.name}`,
            summary: `${dayOf(top.date)} in ${top.city}`,
            blocks: [
              {
                type: "checks" as const,
                checks: checklist(top).map((text) => ({
                  text,
                  item: itemId("step", `${top.name}: ${text.split(/[,:]/)[0]}`),
                  group: "event step",
                })),
              },
            ],
          },
        ]
      : []),
    {
      id: "online",
      title: "Online",
      summary: audiences.length ? plural(audiences.length, "place") : "Online places come from a web search",
      blocks: audiences.length
        ? [
            {
              type: "table",
              columns: AUDIENCE_COLUMNS,
              rows: audiences.map((a) => audienceRow(read, a)),
            },
          ]
        : [
            {
              type: "note",
              text: "No subreddit, community or newsletter came back for this crowd this time",
            },
          ],
    },
    ...(hosts.length
      ? [
          {
            id: "hosts",
            title: "Shops that host events",
            summary: "From the Rep: ask about an in-store tasting or pop-up",
            blocks: [
              {
                type: "names" as const,
                groups: [
                  {
                    label: "Hosts",
                    names: hosts.map((h) => ({
                      name: h.name,
                      kind: "venue",
                      note: [h.hood, h.city].filter(Boolean).join(", "),
                      item: itemId("venue", h.name),
                    })),
                  },
                ],
              },
            ],
          },
        ]
      : []),
  ];
  return {
    crowd: {
      id: c.id,
      name: c.name,
      tier: c.tier,
      ...(c.nearMiss ? { nearMiss: true } : {}),
    },
    sections,
    sources: [{ id: "qloo-insights", label: "Qloo insights" }],
    method: `Read from ${read.calls} Qloo signals · ${plural(events.length, "event")} · ${plural(audiences.length, "online place")}`,
  };
}

/** A suggested split of whatever the founder spends on events: an editable start, never a schedule. */
export function promoBudget(budget: Budget): Extract<Block, { type: "budget" }> {
  const rows =
    budget === "high"
      ? [
          { label: "A festival booth or sponsorship", share: 40 },
          { label: "Market and fair booths", share: 25 },
          { label: "Sponsored newsletter issues", share: 20 },
          { label: "Travel and stock", share: 15 },
        ]
      : budget === "mid"
        ? [
            { label: "Two or three market booths", share: 45 },
            { label: "Sampling at a festival or near a show", share: 25 },
            { label: "One sponsored newsletter issue", share: 20 },
            { label: "Travel and stock", share: 10 },
          ]
        : [
            {
              label: "One market or fair booth: the fee and samples",
              share: 50,
            },
            { label: "Sampling near a show or at a host shop", share: 30 },
            {
              label: "Online: posts and a giveaway in one community",
              share: 20,
              note: "Posting within a community's rules is free",
            },
          ];
  return {
    type: "budget",
    label: "Budget plan",
    rows,
    note: "A suggestion to edit: shares of whatever you spend on events, never a schedule",
  };
}

/** Months ahead with how many dated things fall in each, for the year strip. */
function months(read: PromoRead): Extract<Block, { type: "months" }> {
  const start = new Date(`${read.at.slice(0, 7)}-01T12:00:00Z`);
  const dated = [...read.events.map((e) => ({ name: e.name, date: e.date })), ...read.moments.map((m) => ({ name: m.name, date: m.date }))];
  return {
    type: "months",
    months: Array.from({ length: 12 }, (_, k) => {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + k, 1, 12));
      const key = d.toISOString().slice(0, 7);
      const here = dated.filter((x) => x.date.startsWith(key));
      return {
        month: key,
        label: d.toLocaleDateString("en-US", {
          month: "short",
          timeZone: "UTC",
        }),
        n: here.length,
        names: here.slice(0, 6).map((x) => x.name),
      };
    }),
  };
}

function across(read: PromoRead, opts: PageOpts): NonNullable<CrowdPage["across"]> {
  const overlap = read.events.filter((e) => e.crowds.length >= 2);
  const heard = latest(opts.outcomes.filter((o) => o.agent === "promoter"));
  const sections: Section[] = [
    {
      id: "overlap",
      title: "Events for several crowds",
      summary: overlap.length ? `${plural(overlap.length, "event")} for two or three crowds: one booth, several crowds` : "Each crowd has its own events",
      blocks: [
        ...(overlap.length
          ? [
              {
                type: "table" as const,
                columns: EVENT_COLUMNS,
                rows: overlap.map((e) => eventRow(read, e, opts)),
                facets: [...FACETS, "Crowd"],
              },
            ]
          : [
              {
                type: "note" as const,
                text: "No event fits two crowds at once yet, so each crowd has its own",
              },
            ]),
        calendar(read, opts, undefined, "Every crowd"),
      ],
    },
    {
      id: "year",
      title: "The year ahead",
      summary: "Dated events and moments by month",
      blocks: [months(read)],
    },
    {
      id: "pipeline",
      title: "Pipeline",
      summary: heard.length ? `${plural(heard.length, "event")} marked` : "Mark an event when you apply",
      blocks: [
        {
          type: "pipeline",
          items: read.events.map((e) => ({
            item: e.id,
            name: e.name,
            kind: "event",
            group: e.kind,
            facets: { City: [e.city], Crowd: crowdNames(read, e.crowds) },
          })),
          facets: ["City", "Crowd"],
        },
      ],
    },
    {
      id: "budget",
      title: "Budget plan",
      summary: "An editable split, never a schedule",
      blocks: [promoBudget(read.budget)],
    },
    {
      id: "working",
      title: "What's working",
      summary: "Booked and went rates from your marks, by kind and city",
      blocks: [
        {
          type: "working",
          items: read.events.map((e) => ({
            item: e.id,
            facets: { Kind: e.kind, City: e.city },
          })),
          by: ["Kind", "City"],
        },
      ],
    },
    {
      id: "left",
      title: "Moved or left out",
      summary: read.moved.length ? plural(read.moved.length, "event") : "Nothing moved",
      blocks: [
        ...(read.moved.length
          ? [
              {
                type: "lines" as const,
                label: "Too close to prepare for",
                lines: read.moved.map((t) => ({ text: t })),
              },
            ]
          : [
              {
                type: "note" as const,
                text: `Every event found had at least ${LEAD_DAYS} days to prepare`,
              },
            ]),
        ...(read.limits.length
          ? [
              {
                type: "lines" as const,
                label: "Not read this time",
                lines: read.limits.map((t) => ({ text: t })),
              },
            ]
          : []),
      ],
    },
  ];
  return {
    sections,
    sources: [{ id: "qloo-insights", label: "Qloo insights" }],
    method: `Read from ${read.calls} Qloo signals · ${read.crowds.length} crowds · ${plural(read.events.length, "event")} · ${plural(read.moments.length, "moment")}`,
  };
}

/** The Promoter's page: a tab per crowd in tier order, then Across all three. */
export function promoterPage(read: PromoRead, opts: Partial<PageOpts> = {}): CrowdPage {
  const o: PageOpts = {
    outcomes: opts.outcomes ?? [],
    inquiries: opts.inquiries,
    at: opts.at,
  };
  const tabs = [...read.crowds].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)).map((c) => crowdTab(read, c, o));
  return { tabs, across: across(read, o), at: o.at ?? Date.now() };
}

/** The event to write to first: one for the most crowds with a published way in, soonest; for one crowd when given. */
export function topEvent(read: Pick<PromoRead, "events">, crowd?: string): PromoEvent | undefined {
  const xs = read.events.filter((e) => !crowd || e.crowds.includes(crowd));
  const score = (e: PromoEvent) => e.crowds.length * 2 + (e.kind === "show" ? 0 : 1) + (e.applyUrl || e.email ? 1 : 0);
  return [...xs].sort((a, b) => score(b) - score(a) || a.date.localeCompare(b.date))[0];
}

/** The Navigator's back-fill: each city's events from the Promoter, as names. Links only, never a verdict input. */
export function promoFill(read: PromoRead): { metroId: string; names: string[] }[] {
  return read.cities
    .map((c) => ({
      metroId: c.metroId,
      names: read.events.filter((e) => e.metroId === c.metroId).map((e) => `${e.name} (${dayOf(e.date)})`),
    }))
    .filter((x) => x.names.length);
}
