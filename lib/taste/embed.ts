// The landmark taste embedding (PRD §9.23, v4.0: E1). Each probe asks Qloo to rank a fixed pool of entities under
// one landmark signal; only the order inside each response is used, because Qloo normalises scores per query
// (hackathon docs §3.6). Every entity is then described by its percentile under each landmark, and two entities are
// similar when the same landmarks rank them high and low.

/**
 * Within-probe percentiles in (0, 1): the first-ranked pool member is highest. Pool members Qloo didn't score tie
 * below every scored one at their mid-rank (§10.3's rule).
 */
export function percentiles(ordered: string[], pool: string[]): Map<string, number> {
  const m = pool.length;
  const inPool = new Set(pool);
  const scored = [...new Set(ordered)].filter((id) => inPool.has(id));
  const out = new Map<string, number>();
  scored.forEach((id, i) => out.set(id, 1 - (i + 0.5) / m));
  const n = scored.length;
  const tie = (m - n) / (2 * m);
  for (const id of pool) if (!out.has(id)) out.set(id, tie);
  return out;
}

/** A neutral value for an entry no probe filled (a call that timed out): the middle, so it carries no signal. */
export const MISSING = 0.5;

/**
 * Pearson correlation between rows of U over the given columns (repeats allowed, for the bootstrap). Columns are
 * centred first, so a landmark that ranks everything high doesn't make everything look alike.
 */
export function rowCorrelation(U: number[][], cols?: number[]): number[][] {
  const n = U.length;
  const idx = cols ?? (U[0] ? U[0].map((_, j) => j) : []);
  const L = idx.length;
  const colMean = idx.map((j) => U.reduce((s, r) => s + r[j], 0) / Math.max(1, n));
  const Z = U.map((r) => {
    const x = idx.map((j, t) => r[j] - colMean[t]);
    const mean = x.reduce((s, v) => s + v, 0) / Math.max(1, L);
    const c = x.map((v) => v - mean);
    const norm = Math.sqrt(c.reduce((s, v) => s + v * v, 0));
    return norm > 1e-12 ? c.map((v) => v / norm) : c.map(() => 0);
  });
  const S = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    S[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      let d = 0;
      for (let t = 0; t < L; t++) d += Z[i][t] * Z[j][t];
      S[i][j] = S[j][i] = d;
    }
  }
  return S;
}

/**
 * k-center greedy (Gonzalez 1985): repeatedly pick the entity farthest from every landmark so far, by 1 − correlation.
 * Probing where the map is least known; a 2-approximation of the best covering radius for the chosen count.
 */
export function farthestPoints(S: number[][], landmarks: number[], count: number, allowed: (i: number) => boolean = () => true): number[] {
  const n = S.length;
  const chosen = [...landmarks];
  const picks: number[] = [];
  const near = Array.from({ length: n }, (_, i) => (chosen.length ? Math.min(...chosen.map((l) => 1 - S[i][l])) : Infinity));
  for (let c = 0; c < count; c++) {
    let best = -1;
    for (let i = 0; i < n; i++) if (!chosen.includes(i) && allowed(i) && (best < 0 || near[i] > near[best] + 1e-12)) best = i;
    if (best < 0) break;
    chosen.push(best);
    picks.push(best);
    for (let i = 0; i < n; i++) near[i] = Math.min(near[i], 1 - S[i][best]);
  }
  return picks;
}

/** For one entity, the landmarks that rank it highest: the data behind "why is this here" (E6, 0 calls). */
export function topLandmarks(row: number[], k = 3): { col: number; pct: number }[] {
  return row
    .map((pct, col) => ({ col, pct }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, k);
}
