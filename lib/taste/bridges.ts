import { bridgeScore } from "@/lib/methods/rank";
import type { GraphState } from "./graph";

// Where two crowds meet (§9.28, v4.0): the entities both crowds love. Each crowd's love for an entity is read from
// the measured matrix U, with no new calls: the mean of its percentiles under the crowd's own landmarks, re-ranked as
// a percentile over every entity. The bridge score is the harmonic mean of the two sides (§9.28); an entity bridges
// only when both sides reach the threshold (§9.8), and the landmarks themselves are left out (each tops its own column).

export const BRIDGE_MIN = 0.7;
export const BRIDGE_TAKE = 5;

export type CrowdBridge = { id: string; name: string; a: number; b: number; score: number };

/** Each crowd's percentile for every entity, from the landmarks it holds; undefined for a crowd with no landmark. */
export function crowdProfile(state: GraphState, members: Set<string>): Map<string, number> | undefined {
  const cols = state.landmarks.flatMap((row, j) => (members.has(state.nodes[row]?.id) ? [j + 1] : []));
  if (!cols.length) return undefined;
  const mean = state.nodes.map((n, i) => ({ id: n.id, v: cols.reduce((s, c) => s + (state.U[i]?.[c] ?? 0.5), 0) / cols.length }));
  const sorted = [...mean].sort((x, y) => y.v - x.v);
  const n = sorted.length;
  // Ties share the best rank, so an entity's percentile never depends on the order it was listed in.
  const out = new Map<string, number>();
  let i = 0;
  while (i < n) {
    let k = i;
    while (k + 1 < n && sorted[k + 1].v === sorted[i].v) k++;
    const p = n <= 1 ? 1 : 1 - i / (n - 1);
    for (let t = i; t <= k; t++) out.set(sorted[t].id, p);
    i = k + 1;
  }
  return out;
}

/** The entities two crowds both love, strongest bridge first. */
export function crowdBridges(state: GraphState, a: Set<string>, b: Set<string>, opts: { min?: number; take?: number } = {}): CrowdBridge[] {
  const pa = crowdProfile(state, a);
  const pb = crowdProfile(state, b);
  if (!pa || !pb) return [];
  const landmarks = new Set(state.landmarks.map((r) => state.nodes[r]?.id));
  const min = opts.min ?? BRIDGE_MIN;
  return state.nodes
    .filter((n) => !landmarks.has(n.id))
    .map((n) => ({ id: n.id, name: n.name, a: pa.get(n.id) ?? 0, b: pb.get(n.id) ?? 0 }))
    .filter((x) => Math.min(x.a, x.b) >= min)
    .map((x) => ({ ...x, a: round(x.a), b: round(x.b), score: round(bridgeScore(x.a, x.b)) }))
    .sort((x, y) => y.score - x.score || x.name.localeCompare(y.name))
    .slice(0, opts.take ?? BRIDGE_TAKE);
}

const round = (x: number) => Math.round(x * 100) / 100;
