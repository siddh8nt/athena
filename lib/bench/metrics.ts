import { rng } from "@/lib/taste/linalg";

// Taste Bench metrics (PRD §10.6). Pure. A ranking is a list of tie groups, best first: [[a], [b], [c, d]] puts a
// first, b second, and c and d tied for third and fourth. Every metric treats a tie as the average over its orders,
// so an arm never gains or loses by how ties happen to be broken.

export type Ranking = string[][];

/** An ordered list → a ranking over the candidates: listed candidates in order, the rest tied last. Unknown and repeated ids are ignored. */
export function toRanking(order: string[], candidates: string[]): Ranking {
  const pool = new Set(candidates);
  const seen = new Set<string>();
  const out: Ranking = [];
  for (const id of order) if (pool.has(id) && !seen.has(id)) (seen.add(id), out.push([id]));
  const rest = candidates.filter((id) => !seen.has(id));
  if (rest.length) out.push(rest);
  return out;
}

/** Candidates ordered by a score, highest first; equal scores tie. Missing scores tie last. */
export function rankByScore(candidates: string[], score: (id: string) => number | undefined): Ranking {
  const scored = candidates.filter((id) => Number.isFinite(score(id)));
  const groups = new Map<number, string[]>();
  for (const id of scored) groups.set(score(id)!, [...(groups.get(score(id)!) ?? []), id]);
  const out = [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([, ids]) => ids);
  const rest = candidates.filter((id) => !Number.isFinite(score(id)));
  return rest.length ? [...out, rest] : out;
}

/** 1-based average rank of every id in the ranking. */
export function averageRanks(r: Ranking): Map<string, number> {
  const out = new Map<string, number>();
  let start = 1;
  for (const g of r) {
    for (const id of g) out.set(id, start + (g.length - 1) / 2);
    start += g.length;
  }
  return out;
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Spearman's ρ between a ranking and true values (higher value = should rank higher), with average ranks for ties on both sides. */
export function spearman(r: Ranking, truth: Map<string, number>): number {
  const ids = r.flat();
  const pred = averageRanks(r);
  const want = averageRanks(rankByScore(ids, (id) => truth.get(id) ?? 0));
  return pearson(
    ids.map((id) => pred.get(id)!),
    ids.map((id) => want.get(id)!),
  );
}

/** NDCG@k with linear gains; a tie group spread over positions gets its average gain at each (McSherry & Najork, 2008). */
export function ndcgAt(r: Ranking, gain: Map<string, number>, k: number): number {
  const disc = (p: number) => 1 / Math.log2(p + 1);
  let dcg = 0;
  let pos = 1;
  for (const g of r) {
    const avg = g.reduce((s, id) => s + (gain.get(id) ?? 0), 0) / g.length;
    for (let p = pos; p < pos + g.length && p <= k; p++) dcg += avg * disc(p);
    pos += g.length;
  }
  const ideal = r.flat().map((id) => gain.get(id) ?? 0).sort((a, b) => b - a);
  const idcg = ideal.slice(0, k).reduce((s, x, i) => s + x * disc(i + 1), 0);
  return idcg > 0 ? dcg / idcg : NaN;
}

/** AUC: P(a random positive ranks above a random negative); ties count 0.5. Negatives are every ranked id that isn't positive. */
export function aucOf(r: Ranking, positives: Set<string>): number {
  const at = new Map<string, number>();
  r.forEach((g, i) => g.forEach((id) => at.set(id, i)));
  const pos = [...at.keys()].filter((id) => positives.has(id));
  const neg = [...at.keys()].filter((id) => !positives.has(id));
  if (!pos.length || !neg.length) return NaN;
  let sum = 0;
  for (const p of pos) for (const n of neg) sum += at.get(p)! < at.get(n)! ? 1 : at.get(p) === at.get(n) ? 0.5 : 0;
  return sum / (pos.length * neg.length);
}

/** Expected precision@k: a tie group cut by position k counts its positives pro rata. */
export function precisionAt(r: Ranking, positives: Set<string>, k: number): number {
  let hits = 0;
  let pos = 0;
  for (const g of r) {
    if (pos >= k) break;
    const take = Math.min(g.length, k - pos);
    hits += (g.filter((id) => positives.has(id)).length * take) / g.length;
    pos += g.length;
  }
  return hits / k;
}

export type PairedCI = { n: number; mean: number; lo: number; hi: number; pass: boolean };

/**
 * Mean of per-brand paired differences with a 95% percentile bootstrap CI over brands (§10.6: 10,000 resamples).
 * Pass: the mean is above 0 and the CI excludes 0.
 */
export function pairedBootstrap(diffs: number[], B = 10_000, seed = 16_10_2026): PairedCI {
  const d = diffs.filter(Number.isFinite);
  const n = d.length;
  const mean = n ? d.reduce((s, x) => s + x, 0) / n : NaN;
  if (n < 2) return { n, mean, lo: NaN, hi: NaN, pass: false };
  const rand = rng(seed);
  const means = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += d[Math.floor(rand() * n)];
    means[b] = s / n;
  }
  means.sort();
  const lo = means[Math.floor(0.025 * (B - 1))];
  const hi = means[Math.ceil(0.975 * (B - 1))];
  return { n, mean, lo, hi, pass: mean > 0 && lo > 0 };
}
