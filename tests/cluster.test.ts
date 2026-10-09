import { describe, expect, it } from "vitest";
import { centerColumns, cosine, crowdRules, knnGraph, louvain, rankScale } from "@/lib/taste/cluster";

// The taste-graph maths (PRD §9.23 steps 3–4).

describe("rankScale", () => {
  it("scales a ranked list from 1 down", () => {
    const m = rankScale(["a", "b", "c", "d"]);
    expect(m.get("a")).toBe(1);
    expect(m.get("d")).toBe(0.25);
  });
});

describe("louvain", () => {
  /** Two clear groups of vectors (one pointing at hubs 0–2, one at hubs 3–5), plus noise. */
  function twoGroups(n = 10) {
    const rows: number[][] = [];
    for (let i = 0; i < n; i++) rows.push([1, 0.9, 0.8, 0, 0.1, 0].map((v) => v + ((i * 7) % 5) * 0.02));
    for (let i = 0; i < n; i++) rows.push([0, 0.1, 0, 1, 0.9, 0.8].map((v) => v + ((i * 3) % 5) * 0.02));
    return rows;
  }

  it("finds two communities when the vectors have two", () => {
    const groups = louvain(knnGraph(centerColumns(twoGroups()), 5));
    expect(new Set(groups.slice(0, 10)).size).toBe(1);
    expect(new Set(groups.slice(10)).size).toBe(1);
    expect(groups[0]).not.toBe(groups[10]);
  });

  it("is deterministic", () => {
    const v = centerColumns(twoGroups());
    expect(louvain(knnGraph(v))).toEqual(louvain(knnGraph(v)));
  });

  it("handles an empty or edgeless graph", () => {
    expect(louvain([])).toEqual([]);
    expect(louvain([[0, 0], [0, 0]])).toEqual([0, 1]);
  });
});

describe("crowdRules", () => {
  const vec = (a: number) => [a, 1 - a];

  it("merges a crowd that is too small into the most similar one", () => {
    const groups = [...Array(9).fill(0), ...Array(9).fill(1), 2, 2];
    const vectors = [...Array(9).fill(vec(1)), ...Array(9).fill(vec(0)), vec(0.9), vec(0.95)];
    const members = groups.map((_, i) => ({ domain: i % 2 ? "brand" : "artist" }));
    const out = crowdRules(groups, vectors, members);
    expect(new Set(out).size).toBe(2);
    expect(out[18]).toBe(out[0]); // the two stragglers joined the crowd they resemble
  });

  it("merges a single-domain crowd even when it is big enough", () => {
    const groups = [...Array(10).fill(0), ...Array(10).fill(1)];
    const vectors = [...Array(10).fill(vec(1)), ...Array(10).fill(vec(0))];
    const members = groups.map((g, i) => ({ domain: g === 0 ? (i % 2 ? "brand" : "artist") : "tv_show" }));
    expect(new Set(crowdRules(groups, vectors, members)).size).toBe(1);
  });

  it("keeps at most three crowds", () => {
    const groups = Array.from({ length: 40 }, (_, i) => Math.floor(i / 8));
    const vectors = groups.map((g) => vec(g / 4));
    const members = groups.map((_, i) => ({ domain: i % 2 ? "brand" : "artist" }));
    expect(new Set(crowdRules(groups, vectors, members)).size).toBe(3);
  });
});

describe("cosine", () => {
  it("is 1 for parallel vectors and 0 for a zero vector", () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});
