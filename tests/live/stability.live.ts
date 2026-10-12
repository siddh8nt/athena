import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { rowCorrelation } from "@/lib/taste/embed";
import { jacobiEigen, rng } from "@/lib/taste/linalg";
import { spectral, spectralFixed } from "@/lib/taste/spectral";
import { consensusLabels, membership } from "@/lib/taste/consensus";
import type { CrowdsResult } from "@/lib/journey/types";

// Offline (0 Qloo calls): how stable are the crowds in a cached Galaxy, by three measures, against a null where each
// probe column is shuffled within its domain (the same marginals, no shared taste structure).
// FILE=<path> picks a cached crowds result; default is the newest in .cache/store/crowds.

const dir = path.join(".cache", "store", "crowds");
const file = process.env.FILE ?? readdirSync(dir).map((f) => path.join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];

/** Resampling: bootstrap columns, or 80% subsamples; k, kNN and a rank-r denoise can be forced for comparison. */
type Opts = { sub?: boolean; k?: number; knn?: number; rank?: number };

/** Rank-r reconstruction of the column-centred matrix (top singular directions only). */
function denoise(U: number[][], r: number): number[][] {
  const n = U.length;
  const L = U[0].length;
  const mean = U[0].map((_, l) => U.reduce((s, row) => s + row[l], 0) / n);
  const X = U.map((row) => row.map((v, l) => v - mean[l]));
  const G = Array.from({ length: L }, (_, a) => Array.from({ length: L }, (_, b) => X.reduce((s, row) => s + row[a] * row[b], 0)));
  const { vectors } = jacobiEigen(G);
  const V = vectors.slice(0, r);
  return X.map((row) => {
    const z = V.map((v) => v.reduce((s, x, l) => s + x * row[l], 0));
    return row.map((_, l) => V.reduce((s, v, t) => s + z[t] * v[l], 0) + mean[l]);
  });
}

function analyse(U0: number[][], seed: number, o: Opts = {}, B = 100) {
  const rand = rng(seed);
  const L = U0[0].length;
  const prep = (cols?: number[]) => {
    const U = cols ? U0.map((row) => cols.map((c) => row[c])) : U0;
    return rowCorrelation(o.rank ? denoise(U, o.rank) : U);
  };
  const main = spectral(prep(), { rand, knn: o.knn, k: o.k });
  const k = main.k;
  const runs: number[][] = [];
  for (let b = 0; b < B; b++) {
    const cols = o.sub
      ? [...Array(L).keys()].sort(() => rand() - 0.5).slice(0, Math.round(0.8 * L))
      : Array.from({ length: L }, () => Math.floor(rand() * L));
    runs.push(spectralFixed(prep(cols), k, { start: main.vectors, rand, knn: o.knn }));
  }
  const n = U0.length;
  const C = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const r of runs) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (r[i] === r[j]) C[i][j] += 1 / B;
  const labels = consensusLabels(C, k, rand);
  // Matched membership (each resample's clusters mapped to the consensus crowds) and Hennig's mean Jaccard.
  const m = membership(runs, labels);
  const ids = [...new Set(labels)].sort((a, b) => a - b);
  const members = ids.map((c) => new Set(labels.map((l, i) => (l === c ? i : -1)).filter((i) => i >= 0)));
  const jac = members.map((A) =>
    runs.map((r) => {
      let best = 0;
      for (const c of new Set(r)) {
        const Bset = new Set(r.map((l, i) => (l === c ? i : -1)).filter((i) => i >= 0));
        const inter = [...A].filter((i) => Bset.has(i)).length;
        best = Math.max(best, inter / (A.size + Bset.size - inter));
      }
      return best;
    }),
  );
  const certainty = m.certainty;
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const q = (v: number[], p: number) => [...v].sort((a, b) => a - b)[Math.floor(p * (v.length - 1))];
  return {
    k,
    eig: main.values.slice(0, 6).map((v) => +v.toFixed(3)),
    sizes: members.map((s) => s.size),
    jaccardMean: jac.map((v) => +mean(v).toFixed(2)),
    recovered50: jac.map((v) => +(v.filter((x) => x >= 0.5).length / B).toFixed(2)),
    recovered75: jac.map((v) => +(v.filter((x) => x >= 0.75).length / B).toFixed(2)),
    certaintyMatched: [0.1, 0.5, 0.9].map((p) => +q(certainty, p).toFixed(2)),
    below60: certainty.filter((x) => x < 0.6).length,
    certainty,
  };
}

it("crowd stability on a cached Galaxy vs a shuffled null", () => {
  const stored = JSON.parse(readFileSync(file, "utf-8")) as { value: CrowdsResult };
  const g = stored.value.galaxy!;
  const U = g.u;
  const out: string[] = [`file ${file}`, `crowds ${stored.value.crowds.map((c) => c.name).join(" | ")}`, `n ${U.length} × ${U[0].length}`];
  const domains = g.nodes.map((n) => n.domain);
  const nulls = [0, 1, 2].map((rep) => {
    const r = rng(100 + rep);
    const N = U.map((row) => [...row]);
    for (let l = 0; l < U[0].length; l++)
      for (const d of new Set(domains)) {
        const idx = domains.map((x, i) => (x === d ? i : -1)).filter((i) => i >= 0);
        const vals = idx.map((i) => U[i][l]);
        for (let a = vals.length - 1; a > 0; a--) {
          const b = Math.floor(r() * (a + 1));
          [vals[a], vals[b]] = [vals[b], vals[a]];
        }
        idx.forEach((i, t) => (N[i][l] = vals[t]));
      }
    return N;
  });
  const configs: [string, Opts][] = [
    ["boot", {}],
    ["sub80", { sub: true }],
    ["sub80 k2", { sub: true, k: 2 }],
    ["sub80 knn12", { sub: true, knn: 12 }],
    ["sub80 rank4", { sub: true, rank: 4 }],
    ["sub80 rank4 knn12", { sub: true, rank: 4, knn: 12 }],
  ];
  const avg = (v: number[]) => +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(2);
  for (const [name, o] of configs) {
    const real = analyse(U, 11, o);
    const nul = nulls.map((N, t) => analyse(N, 21 + t, o));
    const p95 = [...nul.flatMap((x) => x.certainty)].sort((a, b) => a - b)[Math.floor(0.95 * nul.length * U.length)];
    out.push(
      `${name.padEnd(18)} k=${real.k} sizes=${real.sizes.join("/")} | jac ${real.jaccardMean.join("/")} vs null ${avg(nul.map((x) => avg(x.jaccardMean)))} | rec50 ${real.recovered50.join("/")} vs null ${avg(nul.map((x) => avg(x.recovered50)))} | cert med/p90 ${real.certaintyMatched[1]}/${real.certaintyMatched[2]} vs null ${avg(nul.map((x) => x.certaintyMatched[1]))}/${avg(nul.map((x) => x.certaintyMatched[2]))} | core(>null p95=${p95.toFixed(2)}) ${real.certainty.filter((c) => c > p95).length} | λ ${real.eig.slice(1, 4).join(",")} vs null ${nul[0].eig.slice(1, 4).join(",")}`,
    );
    console.log(out[out.length - 1]);
  }
  mkdirSync(path.join(".cache", "live"), { recursive: true });
  writeFileSync(path.join(".cache", "live", "stability.txt"), out.join("\n"));
  console.log(out.join("\n"));
});
