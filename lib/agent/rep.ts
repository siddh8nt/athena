import type { QlooClient } from "@/lib/qloo/client";
import { results } from "@/lib/qloo/client";
import { contributions, type QlooEntity } from "@/lib/qloo/types";
import { locationParams } from "@/lib/places/location";
import { metroById } from "@/lib/playbook/metros";
import { isPickable, reasonsFor, type VenuePick } from "@/lib/blocks/places";
import type { TagChip } from "@/lib/blocks/types";
import type { Tier } from "@/lib/playbook/config";
import { cleanVenue, meters, nameSim } from "@/lib/methods/names";
import { alreadyIn, nextRetailers, type RetailCategory, type RetailerPick } from "@/lib/stops/retailers";
import type { Outcome } from "@/lib/team/types";
import { TIER_LABEL, TIER_ORDER, type Block, type CrowdPage, type CrowdTier, type Detail, type PageTab, type Pin, type Row, type Section } from "@/lib/team/page";
import { applyOutcomes, itemId, latest } from "./outcomes";
import { founderLine } from "./founder-line";
import { FITS, strengthWord } from "./fit";
import { isStrong, roles, ROLE_LABEL, type CityRead, type NavRead, type Role } from "./navigator";

// The Rep (PRD §23.5 f): crowd → city → neighbourhood → shops. Each crowd's cities come from the Navigator; a shop that
// fits two or three crowds is found once, tagged with each, and ranked higher. Every matching shop is kept, never a
// top 5. What a shop's own site says (brands on its shelves, a wholesale page, a public buyer email) is read once and
// shown with its source; drafts are never sent.

export { FITS } from "./fit";
/** Fewer fitting shops than this in an anchor neighbourhood, and the Rep widens to the nearest other one. */
export const FEW_IN_HOOD = 3;
/** At least this many fitting shops in a city, and indie shops come first. */
export const INDIE_CITY = 12;
const ANCHORS_PER_CITY = 2;
const HOOD_RADIUS_M = 1500;
const NEAREST_HOOD_M = 2500;
/** Closer than this and a mapped neighbourhood is the same streets, whatever name Qloo gives the shop's own. */
const SAME_STREETS_M = 800;

export type Budget = "low" | "mid" | "high";

/** What the shop's own site says, each with the page it came from (§23.5 f, l). */
export type ShopSite = {
  brands: string[];
  /** Brands in the brand's exact niche on its shelves: a crowded shelf. */
  sameNiche: string[];
  wholesale?: string;
  emails: { value: string; src: string }[];
  form?: string;
  /** Only when the site states it. */
  size?: string;
  /** The page read. */
  src: string;
};

export type Shop = VenuePick & {
  metroId: string;
  city: string;
  hood?: string;
  role?: Role;
  rating?: number;
  hours?: string;
  events?: boolean;
  kind: string;
  /** Strength per crowd id, 0–1. */
  crowds: Record<string, number>;
  /** The brand is already on its shelves: never pitched again. */
  stocked: boolean;
  /** Found in a neighbourhood next to a thin anchor. */
  widened?: string;
  site?: ShopSite;
  /** Its name came back from a search for Faire shops in its city. */
  faire?: boolean;
  callId: string;
};

export type RetailerRow = RetailerPick & { cities: string[] };
export type RepCrowd = { id: string; name: string; tier: CrowdTier; nearMiss?: boolean; brands: { id: string; name: string }[]; cities: string[] };
export type RepCity = { metroId: string; name: string; center: [number, number]; bbox?: [number, number, number, number]; yours: boolean; notes: string[]; hoods: { name: string; role: Role }[] };

export type RepRead = {
  crowds: RepCrowd[];
  cities: RepCity[];
  shops: Shop[];
  retailers: Record<string, RetailerRow[]>;
  budget: Budget;
  brand: { name: string; product: string };
  competitors: string[];
  calls: number;
  callIds: string[];
};

export type RepDeps = {
  brand: { name: string; product: string; stockists: string[]; competitors: { id: string; name: string }[]; tier: Tier };
  channels: string[];
  tierParams: Record<string, unknown>;
  exclude: string[];
  names: Map<string, string>;
  fingerprint: TagChip[];
  kindOf: (v: VenuePick) => string;
  retail?: RetailCategory;
  budget: Budget;
  status?: (s: string) => void;
  /** Reads the top shops' own sites (live only). */
  sites?: (shops: Shop[], brand: RepDeps["brand"]) => Promise<Map<string, ShopSite>>;
  /** The shop names in a city that a search finds on Faire (live only), labelled as found by search. */
  faire?: (city: string, names: string[]) => Promise<Set<string>>;
};

/** The founder's growth budget answer, as a band; "a small budget" when they haven't said. */
export function budgetOf(answers: { question: string; answer: string }[] = []): Budget {
  const a = answers.find((x) => /spend on growth/i.test(x.question))?.answer ?? "";
  if (/over \$?10,?000/i.test(a)) return "high";
  if (/\$?1,?000 to \$?10,?000/i.test(a)) return "mid";
  return "low";
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const hhmm = (s: unknown) => (typeof s === "string" ? s.replace(/^T/, "").slice(0, 5) : "");

/** Qloo's opening hours as one short line: "Every day 08:00–23:00", else day by day. */
export function hoursLine(h: unknown): string | undefined {
  if (!h || typeof h !== "object") return undefined;
  const by = h as Record<string, { opens?: string; closes?: string }[] | undefined>;
  const per = DAYS.map((d) => {
    const slots = by[d] ?? by[d.toLowerCase()];
    if (!Array.isArray(slots) || !slots.length) return undefined;
    return slots.map((s) => `${hhmm(s.opens)}–${hhmm(s.closes)}`).join(", ");
  });
  if (per.every((x) => !x)) return undefined;
  if (per.every((x) => x && x === per[0])) return `Every day ${per[0]}`;
  return DAYS.map((d, i) => `${d.slice(0, 3)} ${per[i] ?? "closed"}`).join(" · ");
}

/** The share of a shop's taste signal that comes from one crowd's entities, from Qloo's explainability. */
function shares(e: QlooEntity, crowds: { id: string; ids: Set<string> }[]): Record<string, number> {
  const c = contributions(e, 20);
  const total = c.reduce((s, x) => s + x.score, 0);
  const out: Record<string, number> = {};
  for (const cr of crowds) out[cr.id] = total ? c.filter((x) => cr.ids.has(x.id)).reduce((s, x) => s + x.score, 0) / total : 0;
  return out;
}

const round = (x: number) => Math.round(x * 100) / 100;

/** The nearest of the city's named neighbourhoods within 2.5 km, with its role. When Qloo names the shop's own
 * neighbourhood and it isn't that one, the shop counts there only if it's in the same streets (Katz's on the Lower East
 * Side is 2 km from Dumbo, across the river). */
export function nearestHood(city: CityRead, role: Map<string, Role>, lat?: number, lon?: number, own?: string): { name: string; role: Role } | undefined {
  if (lat === undefined || lon === undefined) return undefined;
  const near = city.hoods
    .filter((h) => h.at && h.name !== city.name)
    .map((h) => ({ h, d: meters([lat, lon], h.at!) }))
    .filter((x) => x.d <= NEAREST_HOOD_M)
    .sort((a, b) => a.d - b.d)[0];
  const elsewhere = own && near && own.toLowerCase() !== near.h.name.toLowerCase() && near.d > SAME_STREETS_M;
  return near && !elsewhere ? { name: near.h.name, role: role.get(near.h.name) ?? "online" } : undefined;
}

/** Each crowd's cities: the worked cities where it's strong, else its best worked one. */
export function crowdCities(nav: NavRead, worked: CityRead[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const c of nav.crowds) {
    const fits = worked.map((city) => ({ city, f: c.cities.find((x) => x.metroId === city.metroId) }));
    const strong = fits.filter((x) => isStrong(x.f)).map((x) => x.city.metroId);
    const best = [...fits].sort((a, b) => (b.f?.z ?? -9) - (a.f?.z ?? -9))[0]?.city.metroId;
    out.set(c.crowd.id, strong.length ? strong : best ? [best] : []);
  }
  return out;
}

/** The Navigator's worked cities whose shops are read: home always, else where at least one crowd is given the city. */
export function shopCities(nav: NavRead): CityRead[] {
  const worked = nav.cities.slice(0, 4);
  const given = new Set([...crowdCities(nav, worked).values()].flat());
  return worked.filter((c) => c.yours || given.has(c.metroId));
}

export { founderLine };

/** Shops ranked: those fitting more crowds first, then by summed strength. */
export function rankShops(shops: Shop[]): Shop[] {
  const n = (s: Shop) => Object.values(s.crowds).filter((x) => x >= FITS).length;
  const sum = (s: Shop) => Object.values(s.crowds).reduce((a, b) => a + b, 0);
  const sorted = [...shops].sort((a, b) => Number(a.stocked) - Number(b.stocked) || n(b) - n(a) || sum(b) - sum(a));
  // A chain's branches keep their own rows: a repeat name carries where it is, so each branch has its own pitch and mark.
  const seen = new Set<string>();
  return sorted.map((s) => {
    // Names compare as their item ids do, so two that differ only by a mark still get their own rows.
    const key = itemId("venue", s.name);
    if (!seen.has(key)) return seen.add(key), s;
    const named = `${s.name} (${s.hood ?? s.neighbourhood ?? s.city})`;
    const name = seen.has(itemId("venue", named)) ? `${named} ${s.id.slice(0, 4)}` : named;
    seen.add(itemId("venue", name));
    return { ...s, name };
  });
}

/** Reads the shops for every crowd in every city it works. Never throws; a call that fails leaves its slot empty. */
export async function readShops(qloo: QlooClient, nav: NavRead, deps: RepDeps): Promise<RepRead> {
  const callIds: string[] = [];
  let calls = 0;
  const worked = shopCities(nav);
  const byCrowd = crowdCities(nav, worked);
  const crowdIds = nav.crowds.map((c) => ({ id: c.crowd.id, ids: new Set(c.crowd.signal.map((s) => s.id)) }));
  const shops = new Map<string, Shop>();
  const notes = new Map<string, string[]>(worked.map((c) => [c.metroId, []]));
  const chainSet = new Set<string>();

  const insights = async (params: Record<string, unknown>) => {
    calls++;
    try {
      const res = await qloo.insights({
        "filter.type": "urn:entity:place",
        "filter.tags": deps.channels,
        "operator.filter.tags": "union",
        "filter.exclude.entities": deps.exclude.slice(0, 50),
        "feature.explainability": true,
        take: 50,
        ...deps.tierParams,
        ...params,
      } as never);
      callIds.push(res.call.id);
      return { entities: (results(res).entities ?? []).filter((e) => isPickable(e, chainSet)), callId: res.call.id };
    } catch {
      return { entities: [] as QlooEntity[], callId: "" };
    }
  };

  /** Adds what one call returned; `strength` gives each crowd's strength for the shop at rank i of n. */
  const add = (city: CityRead, role: Map<string, Role>, got: { entities: QlooEntity[]; callId: string }, strength: (e: QlooEntity, i: number, n: number) => Record<string, number>, widened?: string) => {
    got.entities.forEach((e, i) => {
      const s = strength(e, i, got.entities.length);
      const prev = shops.get(e.entity_id);
      if (prev) {
        for (const [k, v] of Object.entries(s)) prev.crowds[k] = Math.max(prev.crowds[k] ?? 0, v);
        return;
      }
      const hood = nearestHood(city, role, e.location?.lat, e.location?.lon, e.properties?.neighborhood);
      const props = (e.properties ?? {}) as Record<string, unknown>;
      const pick: VenuePick = {
        rank: i + 1,
        id: e.entity_id,
        name: e.name,
        address: e.properties?.address,
        neighbourhood: e.properties?.neighborhood ?? hood?.name,
        lat: e.location?.lat,
        lon: e.location?.lon,
        priceLevel: e.properties?.price_level,
        popularity: e.popularity,
        reasons: reasonsFor({ ...e, query: { ...e.query, rank: i + 1 } }, got.callId, deps.names, deps.fingerprint, deps.brand.tier, true),
        why: contributions(e),
        tags: (e.tags ?? []).filter((t) => !(t.type ?? "").includes("customer_identity")).slice(0, 6).map((t) => ({ id: t.id ?? t.tag_id ?? t.name, name: t.name })),
        contact: {
          phone: e.properties?.phone ? { value: e.properties.phone, source: "Qloo" as const, callId: got.callId } : undefined,
          website: e.properties?.website ? { value: e.properties.website, source: "Qloo" as const, callId: got.callId } : undefined,
        },
      };
      const spaces = props.event_spaces ?? props.events;
      shops.set(e.entity_id, {
        ...pick,
        metroId: city.metroId,
        city: city.name,
        hood: hood?.name,
        role: hood?.role,
        rating: typeof e.properties?.business_rating === "number" ? e.properties.business_rating : undefined,
        hours: hoursLine(props.hours),
        events: Array.isArray(spaces) ? spaces.length > 0 : !!spaces,
        kind: deps.kindOf(pick),
        crowds: s,
        stocked: alreadyIn(e.name, deps.brand.stockists),
        ...(widened ? { widened } : {}),
        callId: got.callId,
      });
    });
  };

  type Got = { entities: QlooEntity[]; callId: string };
  /** One city's reads, all at once; they're added in city order afterwards so the same shop always lands the same way. */
  const readCity = async (city: CityRead): Promise<{ got: Got; strength: (e: QlooEntity, i: number, n: number) => Record<string, number>; widened?: string }[]> => {
    const metro = metroById(city.metroId);
    const role = roles(city);
    // At home every crowd is read: the founder can work all of them there.
    const given = nav.crowds.filter((c) => byCrowd.get(c.crowd.id)?.includes(city.metroId));
    const mine = given.length || !city.yours ? given : nav.crowds;
    if (!mine.length) return [];
    deps.status?.(`Reading the shops in ${city.name} for ${mine.map((c) => c.crowd.name).join(", ")}`);
    const where = await locationParams(metro).catch(() => ({ "filter.location.query": metro.query }));
    // City-wide, one read per crowd: its rank there is its strength.
    const wide = await Promise.all(mine.map((c) => insights({ "signal.interests.entities": c.crowd.signal.map((s) => s.id).slice(0, 10), ...where })));
    const out: { got: Got; strength: (e: QlooEntity, i: number, n: number) => Record<string, number>; widened?: string }[] = mine.map((c, k) => ({ got: wide[k], strength: (_e, i, n) => ({ [c.crowd.id]: round(1 - i / Math.max(1, n)) }) }));
    // The anchors, read for every crowd at once. That mixed read can't tell crowds apart (Qloo spreads its explanation
    // across them), so a shop found there counts for the crowd it leans to most; fitting several crowds comes from
    // ranking in several crowds' own city-wide reads.
    const both = mine.flatMap((c) => c.crowd.signal.map((s) => s.id).slice(0, Math.ceil(12 / mine.length)));
    const anchors = city.hoods.filter((h) => role.get(h.name) === "anchor" && h.at && h.name !== city.name).slice(0, ANCHORS_PER_CITY);
    const near = (lat: number, lon: number) => insights({ "signal.interests.entities": both, "filter.location": `POINT(${lon} ${lat})`, "filter.location.radius": HOOD_RADIUS_M });
    const split = (e: QlooEntity, i: number, n: number) => {
      const sh = shares(e, crowdIds.filter((x) => mine.some((c) => c.crowd.id === x.id)));
      const top = Math.max(...Object.values(sh), 1e-9);
      const base = 1 - i / Math.max(1, n);
      return Object.fromEntries(Object.entries(sh).filter(([, v]) => v > 0 && v >= top - 1e-9).map(([k]) => [k, round(base)]));
    };
    const got = await Promise.all(anchors.map((h) => near(h.at![0], h.at![1])));
    const wider = await Promise.all(
      anchors.map(async (h, k) => {
        out.push({ got: got[k], strength: split });
        const fitting = got[k].entities.filter((e) => !alreadyIn(e.name, deps.brand.stockists)).length;
        if (fitting >= FEW_IN_HOOD) return undefined;
        const next = city.hoods
          .filter((x) => x.at && x.name !== h.name && x.name !== city.name && !anchors.includes(x))
          .sort((a, b) => meters(h.at!, a.at!) - meters(h.at!, b.at!))[0];
        if (!next) return undefined;
        const why = `few shops in ${h.name}, so widened to ${next.name}`;
        notes.get(city.metroId)!.push(why);
        return { got: await near(next.at![0], next.at![1]), strength: split, widened: why };
      }),
    );
    return [...out, ...wider.filter((x): x is NonNullable<typeof x> => !!x)];
  };
  const perCity = await Promise.all(worked.map(readCity));
  worked.forEach((city, k) => {
    const role = roles(city);
    for (const r of perCity[k]) add(city, role, r.got, r.strength, r.widened);
  });

  // National retailers, per crowd; then where the top ones have stores among the brand's cities.
  deps.status?.("Ranking the bigger retailers by how much their shoppers overlap each crowd");
  const retailers: Record<string, RetailerRow[]> = {};
  const picks = await Promise.all(nav.crowds.map((c) => nextRetailers(qloo, c.crowd.signal.map((s) => s.id).slice(0, 10), deps.brand.stockists, deps.brand.product, { category: deps.retail }).catch(() => undefined)));
  for (const p of picks) if (p) ((calls += p.calls), callIds.push(...p.callIds));
  const top = [...new Set(picks.flatMap((p) => p?.picks.slice(0, 3).map((x) => x.name) ?? []))].slice(0, 4);
  const present = new Map<string, string[]>();
  const pairs = top.flatMap((name) => worked.map((city) => ({ name, city })));
  await Promise.all(
    pairs.slice(0, 20).map(async ({ name, city }) => {
      calls++;
      const res = await qloo.search({ query: name, types: "urn:entity:place", "filter.location": `${city.center[0].toFixed(6)},${city.center[1].toFixed(6)}`, "filter.radius": 25, take: 5 }).catch(() => undefined);
      if (!res) return;
      callIds.push(res.call.id);
      if (res.entities.some((e) => nameSim(cleanVenue(e.name), name) >= 0.99)) present.set(name, [...(present.get(name) ?? []), city.metroId]);
    }),
  );
  nav.crowds.forEach((c, k) => (retailers[c.crowd.id] = (picks[k]?.picks ?? []).map((p) => ({ ...p, cities: present.get(p.name) ?? [] }))));

  let ranked = rankShops([...shops.values()]);
  // The top shops' own sites, and Faire by search, side by side: what they carry, how they buy, who to write to.
  if (deps.sites || deps.faire) deps.status?.("Reading the top shops' own sites for the brands they carry and how they buy");
  const [site, faire] = await Promise.all([
    deps.sites ? deps.sites(ranked.filter((s) => !s.stocked && s.contact.website?.value).slice(0, 15), deps.brand).catch(() => new Map<string, ShopSite>()) : new Map<string, ShopSite>(),
    Promise.all(
      worked.map(async (city) => {
        const names = ranked.filter((s) => s.metroId === city.metroId && !s.stocked).slice(0, 30).map((s) => s.name);
        return names.length && deps.faire ? deps.faire(city.name, names).catch(() => new Set<string>()) : new Set<string>();
      }),
    ),
  ]);
  ranked = ranked.map((s) => {
    const k = worked.findIndex((c) => c.metroId === s.metroId);
    return { ...s, ...(site.has(s.id) ? { site: site.get(s.id) } : {}), ...(k >= 0 && faire[k].has(s.name) ? { faire: true } : {}) };
  });

  return {
    crowds: nav.crowds.map((c) => ({ id: c.crowd.id, name: c.crowd.name, tier: c.tier, ...(c.crowd.nearMiss ? { nearMiss: true } : {}), brands: (c.crowd.brands ?? []).slice(0, 8).map((b) => ({ id: b.id, name: b.name })), cities: byCrowd.get(c.crowd.id) ?? [] })),
    cities: worked.map((c) => {
      const role = roles(c);
      return { metroId: c.metroId, name: c.name, center: c.center, bbox: c.bbox, yours: c.yours, notes: notes.get(c.metroId) ?? [], hoods: c.hoods.filter((h) => h.name !== c.name).map((h) => ({ name: h.name, role: role.get(h.name) ?? "online" })) };
    }),
    shops: ranked,
    retailers,
    budget: deps.budget,
    brand: { name: deps.brand.name, product: deps.brand.product },
    competitors: deps.brand.competitors.map((c) => c.name),
    calls,
    callIds,
  };
}

// ---- The page ------------------------------------------------------------------------------------------------------

const and = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const fitsOf = (s: Shop) => Object.entries(s.crowds).filter(([, v]) => v >= FITS).map(([k]) => k);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How the shop buys: its own wholesale page, Faire by search, or nothing found (a cold approach). */
export function wholesaleOf(s: Shop): string {
  if (s.site?.wholesale) return "Sell-with-us page";
  if (s.faire) return "On Faire (found by search)";
  return "None found: cold approach";
}

/** The first public email, with where it was found. */
const emailOf = (s: Shop) => s.site?.emails[0];

/** The offer, sized to what the founder can spend. Shapes only, never numbers. */
export function offerFor(b: Budget): string {
  if (b === "high") return "Samples, your trade terms and a demo day in the shop";
  if (b === "mid") return "A small opening order with samples, and a sampling day in the shop";
  return "Consignment, or a small opening order";
}

/** How to enter a city: indie shops when there are many, one regional buyer when a chain is there, else a pop-up. */
export function entryRoute(read: RepRead, metroId: string): { route: string; why: string } {
  const fitting = read.shops.filter((s) => s.metroId === metroId && !s.stocked && fitsOf(s).length);
  const chains = Object.values(read.retailers).flat().filter((r) => r.cities.includes(metroId) && !r.ownLabel);
  if (fitting.length >= INDIE_CITY) return { route: "Indie first", why: `${fitting.length} independent shops fit here` };
  if (chains.length) return { route: "Regional chain", why: `${chains[0].name} is here: one buyer, many doors` };
  return { route: "Pop-up or consignment", why: `only ${plural(fitting.length, "shop")} fit here so far` };
}

/** The draft for one shop: the Rep's own pitch when it wrote one, else a short template. Never sent. */
export function draftFor(read: RepRead, s: Shop, pitch?: { subject: string; body: string }): NonNullable<Detail["draft"]> {
  const email = emailOf(s);
  const to = email ? { to: email.value, toSrc: email.src } : {};
  if (pitch) return { subject: pitch.subject, body: pitch.body, ...to };
  // The names the row's "Loved by fans of" line shows, so the email and the row agree; a shop stored before the line
  // kept its names falls back to the crowd brands behind it.
  const shown = s.reasons.find((r) => r.kind === "contribution")?.names;
  const loves = shown ?? (s.why ?? []).map((c) => read.crowds.flatMap((x) => x.brands).find((b) => b.id === c.id)?.name).filter((x): x is string => !!x);
  const fit = loves.length ? `The people who shop with you also love ${and([...new Set(loves)].slice(0, 2))}, and so do ours.` : "Your shop looks like a natural home for it.";
  const offer = read.budget === "high" ? "We can send samples, share trade terms and run a demo day in the shop." : read.budget === "mid" ? "We can send samples and start with a small opening order, with a sampling day in the shop." : "We'd be glad to start on consignment or with a small opening order, whichever suits you.";
  const ask = email ? "Could I send you samples?" : s.site?.form ? "Could I send you samples?" : "I'd love to drop by with samples; when is a good time?";
  const subject = `${read.brand.name} for ${s.name}`;
  return { subject, body: `Hi ${s.name} team,\n\n${founderLine(read.brand.name, read.brand.product)} ${fit} ${offer} ${ask}\n\nThanks,\n${read.brand.name}`, ...to };
}

/** How to reach the shop's buyer: a public email with its source, else its contact form, else a walk-in. */
export function contactOf(s: Shop): string {
  const e = emailOf(s);
  if (e) return `${e.value} (from ${e.src})`;
  if (s.site?.form) return "No public email: use the contact form (draft below)";
  return "No public email: walk in with the note below";
}

const price = (n?: number) => (n ? "$".repeat(Math.max(1, Math.min(4, Math.round(n)))) : "—");

function shopDetail(read: RepRead, s: Shop, pitch?: { subject: string; body: string }): Detail {
  const crowdName = (id: string) => read.crowds.find((c) => c.id === id)?.name ?? id;
  const rivals = (s.site?.brands ?? []).filter((b) => read.competitors.some((c) => nameSim(c, b) >= 0.9));
  const site = s.site;
  return {
    title: s.name,
    item: itemId("venue", s.name),
    kind: "venue",
    group: s.kind,
    facts: [
      ...(s.address ? [{ label: "Address", value: s.address }] : []),
      { label: "Neighbourhood", value: s.hood ? `${s.hood}${s.role ? ` (${ROLE_LABEL[s.role]})` : ""}` : (s.neighbourhood ?? "—") },
      ...read.crowds.map((c) => ({ label: `Fit for ${c.name}`, value: s.crowds[c.id] !== undefined && s.crowds[c.id] >= FITS ? `${strengthWord(s.crowds[c.id])} (${s.crowds[c.id]})` : "Not a fit" })),
      ...(s.rating ? [{ label: "Rating", value: String(s.rating) }] : []),
      ...(s.hours ? [{ label: "Hours", value: s.hours }] : []),
      ...(s.priceLevel ? [{ label: "Price level", value: price(s.priceLevel) }] : []),
      ...(s.contact.phone ? [{ label: "Phone", value: s.contact.phone.value }] : []),
      ...(site?.size ? [{ label: "Size", value: `${site.size} (from its site)` }] : []),
      ...(site?.brands.length ? [{ label: "Brands on its shelves", value: `${site.brands.slice(0, 8).join(", ")} (from its site)` }] : []),
      ...(rivals.length ? [{ label: "Rivals on its shelves", value: `${and(rivals)}: your crowd already shops here` }] : []),
      ...(site?.sameNiche.length ? [{ label: "Same niche", value: `${and(site.sameNiche.slice(0, 3))} already fill this shelf: a crowded shelf` }] : []),
      { label: "Wholesale", value: wholesaleOf(s) },
      { label: "Buyer contact", value: contactOf(s) },
      { label: "Offer", value: offerFor(read.budget) },
      ...(s.widened ? [{ label: "Found by widening", value: s.widened }] : []),
    ],
    lines: [...s.reasons.map((r) => r.label), ...(fitsOf(s).length > 1 ? [`Fits ${and(fitsOf(s).map(crowdName))}: one pitch reaches ${fitsOf(s).length} crowds`] : [])],
    draft: draftFor(read, s, pitch),
    links: [
      ...(s.contact.website?.value ? [{ label: "Website", url: s.contact.website.value }] : []),
      ...(site?.wholesale ? [{ label: "Wholesale page", url: site.wholesale }] : []),
      ...(site?.form ? [{ label: "Contact form", url: site.form }] : []),
    ],
  };
}

const facetsOf = (read: RepRead, s: Shop): Record<string, string[]> => ({
  Crowd: fitsOf(s).map((id) => read.crowds.find((c) => c.id === id)?.name ?? id),
  City: [s.city],
  Neighbourhood: [s.hood ?? s.neighbourhood ?? "Elsewhere in the city"],
  Tier: fitsOf(s).map((id) => TIER_LABEL[read.crowds.find((c) => c.id === id)?.tier ?? "watch"]),
  Wholesale: [wholesaleOf(s)],
  "Has email": [emailOf(s) ? "Has email" : "No email"],
});
const FACETS = ["Crowd", "City", "Neighbourhood", "Tier", "Wholesale", "Has email"];

function shopRow(read: RepRead, s: Shop, pitch?: { subject: string; body: string }): Row {
  const crowd = fitsOf(s).map((id) => read.crowds.find((c) => c.id === id)?.name ?? id);
  return {
    cells: [s.name, s.city, s.hood ?? s.neighbourhood ?? "—", s.kind, crowd.join(", ") || "—", wholesaleOf(s), emailOf(s) ? "Email" : s.site?.form ? "Form" : "Walk in"],
    detail: shopDetail(read, s, pitch),
    facets: facetsOf(read, s),
  };
}
const SHOP_COLUMNS = ["Shop", "City", "Neighbourhood", "Type", "Fits", "Wholesale", "Contact"];

/** The shops in the order to pitch: by fit, then what the founder's marks say works; heard-back ones last. */
function ordered(read: RepRead, shops: Shop[], outcomes: Outcome[]): Shop[] {
  const items = shops.map((s) => ({ s, id: itemId("venue", s.name), kind: "venue", group: s.kind }));
  const kept = applyOutcomes(items, outcomes, "rep").items.map((x) => x.s);
  const rest = shops.filter((s) => !kept.includes(s));
  return [...kept.filter((s) => !s.stocked), ...rest.filter((s) => !s.stocked)];
}

function crowdTab(read: RepRead, c: RepCrowd, opts: PageOpts): PageTab {
  const mine = ordered(read, read.shops.filter((s) => (s.crowds[c.id] ?? 0) >= FITS), opts.outcomes);
  const kinds = new Map<string, number>();
  for (const s of mine) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
  const prices = mine.map((s) => s.priceLevel).filter((x): x is number => !!x).sort((a, b) => a - b);
  const retail = read.retailers[c.id] ?? [];
  const cityName = (id: string) => read.cities.find((x) => x.metroId === id)?.name ?? id;
  const sections: Section[] = [
    {
      id: "profile",
      title: "Who shops",
      summary: `Read from the brands ${c.name} loves`,
      blocks: [
        ...(c.brands.length ? [{ type: "names" as const, groups: [{ label: "Brands they love", names: c.brands.map((b) => ({ name: b.name, kind: "brand", ref: b.id })) }] }] : []),
        {
          type: "facts",
          rows: [
            { label: "Shop types that fit", value: kinds.size ? [...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} (${n})`).join(", ") : "—" },
            { label: "Typical price level", value: prices.length ? price(prices[Math.floor(prices.length / 2)]) : "—" },
          ],
        },
      ],
    },
    {
      id: "retailers",
      title: "National retailers",
      summary: "Ranked by how much their shoppers overlap this crowd",
      blocks: retail.length
        ? [
            {
              type: "table",
              columns: ["Retailer", "Stores in your cities", "Note"],
              rows: retail.slice(0, 8).map((r, i) => ({
                cells: [`${i + 1}. ${r.name}`, r.cities.length ? and(r.cities.map(cityName)) : "—", r.ownLabel ? "Mostly its own label: pitch a co-branded line" : ""],
                detail: { title: r.name, item: itemId("retailer", r.name), kind: "retailer", group: r.ownLabel ? "own-label retailer" : "retailer", facts: [{ label: "Rank for this crowd", value: `#${r.rank}` }, { label: "Stores in your cities", value: r.cities.length ? and(r.cities.map(cityName)) : "None found in these cities" }] },
              })),
            },
          ]
        : [{ type: "note", text: "Independent shops come first for this crowd; the bigger retailers follow once a few shops say yes" }],
    },
    {
      id: "cities",
      title: "Its cities",
      blocks: [
        {
          type: "table",
          columns: ["City", "Matching shops", "Entry route"],
          rows: c.cities.map((id) => {
            const n = mine.filter((s) => s.metroId === id).length;
            const r = entryRoute(read, id);
            return { cells: [cityName(id), String(n), r.route], goto: `city:${id}`, detail: { title: cityName(id), facts: [{ label: "Entry route", value: `${r.route}: ${r.why}` }] } };
          }),
        },
      ],
    },
    {
      id: "shops",
      title: "Every matching shop",
      summary: plural(mine.length, "shop"),
      blocks: mine.length ? [{ type: "table", columns: SHOP_COLUMNS, rows: mine.map((s) => shopRow(read, s, opts.pitches?.[s.id])), facets: FACETS }] : [{ type: "note", text: `The shops in ${and(c.cities.map(cityName))} lean to the other crowds; this crowd is reached online first` }],
    },
  ];
  return {
    crowd: { id: c.id, name: c.name, tier: c.tier, ...(c.nearMiss ? { nearMiss: true } : {}) },
    sections,
    sources: [{ id: "qloo-places", label: "Qloo places" }],
    method: `Read from ${read.calls} Qloo signals · ${plural(mine.length, "shop")} for this crowd`,
  };
}

function cityPage(read: RepRead, city: RepCity, opts: PageOpts): Section {
  const here = read.shops.filter((s) => s.metroId === city.metroId);
  const fitting = ordered(read, here.filter((s) => fitsOf(s).length), opts.outcomes);
  const stocked = here.filter((s) => s.stocked);
  const r = entryRoute(read, city.metroId);
  const count = (h: string) => fitting.filter((s) => s.hood === h).length;
  const chains = [...new Set(Object.values(read.retailers).flat().filter((x) => x.cities.includes(city.metroId)).map((x) => x.name))];
  const rivals = [...new Set(here.flatMap((s) => (s.site?.brands ?? []).filter((b) => read.competitors.some((c) => nameSim(c, b) >= 0.9))))];
  const rank = (s: Shop) => (s.role === "anchor" ? 0 : s.role === "spillover" ? 1 : 2);
  const blocks: Block[] = [
    {
      type: "facts",
      rows: [
        { label: "Matching shops", value: String(fitting.length) },
        { label: "Retailers here", value: chains.length ? and(chains) : "None of the crowds' retailers found here" },
        { label: "Entry route", value: `${r.route}: ${r.why}` },
      ],
    },
    {
      type: "lines",
      label: "What's already there",
      lines: [
        { text: stocked.length ? `You're already in ${and(stocked.map((s) => s.name))}; never suggested again` : "None of your stockists is here" },
        { text: rivals.length ? `Rivals on shelves: ${and(rivals)}` : "No rival found on these shops' shelves yet" },
      ],
    },
    ...(city.notes.length ? [{ type: "note" as const, text: city.notes.map((n) => n[0].toUpperCase() + n.slice(1)).join(". ") }] : []),
    {
      type: "table",
      label: "Neighbourhoods",
      columns: ["Neighbourhood", "Role", "Shops"],
      rows: city.hoods.filter((h) => h.role !== "online" || count(h.name)).map((h) => ({ cells: [h.name, ROLE_LABEL[h.role], String(count(h.name))], detail: { title: h.name, facts: [{ label: "Role", value: h.role === "anchor" ? "Anchor: pitch here first" : h.role === "spillover" ? "Spillover: pitch once the anchor holds" : ROLE_LABEL[h.role] }, { label: "Matching shops", value: String(count(h.name)) }] } })),
    },
    fitting.length ? { type: "table", label: `Every matching shop (${fitting.length})`, columns: SHOP_COLUMNS, rows: [...fitting].sort((a, b) => rank(a) - rank(b)).map((s) => shopRow(read, s, opts.pitches?.[s.id])), facets: FACETS } : { type: "note", text: `A pop-up or consignment spot first in ${city.name}, while the Rep keeps looking` },
  ];
  return { id: `city:${city.metroId}`, title: city.name, summary: `${r.route} · ${plural(fitting.length, "matching shop")}`, blocks };
}

/** How many doors the budget covers: a starting size, not a quote. */
function doors(read: RepRead, shops: Shop[]): Shop[] {
  if (read.budget === "high") return shops;
  if (read.budget === "mid") return shops.filter((s) => s.role === "anchor" || s.role === "spillover").slice(0, 15);
  return [...shops.filter((s) => s.role === "anchor"), ...shops.filter((s) => s.role !== "anchor")].slice(0, 5);
}

type PageOpts = { outcomes: Outcome[]; pitches?: Record<string, { subject: string; body: string }>; at?: number };

function across(read: RepRead, opts: PageOpts): NonNullable<CrowdPage["across"]> {
  const all = ordered(read, read.shops.filter((s) => fitsOf(s).length), opts.outcomes);
  const multi = all.filter((s) => fitsOf(s).length > 1);
  const tierOf = (s: Shop): CrowdTier => fitsOf(s).map((id) => read.crowds.find((c) => c.id === id)?.tier ?? "watch").sort((a, b) => TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b))[0] ?? "watch";
  const afford = doors(read, all);
  const heard = latest(opts.outcomes.filter((o) => o.agent === "rep" && o.kind === "venue"));
  const sections: Section[] = [
    {
      id: "overview",
      title: "Shops at a glance",
      summary: multi.length ? `${plural(multi.length, "shop")} fit two or three crowds` : plural(all.length, "matching shop"),
      blocks: [
        ...(multi.length ? [{ type: "lines" as const, label: "One pitch, several crowds", lines: multi.slice(0, 8).map((s) => ({ text: s.name, reason: `${s.city}${s.hood ? `, ${s.hood}` : ""}: fits ${and(fitsOf(s).map((id) => read.crowds.find((c) => c.id === id)?.name ?? id))}`, item: itemId("venue", s.name) })) }] : [{ type: "note" as const, text: "No shop fits two crowds at once yet, so each crowd has its own shops" }]),
        // Every shop is listed in full once, on its city's page; here only the ones a single pitch reaches twice.
        ...(all.length ? [] : [{ type: "note" as const, text: "The Rep is still looking for shops in these cities" }]),
      ],
    },
    {
      id: "map",
      title: "Map",
      summary: "Every shop, coloured by the crowd it fits best; grey where you already are",
      blocks: read.cities.map((city) => ({
        type: "heat" as const,
        city: { name: city.name, center: city.center, bbox: city.bbox },
        layers: [],
        pins: read.shops.filter((s) => s.metroId === city.metroId && s.lat !== undefined && s.lon !== undefined && (s.stocked || fitsOf(s).length)).map((s): Pin => ({ name: s.name, lat: s.lat!, lon: s.lon!, ...(s.stocked ? { grey: true } : { tier: tierOf(s) }) })),
      })),
    },
    ...read.cities.map((c) => cityPage(read, c, opts)),
    {
      id: "pipeline",
      title: "Pipeline",
      summary: heard.length ? `${plural(heard.length, "shop")} marked` : "Mark a shop when you pitch it",
      blocks: [{ type: "pipeline", items: all.map((s) => ({ item: itemId("venue", s.name), name: s.name, kind: "venue", group: s.kind, facets: { Crowd: facetsOf(read, s).Crowd, City: [s.city], Neighbourhood: facetsOf(read, s).Neighbourhood } })), facets: ["Crowd", "City", "Neighbourhood"] }],
    },
    {
      id: "working",
      title: "What's working",
      summary: "Yes rates from your marks",
      blocks: [{ type: "working", items: all.map((s) => ({ item: itemId("venue", s.name), facets: { "Shop type": s.kind, Tier: TIER_LABEL[tierOf(s)], Neighbourhood: s.hood ?? s.neighbourhood ?? "Elsewhere" } })), by: ["Shop type", "Tier", "Neighbourhood"] }],
    },
    {
      id: "doors",
      title: "Doors you can afford",
      summary: `${plural(afford.length, "door")}: a starting size, not a quote`,
      blocks: [
        { type: "facts", rows: [{ label: "Offer", value: offerFor(read.budget) }, { label: "Doors", value: `${afford.length} to start, a starting size, not a quote` }] },
        ...(afford.length ? [{ type: "lines" as const, lines: afford.map((s) => ({ text: s.name, reason: `${s.city}${s.hood ? `, ${s.hood}` : ""}${s.role ? ` (${ROLE_LABEL[s.role]})` : ""}`, item: itemId("venue", s.name) })) }] : []),
      ],
    },
  ];
  return { sections, sources: [{ id: "qloo-places", label: "Qloo places" }], method: `Read from ${read.calls} Qloo signals · ${read.crowds.length} crowds · ${plural(read.shops.length, "shop")}` };
}

/** The Rep's page: a tab per crowd in tier order, then Across all three. */
export function repPage(read: RepRead, opts: Partial<PageOpts> = {}): CrowdPage {
  const o: PageOpts = { outcomes: opts.outcomes ?? [], pitches: opts.pitches, at: opts.at };
  const tabs = [...read.crowds].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)).map((c) => crowdTab(read, c, o));
  return { tabs, across: across(read, o), at: o.at ?? Date.now() };
}
