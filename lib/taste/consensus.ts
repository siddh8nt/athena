import { rowCorrelation } from "./embed";
import type { Rng } from "./linalg";
import { spectral, spectralDense, spectralFixed } from "./spectral";

// Crowds with confidence (PRD §9.23, v4.0: E2). Resampling the landmarks and re-clustering shows which crowds are
// real structure and which entities sit between crowds; the same steps on shuffled data set the bar for the core.
// No Qloo calls: it reuses the probes already made.

/** Adjusted Rand index (Hubert & Arabie 1985): 1 for identical partitions, about 0 for chance agreement. */
export function adjustedRand(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 1;
  const table = new Map<string, number>();
  const ra = new Map<number, number>();
  const rb = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const key = `${a[i]}|${b[i]}`;
    table.set(key, (table.get(key) ?? 0) + 1);
    ra.set(a[i], (ra.get(a[i]) ?? 0) + 1);
    rb.set(b[i], (rb.get(b[i]) ?? 0) + 1);
  }
  const c2 = (x: number) => (x * (x - 1)) / 2;
  const index = [...table.values()].reduce((s, x) => s + c2(x), 0);
  const sa = [...ra.values()].reduce((s, x) => s + c2(x), 0);
  const sb = [...rb.values()].reduce((s, x) => s + c2(x), 0);
  const expected = (sa * sb) / c2(n);
  const max = (sa + sb) / 2;
  return max === expected ? 1 : (index - expected) / (max - expected);
}

/** Each resample's crowds: the landmark columns drawn with replacement, k fixed, warm-started from the full data. */
export function resample(U: number[][], k: number, opts: { B?: number; knn?: number; start?: number[][]; rand: Rng }): number[][] {
  const L = U[0]?.length ?? 0;
  return Array.from({ length: opts.B ?? 100 }, () => {
    const cols = Array.from({ length: L }, () => Math.floor(opts.rand() * L));
    return spectralFixed(rowCorrelation(U, cols), k, { knn: opts.knn, start: opts.start, rand: opts.rand });
  });
}

/** The co-association matrix: the share of resamples in which i and j land in the same crowd. */
export function coassociationOf(runs: number[][]): number[][] {
  const n = runs[0]?.length ?? 0;
  const C = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const r of runs) for (let i = 0; i < n; i++) for (let j = i; j < n; j++) if (r[i] === r[j]) C[i][j] += 1;
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) C[j][i] = C[i][j] = C[i][j] / Math.max(1, runs.length);
  return C;
}

export function coassociation(U: number[][], k: number, opts: { B?: number; knn?: number; start?: number[][]; rand: Rng }): number[][] {
  return coassociationOf(resample(U, k, opts));
}

/** The consensus partition: crowds of the co-association matrix itself. */
export function consensusLabels(C: number[][], k: number, rand: Rng): number[] {
  return spectralDense(C, k, rand);
}

const permutations = (xs: number[]): number[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

/**
 * One resample's clusters matched to the consensus crowds: the one-to-one assignment that agrees on the most
 * entities (k ≤ 4, so at most 24 to try). Returns, per entity, the consensus crowd its resample cluster maps to, or -1.
 */
function matchRun(run: number[], crowds: number[]): number[] {
  const a = [...new Set(run)].sort((x, y) => x - y);
  const b = [...new Set(crowds)].sort((x, y) => x - y);
  if (a.length > b.length) {
    // The crowd rules merged some clusters: each resample cluster joins the crowd it overlaps most.
    const to = new Map(
      a.map((c) => {
        const counts = b.map((d) => run.reduce((s, l, i) => s + (l === c && crowds[i] === d ? 1 : 0), 0));
        return [c, b[counts.indexOf(Math.max(...counts))]];
      }),
    );
    return run.map((l) => to.get(l) ?? -1);
  }
  const slots = Array.from({ length: Math.max(a.length, b.length) }, (_, i) => i);
  let best: Map<number, number> = new Map();
  let score = -1;
  for (const p of permutations(slots)) {
    const map = new Map(a.map((c, i) => [c, b[p[i]] ?? -1]));
    const agree = run.reduce((s, l, i) => s + (map.get(l) === crowds[i] ? 1 : 0), 0);
    if (agree > score) (score = agree), (best = map);
  }
  return run.map((l) => best.get(l) ?? -1);
}

export type Membership = {
  /** p[i][c]: the share of resamples in which entity i landed in crowd c (resample clusters matched to the crowds). */
  p: number[][];
  /** p[i] at the entity's own crowd: low means it sits between crowds. */
  certainty: number[];
  /** Per crowd, Hennig's (2007) stability: the mean Jaccard of the crowd with its best match in each resample. */
  stability: number[];
};

export function membership(runs: number[][], crowds: number[]): Membership {
  const ids = [...new Set(crowds)].sort((a, b) => a - b);
  const p = crowds.map(() => new Array<number>(ids.length).fill(0));
  const B = Math.max(1, runs.length);
  for (const run of runs) matchRun(run, crowds).forEach((c, i) => c >= 0 && (p[i][ids.indexOf(c)] += 1 / B));
  const members = ids.map((c) => new Set(crowds.map((l, i) => (l === c ? i : -1)).filter((i) => i >= 0)));
  const stability = members.map((A) => {
    let total = 0;
    for (const run of runs) {
      let best = 0;
      for (const c of new Set(run)) {
        let inter = 0;
        let size = 0;
        run.forEach((l, i) => l === c && (size++, A.has(i) && inter++));
        best = Math.max(best, inter / (A.size + size - inter));
      }
      total += best;
    }
    return total / B;
  });
  return { p, certainty: crowds.map((c, i) => p[i][ids.indexOf(c)]), stability };
}

/**
 * The bar an entity's certainty must clear to count as its crowd's core: the 95th percentile of certainty when each
 * probe column is shuffled within its domain (same values, no shared taste), clustered the same way. Measured
 * 12 Oct on Brightland: hard crowds hold far less often than this suggests, so only the core is claimed.
 */
export function nullCertainty(U: number[][], groups: string[], k: number, opts: { B?: number; knn?: number; rand: Rng; q?: number }): number {
  const N = U.map((row) => [...row]);
  const byGroup = new Map<string, number[]>();
  groups.forEach((g, i) => byGroup.set(g, [...(byGroup.get(g) ?? []), i]));
  for (let l = 0; l < (U[0]?.length ?? 0); l++)
    for (const idx of byGroup.values()) {
      const vals = idx.map((i) => U[i][l]);
      for (let a = vals.length - 1; a > 0; a--) {
        const b = Math.floor(opts.rand() * (a + 1));
        [vals[a], vals[b]] = [vals[b], vals[a]];
      }
      idx.forEach((i, t) => (N[i][l] = vals[t]));
    }
  const main = spectral(rowCorrelation(N), { k, knn: opts.knn, rand: opts.rand });
  const runs = resample(N, k, { B: opts.B, knn: opts.knn, start: main.vectors, rand: opts.rand });
  const cert = membership(runs, consensusLabels(coassociationOf(runs), k, opts.rand)).certainty.sort((a, b) => a - b);
  return cert[Math.min(cert.length - 1, Math.floor((opts.q ?? 0.95) * cert.length))] ?? 1;
}

/** Normalised entropy of an entity's memberships (0 = clearly one crowd, 1 = evenly between): the agent asks about the highest (E8). */
export function ambiguity(row: number[]): number {
  const total = row.reduce((s, v) => s + v, 0);
  if (total <= 0 || row.length < 2) return 0;
  const h = row.reduce((s, v) => (v > 0 ? s - (v / total) * Math.log(v / total) : s), 0);
  return h / Math.log(row.length);
}
