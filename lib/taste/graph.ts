import type { Priority, QlooClient } from "@/lib/qloo/client";
import type { QlooEntity } from "@/lib/qloo/types";
import { isChainName } from "@/lib/methods/names";
import { centerColumns, crowdRules, knnGraph, louvain, rankScale } from "./cluster";

// The taste graph (PRD §9.23 steps 2–6). From a seed (the brand, or lookalike brands and product tags), Qloo's
// cross-domain affinities give a ring of what the crowd loves; scoring that ring under a few "hub" entities gives
// each entity a taste vector; Louvain on those vectors splits the crowd into 2–3 crowds. Every number comes from Qloo.

export type Domain = "brand" | "artist" | "tv_show";
export const DOMAINS: Domain[] = ["brand", "artist", "tv_show"];

export type Ref = { id: string; name: string };
export type Seed = {
  /** The brand itself, when Qloo knows it. */
  brand?: Ref;
  /** 3–5 lookalike brands found in Qloo (§9.23 step 1). */
  lookalikes: Ref[];
  /** Qloo tag URNs chosen from tag search for the product's traits. */
  tags: Ref[];
};

export type Node = Ref & { domain: Domain; affinity: number; popularity?: number; tags: string[] };

export type Crowd = {
  id: string;
  /** The crowd closest to the seed; the others are adjacent (§9.23 step 6). */
  main: boolean;
  /** Members, strongest first (by the seed's own affinity). */
  entities: Node[];
  /** The crowd's signal for later stops: its top members across domains. */
  signal: Ref[];
  domains: Domain[];
};

export type TasteGraph = {
  seed: Seed;
  nodes: Node[];
  hubs: Ref[];
  crowds: Crowd[];
  calls: number;
  callIds: string[];
};

export const RING_TAKE = 20;
/** Hubs are taken across the ranking, not just the top, so they don't all sit in the main crowd. */
const HUB_POSITIONS: Record<Domain, number[]> = { brand: [0, 3, 7], artist: [0, 3, 7], tv_show: [0, 4] };
export const GRAPH_BUDGET = 40;

/**
 * The seed as a Qloo signal. Tags join only when there are fewer than 2 entities: brands carry taste better than
 * tags (8 Oct), and tags made each call about 3× slower (10 Oct: 3.4 s → 10 s).
 */
export function seedSignal(seed: Seed): { entities: string[]; tags: string[] } {
  const entities = [...new Set(seed.brand ? [seed.brand.id, ...seed.lookalikes.slice(0, 2).map((l) => l.id)] : seed.lookalikes.slice(0, 4).map((l) => l.id))];
  return { entities, tags: entities.length < 2 ? seed.tags.map((t) => t.id).slice(0, 2) : [] };
}

/** A slow first-ring call gives up after this; the graph goes on with the domains that answered (the call still finishes and caches). */
export const RING_TIMEOUT_MS = 15_000;

export type GraphOptions = { priority?: Priority; budget?: number; onStep?: (text: string) => void };

/** Never throws: a graph Qloo can't fill comes back with one crowd or none, and the journey carries on. */
export async function buildGraph(qloo: QlooClient, seed: Seed, opts: GraphOptions = {}): Promise<TasteGraph> {
  const priority = opts.priority ?? "now";
  const budget = opts.budget ?? GRAPH_BUDGET;
  const callIds: string[] = [];
  const sig = seedSignal(seed);
  const empty: TasteGraph = { seed, nodes: [], hubs: [], crowds: [], calls: 0, callIds };
  if (!sig.entities.length && !sig.tags.length) return empty;
  const exclude = [...sig.entities];
  const insights = async (params: Record<string, string | number | string[] | undefined>, timeoutMs?: number) => {
    if (callIds.length >= budget) return [] as QlooEntity[];
    const call = qloo.insights(params, { priority }).catch(() => undefined);
    const r = timeoutMs ? await Promise.race([call, new Promise<undefined>((ok) => setTimeout(() => ok(undefined), timeoutMs))]) : await call;
    if (!r) return [] as QlooEntity[];
    callIds.push(r.call.id);
    return r.status === 200 ? (r.results.entities ?? []) : [];
  };

  // Ring 1: what the seed's crowd loves, per domain.
  opts.onStep?.("Reading what this crowd loves across brands, music and TV");
  const ring = await Promise.all(
    DOMAINS.map((d) =>
      insights({
        "filter.type": `urn:entity:${d}`,
        "signal.interests.entities": sig.entities,
        "signal.interests.tags": sig.tags,
        "filter.exclude.entities": exclude,
        "filter.popularity.max": 0.99, // the crowd's own picks, not what everyone likes
        take: RING_TAKE,
      }, RING_TIMEOUT_MS),
    ),
  );
  const nodes: Node[] = [];
  const seen = new Set(exclude);
  DOMAINS.forEach((d, di) => {
    const list = ring[di].filter((e) => !seen.has(e.entity_id) && !(d === "brand" && isChainName(e.name)));
    const scaled = rankScale(list.map((e) => e.entity_id));
    for (const e of list) {
      seen.add(e.entity_id);
      nodes.push({ id: e.entity_id, name: e.name, domain: d, affinity: scaled.get(e.entity_id)!, popularity: e.popularity, tags: (e.tags ?? []).map((t) => t.name).slice(0, 6) });
    }
  });
  if (nodes.length < 8) return { ...empty, nodes, calls: callIds.length, crowds: nodes.length ? [crowdOf("c0", true, nodes)] : [] };

  // Hubs: a spread of strong entities per domain. Each one becomes a dimension of the taste vectors.
  const hubs: Node[] = DOMAINS.flatMap((d) => {
    const list = nodes.filter((n) => n.domain === d);
    return HUB_POSITIONS[d].map((p) => list[p]).filter((n): n is Node => !!n);
  });

  // Score every node under every hub, one pool call per hub and domain (Q8).
  opts.onStep?.(`Measuring how ${nodes.length} of them relate to each other`);
  const vec = new Map(nodes.map((n) => [n.id, new Array<number>(hubs.length).fill(0)]));
  await Promise.all(
    hubs.flatMap((h, hi) =>
      DOMAINS.map(async (d) => {
        const pool = nodes.filter((n) => n.domain === d && n.id !== h.id).map((n) => n.id);
        if (!pool.length) return;
        const scored = await insights({ "filter.type": `urn:entity:${d}`, "signal.interests.entities": [h.id], "filter.results.entities": pool, take: pool.length });
        // Unscored pool members stay at 0: below every scored one (§10.3's rule).
        const scaled = rankScale(scored.map((e) => e.entity_id));
        for (const id of pool) vec.get(id)![hi] = scaled.get(id) ?? 0;
      }),
    ),
  );
  hubs.forEach((h, hi) => (vec.get(h.id)![hi] = 1));

  // Crowds: Louvain on a k-nearest-neighbour graph of centred vectors, then the crowd rules.
  opts.onStep?.("Finding the distinct crowds inside it");
  const vectors = centerColumns(nodes.map((n) => vec.get(n.id)!));
  const groups = crowdRules(louvain(knnGraph(vectors, 6)), vectors, nodes);
  const crowds = [...new Set(groups)].map((g) => nodes.filter((_, i) => groups[i] === g));
  // The main crowd is the one the seed itself loves most.
  const closeness = (members: Node[]) => members.reduce((s, n) => s + n.affinity, 0) / members.length;
  crowds.sort((a, b) => closeness(b) - closeness(a));
  return {
    seed,
    nodes,
    hubs: hubs.map(({ id, name }) => ({ id, name })),
    crowds: crowds.map((members, i) => crowdOf(`c${i}`, i === 0, members)),
    calls: callIds.length,
    callIds,
  };
}

function crowdOf(id: string, main: boolean, members: Node[]): Crowd {
  const entities = [...members].sort((a, b) => b.affinity - a.affinity);
  const domains = DOMAINS.filter((d) => entities.some((n) => n.domain === d));
  // The signal: the strongest two per domain, then fill to six.
  const signal = [...domains.flatMap((d) => entities.filter((n) => n.domain === d).slice(0, 2)), ...entities].filter((n, i, all) => all.findIndex((x) => x.id === n.id) === i).slice(0, 6);
  return { id, main, entities, signal: signal.map(({ id, name }) => ({ id, name })), domains };
}
