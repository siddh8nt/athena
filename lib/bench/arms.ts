import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generate, llmConfig, parseJson } from "@/lib/llm/vertex";
import { agentTurn } from "@/lib/brief/agent";
import { emptyBrief } from "@/lib/brief/types";
import { classifyBusiness } from "@/lib/agent/intake";
import { CATEGORIES, buildPlaybook, type CategoryId, type Motion, type Tier } from "@/lib/playbook/config";
import { METROS, metroById, metroIdFor } from "@/lib/playbook/metros";
import { markets } from "@/lib/blocks/markets";
import { RETAILER_POOLS, nextRetailers, retailCategory, type RetailCategory } from "@/lib/stops/retailers";
import { resolveBrand, resolveVenue } from "@/lib/methods/resolve";
import { cleanVenue, isChainName, nameSim } from "@/lib/methods/names";
import { buildSeed } from "@/lib/taste/seed";
import { buildGraph, seedSignal, type Ref, type Seed } from "@/lib/taste/graph";
import type { QlooClient } from "@/lib/qloo/client";
import type { QlooEntity } from "@/lib/qloo/types";
import { rng } from "@/lib/taste/linalg";
import { rankByScore, toRanking, type Ranking } from "./metrics";
import { independentsByMetro, rankingCheckMetros, stockedRetailers, type StockistRow } from "./truth";

// Taste Bench arms (PRD §10.6). Each arm turns the same inputs into a ranking of the same candidates; the runner
// (tests/live/bench.live.ts) scores them. Athena's arms call the stops exactly as built. Every LLM output and every
// Qloo-derived pool is kept in .cache/bench (git-ignored), so a rerun replays rather than re-spends.

export const BENCH_SEED = 16_10_2026;
export const CACHE = path.join(process.cwd(), ".cache", "bench");

export type Condition = "cold" | "known";
export type Task = "t1" | "t2" | "t3";

/** FNV-1a: one registered way to turn a label into a seed for rng(). */
export function seedOf(label: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0;
  return (h ^ BENCH_SEED) >>> 0;
}

/** Fisher–Yates with the seeded generator; never changes the input. */
export function shuffled<T>(xs: readonly T[], label: string): T[] {
  const out = [...xs];
  const rand = rng(seedOf(label));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Replays .cache/bench/<file> when it exists and `valid` accepts it; otherwise makes and stores it. */
function cached<T>(file: string, make: () => Promise<T>, valid: (v: T) => boolean = () => true): Promise<T> {
  const p = path.join(CACHE, file);
  const hit = existsSync(p) ? (JSON.parse(readFileSync(p, "utf-8")) as T) : undefined;
  if (hit !== undefined && valid(hit)) return Promise.resolve(hit);
  return make().then((v) => {
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(v, null, 1));
    return v;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// The brand profile: read once per brand from its registered description, reused by every arm in both conditions.

export type Profile = {
  description: string;
  sells?: string;
  traits: string[];
  lookalikes: string[];
  /** As the brief agent read it; undefined means Next retailers falls back to the product's words, as built. */
  retail?: RetailCategory;
  tier: Tier;
  category: CategoryId;
  motions: Motion[];
  /** The classifier said out of scope or didn't answer, so the default category stands in. */
  categoryFallback?: boolean;
  recordedAt: string;
};

/** The cold-start profile: the brief agent and the classifier read the description, with no name and no web research. */
export function profileOf(slug: string, description: string): Promise<Profile> {
  return cached(`profile/${slug}.json`, async () => {
    const turn = await agentTurn(emptyBrief(), [], description, []);
    const p = turn.patch;
    const cls = await classifyBusiness({ name: "a new brand (name withheld)", description, qlooTags: [], accountTypes: [], needComparables: false });
    const ok = !!cls && cls.category !== "out_of_scope" && CATEGORIES[cls.category].status !== "out_of_scope";
    const category = ok ? (cls!.category as CategoryId) : "G1";
    return {
      description,
      sells: p.sells?.value,
      traits: p.traits ?? [],
      lookalikes: p.proxies ?? [],
      retail: p.retail,
      // Precedence as built (§7.2): the founder's tier hint, then the classifier's.
      tier: p.tierHint?.value ?? cls?.tier ?? "mainstream",
      category,
      motions: cls?.motions.length ? cls.motions : CATEGORIES[category].motions,
      categoryFallback: ok ? undefined : true,
      recordedAt: new Date().toISOString(),
    };
  });
}

export const productOf = (p: Profile) => [p.sells, ...p.traits].filter(Boolean).join(", ");
export const retailOf = (p: Profile): RetailCategory => p.retail ?? retailCategory(productOf(p));

// ---------------------------------------------------------------------------------------------------------------
// The taste engine (§9.23): seed → graph → the main crowd, as the Crowd stop builds it.

export type Engine = {
  seed: Seed & { missing: string[] };
  /** The main crowd's signal (what every stop sends when the founder keeps Athena's choice). */
  signal: string[];
  /** The main crowd's brand members, strongest first (what Markets scores cities on, §9.3 v4.0). */
  brands: string[];
  crowds: number;
  /** No crowd formed: the seed's lookalikes stand in as comparables. */
  fallback: boolean;
  brandId?: string;
  tierEvidence?: Tier;
};

/** Known condition only: the brand's own Qloo entity, by exact name (as "Is this you?" accepts it). */
export async function brandRef(qloo: QlooClient, name: string): Promise<{ ref?: Ref; priceTier?: number }> {
  const r = await resolveBrand(qloo, name).catch(() => undefined);
  return r?.entity ? { ref: { id: r.entity.entity_id, name: r.entity.name }, priceTier: r.entity.properties?.price_tier } : {};
}

export async function engineOf(qloo: QlooClient, profile: Profile, brand?: { ref?: Ref; priceTier?: number }, onStep?: (s: string) => void): Promise<Engine> {
  const seed = await buildSeed(qloo, { brand: brand?.ref, comparables: [], lookalikes: profile.lookalikes, traits: profile.traits });
  const graph = await buildGraph(qloo, seed, { onStep });
  const main = graph.crowds.find((c) => c.main) ?? graph.crowds[0];
  const tiers: Tier[] = ["mass", "mainstream", "premium", "luxury"];
  return {
    seed: { brand: seed.brand, lookalikes: seed.lookalikes, tags: seed.tags, missing: seed.missing },
    // crowdSignal() with the main crowd chosen and no reactions: its signal, capped at MAX_SIGNAL (24), equal weights.
    signal: main ? main.signal.slice(0, 24).map((s) => s.id) : [],
    brands: main ? main.brands.map((b) => b.id) : [],
    crowds: graph.crowds.length,
    fallback: !main,
    brandId: seed.brand?.id,
    tierEvidence: brand?.priceTier ? tiers[Math.min(3, Math.max(0, brand.priceTier - 1))] : undefined,
  };
}

/** The stops' signal: the main crowd, or with no crowd the seed's lookalikes (and the brand, when known). */
const stopSignal = (e: Engine) => (e.signal.length ? e.signal : [...(e.brandId ? [e.brandId] : []), ...e.seed.lookalikes.map((l) => l.id)]);

// ---------------------------------------------------------------------------------------------------------------
// T1 Where to launch: rank the 25 named metros.

export const METRO_IDS = METROS.map((m) => m.id);

/** Athena: the Markets stop as built (§9.3): the playbook from the profile, the main crowd as the signal, no home metro. */
export async function t1Athena(qloo: QlooClient, profile: Profile, e: Engine): Promise<Ranking> {
  const pb = buildPlaybook({
    brandName: "Bench",
    category: profile.category,
    tier: e.tierEvidence ?? profile.tier,
    motions: profile.motions,
    signal: { accounts: [], wins: [], declines: [], brand: e.brandId, comparables: e.signal.length ? [] : e.seed.lookalikes.map((l) => l.id), tags: [], crowd: e.signal.length ? e.signal : undefined, crowdBrands: e.brands.length ? e.brands : undefined },
    targetMetro: "nyc",
  });
  const r = await markets({ pb, qloo, names: new Map(), emit: () => undefined });
  return toRanking(r.data.metros.map((m) => m.metroId), METRO_IDS);
}

/** Qloo-naive: one places call with the seed as the signal (US only, take 50); metros in order of their first venue. */
export async function t1Naive(qloo: QlooClient, e: Engine): Promise<Ranking> {
  const s = seedSignal(e.seed);
  const res = await qloo.insights({
    "filter.type": "urn:entity:place",
    "signal.interests.entities": s.entities,
    ...(s.tags.length ? { "signal.interests.tags": s.tags } : {}),
    "filter.geocode.country_code": "US",
    take: 50,
  });
  const order = (res.results.entities ?? []).flatMap((v) => (v.properties?.geocode?.metro ? [metroIdFor(v.properties.geocode.metro, v.location ? [v.location.lat, v.location.lon] : undefined)] : []));
  return toRanking(order, METRO_IDS);
}

export const t1Popularity = (population: Map<string, number>): Ranking => rankByScore(METRO_IDS, (id) => population.get(id));

// ---------------------------------------------------------------------------------------------------------------
// T2 Which retailer next: rank the §9.25 list for the profile's retail category.

export type RetailerPool = { category: RetailCategory; candidates: { id: string; name: string; popularity?: number }[]; unresolved: string[]; positives: string[] };

/** The candidates: every retailer on the category's list that Qloo has by exact name (the same check the stop makes). */
export async function retailerPool(qloo: QlooClient, profile: Profile, rows: StockistRow[]): Promise<RetailerPool> {
  const category = retailOf(profile);
  const found = await Promise.all(RETAILER_POOLS[category].map(async (n) => ({ n, e: (await resolveBrand(qloo, n).catch(() => undefined))?.entity })));
  const candidates = found.filter((x) => x.e).map((x) => ({ id: x.e!.entity_id, name: x.n, popularity: x.e!.popularity }));
  const stocked = stockedRetailers(rows, candidates.map((c) => c.name));
  return { category, candidates, unresolved: found.filter((x) => !x.e).map((x) => x.n), positives: candidates.filter((c) => stocked.has(c.name)).map((c) => c.id) };
}

/** Athena: the Next retailers stop as built, under the main crowd, with no evidence (so nothing is hidden as "already in"). */
export async function t2Athena(qloo: QlooClient, profile: Profile, e: Engine, pool: RetailerPool): Promise<Ranking> {
  const r = await nextRetailers(qloo, stopSignal(e), [], productOf(profile), { category: pool.category });
  return toRanking(r.picks.map((p) => p.id), pool.candidates.map((c) => c.id));
}

/** Qloo-naive: the candidates scored in one call under the seed, by affinity. */
export async function t2Naive(qloo: QlooClient, e: Engine, pool: RetailerPool): Promise<Ranking> {
  const s = seedSignal(e.seed);
  const ids = pool.candidates.map((c) => c.id);
  const res = await qloo.insights({
    "filter.type": "urn:entity:brand",
    "signal.interests.entities": s.entities,
    ...(s.tags.length ? { "signal.interests.tags": s.tags } : {}),
    "filter.results.entities": ids.slice(0, 50),
    take: Math.min(50, ids.length),
  });
  return toRanking((res.results.entities ?? []).map((x) => x.entity_id), ids);
}

export const t2Popularity = (pool: RetailerPool): Ranking => rankByScore(pool.candidates.map((c) => c.id), (id) => pool.candidates.find((c) => c.id === id)?.popularity);

// ---------------------------------------------------------------------------------------------------------------
// T3 Which venues: the ranking check (§10.3).

export const T3 = { signalMax: 50, signalRowsTried: 80, stockists: 25, minStockists: 10, decoyTake: 50, radiusKm: 55, popBands: [0.01, 0.05, 0.1, 0.2, 1] } as const;

export type Venue = { id: string; name: string; hood: string; popularity?: number };
export type VenuePool = {
  metroA: string;
  metroB: string;
  eligible: boolean;
  reason?: string;
  signal: Venue[];
  stockists: Venue[];
  decoys: Venue[];
  /** The pool in its registered (shuffled) order. */
  pool: Venue[];
  /** Each stockist's decoy: genre overlap (Jaccard), popularity gap, the band it came from, and whether the kinds match. */
  matches: { stockist: string; jaccard: number; dPop: number; band: number; sameKind: boolean }[];
  /** Metro B's coverage: rows tried, resolved (matched and open) and seen by Insights. */
  tried: { a: number; b: number };
  coverage: { resolved: number; visible: number };
};

const BROAD_GENRES = new Set(["shopping", "restaurant", "tourist_attraction"].map((t) => `urn:tag:genre:place:${t}`));
const genresOf = (e: QlooEntity) => [...new Set((e.tags ?? []).map((t) => t.id ?? t.tag_id ?? "").filter((id) => id.startsWith("urn:tag:genre:place:")))];
const primaryGenre = (e: QlooEntity) => (e.properties?.primary_genre as { id?: string } | undefined)?.id;
const jaccard = (a: string[], b: string[]) => {
  const B = new Set(b);
  const both = a.filter((x) => B.has(x)).length;
  return both / (new Set([...a, ...b]).size || 1);
};
const r3 = (x: number) => Math.round(x * 1000) / 1000;

const venue = (e: QlooEntity): Venue => ({ id: e.entity_id, name: e.name, hood: e.properties?.neighborhood || e.properties?.geocode?.city || "", popularity: e.popularity });
const rowOf = (r: StockistRow) => ({ name: r.venue, address: r.address || undefined, city: r.city || undefined, lat: r.lat, lon: r.lon });

/**
 * Resolve rows in the given order, `batch` at a time, until `want` are matched, open and kept by `keep` (all, unless
 * given). Deterministic for a given order.
 */
async function resolveUntil(qloo: QlooClient, rows: StockistRow[], want: number, keep?: (es: QlooEntity[]) => Promise<QlooEntity[]>, batch = 10): Promise<{ found: QlooEntity[]; tried: number; resolved: number }> {
  const found: QlooEntity[] = [];
  const seen = new Set<string>();
  let tried = 0;
  for (let i = 0; i < rows.length && found.length < want; i += batch) {
    const chunk = rows.slice(i, i + batch);
    tried += chunk.length;
    const fresh: QlooEntity[] = [];
    for (const r of await Promise.all(chunk.map((x) => resolveVenue(qloo, rowOf(x)).catch(() => undefined)))) {
      if (r?.status === "matched" && !r.entity.properties?.is_closed && !seen.has(r.entity.entity_id)) (seen.add(r.entity.entity_id), fresh.push(r.entity));
    }
    found.push(...(keep ? await keep(fresh) : fresh));
  }
  return { found: found.slice(0, want), tried, resolved: seen.size };
}

/**
 * The venues Insights can see: one no-signal call scoped to them (`filter.results.entities`) returns only those it has
 * data for (on 13 Oct, about 3 in 10 resolved Brightland and Fishwife stockists in Los Angeles). Their popularity comes
 * from the same call, so stockists and decoys are measured alike.
 */
async function seenByInsights(qloo: QlooClient, es: QlooEntity[]): Promise<QlooEntity[]> {
  if (!es.length) return [];
  const res = await qloo.insights({ "filter.type": "urn:entity:place", "filter.results.entities": es.map((e) => e.entity_id), take: es.length });
  const pop = new Map((res.results.entities ?? []).map((e) => [e.entity_id, e.popularity ?? 0]));
  return es.filter((e) => pop.has(e.entity_id)).map((e) => ({ ...e, popularity: pop.get(e.entity_id) }));
}

export function venuePool(qloo: QlooClient, slug: string, rows: StockistRow[]): Promise<VenuePool> {
  return cached(`t3/${slug}.json`, async () => {
    const { a, b } = rankingCheckMetros(rows);
    const indep = (m: string) => rows.filter((r) => !r.chain && r.metroId === m);
    // Signal: up to 50 resolved, open independents in metro A, from the first 80 rows in seeded order.
    const sig = await resolveUntil(qloo, shuffled(indep(a), `${slug}|t3|A`).slice(0, T3.signalRowsTried), T3.signalMax);
    // Stockists: the first 25 resolved, open independents in metro B that Insights can see, in seeded order; at least
    // 10. Decoys come from Insights, so a stockist it can't see would lose to every decoy whatever the taste.
    const st = await resolveUntil(qloo, shuffled(indep(b), `${slug}|t3|B`), T3.stockists, (es) => seenByInsights(qloo, es));
    const base = { metroA: a, metroB: b, signal: sig.found.map(venue), stockists: st.found.map(venue), tried: { a: sig.tried, b: st.tried }, coverage: { resolved: st.resolved, visible: st.found.length } };
    if (st.found.length < T3.minStockists || !sig.found.length) {
      return { ...base, eligible: false, reason: `${st.found.length} stockists in metro B seen by Insights (need ${T3.minStockists}); ${sig.found.length} signal venues in metro A`, decoys: [], pool: [], matches: [] };
    }
    // Decoys, matched one to one (registered), so that kind and fame can't tell a stockist from its decoy (the
    // popularity baseline should land near 0.5). For each stockist, in its seeded order: venues within 55 km of metro
    // B's centre of the same kind (Qloo's primary genre for the venue; without one, any of its genre tags other than
    // the broad shopping, restaurant and tourist_attraction) with Qloo popularity within ±0.01 of its own, widened to
    // ±0.05, ±0.10 and ±0.20, each from pages 1–3 of the no-signal ranking; then, at any popularity, pages 1–3 of its
    // kind, of any of its specific genres, of any of its genres, then of any place. Each must be open, independent (not
    // a known chain name, and fewer than 3 places of the same name in a Qloo search), not a signal venue or stockist,
    // not on the brand's list and not already drawn. The pick: the same primary genre first, then the largest overlap
    // of genre tags (Jaccard), then the closest popularity, then the seeded order.
    const metro = metroById(b);
    const listed = rows.filter((r) => r.metroId === b).map((r) => cleanVenue(r.venue));
    const used = new Set([...sig.found, ...st.found].map((e) => e.entity_id));
    const where = { "filter.location": `POINT(${metro.center[1]} ${metro.center[0]})`, "filter.location.radius": T3.radiusKm * 1000 };
    const chains = new Map<string, Promise<boolean>>();
    const isChain = (e: QlooEntity) => {
      const name = cleanVenue(e.name);
      if (!chains.has(name)) chains.set(name, isChainName(e.name) ? Promise.resolve(true) : qloo.search({ query: name, types: "urn:entity:place", take: 20 }).then((r) => r.entities.filter((x) => nameSim(cleanVenue(x.name), name) >= 0.99).length >= 3));
      return chains.get(name)!;
    };
    const decoys: QlooEntity[] = [];
    const matches: VenuePool["matches"] = [];
    for (const [i, s] of st.found.entries()) {
      const g = genresOf(s);
      const kind = primaryGenre(s);
      const specific = g.filter((t) => !BROAD_GENRES.has(t));
      const first = kind ? [kind] : specific.length ? specific : g;
      const wide = [first, specific, g, []].flatMap((tags) => [1, 2, 3].map((page) => ({ band: 1, tags, page })));
      const steps = [...T3.popBands.slice(0, -1).flatMap((band) => [1, 2, 3].map((page) => ({ band, tags: first, page }))), ...wide].filter((x, k, all) => all.findIndex((y) => y.band === x.band && y.page === x.page && y.tags.join() === x.tags.join()) === k);
      const p = s.popularity ?? 0;
      let pick: { e: QlooEntity; sameKind: boolean; jaccard: number; dPop: number; band: number } | undefined;
      for (const { band, tags, page } of steps) {
        const res = await qloo.insights({ "filter.type": "urn:entity:place", ...where, ...(tags.length ? { "filter.tags": tags, "operator.filter.tags": "union" } : {}), "filter.popularity.min": Math.max(0, r3(p - band)), "filter.popularity.max": Math.min(1, r3(p + band)), take: T3.decoyTake, page });
        const ok = (res.results.entities ?? []).filter((e) => !used.has(e.entity_id) && !e.properties?.is_closed && !listed.some((n) => nameSim(cleanVenue(e.name), n) >= 0.85));
        const ranked = shuffled([...ok].sort((x, y) => x.entity_id.localeCompare(y.entity_id)), `${slug}|t3|decoy|${i}`)
          .map((e) => ({ e, sameKind: !kind || primaryGenre(e) === kind, jaccard: jaccard(g, genresOf(e)), dPop: Math.abs((e.popularity ?? 0) - p), band }))
          .sort((x, y) => Number(y.sameKind) - Number(x.sameKind) || y.jaccard - x.jaccard || x.dPop - y.dPop);
        for (const c of ranked) if (!(await isChain(c.e))) {
          pick = c;
          break;
        }
        if (pick) break;
      }
      if (!pick) continue;
      used.add(pick.e.entity_id);
      decoys.push(pick.e);
      matches.push({ stockist: s.entity_id, jaccard: r3(pick.jaccard), dPop: r3(pick.dPop), band: pick.band, sameKind: pick.sameKind });
    }
    if (decoys.length < st.found.length) return { ...base, eligible: false, reason: `${decoys.length} of ${st.found.length} decoys found`, decoys: decoys.map(venue), pool: [], matches };
    const pool = shuffled([...base.stockists, ...decoys.map(venue)], `${slug}|t3|pool`);
    return { ...base, eligible: true, decoys: decoys.map(venue), pool, matches };
  });
}

/** Athena (§10.3 step 3): one call scores the pool under metro A's stockists; unscored members tie last. */
export async function t3Athena(qloo: QlooClient, p: VenuePool): Promise<{ ranking: Ranking; scored: number }> {
  const ids = p.pool.map((v) => v.id);
  const res = await qloo.insights({ "filter.type": "urn:entity:place", "signal.interests.entities": p.signal.map((v) => v.id), "filter.results.entities": ids, take: ids.length });
  const order = (res.results.entities ?? []).map((e) => e.entity_id);
  return { ranking: toRanking(order, ids), scored: order.filter((id) => ids.includes(id)).length };
}

export const t3Popularity = (p: VenuePool): Ranking => rankByScore(p.pool.map((v) => v.id), (id) => p.pool.find((v) => v.id === id)?.popularity);

// ---------------------------------------------------------------------------------------------------------------
// LLM-only: Gemini 3.1 Pro, the same context and candidates, with and without Google Search. Prompts are registered
// verbatim (proof/REGISTRATION.md); candidates are shown in a seeded order that differs per sample.

export const LLM_SAMPLES = 3;
export const LLM_SYSTEM = "You advise consumer brands on where and through whom to grow in the US. Rank every item you are given. Reply with JSON only.";

export type Item = { id: string; label: string };
export type LlmSample = { prompt: string; order: string[]; parsed: number; model: string; queries: string[]; tokens?: number; ms: number; tries: number; text: string };

export function brandLine(cond: Condition, profile: Profile, name: string): string {
  return cond === "cold" ? `The product (the brand's name is withheld): ${profile.description}` : `The brand: ${name}. The product: ${profile.description}`;
}

export function llmPrompt(task: Task, head: string, items: Item[], ctx: { metroA?: string; metroB?: string; signal?: string[] } = {}, search = false): string {
  const list = items.map((x, i) => `${i + 1}. ${x.label}`).join("\n");
  const n = items.length;
  const ask =
    task === "t1"
      ? `Question: in which of these US metro areas will this product find the most independent shops (not chains) to sell it, relative to the metro's population? Rank all ${n} metros, most per resident first.`
      : task === "t2"
        ? `Question: which of these US retailers are most likely to carry this product? Rank all ${n} retailers, most likely first.`
        : `These independent venues in ${ctx.metroA} sell it: ${(ctx.signal ?? []).join("; ")}.\n\nQuestion: which of these ${n} venues in ${ctx.metroB} are most likely to sell it too? Rank all ${n} venues, most likely first.`;
  const noun = task === "t1" ? "metro" : task === "t2" ? "retailer" : "venue";
  const tools = search ? "\n\nYou can use Google Search; use it wherever it helps you rank." : "";
  return `${head}\n\n${ask}\n\n${list}${tools}\n\nReturn JSON: {"ranking": [the number of every ${noun} above, best first]}`;
}

/** One sample. Retries (up to 3 tries) when Pro was busy and the call fell back to Flash; the model that answered is recorded. */
export function llmSample(key: string, task: Task, head: string, items: Item[], grounding: boolean, sample: number, ctx: Parameters<typeof llmPrompt>[3] = {}): Promise<LlmSample> {
  const shown = shuffled(items, `${key}|${task}|${grounding}|${sample}`);
  const prompt = llmPrompt(task, head, shown, ctx, grounding);
  // A sample is replayed only for the exact prompt it answered (a changed pool or wording asks again).
  return cached(`llm/${key}-${task}-${grounding ? "search" : "plain"}-${sample}.json`, async () => {
    let last: LlmSample | undefined;
    for (let tries = 1; tries <= 3; tries++) {
      const res = await generate({ model: "pro", system: LLM_SYSTEM, prompt, grounding, json: true, dated: false, maxOutputTokens: 32_768, budgetMs: 300_000 }).catch((err: Error) => ({ text: "", model: `error: ${err.message.slice(0, 120)}`, queries: [] as string[], tokens: undefined, ms: 0 }));
      const j = parseJson<{ ranking?: unknown[] }>(res.text);
      const order = (Array.isArray(j?.ranking) ? j.ranking : []).map((x) => shown[Number(x) - 1]?.id).filter((x): x is string => !!x);
      last = { prompt, order: [...new Set(order)], parsed: new Set(order).size, model: res.model, queries: res.queries, tokens: res.tokens, ms: res.ms, tries, text: res.text };
      if (res.model === llmConfig().pro && last.parsed) break;
      await new Promise((r) => setTimeout(r, 20_000 * tries));
    }
    return last!;
  }, (v) => (v.prompt ?? legacy(prompt, grounding)) === prompt);
}

/** Samples stored before prompts were recorded (13 Oct, tuning only) replay only for the plain variant's unchanged wording. */
const legacy = (prompt: string, grounding: boolean) => (grounding ? "" : prompt);

export async function llmArm(key: string, task: Task, head: string, items: Item[], grounding: boolean, ctx: Parameters<typeof llmPrompt>[3] = {}): Promise<{ rankings: Ranking[]; samples: LlmSample[] }> {
  const samples = await Promise.all(Array.from({ length: LLM_SAMPLES }, (_, s) => llmSample(key, task, head, items, grounding, s + 1, ctx)));
  return { rankings: samples.map((s) => toRanking(s.order, items.map((x) => x.id))), samples };
}

// ---------------------------------------------------------------------------------------------------------------
// Eligibility (registered): T1 needs independents in ≥ 10 of the 25 metros; T2 at least one stocked and one unstocked
// candidate; T3 25 resolved stockists in metro B and at least one signal venue in metro A.

export const metrosCovered = (rows: StockistRow[]) => [...independentsByMetro(rows).values()].filter((n) => n > 0).length;
