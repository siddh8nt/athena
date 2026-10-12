import type { Priority, QlooClient } from "@/lib/qloo/client";
import type { QlooEntity } from "@/lib/qloo/types";
import { isChainName } from "@/lib/methods/names";
import { centerColumns, crowdRules } from "./cluster";
import { MISSING, farthestPoints, percentiles, rowCorrelation } from "./embed";
import { DOMAINS, type Domain, type Galaxy, type Ref } from "./galaxy";
import { rng } from "./linalg";
import { spectral } from "./spectral";
import { adjustedRand, ambiguity, coassociationOf, consensusLabels, membership, nullCertainty, resample } from "./consensus";
import { specificity } from "./specificity";

// The taste graph (PRD §9.23, v4.0). Qloo as a measuring instrument: from a seed (the brand, or lookalike brands and
// product tags), one call per domain finds about 150 entities the crowd loves (ring 1). Then the agent probes: each
// probe ranks every entity of one domain under one landmark signal (a pool call, Q8). Landmarks are chosen round by
// round where the map is least known (k-center greedy), until the crowds stop changing. Every entity is described by
// its percentile under each landmark; spectral clustering with a bootstrap over landmarks gives crowds with a
// confidence, and each entity's specificity says how much more this crowd loves it than its popularity explains.

export { DOMAINS, domainWord, shortName, whyOf, type Domain, type Galaxy, type Ref } from "./galaxy";

export type Seed = {
  /** The brand itself, when Qloo knows it. */
  brand?: Ref;
  /** 3–5 lookalike brands found in Qloo (§9.23 step 1). */
  lookalikes: Ref[];
  /** Qloo tag URNs chosen from tag search for the product's traits. */
  tags: Ref[];
};

export type Node = Ref & {
  domain: Domain;
  /** The seed's own within-domain percentile for this entity (ring 1). */
  affinity: number;
  popularity?: number;
  tags: string[];
  /** Share of resamples in which it landed in its crowd (E2). */
  certainty?: number;
  /** Certainty above what shuffled data reaches (its 95th percentile): the crowd's core, not its fringe. */
  core?: boolean;
  /** Percentile points above what its popularity predicts (E3). */
  specificity?: number;
};

export type Crowd = {
  id: string;
  /** The crowd closest to the seed; the others are adjacent (§9.23 step 6). */
  main: boolean;
  /** Members, strongest first (by the seed's own affinity). */
  entities: Node[];
  /** The crowd's signal for later stops: its most central strong members, one per domain first. */
  signal: Ref[];
  domains: Domain[];
  /** Hennig's stability: the crowd's mean Jaccard with its best match across resamples of the landmarks (0–1). */
  stability?: number;
  /** How many members are at its core. */
  core?: number;
};

export type TasteGraph = {
  seed: Seed;
  nodes: Node[];
  landmarks: Ref[];
  crowds: Crowd[];
  calls: number;
  callIds: string[];
  galaxy?: Galaxy;
};

/** Ring 1 per domain: about 150 entities over six domains, at most 25 per pool call. */
export const RING_TAKE = 25;
/** Landmarks: the first round, the rounds after it, and the most. The quota guard lowers the most (§5 of PLAN v4). */
export const FIRST_ROUND = 8;
export const ROUND_SIZE = 3;
export const MAX_LANDMARKS = 16;
/** The crowds are settled when two consecutive rounds agree this well (adjusted Rand index). */
export const STABLE_ARI = 0.9;
/** Resamples for the crowd confidence, and for the shuffled null that sets the bar for the core. */
export const BOOTSTRAP = 100;
export const NULL_RESAMPLES = 50;
export const GRAPH_BUDGET = 110;
/** Below this many calls left on the keys this month, landmarks drop to the first round only. */
export const QUOTA_LOW = 2000;

/**
 * The seed as a Qloo signal. Tags join only when there are fewer than 2 entities: brands carry taste better than
 * tags (8 Oct), and tags made each call about 3× slower (10 Oct: 3.4 s → 10 s).
 */
export function seedSignal(seed: Seed): { entities: string[]; tags: string[] } {
  const entities = [...new Set(seed.brand ? [seed.brand.id, ...seed.lookalikes.slice(0, 2).map((l) => l.id)] : seed.lookalikes.slice(0, 4).map((l) => l.id))];
  return { entities, tags: entities.length < 2 ? seed.tags.map((t) => t.id).slice(0, 2) : [] };
}

/** A slow call gives up after this; the graph goes on with what answered (the call still finishes and caches). */
export const RING_TIMEOUT_MS = 15_000;

export type GraphOptions = {
  priority?: Priority;
  budget?: number;
  maxLandmarks?: number;
  onStep?: (text: string) => void;
  /** A snapshot after every probe round, for the forming Galaxy. */
  onRound?: (g: Galaxy) => void;
};

/** Calls left this month over every key, when every key has reported it. */
export function quotaLeft(qloo: QlooClient): number | undefined {
  const left = qloo.pacer.monthRemaining;
  return left.length && left.every((n) => typeof n === "number") ? left.reduce((s: number, n) => s + (n ?? 0), 0) : undefined;
}

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/** Never throws: a graph Qloo can't fill comes back with one crowd or none, and the journey carries on. */
export async function buildGraph(qloo: QlooClient, seed: Seed, opts: GraphOptions = {}): Promise<TasteGraph> {
  const priority = opts.priority ?? "now";
  const budget = opts.budget ?? GRAPH_BUDGET;
  const left = quotaLeft(qloo);
  const maxLandmarks = Math.min(opts.maxLandmarks ?? MAX_LANDMARKS, left !== undefined && left < QUOTA_LOW ? FIRST_ROUND : MAX_LANDMARKS);
  const callIds: string[] = [];
  const sig = seedSignal(seed);
  const empty: TasteGraph = { seed, nodes: [], landmarks: [], crowds: [], calls: 0, callIds };
  if (!sig.entities.length && !sig.tags.length) return empty;
  const exclude = [...sig.entities];
  const rand = rng(hash([...sig.entities, ...sig.tags].join(",")));
  /** null when the call failed or timed out (its entries stay neutral); [] when Qloo had nothing. */
  const insights = async (params: Record<string, string | number | string[] | undefined>): Promise<QlooEntity[] | null> => {
    if (callIds.length >= budget) return null;
    const call = qloo.insights(params, { priority }).catch(() => undefined);
    const r = await Promise.race([call, new Promise<undefined>((ok) => setTimeout(() => ok(undefined), RING_TIMEOUT_MS))]);
    if (!r) return null;
    callIds.push(r.call.id);
    return r.status === 200 ? (r.results.entities ?? []) : null;
  };

  // Ring 1: what the seed's crowd loves, per domain. Its order is the first column (the seed as a landmark).
  opts.onStep?.("Reading what this crowd loves across brands, music, TV, film, podcasts and books");
  const ring = await Promise.all(
    DOMAINS.map((d) =>
      insights({
        "filter.type": `urn:entity:${d}`,
        "signal.interests.entities": sig.entities,
        "signal.interests.tags": sig.tags,
        "filter.exclude.entities": exclude,
        "filter.popularity.max": 0.99, // the crowd's own picks, not what everyone likes
        take: RING_TAKE,
      }),
    ),
  );
  const nodes: Node[] = [];
  const seen = new Set(exclude);
  DOMAINS.forEach((d, di) => {
    const list = (ring[di] ?? []).filter((e) => !seen.has(e.entity_id) && !(d === "brand" && isChainName(e.name)));
    const pct = percentiles(list.map((e) => e.entity_id), list.map((e) => e.entity_id));
    for (const e of list) {
      seen.add(e.entity_id);
      nodes.push({ id: e.entity_id, name: e.name, domain: d, affinity: pct.get(e.entity_id)!, popularity: e.popularity, tags: (e.tags ?? []).map((t) => t.name).slice(0, 6) });
    }
  });
  if (nodes.length < 8) return { ...empty, nodes, calls: callIds.length, crowds: nodes.length ? [crowdOf("c0", true, nodes)] : [] };

  // Specificity needs only ring 1 (the seed's order and each entity's popularity), so the forming Galaxy shows it at once.
  const spec = specificity(nodes, nodes.map((n) => n.affinity));
  nodes.forEach((n, i) => (n.specificity = round2(spec[i])));
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const U: number[][] = nodes.map((n) => [n.affinity]);
  const landmarks: number[] = [];
  const seedName = seed.brand?.name ?? (seed.lookalikes.length ? seed.lookalikes.slice(0, 2).map((l) => l.name).join(" + ") : "Your product");
  const domainsPresent = DOMAINS.filter((d) => nodes.some((n) => n.domain === d));
  opts.onRound?.(ringSnapshot(nodes, domainsPresent, seedName, callIds.length));

  /** One landmark: a pool call per domain, each giving that domain's entities a percentile under it. */
  const probe = async (li: number) => {
    const col = U[0].length;
    for (const row of U) row.push(MISSING);
    landmarks.push(li);
    U[li][col] = 1;
    await Promise.all(
      domainsPresent.map(async (d) => {
        const pool = nodes.filter((n, i) => n.domain === d && i !== li).map((n) => n.id);
        if (!pool.length) return;
        const scored = await insights({ "filter.type": `urn:entity:${d}`, "signal.interests.entities": [nodes[li].id], "filter.results.entities": pool, take: pool.length });
        if (!scored) return;
        const pct = percentiles(scored.map((e) => e.entity_id), pool);
        for (const id of pool) U[index.get(id)!][col] = pct.get(id)!;
      }),
    );
  };
  const callsPerLandmark = domainsPresent.length;
  const room = () => Math.floor((budget - callIds.length) / callsPerLandmark);

  // Round 1: each domain's strongest entity, then a spread of the next ones, so the first map spans every domain.
  const first: number[] = [];
  for (const rank of [0, 6, 12, 3, 9])
    for (const d of domainsPresent) {
      const list = nodes.map((n, i) => ({ n, i })).filter((x) => x.n.domain === d);
      if (list[rank] && first.length < Math.min(FIRST_ROUND, maxLandmarks, room())) first.push(list[rank].i);
    }
  opts.onStep?.(`Probing ${first.length} landmarks: ${first.slice(0, 3).map((i) => nodes[i].name).join(", ")} and more`);
  await Promise.all(first.map(probe));

  let S = rowCorrelation(U);
  let main = spectral(S, { rand, kMax: Math.min(4, nodes.length - 1) });
  let round = 1;
  opts.onRound?.(snapshot(nodes, U, S, main.labels, main, landmarks, seedName, round, false, callIds.length));

  // Later rounds: probe where the map is least known, until the crowds stop changing.
  while (landmarks.length < maxLandmarks && room() >= 1) {
    const picks = farthestPoints(S, landmarks, Math.min(ROUND_SIZE, maxLandmarks - landmarks.length, room()));
    if (!picks.length) break;
    opts.onStep?.(`Probing ${picks.map((i) => nodes[i].name).join(", ")}, where the map is least clear`);
    await Promise.all(picks.map(probe));
    S = rowCorrelation(U);
    const next = spectral(S, { rand, kMax: Math.min(4, nodes.length - 1) });
    const agree = adjustedRand(main.labels, next.labels);
    main = next;
    round++;
    opts.onRound?.(snapshot(nodes, U, S, main.labels, main, landmarks, seedName, round, false, callIds.length));
    if (agree >= STABLE_ARI) break;
  }

  // Crowds with confidence: resample the landmarks, cluster the co-association, apply the crowd rules. The same steps
  // on shuffled probes set the bar for the core (measured 12 Oct: the crowds are real but soft, so only cores are claimed).
  opts.onStep?.(`Checking which crowds hold up across ${BOOTSTRAP} resamples of ${landmarks.length + 1} probes, and against shuffled data`);
  const runs = resample(U, main.k, { B: BOOTSTRAP, start: main.vectors, rand });
  const groups = crowdRules(consensusLabels(coassociationOf(runs), main.k, rand), centerColumns(U), nodes);
  const m = membership(runs, groups);
  const single = new Set(groups).size < 2;
  const coreAt = single ? 0 : nullCertainty(U, nodes.map((n) => n.domain), main.k, { B: NULL_RESAMPLES, rand });
  nodes.forEach((n, i) => {
    n.certainty = single ? 1 : round2(m.certainty[i]);
    n.core = single || m.certainty[i] > coreAt;
  });
  const ids = [...new Set(groups)].sort((a, b) => a - b);
  const closeness = (g: number) => {
    const members = nodes.filter((_, i) => groups[i] === g);
    return members.reduce((s, n) => s + n.affinity, 0) / members.length;
  };
  const order = [...ids].sort((a, b) => closeness(b) - closeness(a));
  const crowds = order.map((g, ci) => {
    const members = nodes.filter((_, i) => groups[i] === g);
    return { ...crowdOf(`c${ci}`, ci === 0, members), stability: round2(m.stability[ids.indexOf(g)]), core: members.filter((n) => n.core).length };
  });
  const crowdIndex = groups.map((g) => order.indexOf(g));
  const galaxy = snapshot(nodes, U, S, crowdIndex, main, landmarks, seedName, round, true, callIds.length);
  galaxy.nodes.forEach((g, i) => ((g.certainty = nodes[i].certainty ?? 1), (g.core = nodes[i].core ?? true)));
  galaxy.coreAt = round2(coreAt);
  galaxy.question = question(nodes, m.p.map((row) => order.map((g) => row[ids.indexOf(g)])), crowdIndex);
  opts.onRound?.(galaxy);
  return {
    seed,
    nodes,
    landmarks: [{ id: "seed", name: seedName }, ...landmarks.map((i) => ({ id: nodes[i].id, name: nodes[i].name }))],
    crowds,
    calls: callIds.length,
    callIds,
    galaxy,
  };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

function snapshot(nodes: Node[], U: number[][], S: number[][], crowd: number[], main: { k: number; values: number[]; vectors: number[][] }, landmarks: number[], seedName: string, round: number, done: boolean, calls: number): Galaxy {
  const ax = main.vectors[1] ?? [];
  const ay = main.vectors[2] ?? [];
  const scale = (v: number[]) => {
    const m = Math.max(1e-9, ...v.map(Math.abs));
    return (i: number) => round2((v[i] ?? 0) / m);
  };
  const sx = scale(ax);
  const sy = scale(ay);
  const isLandmark = new Set(landmarks);
  const edges: [number, number, number][] = [];
  const have = new Set<string>();
  S.forEach((row, i) =>
    row
      .map((s, j) => ({ j, s }))
      .filter((x) => x.j !== i && x.s > 0.2)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .forEach(({ j, s }) => {
        const key = i < j ? `${i}|${j}` : `${j}|${i}`;
        if (!have.has(key)) (have.add(key), edges.push([Math.min(i, j), Math.max(i, j), round2(s)]));
      }),
  );
  return {
    nodes: nodes.map((n, i) => ({ id: n.id, name: n.name, domain: n.domain, crowd: crowd[i] ?? -1, certainty: 1, core: true, specificity: n.specificity ?? 0, affinity: round2(n.affinity), popularity: n.popularity === undefined ? undefined : round2(n.popularity), x: sx(i), y: sy(i), landmark: isLandmark.has(i) })),
    edges,
    landmarks: [{ id: "seed", name: seedName }, ...landmarks.map((i) => ({ id: nodes[i].id, name: nodes[i].name }))],
    u: U.map((r) => r.map(round2)),
    k: main.k,
    eigenvalues: main.values.slice(0, 6).map((v) => Math.round(v * 1000) / 1000),
    round,
    done,
    calls,
  };
}

/**
 * Round 0, before any probe: the seed in the middle, each domain in its own sector, closer the more the seed's crowd
 * loves it. The probes then pull the entities into crowds.
 */
function ringSnapshot(nodes: Node[], domains: Domain[], seedName: string, calls: number): Galaxy {
  const count = new Map<Domain, number>();
  const seenIn = new Map<Domain, number>();
  for (const n of nodes) count.set(n.domain, (count.get(n.domain) ?? 0) + 1);
  return {
    nodes: nodes.map((n) => {
      const k = seenIn.get(n.domain) ?? 0;
      seenIn.set(n.domain, k + 1);
      const angle = ((domains.indexOf(n.domain) + 0.1 + (0.8 * (k + 0.5)) / (count.get(n.domain) ?? 1)) / domains.length) * 2 * Math.PI;
      const radius = 0.2 + 0.75 * (1 - n.affinity);
      return { id: n.id, name: n.name, domain: n.domain, crowd: -1, certainty: 1, core: true, specificity: n.specificity ?? 0, affinity: round2(n.affinity), popularity: n.popularity === undefined ? undefined : round2(n.popularity), x: round2(radius * Math.cos(angle)), y: round2(radius * Math.sin(angle)), landmark: false };
    }),
    edges: [],
    landmarks: [{ id: "seed", name: seedName }],
    u: nodes.map((n) => [round2(n.affinity)]),
    k: 0,
    eigenvalues: [],
    round: 0,
    done: false,
    calls,
  };
}

/** Founders recognise brands, shows and music fastest, so the agent's question and each crowd's signal lead with them. */
const FAMILIAR: Domain[] = ["brand", "tv_show", "artist"];

/**
 * The agent's one good question (E8): among familiar entities the seed loves (top half), the one most evenly between
 * two crowds, so the founder's answer moves the most.
 */
function question(nodes: Node[], p: number[][], crowd: number[]): Galaxy["question"] {
  if ((p[0]?.length ?? 0) < 2) return undefined;
  const median = [...nodes.map((n) => n.affinity)].sort((a, b) => a - b)[Math.floor(nodes.length / 2)];
  let best = -1;
  let score = -1;
  nodes.forEach((n, i) => {
    if (n.affinity < median || !FAMILIAR.includes(n.domain)) return;
    const a = ambiguity(p[i]);
    if (a > score) (score = a), (best = i);
  });
  if (best < 0) return undefined;
  const ranked = p[best].map((v, c) => ({ v, c })).sort((a, b) => b.v - a.v);
  const own = crowd[best];
  const other = ranked.find((x) => x.c !== own)?.c ?? ranked[1].c;
  return { id: nodes[best].id, name: nodes[best].name, crowds: [own, other] };
}

function crowdOf(id: string, main: boolean, members: Node[]): Crowd {
  const entities = [...members].sort((a, b) => b.affinity - a.affinity);
  const domains = DOMAINS.filter((d) => entities.some((n) => n.domain === d));
  // The signal: central, strong members (most central × strongest). Two each of brands, music and TV first, the
  // domains every later stop was tuned on (§9.23), then fill to six from any domain.
  const score = (n: Node) => n.affinity * (n.certainty ?? 1);
  const ranked = [...entities].sort((a, b) => score(b) - score(a));
  const lead = FAMILIAR.flatMap((d) => ranked.filter((n) => n.domain === d).slice(0, 2));
  const signal = [...lead, ...ranked].filter((n, i, all) => all.findIndex((x) => x.id === n.id) === i).slice(0, 6);
  return { id, main, entities, signal: signal.map(({ id, name }) => ({ id, name })), domains };
}
