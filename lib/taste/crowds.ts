import type { Priority, QlooClient } from "@/lib/qloo/client";
import type { QlooEntity } from "@/lib/qloo/types";
import { isChainName } from "@/lib/methods/names";
import { cleanMetroName, metroFor } from "@/lib/playbook/metros";
import { VENUE_TAGS } from "@/lib/playbook/config";
import type { Crowd } from "./graph";

// A crowd's card (PRD §9.23 step 5): its labelled audience skew and where its taste concentrates. Any US metro can
// be named (§9.3, v3.0): the metro comes from Qloo's own geocode, and the 25 fixed metros only lend display names.

export type Skew = { age: Record<string, number>; gender: Record<string, number>; clear: boolean };
export type City = { metro: string; name: string; venue: string; venues: number };
export type CrowdDetails = { skew?: Skew; cities: City[]; calls: number; callIds: string[] };

/** Below this on every bar, the chart says "No clear skew" (§9.17). */
export const SKEW_CLEAR = 0.1;
/** A metro is named only when Qloo returns at least this many matching venues there (§9.3). */
export const MIN_VENUES = 2;

/** Everyday venues where a crowd's taste shows (§7.3's confirmed types), so landmarks and hotels don't set the ranking. */
export const EVERYDAY_VENUES = [VENUE_TAGS.cafe, VENUE_TAGS.coffee_shop, VENUE_TAGS.bakery, VENUE_TAGS.brunch, VENUE_TAGS.gift_shop, VENUE_TAGS.home_goods_store, VENUE_TAGS.gym, VENUE_TAGS.art_gallery, VENUE_TAGS.wine_store];

const cityKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** Qloo's metro string, shown with the fixed metros' display name where one matches ("New York City" → "New York"). */
export function cityName(metro: string): string {
  return metroFor(metro)?.name ?? cleanMetroName(metro);
}

/** Groups place results by metro, ranked by their best venue (first appearance = rank, as in Markets). */
export function citiesFrom(places: QlooEntity[], take = 5): City[] {
  const by = new Map<string, City>();
  for (const e of places) {
    const metro = e.properties?.geocode?.metro;
    if (!metro || (e.properties?.geocode?.country_code && e.properties.geocode.country_code !== "US")) continue;
    const k = cityKey(metro);
    const hit = by.get(k);
    if (hit) hit.venues++;
    else by.set(k, { metro, name: cityName(metro), venue: isChainName(e.name) ? "" : e.name, venues: 1 });
    if (hit && !hit.venue && !isChainName(e.name)) hit.venue = e.name;
  }
  const all = [...by.values()];
  const strong = all.filter((c) => c.venues >= MIN_VENUES);
  return (strong.length >= 3 ? strong : all).slice(0, take);
}

export function readSkew(q: { age?: Record<string, number>; gender?: Record<string, number> } | undefined): Skew | undefined {
  if (!q?.age && !q?.gender) return undefined;
  const round = (o: Record<string, number> = {}) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 100) / 100]));
  const age = round(q.age);
  const gender = round(q.gender);
  return { age, gender, clear: [...Object.values(age), ...Object.values(gender)].some((v) => Math.abs(v) >= SKEW_CLEAR) };
}

/** Two calls, in parallel. Never throws. */
export async function crowdDetails(qloo: QlooClient, crowd: Crowd, opts: { priority?: Priority } = {}): Promise<CrowdDetails> {
  const ids = crowd.signal.map((s) => s.id);
  const callIds: string[] = [];
  const settle = async <T,>(p: Promise<T & { call: { id: string } }>) => {
    const r = await p.catch(() => undefined);
    if (r) callIds.push(r.call.id);
    return r;
  };
  const [demo, places] = await Promise.all([
    settle(qloo.insights({ "filter.type": "urn:demographics", "signal.interests.entities": ids }, opts)),
    settle(
      qloo.insights(
        {
          "filter.type": "urn:entity:place",
          "signal.interests.entities": ids,
          "filter.tags": EVERYDAY_VENUES,
          "operator.filter.tags": "union",
          "diversify.by": "properties.geocode.metro",
          "diversify.take": 3,
          "filter.geocode.country_code": "US",
          take: 50,
        },
        opts,
      ),
    ),
  ]);
  return {
    skew: readSkew(demo?.results.demographics?.[0]?.query),
    cities: citiesFrom(places?.results.entities ?? []),
    calls: callIds.length,
    callIds,
  };
}

/** The always-valid name: "The Great Jones crowd". The agent may write a better one from the crowd's own words (§9.23 step 5). */
export function fallbackName(crowd: Crowd): string {
  const lead = crowd.entities.find((n) => n.domain === "brand") ?? crowd.entities[0];
  if (!lead) return "This crowd";
  return /^the\s/i.test(lead.name) ? `${lead.name} crowd` : `The ${lead.name} crowd`;
}

const STOP = new Set(["the", "and", "of", "a", "an", "crowd", "fans", "people", "lovers", "set", "with", "for", "who", "love", "&"]);

/**
 * The name validator (§9.23 step 5): every content word must come from the crowd's own entity names or Qloo tags,
 * so a name can never claim a taste Qloo didn't show. Prefix matching lets "comedies" match "comedy".
 */
export function validName(name: string, crowd: Crowd): boolean {
  const vocab = crowd.entities.flatMap((n) => [n.name, ...n.tags]).join(" ").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length || words.length > 5) return false;
  return words.every((w) => vocab.some((v) => v.startsWith(w.slice(0, Math.max(4, w.length - 2))) || w.startsWith(v.slice(0, Math.max(4, v.length - 2)))));
}
