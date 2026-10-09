// Pure maths for the taste graph (PRD §9.23 steps 3–4): taste vectors, similarity, Louvain communities and the
// crowd rules. No Qloo calls here, so every step is unit-tested.

/** Rank-scales one Qloo list to 0–1 (first = 1). Qloo's affinities within a list are tightly packed (10 Oct: 0.849–0.869), so ranks carry the signal. */
export function rankScale(orderedIds: string[]): Map<string, number> {
  const n = orderedIds.length;
  return new Map(orderedIds.map((id, i) => [id, n === 1 ? 1 : 1 - i / n]));
}

/** Subtracts each column's mean, so similarity measures how two entities differ from the brand's whole universe, not how much they share it. */
export function centerColumns(rows: number[][]): number[][] {
  if (!rows.length) return rows;
  const cols = rows[0].length;
  const mean = Array.from({ length: cols }, (_, c) => rows.reduce((s, r) => s + r[c], 0) / rows.length);
  return rows.map((r) => r.map((v, c) => v - mean[c]));
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** A symmetric k-nearest-neighbour graph: each node keeps its k most similar neighbours (positive similarity only). */
export function knnGraph(vectors: number[][], k = 6): number[][] {
  const n = vectors.length;
  const W = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    const sims = vectors.map((v, j) => ({ j, s: j === i ? -Infinity : cosine(vectors[i], v) })).sort((a, b) => b.s - a.s);
    for (const { j, s } of sims.slice(0, k)) if (s > 0) W[i][j] = W[j][i] = Math.max(W[i][j], s);
  }
  return W;
}

/** One pass of Louvain's local moving: each node joins the neighbouring community with the best modularity gain. */
function localMoving(W: number[][]): number[] {
  const n = W.length;
  const k = W.map((row) => row.reduce((s, v) => s + v, 0));
  const m2 = k.reduce((s, v) => s + v, 0);
  const comm = Array.from({ length: n }, (_, i) => i);
  if (!m2) return comm;
  const tot = [...k];
  let moved = true;
  for (let pass = 0; moved && pass < 50; pass++) {
    moved = false;
    for (let i = 0; i < n; i++) {
      const own = comm[i];
      tot[own] -= k[i];
      const links = new Map<number, number>();
      for (let j = 0; j < n; j++) if (W[i][j] && j !== i) links.set(comm[j], (links.get(comm[j]) ?? 0) + W[i][j]);
      let best = own;
      let bestGain = (links.get(own) ?? 0) - (tot[own] * k[i]) / m2;
      for (const [c, kin] of links) {
        const gain = kin - (tot[c] * k[i]) / m2;
        if (gain > bestGain + 1e-12) {
          best = c;
          bestGain = gain;
        }
      }
      tot[best] += k[i];
      if (best !== own) {
        comm[i] = best;
        moved = true;
      }
    }
  }
  return comm;
}

/** Louvain community detection (deterministic: nodes are visited in index order). Returns a community index per node, 0-based and dense. */
export function louvain(W: number[][]): number[] {
  let membership = Array.from({ length: W.length }, (_, i) => i);
  let graph = W;
  for (let level = 0; level < 10; level++) {
    const comm = localMoving(graph);
    const ids = [...new Set(comm)];
    if (ids.length === graph.length) break;
    const dense = new Map(ids.map((c, i) => [c, i]));
    membership = membership.map((c) => dense.get(comm[c])!);
    const agg = Array.from({ length: ids.length }, () => new Array<number>(ids.length).fill(0));
    for (let i = 0; i < graph.length; i++) for (let j = 0; j < graph.length; j++) agg[dense.get(comm[i])!][dense.get(comm[j])!] += graph[i][j];
    graph = agg;
  }
  const dense = new Map([...new Set(membership)].map((c, i) => [c, i]));
  return membership.map((c) => dense.get(c)!);
}

export type Member = { domain: string };

/**
 * The crowd rules (§9.23 step 4): a crowd needs ≥ minSize entities across ≥ 2 domains, or it merges into the crowd
 * whose centroid is most similar; then the smallest crowds merge until at most maxCrowds remain.
 */
export function crowdRules(groups: number[], vectors: number[][], members: Member[], minSize = 8, maxCrowds = 3): number[] {
  let g = [...groups];
  const ids = () => [...new Set(g)];
  const centroid = (c: number) => {
    const rows = vectors.filter((_, i) => g[i] === c);
    return rows[0].map((_, d) => rows.reduce((s, r) => s + r[d], 0) / rows.length);
  };
  const size = (c: number) => g.filter((x) => x === c).length;
  const valid = (c: number) => size(c) >= minSize && new Set(members.filter((_, i) => g[i] === c).map((m) => m.domain)).size >= 2;
  const mergeInto = (from: number) => {
    const cf = centroid(from);
    const target = ids()
      .filter((c) => c !== from)
      .map((c) => ({ c, s: cosine(cf, centroid(c)) + size(c) * 1e-9 }))
      .sort((a, b) => b.s - a.s)[0]?.c;
    if (target !== undefined) g = g.map((x) => (x === from ? target : x));
  };
  for (let guard = 0; guard < 100; guard++) {
    const weak = ids().filter((c) => !valid(c)).sort((a, b) => size(a) - size(b))[0];
    if (weak === undefined || ids().length === 1) break;
    mergeInto(weak);
  }
  while (ids().length > maxCrowds) mergeInto(ids().sort((a, b) => size(a) - size(b))[0]);
  const dense = new Map(ids().map((c, i) => [c, i]));
  return g.map((c) => dense.get(c)!);
}
