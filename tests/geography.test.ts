import { describe, expect, it } from "vitest";
import { geohashBounds, geohashEncode, geohashNeighbours } from "@/lib/geo/geohash";
import { bhThreshold, clusters, giStar, hotCells, percentilesOf, upperTail } from "@/lib/geo/hotspots";
import { geographyFrom, type CellPop } from "@/lib/geo/geography";
import type { HeatmapCell } from "@/lib/qloo/types";

// Crowd geography (§9.26): geohash neighbours, Gi* hotspots under Benjamini–Hochberg, crowd weather and reach.

/** A deterministic uniform stream (mulberry32). */
function rand(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A grid of geohash-4 cells, rows × cols, starting at a corner in Kansas. */
function grid(rows: number, cols: number): string[][] {
  const start = geohashBounds(geohashEncode(37, -100, 4))!;
  const w = start[2] - start[0];
  const h = start[3] - start[1];
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => geohashEncode(start[1] + (r + 0.5) * h, start[0] + (c + 0.5) * w, 4)));
}

describe("geohash", () => {
  it("finds the 8 cells that touch a cell", () => {
    const g = grid(3, 3);
    const around = geohashNeighbours(g[1][1]).sort();
    expect(around).toEqual([g[0][0], g[0][1], g[0][2], g[1][0], g[1][2], g[2][0], g[2][1], g[2][2]].sort());
  });
});

describe("hotspot statistics", () => {
  it("ranks values into percentiles, ties sharing their mean rank", () => {
    const p = percentilesOf(new Map([["a", 1], ["b", 5], ["c", 5], ["d", 9]]));
    expect(p.get("a")).toBe(0);
    expect(p.get("b")).toBe(0.5);
    expect(p.get("c")).toBe(0.5);
    expect(p.get("d")).toBe(1);
  });

  it("has the normal tail and the Benjamini–Hochberg cut right", () => {
    expect(upperTail(1.6449)).toBeCloseTo(0.05, 4);
    expect(upperTail(-1.96)).toBeCloseTo(0.975, 4);
    expect(bhThreshold([0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205], 0.05)).toBe(0.008);
    expect(bhThreshold([0.5, 0.9], 0.05)).toBe(0);
  });

  it("finds a planted hot cluster and little else; pure noise gives almost nothing", () => {
    const g = grid(30, 30);
    const r = rand(7);
    const planted = new Set<string>();
    const values = new Map<string, number>();
    g.forEach((row, i) =>
      row.forEach((cell, j) => {
        const inside = i >= 10 && i < 18 && j >= 12 && j < 20;
        if (inside) planted.add(cell);
        values.set(cell, inside ? 0.8 + 0.2 * r() : r());
      }),
    );
    const hot = hotCells(values);
    // Gi* scores each cell with its 8 neighbours, so the cluster's interior is certain; its edge, half background, may
    // not clear a 5% false discovery rate, and nothing far from it should.
    const interior = [...planted].filter((c) => geohashNeighbours(c).every((n) => planted.has(n)));
    expect(interior).toHaveLength(36);
    expect(interior.every((c) => hot.has(c))).toBe(true);
    const far = [...hot].filter((c) => !planted.has(c) && !geohashNeighbours(c).some((n) => planted.has(n)));
    expect(far.length).toBeLessThanOrEqual(3);
    expect(clusters(hot).sort((a, b) => b.length - a.length)[0].length).toBeGreaterThanOrEqual(36);

    const noise = new Map(g.flat().map((c) => [c, r()] as const));
    expect(hotCells(noise).size).toBeLessThanOrEqual(5);
    expect(giStar(noise).size).toBe(900);
  });
});

describe("crowd geography", () => {
  const g = grid(12, 12);
  const cells = g.flat();
  const cp: CellPop = { counties: ["KS|Ford County"], cells: Object.fromEntries(cells.map((c) => [c, [1000, 0]])) };
  const heat = (score: (i: number, j: number) => number): HeatmapCell[] =>
    g.flatMap((row, i) => row.map((gh, j) => ({ location: { latitude: 0, longitude: 0, geohash: gh }, query: { affinity: score(i, j), affinity_rank: 0, popularity: 0 } })));
  // Crowd A loves the west of the grid, crowd B the east.
  const a = heat((i, j) => 12 - j + ((i * 7 + j * 3) % 5) / 10);
  const b = heat((i, j) => j + ((i * 3 + j * 7) % 5) / 10);
  const crowds = [
    { id: "a", name: "West", signal: ["x"] },
    { id: "b", name: "East", signal: ["y"] },
  ];

  it("colours each cell by the crowd that ranks it higher, and finds where each stands out", () => {
    const out = geographyFrom(crowds, [a, b], cp);
    const lead = new Map(out.cells.map(([gh, c]) => [gh, c]));
    expect(lead.get(g[5][0])).toBe(0);
    expect(lead.get(g[5][11])).toBe(1);
    expect(out.crowds[0].leads + out.crowds[1].leads).toBe(144 * 1000);
    expect(out.crowds[0].hot).toBeGreaterThan(0);
    // Hot cells of A sit in the west, and A stands out only where it leads.
    for (const [gh, , , mask] of out.cells) if (mask & 1) expect(lead.get(gh)).toBeDefined();
    expect(out.crowds[0].standsOut.length).toBeGreaterThan(0);
    expect(out.crowds[0].hotspots[0].label).toBe("Ford County, KS");
  });

  it("drops cells with no residents and keeps a crowd whose call failed out of the weather", () => {
    const outside = { location: { latitude: 0, longitude: 0, geohash: "f000" }, query: { affinity: 99, affinity_rank: 0, popularity: 0 } };
    const out = geographyFrom(crowds, [[...a, outside], null], cp);
    expect(out.cells.find(([gh]) => gh === "f000")).toBeUndefined();
    expect(out.cells.every(([, c]) => c === 0)).toBe(true);
    expect(out.crowds[1].cells).toBe(0);
    expect(geographyFrom(crowds, [null, null], cp).empty).toBe(true);
  });
});
