import { jacobiEigen, kmeans, topEigen, type Apply, type Rng } from "./linalg";

// Spectral clustering (PRD §9.23, v4.0: E2), after Ng, Jordan & Weiss (2002): a k-nearest-neighbour graph on the
// taste similarities, its normalised affinity D^-1/2 W D^-1/2, the number of crowds from the largest eigengap, then
// k-means on the row-normalised top eigenvectors.

export type Sparse = { n: number; rows: Map<number, number>[] };

/** A symmetric k-nearest-neighbour graph: i and j are linked when either is among the other's k most similar (positive similarity only). */
export function knnAffinity(S: number[][], k: number): Sparse {
  const n = S.length;
  const rows = Array.from({ length: n }, () => new Map<number, number>());
  for (let i = 0; i < n; i++) {
    const near = S[i]
      .map((s, j) => ({ j, s }))
      .filter((x) => x.j !== i && x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, k);
    for (const { j, s } of near) {
      rows[i].set(j, Math.max(rows[i].get(j) ?? 0, s));
      rows[j].set(i, Math.max(rows[j].get(i) ?? 0, s));
    }
  }
  return { n, rows };
}

/** The normalised affinity as a product with a vector, plus its dense form for the full eigen decomposition. */
export function normalised(W: Sparse): { apply: Apply; dense: () => number[][] } {
  const deg = W.rows.map((r) => [...r.values()].reduce((s, v) => s + v, 0) + 1e-9);
  const inv = deg.map((d) => 1 / Math.sqrt(d));
  const apply: Apply = (v) => W.rows.map((r, i) => {
    let s = 0;
    for (const [j, w] of r) s += w * inv[j] * v[j];
    return s * inv[i];
  });
  const dense = () => W.rows.map((r, i) => Array.from({ length: W.n }, (_, j) => (r.get(j) ?? 0) * inv[i] * inv[j]));
  return { apply, dense };
}

/** Rows of the top-k eigenvectors, each scaled to unit length (NJW step 4). */
export function embedding(vectors: number[][], k: number): number[][] {
  const n = vectors[0]?.length ?? 0;
  return Array.from({ length: n }, (_, i) => {
    const row = vectors.slice(0, k).map((v) => v[i]);
    const norm = Math.sqrt(row.reduce((s, x) => s + x * x, 0));
    return norm > 1e-12 ? row.map((x) => x / norm) : row;
  });
}

/** The k in [min, max] with the largest gap between the k-th and (k+1)-th eigenvalues of the normalised affinity. */
export function eigengapK(values: number[], min = 2, max = 4): number {
  let best = min;
  let gap = -Infinity;
  for (let k = min; k <= max && k < values.length; k++) {
    const g = values[k - 1] - values[k];
    if (g > gap + 1e-12) (gap = g), (best = k);
  }
  return best;
}

export type Spectral = { labels: number[]; k: number; values: number[]; vectors: number[][]; embedding: number[][] };

/** Full spectral clustering on a similarity matrix: chooses k by eigengap unless `k` is given. */
export function spectral(S: number[][], opts: { knn?: number; k?: number; kMin?: number; kMax?: number; rand: Rng }): Spectral {
  const W = knnAffinity(S, opts.knn ?? 8);
  const { dense } = normalised(W);
  const eig = jacobiEigen(dense());
  const k = opts.k ?? eigengapK(eig.values, opts.kMin ?? 2, opts.kMax ?? 4);
  const emb = embedding(eig.vectors, k);
  return { labels: kmeans(emb, k, opts.rand), k, values: eig.values.slice(0, 8), vectors: eig.vectors.slice(0, Math.max(k, 3)), embedding: emb };
}

/** Spectral clustering with k fixed and the eigenvectors warm-started: the fast path for the bootstrap. */
export function spectralFixed(S: number[][], k: number, opts: { knn?: number; start?: number[][]; rand: Rng }): number[] {
  const W = knnAffinity(S, opts.knn ?? 8);
  const eig = topEigen(normalised(W).apply, W.n, k, { start: opts.start, iters: 25, rand: opts.rand });
  return kmeans(embedding(eig.vectors, k), k, opts.rand, 3);
}

/** Spectral clustering of a dense affinity (the bootstrap's co-association matrix), with k fixed. */
export function spectralDense(A: number[][], k: number, rand: Rng): number[] {
  const n = A.length;
  const deg = A.map((r, i) => r.reduce((s, v, j) => s + (i === j ? 0 : v), 0) + 1e-9);
  const M = A.map((r, i) => r.map((v, j) => (i === j ? 0 : v / Math.sqrt(deg[i] * deg[j]))));
  const eig = jacobiEigen(M);
  return n <= k ? A.map((_, i) => i) : kmeans(embedding(eig.vectors, k), k, rand);
}
