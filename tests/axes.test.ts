import { describe, expect, it } from "vitest";
import { chooseRank, nmf, rmse, tasteAxes } from "@/lib/taste/axes";
import { rng } from "@/lib/taste/linalg";
import type { Node } from "@/lib/taste/graph";

// Taste axes (§9.27): masked NMF recovers planted structure, the rank is chosen on held-out entries, and each axis's
// top entities are the ones planted on it.

/** A rows × cols non-negative matrix of rank k: each row loads on one block of columns (its group), plus small noise. */
function planted(rows: number, cols: number, k: number, noise = 0.02, seed = 7) {
  const r = rng(seed);
  const group = Array.from({ length: rows }, (_, i) => i % k);
  const colGroup = Array.from({ length: cols }, (_, j) => j % k);
  const V = group.map((g) => colGroup.map((cg) => Math.min(1, Math.max(0, (cg === g ? 0.85 : 0.15) + noise * (r() - 0.5)))));
  return { V, group };
}

const nodes = (n: number): Node[] => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, name: `Entity ${i}`, domain: "brand", affinity: 0.5, tags: [] }) as unknown as Node);

describe("nmf", () => {
  it("reconstructs a planted rank-3 matrix", () => {
    const { V } = planted(60, 12, 3);
    const f = nmf(V, 3);
    expect(f.W.flat().every((x) => x >= 0) && f.H.flat().every((x) => x >= 0)).toBe(true);
    expect(rmse(V, f, () => true)).toBeLessThan(0.03);
  });

  it("fits only the entries in the mask", () => {
    const { V } = planted(60, 12, 3);
    const mask = V.map((r, i) => r.map((_, j) => ((i + j) % 7 === 0 ? 0 : 1)));
    // Poison the hidden entries: a masked fit must not see them.
    const poisoned = V.map((r, i) => r.map((v, j) => (mask[i][j] ? v : 50)));
    const f = nmf(poisoned, 3, mask);
    expect(rmse(V, f, (i, j) => mask[i][j] === 0)).toBeLessThan(0.05);
  });

  it("is deterministic", () => {
    const { V } = planted(30, 8, 3);
    expect(nmf(V, 3, undefined, { iters: 50 })).toEqual(nmf(V, 3, undefined, { iters: 50 }));
  });
});

describe("chooseRank", () => {
  it("picks the planted rank when it is in range", () => {
    expect(chooseRank(planted(80, 16, 4).V).rank).toBe(4);
    expect(chooseRank(planted(80, 16, 3).V).rank).toBe(3);
  });
});

describe("tasteAxes", () => {
  it("puts each planted group's entities at the top of one axis", () => {
    const { V, group } = planted(90, 15, 3);
    const out = tasteAxes(V, nodes(90))!;
    expect(out.rank).toBe(3);
    expect(out.axes).toHaveLength(3);
    const groupsOnTop = out.axes.map((a) => new Set(a.top.map((n) => group[Number(n.id.slice(1))])));
    // Each axis's top entities come from a single group, and the three axes cover all three groups.
    for (const g of groupsOnTop) expect(g.size).toBe(1);
    expect(new Set(groupsOnTop.map((g) => [...g][0])).size).toBe(3);
    // Loads are shares: one entity's loads sum to about 1.
    const sum = out.axes.reduce((s, a) => s + (a.load.get("e0") ?? 0), 0);
    expect(sum).toBeGreaterThan(0.97);
    expect(sum).toBeLessThan(1.03);
  });

  it("declines a matrix too small to factorise", () => {
    expect(tasteAxes(planted(8, 3, 2).V, nodes(8))).toBeUndefined();
  });
});
