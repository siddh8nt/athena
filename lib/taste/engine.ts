import "server-only";
import { getQloo } from "@/lib/qloo";
import { getStore } from "@/lib/store";
import { buildSeed, type SeedInput } from "@/lib/taste/seed";
import { DOMAINS, buildGraph, extendGraph, seedSignal, shortName, type Crowd, type Domain, type GraphState, type TasteGraph } from "@/lib/taste/graph";
import type { QlooClient } from "@/lib/qloo/client";
import { crowdDetails } from "@/lib/taste/crowds";
import { nameAxes, nameCards, nameCrowds } from "@/lib/taste/name";
import { tasteAxes } from "@/lib/taste/axes";
import { STAND_IN, crowdBridges } from "@/lib/taste/bridges";
import type { CrowdCard, CrowdMeeting, CrowdsResult, Love, TasteAxisCard } from "@/lib/journey/types";
import type { Galaxy } from "@/lib/taste/graph";

// The Crowd engine (PRD §9.23): product → seed → taste graph → crowds with skew, cities and names. Used by the
// Crowd stop (/api/crowds) and by the agent's build_taste_graph and probe tools (§23.2 step 2). Results and their
// graphs are cached per seed for 7 days, so a repeat brand is instant. Limits are the caller's job.

export const TTL = 7 * 24 * 3600_000;

const KIND: Record<Domain, Love["kind"]> = { brand: "brand", artist: "artist", tv_show: "TV", movie: "film", podcast: "podcast", book: "book" };

/**
 * Loves across domains, interleaved so a card shows brands, music, TV, film, podcasts and books, not ten brands. Within a
 * domain: the crowd's core members (placed more surely than shuffled data allows), most specific first (E3).
 */
export function lovesOf(c: Crowd, n = 9): Love[] {
  const by = DOMAINS.map((d) => {
    const all = c.entities.filter((e) => e.domain === d);
    const central = all.filter((e) => e.core ?? true);
    return (central.length >= 2 ? central : all).sort((a, b) => (b.specificity ?? 0) - (a.specificity ?? 0));
  });
  const out: Love[] = [];
  for (let i = 0; out.length < n && i < 10; i++) for (const list of by) if (list[i] && out.length < n) out.push({ name: shortName(list[i].name, list[i].domain), kind: KIND[list[i].domain] });
  return out;
}

/** The measured graph behind a result, kept so click to probe adds one landmark instead of re-measuring (§13.11). */
export type SavedGraph = { state: GraphState; seed: CrowdsResult["seed"]; seedCallIds: string[] };

/** Seed → taste graph → crowd cards; the result and its graph are stored for a week. */
export async function measure(qloo: QlooClient, input: SeedInput, base: string, status: (t: string) => void, graphEvent: (g: Galaxy) => void): Promise<{ result: CrowdsResult; saved?: SavedGraph }> {
  status(input.brand ? `Reading ${input.brand.name}'s crowd in Qloo` : "Finding brands like yours in Qloo");
  const seed = await buildSeed(qloo, input);
  const graph = await buildGraph(qloo, seed, { onStep: status, onRound: graphEvent });
  // Report only the tags the graph actually used (they join the signal only when brands are scarce).
  const used = new Set(seedSignal(seed).tags);
  seed.tags = seed.tags.filter((t) => used.has(t.id));
  const seedOut = { brand: seed.brand, lookalikes: seed.lookalikes, tags: seed.tags, missing: seed.missing };
  const result = await resultOf(qloo, graph, seedOut, seed.callIds, status);
  const saved: SavedGraph | undefined = graph.state ? { state: graph.state, seed: seedOut, seedCallIds: seed.callIds } : undefined;
  if (result.crowds.length) {
    await getStore().set("crowds", base, result, TTL).catch(() => undefined);
    if (saved) await getStore().set<SavedGraph>("graph", base, saved, TTL).catch(() => undefined);
  }
  return { result, saved };
}

/** Each crowd's card: its skew and cities (2 calls each) and its name after two things it loves (the agent, checked; §23.8 a). */
export async function resultOf(qloo: QlooClient, graph: TasteGraph, seed: CrowdsResult["seed"], seedCallIds: string[], status: (t: string) => void): Promise<CrowdsResult> {
  if (!graph.crowds.length) return { seed, crowds: [], calls: seedCallIds.length + graph.calls, callIds: [...seedCallIds, ...graph.callIds], empty: true };
  const held = graph.crowds.filter((c) => !c.nearMiss).length;
  const near = held < graph.crowds.length ? " and a group next to them" : "";
  status(held > 1 ? `Found ${held} distinct crowds${near}; checking where each one lives` : `Checking where this crowd${near} lives`);
  const [details, names, axes] = await Promise.all([Promise.all(graph.crowds.map((c) => crowdDetails(qloo, c, { priority: c.main ? "now" : "next" }))), nameCrowds(graph.crowds), graph.state ? axesOf(graph.state) : undefined]);
  const crowds: CrowdCard[] = graph.crowds.map((c, i) => ({
    id: c.id,
    ...names[i],
    main: c.main,
    loves: lovesOf(c),
    signal: c.signal,
    brands: c.brands,
    skew: details[i].skew,
    cities: details[i].cities,
    size: c.entities.length,
    stability: c.stability,
    core: c.core,
    ...(c.nearMiss ? { nearMiss: true, members: c.entities.map((e) => e.id) } : {}),
  }));
  const callIds = [...seedCallIds, ...graph.callIds, ...details.flatMap((d) => d.callIds)];
  const meetings = graph.state ? meetingsOf(graph.state, graph.crowds.map((c) => ({ id: c.id, main: c.main, nearMiss: c.nearMiss, members: new Set(c.entities.map((e) => e.id)) }))) : undefined;
  return { seed, crowds, calls: callIds.length, callIds, galaxy: graph.galaxy, probes: graph.state?.extra.length ? graph.state.extra : undefined, ...(axes ? { axes } : {}), ...(meetings ? { meetings } : {}) };
}

// "v4.2": results from the probe-based graph (§9.23, v4.0) carry the Galaxy with null-calibrated cores and each
// crowd's brand members (for Markets); older ones don't. "v4.3": with fewer than three crowds, Watch holds the
// near-miss group (§23.5 c).
export const baseKey = (input: SeedInput) => `v4.3|${JSON.stringify([input.brand?.id ?? "", [...input.comparables].sort(), [...input.lookalikes].sort(), [...input.traits].sort()]).toLowerCase()}`;

type Extras = { axes?: TasteAxisCard[]; meetings?: CrowdMeeting[] };

export const probeKey = (base: string, probes: string[]) => (probes.length ? `${base}|probe:${probes.join(",")}` : base);

/**
 * Axes and crowd meetings for a result cached before them (§9.27, §9.28): the stored graph is read once (no Qloo
 * calls) and the cached result keeps them. Members come from the cached Galaxy. A probed result from before its graph
 * was kept is re-probed once on the stored graph (Qloo's answers are cached, so usually free); its cards don't change.
 * Undefined when nothing is stored for this seed.
 */
export async function storedExtras(base: string, probes: string[] = []): Promise<Extras | undefined> {
  const store = getStore();
  const key = probeKey(base, probes);
  const hit = (await store.get<CrowdsResult>("crowds", key).catch(() => undefined))?.value;
  if (hit?.axes && hit.meetings) return { axes: hit.axes, meetings: hit.meetings };
  const saved = (await store.get<SavedGraph>("graph", key).catch(() => undefined))?.value ?? (probes.length && hit?.crowds?.length ? await reprobed(base, key, probes) : undefined);
  if (!saved) return undefined;
  const axes = hit?.axes ?? (await axesOf(saved.state));
  const meetings = hit?.crowds?.length ? meetingsOf(saved.state, hit.crowds.map((c, i) => ({ id: c.id, main: c.main, nearMiss: c.nearMiss, members: membersOf(hit, c, i) }))) : undefined;
  // An empty list marks meetings as read, so a seed whose crowds don't meet isn't read again.
  const extras: Extras = { ...(axes ? { axes } : {}), meetings: meetings ?? [] };
  if (axes && hit?.crowds?.length) await store.set("crowds", key, { ...hit, ...extras }, TTL).catch(() => undefined);
  return extras;
}

/** The probed graph behind an older probed result: the stored base graph extended with the same probes, then kept. */
async function reprobed(base: string, key: string, probes: string[]): Promise<SavedGraph | undefined> {
  const store = getStore();
  const saved = (await store.get<SavedGraph>("graph", base).catch(() => undefined))?.value;
  if (!saved) return undefined;
  const graph = await extendGraph(getQloo(), saved.state, probes, { priority: "next" }).catch(() => undefined);
  if (!graph?.state) return undefined;
  const out = { ...saved, state: graph.state };
  await store.set<SavedGraph>("graph", key, out, TTL).catch(() => undefined);
  return out;
}

/** A cached crowd's members: its Galaxy nodes (crowd index i is card i), else the signal and brands its card holds. */
function membersOf(hit: CrowdsResult, c: CrowdCard, i: number): Set<string> {
  if (c.members?.length) return new Set(c.members);
  const nodes = hit.galaxy?.nodes.filter((n) => n.crowd === i).map((n) => n.id);
  return new Set(nodes?.length ? nodes : [...c.signal, ...(c.brands ?? [])].map((r) => r.id));
}

/**
 * Where the main crowd meets each other crowd (§9.28): the entities both love, from U (no Qloo calls). The near-miss
 * group (§23.5 c) is met from every measured crowd, each read without the near-miss members it also holds.
 */
export function meetingsOf(state: GraphState, crowds: { id: string; main: boolean; nearMiss?: boolean; members: Set<string> }[]): CrowdMeeting[] {
  const main = crowds.find((c) => c.main);
  if (!main) return [];
  const measured = crowds.filter((c) => !c.nearMiss);
  return crowds.filter((c) => c !== main).flatMap((c) => {
    const from = c.nearMiss ? measured : [main];
    return from.flatMap((m) => {
      const own = c.nearMiss ? new Set([...m.members].filter((id) => !c.members.has(id))) : m.members;
      const items = crowdBridges(state, own, c.members, c.nearMiss ? { stand: STAND_IN } : {});
      return items.length ? [{ a: m.id, b: c.id, items }] : [];
    });
  });
}

/** The graph's taste axes (§9.27): a factorisation of the measured matrix (no Qloo calls), named by the agent. */
export async function axesOf(state: GraphState): Promise<TasteAxisCard[] | undefined> {
  const out = tasteAxes(state.U, state.nodes);
  if (!out) return undefined;
  const names = await nameAxes(out.axes);
  return out.axes.map((a, i) => ({
    id: `axis-${i + 1}`,
    ...names[i],
    top: a.top.slice(0, 6).map((n) => ({ id: n.id, name: n.name })),
    // Only loads that move a weight are sent; anything under 0.05 is treated as 0.
    load: Object.fromEntries([...a.load].filter(([, x]) => x >= 0.05)),
  }));
}

/** A cached result for this seed and probes, with axes and meetings filled in when they were missing. */
export async function cachedCrowds(input: SeedInput, probes: string[] = []): Promise<CrowdsResult | undefined> {
  const base = baseKey(input);
  const hit = (await getStore().get<CrowdsResult>("crowds", probeKey(base, probes)).catch(() => undefined))?.value;
  if (!hit?.crowds?.length) return undefined;
  const named = await renamed(hit, probeKey(base, probes));
  if (named.axes && named.meetings) return named;
  const extras = await storedExtras(base, probes);
  return extras ? { ...named, ...extras } : named;
}

/** A result cached before §23.8 gets its crowds named after what they love, once (one Flash Lite call, no Qloo calls). */
async function renamed(hit: CrowdsResult, key: string): Promise<CrowdsResult> {
  if (hit.crowds.every((c) => c.after)) return hit;
  const names = await nameCards(hit.crowds);
  const out = { ...hit, crowds: hit.crowds.map((c, i) => ({ ...c, ...names[i] })) };
  await getStore().set("crowds", key, out, TTL).catch(() => undefined);
  return out;
}

type Latest = { seed: SeedInput; probes: string[] };

/** Marks a brand's newest crowds, so a request carrying an older seed or probes still finds them. */
export async function rememberCrowds(brand: string, seed: SeedInput, probes: string[]): Promise<void> {
  if (brand) await getStore().set<Latest>("crowds-latest", brand.toLowerCase(), { seed, probes }, TTL).catch(() => undefined);
}

/** A brand's newest crowds, with the seed and probes they were measured from. */
export async function latestCrowds(brand: string): Promise<(Latest & { crowds: CrowdsResult }) | undefined> {
  if (!brand) return undefined;
  const at = (await getStore().get<Latest>("crowds-latest", brand.toLowerCase()).catch(() => undefined))?.value;
  const crowds = at && (await cachedCrowds(at.seed, at.probes));
  return at && crowds ? { ...at, crowds } : undefined;
}

/** The stored graph for a seed (and probes), when one was kept. */
export async function savedGraph(input: SeedInput, probes: string[] = []): Promise<SavedGraph | undefined> {
  return (await getStore().get<SavedGraph>("graph", probeKey(baseKey(input), probes)).catch(() => undefined))?.value;
}

/**
 * Click to probe (§13.11): the probed entities join the stored graph as landmarks (about 6 calls each). Measures the
 * base graph first when none was kept. The probed graph and result are kept too.
 */
export async function probeCrowds(qloo: QlooClient, input: SeedInput, probes: string[], status: (t: string) => void, graphEvent: (g: Galaxy) => void = () => undefined): Promise<CrowdsResult | undefined> {
  const base = baseKey(input);
  const saved = (await savedGraph(input)) ?? (await measure(qloo, input, base, status, () => undefined)).saved;
  if (!saved) return undefined;
  const graph = await extendGraph(qloo, saved.state, probes, { onStep: status });
  if (graph.galaxy) graphEvent(graph.galaxy);
  // The probed graph is kept too, so its axes and meetings can be read again without probing.
  if (graph.state) await getStore().set<SavedGraph>("graph", probeKey(base, probes), { ...saved, state: graph.state }, TTL).catch(() => undefined);
  const result = await resultOf(qloo, graph, saved.seed, saved.seedCallIds, status);
  if (result.crowds.length) await getStore().set("crowds", probeKey(base, probes), result, TTL).catch(() => undefined);
  return result;
}
