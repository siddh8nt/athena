import { geohashNeighbours } from "./geohash";

// Hotspots (§9.26): Getis-Ord Gi* over each cell and its 8 geohash neighbours, with Benjamini–Hochberg control across
// cells. Pure statistics; the values are a crowd's within-response percentiles, so only Qloo's order is used.

/** Standard normal upper tail, P(Z > z) (Abramowitz & Stegun 7.1.26, error under 1.5e-7). */
export function upperTail(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erfc = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x);
  return z >= 0 ? erfc / 2 : 1 - erfc / 2;
}

/**
 * Gi* z-scores, binary weights over the cell and those of its 8 neighbours that have a value (Getis & Ord 1992; Ord &
 * Getis 1995). A positive z means the cell's neighbourhood holds higher values than the whole map would by chance.
 */
export function giStar(values: Map<string, number>): Map<string, number> {
  const n = values.size;
  const out = new Map<string, number>();
  if (n < 3) return out;
  let sum = 0;
  let sq = 0;
  for (const v of values.values()) {
    sum += v;
    sq += v * v;
  }
  const mean = sum / n;
  const s = Math.sqrt(Math.max(0, sq / n - mean * mean));
  if (s === 0) return out;
  for (const [cell, v] of values) {
    let local = v;
    let w = 1;
    for (const nb of geohashNeighbours(cell)) {
      const x = values.get(nb);
      if (x === undefined) continue;
      local += x;
      w++;
    }
    const denom = s * Math.sqrt((n * w - w * w) / (n - 1));
    out.set(cell, denom > 0 ? (local - mean * w) / denom : 0);
  }
  return out;
}

/** Benjamini–Hochberg (1995): the p-value threshold that keeps the expected false discovery rate at q. 0 when nothing passes. */
export function bhThreshold(pvalues: number[], q = 0.05): number {
  const p = [...pvalues].sort((a, b) => a - b);
  let cut = 0;
  for (let k = 0; k < p.length; k++) if (p[k] <= ((k + 1) / p.length) * q) cut = p[k];
  return cut;
}

/** The cells in significant hot clusters: one-sided Gi* (z > 0) under BH control at q. */
export function hotCells(values: Map<string, number>, q = 0.05): Set<string> {
  const z = giStar(values);
  const p = new Map([...z].map(([c, v]) => [c, upperTail(v)] as const));
  const cut = bhThreshold([...p.values()], q);
  return new Set([...p].filter(([c, pv]) => cut > 0 && pv <= cut && z.get(c)! > 0).map(([c]) => c));
}

/** Connected groups of cells (8-neighbour adjacency). */
export function clusters(cells: Set<string>): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const start of cells) {
    if (seen.has(start)) continue;
    const group: string[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const c = stack.pop()!;
      group.push(c);
      for (const nb of geohashNeighbours(c))
        if (cells.has(nb) && !seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
    }
    out.push(group);
  }
  return out;
}

/** Each entry's percentile (0–1) by its value's order among all entries; ties share their mean rank. */
export function percentilesOf(values: Map<string, number>): Map<string, number> {
  const sorted = [...values].sort((a, b) => a[1] - b[1]);
  const out = new Map<string, number>();
  const n = sorted.length;
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && sorted[j + 1][1] === sorted[i][1]) j++;
    const pct = n > 1 ? (i + j) / 2 / (n - 1) : 1;
    for (let k = i; k <= j; k++) out.set(sorted[k][0], pct);
    i = j + 1;
  }
  return out;
}
