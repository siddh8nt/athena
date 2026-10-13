// Deterministic ranking maths (PRD §9.6–9.8, §9.14, §9.16, §10.3).
// Rule: never compare raw affinity across calls. Compare percentiles over one fixed pool.

/** Percentile from rank within one call: p = 1 − (rank − 1)/(n − 1). A single item gets 1. */
export function percentiles(orderedIds: string[]): Map<string, number> {
  const n = orderedIds.length;
  const out = new Map<string, number>();
  orderedIds.forEach((id, i) => out.set(id, n <= 1 ? 1 : 1 - i / (n - 1)));
  return out;
}

/** Mutual fit = min(forward, reverse) (§9.6). Undefined when the reverse side is missing. */
export function mutualFit(pForward: number, pReverse: number | undefined): number | undefined {
  return pReverse === undefined ? undefined : Math.min(pForward, pReverse);
}

export type Bridge = { id: string; pAccounts: number; pVenue: number; value: number };

/**
 * Bridge score between two signals (§9.28, v4.0): the harmonic mean of the entity's percentiles under each. High only
 * when both sides love it, and, unlike min(), it still tells a 0.99 / 0.92 bridge from a 0.92 / 0.92 one.
 */
export function bridgeScore(a: number, b: number): number {
  return a + b > 0 ? (2 * a * b) / (a + b) : 0;
}

/** Bridges (§9.8): both sides at least `threshold`, ordered by the bridge score (§9.28); the top `max`. */
export function bridges(
  pAccounts: Map<string, number>,
  pVenue: Map<string, number>,
  threshold = 0.7,
  max = 2,
): Bridge[] {
  const out: Bridge[] = [];
  for (const [id, a] of pAccounts) {
    const v = pVenue.get(id);
    if (v === undefined) continue;
    if (Math.min(a, v) >= threshold) out.push({ id, pAccounts: a, pVenue: v, value: bridgeScore(a, v) });
  }
  return out.sort((x, y) => y.value - x.value || y.pAccounts - x.pAccounts).slice(0, max);
}

export type Reranked = { id: string; score?: number; pFit?: number; pDec: number; scored: boolean; previousIndex: number };

/**
 * Re-rank over a fixed pool (§9.7): score = pFit − λ·pDec, ties broken by pFit.
 * Items without pFit keep their previous relative order below every scored item.
 * An item missing from the decline call gets pDec = 0.
 */
export function rerank(
  previousOrder: string[],
  pFit: Map<string, number>,
  pDec: Map<string, number> | undefined,
  lambda = 0.5,
): Reranked[] {
  const rows: Reranked[] = previousOrder.map((id, previousIndex) => {
    const fit = pFit.get(id);
    const dec = pDec?.get(id) ?? 0;
    return fit === undefined
      ? { id, pDec: dec, scored: false, previousIndex }
      : { id, pFit: fit, pDec: dec, score: fit - lambda * dec, scored: true, previousIndex };
  });
  const scored = rows.filter((r) => r.scored).sort((a, b) => b.score! - a.score! || b.pFit! - a.pFit! || a.previousIndex - b.previousIndex);
  const unscored = rows.filter((r) => !r.scored).sort((a, b) => a.previousIndex - b.previousIndex);
  return [...scored, ...unscored];
}

export type PositionClass = "shared" | "onlyYou" | "onlyThem" | null;

/** Shared-pool positioning (§9.16). Unscored tags count as p = 0. */
export function classifyTag(pYou: number | undefined, pThem: number | undefined, hi = 0.7, lo = 0.4): PositionClass {
  const y = pYou ?? 0;
  const t = pThem ?? 0;
  if (y >= hi && t >= hi) return "shared";
  if (y >= hi && t <= lo) return "onlyYou";
  if (t >= hi && y <= lo) return "onlyThem";
  return null;
}

export function positioning(
  pool: string[],
  pYou: Map<string, number>,
  pThem: Map<string, number>,
  perClass = 3,
): { shared: string[]; onlyYou: string[]; onlyThem: string[] } {
  const buckets = { shared: [] as [string, number][], onlyYou: [] as [string, number][], onlyThem: [] as [string, number][] };
  for (const tag of pool) {
    const c = classifyTag(pYou.get(tag), pThem.get(tag));
    if (!c) continue;
    const strength = c === "onlyThem" ? (pThem.get(tag) ?? 0) : c === "shared" ? Math.min(pYou.get(tag) ?? 0, pThem.get(tag) ?? 0) : (pYou.get(tag) ?? 0);
    buckets[c].push([tag, strength]);
  }
  const top = (xs: [string, number][]) => xs.sort((a, b) => b[1] - a[1]).slice(0, perClass).map(([t]) => t);
  return { shared: top(buckets.shared), onlyYou: top(buckets.onlyYou), onlyThem: top(buckets.onlyThem) };
}

/**
 * AUC for the ranking check (§10.3): P(random positive ranks above random negative), ties = 0.5.
 * `rank` maps id → position (0 = best); ids missing from `rank` are unscored and tie below all scored ids.
 */
export function auc(positives: string[], negatives: string[], rank: Map<string, number>): number {
  if (!positives.length || !negatives.length) return NaN;
  const pos = (id: string) => rank.get(id) ?? Number.POSITIVE_INFINITY;
  let sum = 0;
  for (const p of positives) {
    for (const n of negatives) {
      const a = pos(p);
      const b = pos(n);
      sum += a < b ? 1 : a === b ? 0.5 : 0;
    }
  }
  return sum / (positives.length * negatives.length);
}

export function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
