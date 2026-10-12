import { describe, expect, it } from "vitest";
import { aucOf, averageRanks, ndcgAt, pairedBootstrap, precisionAt, rankByScore, spearman, toRanking } from "@/lib/bench/metrics";
import { BENCH_BRANDS, independentsByMetro, isRetailerVenue, metroTruth, parseCsv, parseStockists, rankingCheckMetros, readStockists, stockedRetailers } from "@/lib/bench/truth";
import { RETAILER_POOLS } from "@/lib/stops/retailers";

describe("bench metrics", () => {
  it("builds rankings: listed first, the rest tied last", () => {
    expect(toRanking(["b", "x", "a", "b"], ["a", "b", "c", "d"])).toEqual([["b"], ["a"], ["c", "d"]]);
    expect(rankByScore(["a", "b", "c", "d"], (id) => ({ a: 1, b: 3, c: 1 })[id])).toEqual([["b"], ["a", "c"], ["d"]]);
    expect([...averageRanks([["a"], ["b", "c"], ["d"]])]).toEqual([["a", 1], ["b", 2.5], ["c", 2.5], ["d", 4]]);
  });

  it("Spearman: 1 for the true order, -1 reversed, ties averaged", () => {
    const truth = new Map([["a", 4], ["b", 3], ["c", 2], ["d", 1]]);
    expect(spearman([["a"], ["b"], ["c"], ["d"]], truth)).toBeCloseTo(1);
    expect(spearman([["d"], ["c"], ["b"], ["a"]], truth)).toBeCloseTo(-1);
    expect(spearman([["a", "b", "c", "d"]], truth)).toBe(0);
    expect(spearman([["a"], ["b"], ["c", "d"]], truth)).toBeCloseTo(0.9487, 3);
  });

  it("NDCG@k: 1 for the ideal order; a tie group gets its average gain", () => {
    const gain = new Map([["a", 3], ["b", 2], ["c", 0]]);
    expect(ndcgAt([["a"], ["b"], ["c"]], gain, 2)).toBeCloseTo(1);
    const idcg = 3 + 2 / Math.log2(3);
    expect(ndcgAt([["c"], ["b"], ["a"]], gain, 2)).toBeCloseTo((0 + 2 / Math.log2(3)) / idcg);
    expect(ndcgAt([["a", "b", "c"]], gain, 2)).toBeCloseTo(((5 / 3) * (1 + 1 / Math.log2(3))) / idcg);
  });

  it("AUC and precision@k count ties as half and pro rata", () => {
    const pos = new Set(["a", "b"]);
    expect(aucOf([["a"], ["b"], ["c"], ["d"]], pos)).toBe(1);
    expect(aucOf([["c"], ["a"], ["d"], ["b"]], pos)).toBe(0.25);
    expect(aucOf([["a", "c"], ["b", "d"]], pos)).toBe(0.5);
    expect(aucOf([["a"], ["b"]], pos)).toBeNaN();
    expect(precisionAt([["a"], ["c"], ["b"]], pos, 2)).toBe(0.5);
    expect(precisionAt([["c"], ["a", "b", "d", "e"]], pos, 3)).toBeCloseTo((0 + 2 * (2 / 4)) / 3);
  });

  it("paired bootstrap: CI brackets the mean, passes only when it clears 0, and is seeded", () => {
    const up = pairedBootstrap([0.2, 0.3, 0.25, 0.1, 0.35, 0.15, 0.3, 0.2], 2000);
    expect(up.lo).toBeLessThanOrEqual(up.mean);
    expect(up.hi).toBeGreaterThanOrEqual(up.mean);
    expect(up.pass).toBe(true);
    expect(pairedBootstrap([0.3, -0.2, 0.1, -0.25, 0.05, -0.1], 2000).pass).toBe(false);
    expect(pairedBootstrap([0.1, 0.2, 0.3], 500)).toEqual(pairedBootstrap([0.1, 0.2, 0.3], 500));
    expect(pairedBootstrap([0.4]).pass).toBe(false);
  });
});

describe("bench ground truth", () => {
  it("parses quoted CSV with commas, doubled quotes and CRLF", () => {
    expect(parseCsv('a,b,c\r\n"x, y","say ""hi""",3\n\n')).toEqual([["a", "b", "c"], ["x, y", 'say "hi"', "3"]]);
    const rows = parseStockists('brand,venue,address,city,state,metro,is_chain,lat,lon\nB,"Shop, Inc.","1 Main St, Atlanta",Atlanta,GA,Atlanta,no,33.7,-84.3\nB,Target #1,2 Elm,Austin,TX,Austin,yes,,\n');
    expect(rows[0]).toMatchObject({ venue: "Shop, Inc.", metroId: "atlanta", chain: false, lat: 33.7 });
    expect(rows[1]).toMatchObject({ metroId: "austin", chain: true, lat: undefined });
  });

  it("matches locator venues to retailers by name prefix", () => {
    expect(isRetailerVenue("FRESH MARKET #061", "The Fresh Market")).toBe(true);
    expect(isRetailerVenue("Citi Fresh Market", "The Fresh Market")).toBe(false);
    expect(isRetailerVenue("Sprouts Farmers Market #280", "Sprouts Farmers Market")).toBe(true);
    expect(isRetailerVenue("SPROUTS #12", "Sprouts Farmers Market")).toBe(true);
    expect(isRetailerVenue("HEB Plus", "H-E-B")).toBe(true);
    expect(isRetailerVenue("Gelsons Market", "Gelson's")).toBe(true);
    expect(isRetailerVenue("Targeted Nutrition", "Target")).toBe(false);
  });

  it("reads every Bench brand: 25 metros with Census-ready ids, metros A and B for the ranking check", () => {
    for (const b of BENCH_BRANDS) {
      const rows = readStockists(b.slug);
      expect(rows.length).toBeGreaterThan(100);
      expect(rows.every((r) => r.metroId)).toBe(true);
      expect(independentsByMetro(rows).size).toBe(25);
    }
    const mc = rankingCheckMetros(readStockists("mcclures"));
    expect([mc.a, mc.b]).toEqual(["detroit", "nyc"]);
    const t = metroTruth(readStockists("brightland"), new Map([["nyc", 2e7], ["la", 1e7]]));
    expect(t.find((x) => x.metroId === "nyc")).toMatchObject({ independents: 108, perMillion: 5.4 });
    expect(stockedRetailers(readStockists("fishwife"), RETAILER_POOLS.food).get("Target")).toBeGreaterThan(500);
  });
});
