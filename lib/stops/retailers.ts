import type { Priority, QlooClient } from "@/lib/qloo/client";
import type { QlooEntity } from "@/lib/qloo/types";
import { resolveBrand } from "@/lib/methods/resolve";
import { norm } from "@/lib/methods/names";

// Next retailers: the retail step-up (PRD §9.25). Independent stores are where young brands start, not where they
// stop. Qloo ranks bigger retailers by how much the brand's crowd loves them: a fixed pool of US retailers, each
// match-checked, plus Qloo's own retail-genre picks, scored in one call under the crowd's signal.

export type RetailCategory = "food" | "beauty" | "home" | "fashion" | "general";

/**
 * US retailers per category, resolved once in Qloo and cached forever. Category matters: on 10 Oct a tinned-fish
 * brand's lifestyle crowd ranked Goop, Madewell and Rent the Runway first when every retailer was in one pool.
 */
const MASS = ["Target", "Walmart", "Costco", "Kroger"];
export const RETAILER_POOLS: Record<RetailCategory, string[]> = {
  food: [
    "Whole Foods Market", "Erewhon", "Sprouts Farmers Market", "Trader Joe's", "Eataly", "Central Market", "Wegmans", "The Fresh Market", "Gelson's",
    "Bristol Farms", "New Seasons Market", "Natural Grocers", "Publix", "H-E-B", "Safeway", "Aldi", "Ralphs", "Harris Teeter", "Albertsons", "Foxtrot",
    "Williams-Sonoma", "Sur La Table", "Thrive Market", "H Mart", ...MASS,
  ],
  beauty: ["Sephora", "Ulta Beauty", "Credo Beauty", "Goop", "CVS", "Walgreens", "Nordstrom", "Anthropologie", "Free People", "Urban Outfitters", "Erewhon", "Whole Foods Market", ...MASS],
  home: ["West Elm", "Crate & Barrel", "Anthropologie", "Williams-Sonoma", "Sur La Table", "Nordstrom", "Goop", "Urban Outfitters", "Free People", "CB2", "Pottery Barn", ...MASS],
  fashion: ["Nordstrom", "Madewell", "Free People", "Urban Outfitters", "Anthropologie", "REI", "Revolve", "Bloomingdale's", "Saks Fifth Avenue", ...MASS],
  general: [],
};
RETAILER_POOLS.general = [...new Set(Object.values(RETAILER_POOLS).flat())];

/** Qloo's own retail picks are kept only when their genres don't say they're another category (§9.25). */
const OFF_CATEGORY: Record<RetailCategory, RegExp | undefined> = {
  food: /:genre:brand:(fashion|health_and_beauty|electronics|automotive|sports)/,
  beauty: /:genre:brand:(food_and_beverage|electronics|automotive|wine_and_spirits)/,
  home: /:genre:brand:(food_and_beverage|electronics|automotive|wine_and_spirits)/,
  fashion: /:genre:brand:(food_and_beverage|electronics|automotive|wine_and_spirits|health_and_beauty)/,
  general: undefined,
};

/** The product's retail category, from what it is and its traits. */
export function retailCategory(product: string): RetailCategory {
  const p = product.toLowerCase();
  if (/\b(food|snack|drink|beverage|coffee|tea|olive oil|oil|fish|seafood|sauce|chocolate|pantry|soda|water|candy|spice|condiment|grocery|tinned|canned|cereal|bar|jerky|pasta|honey|wine|kombucha)/.test(p)) return "food";
  if (/\b(skin|beauty|cosmetic|makeup|hair|acne|patch|serum|deodorant|soap|fragrance|perfume|lip|nail|sunscreen)/.test(p)) return "beauty";
  if (/\b(candle|home|decor|cookware|kitchen|bedding|furniture|towel|linen|ceramic|vase|rug|lamp)/.test(p)) return "home";
  if (/\b(apparel|clothing|shoe|sneaker|jewel|bag|fashion|denim|dress|socks|underwear|lingerie|swim)/.test(p)) return "fashion";
  return "general";
}

/** Mostly sell their own label: shown last, with a note (§9.25). */
export const OWN_LABEL = new Set(["trader joe s", "aldi"]);

export type RetailerPick = { id: string; name: string; affinity: number; rank: number; ownLabel: boolean; qlooPick: boolean; callId: string };
export type RetailersData = { picks: RetailerPick[]; already: string[]; calls: number; callIds: string[] };

/** Is this retailer one the brand is already in? Matched against its store list, files and how it says it's sold. */
export function alreadyIn(name: string, evidence: string[]): boolean {
  const n = norm(name).replace(/\b(market|markets|farmers|stores?|the)\b/g, "").trim();
  if (n.length < 3) return false;
  return evidence.some((e) => ` ${norm(e)} `.includes(` ${n} `) || norm(e).replace(/\b(market|markets|farmers|stores?|the)\b/g, "").trim() === n);
}

/** Never throws. Calls: 2, plus first-time resolution of the pool (cached forever after). */
export async function nextRetailers(qloo: QlooClient, signal: string[], evidence: string[], product: string, opts: { priority?: Priority } = {}): Promise<RetailersData & { category: RetailCategory }> {
  const callIds: string[] = [];
  const category = retailCategory(product);
  const off = OFF_CATEGORY[category];
  const resolved = (
    await Promise.all(
      RETAILER_POOLS[category].map(async (n) => {
        const r = await resolveBrand(qloo, n).catch(() => undefined);
        if (r) callIds.push(r.callId);
        return r?.entity; // resolveBrand accepts only an exact name match (10 Oct: "Murray's Cheese" came back as Philadelphia cream cheese)
      }),
    )
  ).filter((e): e is QlooEntity => !!e);
  const genre = category === "general" ? await qloo.insights({ "filter.type": "urn:entity:brand", "signal.interests.entities": signal, "filter.tags": "urn:tag:genre:brand:retail", take: 15 }, opts).catch(() => undefined) : undefined;
  if (genre) callIds.push(genre.call.id);
  // Qloo's own retail picks join only when the category is unknown: their genre tags are too coarse to tell a grocer
  // from a clothing site (10 Oct: H Mart and Rent the Runway both carry only "retail"), so for a food brand they
  // pushed West Elm and Thredup above every grocer.
  const fits = (e: QlooEntity) => category === "general" && (!off || !(e.tags ?? []).some((t) => off.test(t.id ?? t.tag_id ?? "")));
  const qlooOwn = (genre?.results.entities ?? []).filter(fits);
  const qlooPicks = new Set(qlooOwn.map((e) => e.entity_id));
  const pool = [...new Map([...resolved, ...qlooOwn].map((e) => [e.entity_id, e])).values()].slice(0, 50);
  if (!pool.length || !signal.length) return { picks: [], already: [], calls: callIds.length, callIds, category };
  const scored = await qloo.insights({ "filter.type": "urn:entity:brand", "signal.interests.entities": signal, "filter.results.entities": pool.map((e) => e.entity_id), take: pool.length }, opts).catch(() => undefined);
  if (scored) callIds.push(scored.call.id);
  const already: string[] = [];
  const picks: RetailerPick[] = [];
  for (const e of scored?.results.entities ?? []) {
    if (alreadyIn(e.name, evidence)) {
      already.push(e.name);
      continue;
    }
    picks.push({ id: e.entity_id, name: e.name, affinity: Math.round((e.query?.affinity ?? 0) * 1000) / 1000, rank: 0, ownLabel: OWN_LABEL.has(norm(e.name)), qlooPick: qlooPicks.has(e.entity_id), callId: scored!.call.id });
  }
  // Own-label retailers go last; the rest keep Qloo's order.
  const ordered = [...picks.filter((p) => !p.ownLabel), ...picks.filter((p) => p.ownLabel)].map((p, i) => ({ ...p, rank: i + 1 }));
  return { picks: ordered, already, calls: callIds.length, callIds, category };
}
