// Small dense linear algebra for the taste engine (PRD §9.23, v4.0). Matrices are at most about 150 × 150, so plain
// arrays and textbook methods are fast enough and easy to test: cyclic Jacobi for a full symmetric eigen
// decomposition, orthogonal iteration for the top few eigenvectors (warm-started in the bootstrap), and k-means++.

export type Rng = () => number;

/** A seeded generator (mulberry32), so every resample and k-means start is reproducible. */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Eigen = { values: number[]; vectors: number[][] };

/** All eigenvalues and eigenvectors of a symmetric matrix, largest first. `vectors[k]` is the k-th eigenvector. */
export function jacobiEigen(S: number[][], sweeps = 30): Eigen {
  const n = S.length;
  const A = S.map((r) => [...r]);
  const V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < sweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p][q];
        if (Math.abs(apq) < 1e-14) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p];
          const akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k];
          const aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p];
          const vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => A[b][b] - A[a][a]);
  return { values: order.map((i) => A[i][i]), vectors: order.map((i) => V.map((row) => row[i])) };
}

function orthonormalize(Q: number[][]): number[][] {
  const out: number[][] = [];
  for (const v of Q) {
    const w = [...v];
    for (const u of out) {
      let d = 0;
      for (let i = 0; i < w.length; i++) d += w[i] * u[i];
      for (let i = 0; i < w.length; i++) w[i] -= d * u[i];
    }
    const norm = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
    out.push(norm > 1e-12 ? w.map((x) => x / norm) : w.map(() => 0));
  }
  return out;
}

/** A symmetric matrix as a product with a vector, so a sparse k-nearest-neighbour graph costs O(nk), not O(n²). */
export type Apply = (v: number[]) => number[];

export const dense = (M: number[][]): Apply => (v) => M.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));

/**
 * The k largest eigenpairs of a symmetric matrix whose eigenvalues lie in [-1, 1] (a normalised affinity), by
 * orthogonal iteration on M + I, finished with a Rayleigh–Ritz step. `start` warm-starts it (the bootstrap passes
 * the full-data eigenvectors, so a few iterations suffice).
 */
export function topEigen(apply: Apply, n: number, k: number, opts: { start?: number[][]; iters?: number; rand?: Rng } = {}): Eigen {
  const p = Math.min(n, k + 2);
  const rand = opts.rand ?? rng(7);
  let Q = orthonormalize(Array.from({ length: p }, (_, j) => opts.start?.[j] ?? Array.from({ length: n }, () => rand() - 0.5)));
  const shifted = (v: number[]) => apply(v).map((x, i) => x + v[i]);
  for (let it = 0; it < (opts.iters ?? 80); it++) Q = orthonormalize(Q.map(shifted));
  const MQ = Q.map(apply);
  const T = Q.map((qi) => MQ.map((mqj) => qi.reduce((s, x, t) => s + x * mqj[t], 0)));
  const small = jacobiEigen(T.map((r, i) => r.map((x, j) => (x + T[j][i]) / 2)));
  const vectors = small.vectors.map((c) => Array.from({ length: n }, (_, t) => c.reduce((s, cj, j) => s + cj * Q[j][t], 0)));
  return { values: small.values.slice(0, k), vectors: vectors.slice(0, k) };
}

const dist2 = (a: number[], b: number[]) => a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0);

/** k-means with k-means++ starts; the best of `restarts` runs by inertia. Returns a 0-based cluster per row. */
export function kmeans(X: number[][], k: number, rand: Rng, restarts = 8): number[] {
  const n = X.length;
  if (k <= 1 || n <= k) return X.map((_, i) => (k <= 1 ? 0 : i));
  let best: { labels: number[]; inertia: number } | undefined;
  for (let r = 0; r < restarts; r++) {
    const centers: number[][] = [X[Math.floor(rand() * n)]];
    while (centers.length < k) {
      const d = X.map((x) => Math.min(...centers.map((c) => dist2(x, c))));
      const total = d.reduce((s, v) => s + v, 0);
      let pick = rand() * total;
      let idx = 0;
      while (idx < n - 1 && pick > d[idx]) pick -= d[idx++];
      centers.push(X[total > 0 ? idx : Math.floor(rand() * n)]);
    }
    let labels = new Array<number>(n).fill(-1);
    for (let it = 0; it < 100; it++) {
      const next = X.map((x) => {
        let bi = 0;
        let bd = Infinity;
        centers.forEach((c, ci) => {
          const d = dist2(x, c);
          if (d < bd) (bd = d), (bi = ci);
        });
        return bi;
      });
      const same = next.every((l, i) => l === labels[i]);
      labels = next;
      if (same) break;
      for (let c = 0; c < k; c++) {
        const rows = X.filter((_, i) => labels[i] === c);
        if (rows.length) centers[c] = rows[0].map((_, d) => rows.reduce((s, row) => s + row[d], 0) / rows.length);
      }
    }
    const inertia = X.reduce((s, x, i) => s + dist2(x, centers[labels[i]]), 0);
    if (!best || inertia < best.inertia - 1e-12) best = { labels, inertia };
  }
  const dense = new Map<number, number>();
  return best!.labels.map((l) => (dense.has(l) ? dense.get(l)! : (dense.set(l, dense.size), dense.size - 1)));
}
