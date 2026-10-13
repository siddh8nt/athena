import { rng, type Rng } from "./linalg";
import type { Node } from "./graph";

// Taste axes (PRD §9.27, v4.0). The measured matrix U (every entity's percentile under the seed and each landmark) is
// factorised as U ≈ W·H with non-negative W and H (Lee & Seung 1999, multiplicative updates for squared error).
// Each of the k components is an axis: a direction of taste the landmarks pull along. The rank k (3–5) is chosen on
// held-out entries: a seeded tenth of U is hidden, each k is fitted on the rest, and the k with the lowest error on
// the hidden entries wins (ties to the smaller k). Pure and deterministic; no Qloo calls.

export const RANKS = [3, 4, 5] as const;
export const HOLDOUT = 0.1;
export const ITERS = 400;
const EPS = 1e-9;
const SEED = 9_27;

export type Factors = { W: number[][]; H: number[][] };

/**
 * Masked NMF: minimises Σ over the entries with mask 1 of (V − WH)², by Lee–Seung updates restricted to the mask.
 * Deterministic for a given seed.
 */
export function nmf(V: number[][], k: number, mask?: number[][], opts: { iters?: number; rand?: Rng } = {}): Factors {
  const n = V.length;
  const m = V[0]?.length ?? 0;
  const rand = opts.rand ?? rng(SEED + k);
  const M = mask ?? V.map((r) => r.map(() => 1));
  let mean = 0;
  let cnt = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) if (M[i][j]) (mean += V[i][j], cnt++);
  const scale = Math.sqrt(Math.max(EPS, mean / Math.max(1, cnt)) / k);
  const W = Array.from({ length: n }, () => Array.from({ length: k }, () => scale * (0.5 + rand())));
  const H = Array.from({ length: k }, () => Array.from({ length: m }, () => scale * (0.5 + rand())));
  const WH = (i: number, j: number) => {
    let s = 0;
    for (let a = 0; a < k; a++) s += W[i][a] * H[a][j];
    return s;
  };
  for (let it = 0; it < (opts.iters ?? ITERS); it++) {
    // H ← H ⊙ Wᵀ(M⊙V) / Wᵀ(M⊙WH)
    const R = V.map((r, i) => r.map((_, j) => (M[i][j] ? WH(i, j) : 0)));
    for (let a = 0; a < k; a++)
      for (let j = 0; j < m; j++) {
        let num = 0;
        let den = 0;
        for (let i = 0; i < n; i++) if (M[i][j]) (num += W[i][a] * V[i][j], den += W[i][a] * R[i][j]);
        H[a][j] *= num / (den + EPS);
      }
    // W ← W ⊙ (M⊙V)Hᵀ / (M⊙WH)Hᵀ
    const R2 = V.map((r, i) => r.map((_, j) => (M[i][j] ? WH(i, j) : 0)));
    for (let i = 0; i < n; i++)
      for (let a = 0; a < k; a++) {
        let num = 0;
        let den = 0;
        for (let j = 0; j < m; j++) if (M[i][j]) (num += V[i][j] * H[a][j], den += R2[i][j] * H[a][j]);
        W[i][a] *= num / (den + EPS);
      }
  }
  return { W, H };
}

/** Root-mean-square error of WH against V over the entries where `on` is true. */
export function rmse(V: number[][], f: Factors, on: (i: number, j: number) => boolean): number {
  const k = f.H.length;
  let s = 0;
  let c = 0;
  V.forEach((r, i) =>
    r.forEach((v, j) => {
      if (!on(i, j)) return;
      let x = 0;
      for (let a = 0; a < k; a++) x += f.W[i][a] * f.H[a][j];
      s += (v - x) ** 2;
      c++;
    }),
  );
  return c ? Math.sqrt(s / c) : 0;
}

/** Within this share of the best held-out error, the smaller rank wins: an axis must earn its place [DECISION; tune]. */
export const PARSIMONY = 0.02;

/** Held-out error per rank, and the rank chosen: the smallest rank within PARSIMONY of the lowest error. */
export function chooseRank(V: number[][], ranks: readonly number[] = RANKS, opts: { iters?: number } = {}): { rank: number; heldOut: Record<number, number> } {
  const rand = rng(SEED);
  const mask = V.map((r) => r.map(() => (rand() < HOLDOUT ? 0 : 1)));
  const fit = ranks.filter((k) => k < Math.min(V.length, V[0]?.length ?? 0));
  const heldOut: Record<number, number> = {};
  for (const k of fit) heldOut[k] = rmse(V, nmf(V, k, mask, opts), (i, j) => mask[i][j] === 0);
  const best = Math.min(...fit.map((k) => heldOut[k]));
  const rank = fit.find((k) => heldOut[k] <= best * (1 + PARSIMONY)) ?? 0;
  return { rank, heldOut };
}

export type Axis = {
  /** Members that load mostly on this axis, strongest first: what the agent names it from. */
  top: Node[];
  /** Each entity's share of its loading on this axis (0–1), by Qloo id. */
  load: Map<string, number>;
  /** Share of the matrix's total fitted mass carried by this axis. */
  mass: number;
};

export type AxesResult = { axes: Axis[]; rank: number; heldOut: Record<number, number>; rows: number; cols: number };

/**
 * The axes of a measured graph: the rank chosen on held-out entries, then a fit on all of U. An entity's load on an
 * axis is its share of its own loading (W row normalised), so a slider weights entities by how much of their taste
 * runs along that axis. Axes are ordered by the mass they carry. Undefined when U is too small to factorise.
 */
export function tasteAxes(U: number[][], nodes: Node[], opts: { iters?: number; top?: number } = {}): AxesResult | undefined {
  const rows = U.length;
  const cols = U[0]?.length ?? 0;
  if (rows < 10 || cols < 4) return undefined;
  const { rank, heldOut } = chooseRank(U, RANKS, opts);
  if (!rank) return undefined;
  const { W, H } = nmf(U, rank, undefined, opts);
  const hSum = H.map((h) => h.reduce((s, x) => s + x, 0));
  const total = W.reduce((s, w) => s + w.reduce((t, x, a) => t + x * hSum[a], 0), 0) || 1;
  const rowSum = W.map((w) => w.reduce((s, x) => s + x, 0) || EPS);
  // Naming draws on entities that carry real loading, not on near-zero rows whose share is noise.
  const totals = [...rowSum].sort((a, b) => a - b);
  const floor = 0.25 * totals[Math.floor(totals.length / 2)];
  const axes: Axis[] = Array.from({ length: rank }, (_, a) => {
    const share = W.map((w, i) => w[a] / rowSum[i]);
    const top = nodes
      .map((n, i) => ({ n, s: share[i], i }))
      .filter((x) => rowSum[x.i] >= floor)
      .sort((x, y) => y.s - x.s)
      .slice(0, opts.top ?? 8)
      .map((x) => x.n);
    return { top, load: new Map(nodes.map((n, i) => [n.id, Math.round(share[i] * 100) / 100])), mass: W.reduce((s, w) => s + w[a] * hSum[a], 0) / total };
  });
  return { axes: axes.sort((x, y) => y.mass - x.mass), rank, heldOut, rows, cols };
}
