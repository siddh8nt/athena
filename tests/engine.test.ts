import { describe, expect, it } from "vitest";
import { dense, jacobiEigen, kmeans, rng, topEigen } from "@/lib/taste/linalg";
import { farthestPoints, percentiles, rowCorrelation, topLandmarks } from "@/lib/taste/embed";
import { eigengapK, knnAffinity, normalised, spectral } from "@/lib/taste/spectral";
import { adjustedRand, ambiguity, coassociationOf, consensusLabels, membership, nullCertainty, resample } from "@/lib/taste/consensus";
import { specificity } from "@/lib/taste/specificity";

// The taste engine's maths (PRD §9.23, v4.0) on synthetic matrices with known structure.

/** `groups` crowds of `size` entities; each landmark belongs to one crowd and ranks that crowd's members high. */
function planted(groups: number, size: number, landmarks: number, noise: number, seed = 1) {
  const r = rng(seed);
  const truth = Array.from({ length: groups * size }, (_, i) => Math.floor(i / size));
  const owner = Array.from({ length: landmarks }, (_, l) => l % groups);
  const U = truth.map((g) => owner.map((o) => Math.min(0.99, Math.max(0.01, (o === g ? 0.75 : 0.3) + (r() - 0.5) * noise))));
  return { U, truth, owner };
}

describe("linear algebra", () => {
  it("diagonalises a symmetric matrix", () => {
    const r = rng(3);
    const n = 12;
    const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = i; j < n; j++) A[i][j] = A[j][i] = r() - 0.5;
    const { values, vectors } = jacobiEigen(A);
    expect(values[0]).toBeGreaterThanOrEqual(values[n - 1]);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) expect(values.reduce((s, v, k) => s + v * vectors[k][i] * vectors[k][j], 0)).toBeCloseTo(A[i][j], 8);
    expect(jacobiEigen([[2, 1], [1, 2]]).values.map((v) => +v.toFixed(9))).toEqual([3, 1]);
  });

  it("finds the same top eigenvalues by orthogonal iteration", () => {
    const { U } = planted(3, 15, 12, 0.3);
    const M = normalised(knnAffinity(rowCorrelation(U), 6)).dense();
    const full = jacobiEigen(M).values.slice(0, 3);
    const top = topEigen(dense(M), M.length, 3, { iters: 300 }).values;
    top.forEach((v, i) => expect(v).toBeCloseTo(full[i], 4));
  });

  it("separates well-apart clusters with k-means", () => {
    const X = [...Array.from({ length: 10 }, (_, i) => [i * 0.01, 0]), ...Array.from({ length: 10 }, (_, i) => [5 + i * 0.01, 5])];
    const labels = kmeans(X, 2, rng(1));
    expect(new Set(labels.slice(0, 10)).size).toBe(1);
    expect(labels[0]).not.toBe(labels[10]);
  });
});

describe("landmark embedding", () => {
  it("turns one Qloo order into within-probe percentiles, unscored tied at the bottom", () => {
    const p = percentiles(["a", "b", "x"], ["a", "b", "c", "d"]);
    expect(p.get("a")).toBeCloseTo(0.875);
    expect(p.get("b")).toBeCloseTo(0.625);
    expect(p.get("c")).toBeCloseTo(0.25);
    expect(p.get("d")).toBeCloseTo(0.25);
    expect(p.has("x")).toBe(false);
  });

  it("is invariant to how Qloo scales scores: only the order matters", () => {
    const pool = ["a", "b", "c"];
    expect([...percentiles(["c", "a", "b"], pool)]).toEqual([...percentiles(["c", "a", "b"], [...pool])]);
  });

  it("correlates entities that the same landmarks rank alike", () => {
    const S = rowCorrelation([[0.9, 0.1, 0.8], [0.8, 0.2, 0.9], [0.1, 0.9, 0.2]]);
    expect(S[0][1]).toBeGreaterThan(0.5);
    expect(S[0][2]).toBeLessThan(0);
  });

  it("probes where the map is least known (k-center greedy)", () => {
    const { U, truth } = planted(3, 10, 9, 0.2);
    const S = rowCorrelation(U);
    // Landmarks so far all sit in crowd 0; the next two picks cover crowds 1 and 2.
    const picks = farthestPoints(S, [0, 1], 2);
    expect(new Set(picks.map((i) => truth[i]))).toEqual(new Set([1, 2]));
  });

  it("names the landmarks that rank an entity highest", () => {
    expect(topLandmarks([0.2, 0.9, 0.5], 2).map((x) => x.col)).toEqual([1, 2]);
  });
});

describe("spectral crowds", () => {
  it("recovers planted crowds and picks k by eigengap", () => {
    const { U, truth } = planted(3, 20, 16, 0.5);
    const s = spectral(rowCorrelation(U), { rand: rng(1) });
    expect(s.k).toBe(3);
    expect(adjustedRand(s.labels, truth)).toBeGreaterThan(0.9);
  });

  it("finds two crowds when there are two", () => {
    const { U, truth } = planted(2, 25, 12, 0.5, 4);
    const s = spectral(rowCorrelation(U), { rand: rng(2) });
    expect(s.k).toBe(2);
    expect(adjustedRand(s.labels, truth)).toBeGreaterThan(0.9);
  });

  it("chooses the k after the largest eigengap", () => {
    expect(eigengapK([1, 0.98, 0.97, 0.4, 0.35], 2, 4)).toBe(3);
    expect(eigengapK([1, 0.5, 0.45, 0.4, 0.35], 2, 4)).toBe(2);
  });
});

describe("consensus", () => {
  it("scores the adjusted Rand index", () => {
    expect(adjustedRand([0, 0, 1, 1], [1, 1, 0, 0])).toBe(1);
    expect(adjustedRand([0, 0, 1, 1], [0, 1, 0, 1])).toBeLessThan(0.1);
  });

  it("holds planted crowds together across resamples and flags an entity between them", () => {
    const { U, truth } = planted(3, 15, 15, 0.5, 9);
    // One extra entity loved equally by crowd 0's and crowd 1's landmarks.
    const between = U[0].map((_, l) => (l % 3 === 2 ? 0.3 : 0.75));
    const X = [...U, between];
    const rand = rng(5);
    const main = spectral(rowCorrelation(X), { rand });
    const runs = resample(X, main.k, { B: 40, start: main.vectors, rand });
    const labels = consensusLabels(coassociationOf(runs), main.k, rand);
    expect(adjustedRand(labels.slice(0, truth.length), truth)).toBeGreaterThan(0.9);
    const m = membership(runs, labels);
    m.stability.forEach((s) => expect(s).toBeGreaterThan(0.8));
    m.p.forEach((row) => expect(row.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 6));
    const typical = m.certainty.slice(0, truth.length).reduce((s, v) => s + v, 0) / truth.length;
    expect(m.certainty[truth.length]).toBeLessThan(typical);
    expect(ambiguity(m.p[truth.length])).toBeGreaterThan(ambiguity(m.p[0]));
  });

  it("sets the core's bar from shuffled data: planted crowds clear it, noise mostly doesn't", () => {
    const { U } = planted(3, 15, 15, 0.5, 9);
    const domains = U.map((_, i) => (i % 2 ? "brand" : "artist"));
    const rand = rng(8);
    const bar = nullCertainty(U, domains, 3, { B: 30, rand });
    const main = spectral(rowCorrelation(U), { k: 3, rand });
    const runs = resample(U, 3, { B: 30, start: main.vectors, rand });
    const m = membership(runs, consensusLabels(coassociationOf(runs), 3, rand));
    expect(m.certainty.filter((c) => c > bar).length).toBeGreaterThan(U.length * 0.8);
    const noise = U.map((row) => row.map(() => rand()));
    const nm = spectral(rowCorrelation(noise), { k: 3, rand });
    const nruns = resample(noise, 3, { B: 30, start: nm.vectors, rand });
    const nmem = membership(nruns, consensusLabels(coassociationOf(nruns), 3, rand));
    expect(nmem.certainty.filter((c) => c > bar).length).toBeLessThan(U.length * 0.25);
  });
});

describe("specificity", () => {
  it("finds the entity loved more than its popularity predicts, per domain", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ domain: i < 6 ? "brand" : "artist", popularity: 0.1 + 0.07 * i }));
    const y = items.map((x) => 0.2 + 0.5 * x.popularity);
    y[2] += 0.3; // a niche brand this crowd loves
    const s = specificity(items, y);
    expect(s.indexOf(Math.max(...s))).toBe(2);
    expect(specificity([{ domain: "brand" }], [0.9])).toEqual([0]);
  });
});
