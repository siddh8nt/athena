import { describe, expect, it } from "vitest";
import { blocksFor, buildPlaybook, signalIds } from "@/lib/playbook/config";
import { METROS, metroFor } from "@/lib/playbook/metros";

const signal = { accounts: [], wins: [], declines: [], comparables: ["c1", "c2"], tags: [], brand: "b" };

describe("recipes (§7.6)", () => {
  it("gives the three demo brands three different block orders", () => {
    const goods = buildPlaybook({ brandName: "Brightland", category: "G1", tier: "premium", signal: { ...signal, accounts: Array.from({ length: 12 }, (_, i) => `a${i}`) }, targetMetro: "la" });
    const app = buildPlaybook({ brandName: "Timeleft", category: "A1", tier: "mass", signal, targetMetro: "chicago" });
    const hw = buildPlaybook({ brandName: "Master & Dynamic", category: "T1", tier: "premium", signal, targetMetro: "la" });
    expect(goods.blocks).toEqual(["markets", "places", "partners", "message", "moments", "act"]);
    expect(app.blocks).toEqual(["markets", "places", "moments", "partners", "message", "act"]);
    expect(hw.blocks).toEqual(["partners", "message", "moments", "markets", "places", "act"]);
    expect(new Set([goods.recipe, app.recipe, hw.recipe]).size).toBe(3);
  });
  it("merges several motions in order, each block once", () => {
    expect(blocksFor(["partnership", "retail"])).toEqual(["partners", "message", "moments", "markets", "places", "act"]);
  });
  it("refuses out-of-scope categories", () => {
    expect(() => buildPlaybook({ brandName: "x", category: "A4", tier: "mass", signal, targetMetro: "la" })).toThrow();
  });
});

describe("stages and signals (§7.5)", () => {
  it("scaling brands use accounts only, capped at 50", () => {
    const accounts = Array.from({ length: 60 }, (_, i) => `a${i}`);
    const pb = buildPlaybook({ brandName: "x", category: "G1", tier: "premium", signal: { ...signal, accounts }, targetMetro: "la" });
    expect(pb.stage).toBe("scaling");
    const ids = signalIds(pb.signal, pb.stage);
    expect(ids.length).toBe(50);
    expect(ids).not.toContain("b");
    expect(pb.partnerParams).toEqual({});
  });
  it("early brands mix accounts and the brand, with the reach window", () => {
    const pb = buildPlaybook({ brandName: "x", category: "G1", tier: "premium", signal: { ...signal, accounts: ["a1", "a2"] }, targetMetro: "la" });
    expect(pb.stage).toBe("early");
    expect(signalIds(pb.signal, pb.stage)).toEqual(["a1", "a2", "b", "c1", "c2"]);
    expect(pb.partnerParams["filter.popularity.max"]).toBe(0.97);
  });
  it("excludes accounts, the brand and competitors", () => {
    const pb = buildPlaybook({ brandName: "x", category: "G1", tier: "premium", signal: { ...signal, accounts: ["a1"] }, competitors: ["k1"], targetMetro: "la" });
    expect(pb.exclude.sort()).toEqual(["a1", "b", "k1"]);
  });
});

describe("metros", () => {
  it("has 25 metros with unique ids", () => {
    expect(METROS.length).toBe(25);
    expect(new Set(METROS.map((m) => m.id)).size).toBe(25);
  });
  it("maps Qloo's metro names", () => {
    expect(metroFor("New York City")?.id).toBe("nyc");
    expect(metroFor("San Francisco")?.id).toBe("sf");
    expect(metroFor("Dallas")?.id).toBe("dfw");
    expect(metroFor("Portland")).toBeUndefined();
  });
});

describe("signal policy (§7.5, decided 8 Oct)", () => {
  it("brand-led: Markets, Partners, Message and Moments use the brand; Places keeps the accounts", async () => {
    const { blockSignal } = await import("@/lib/playbook/config");
    const accounts = Array.from({ length: 12 }, (_, i) => `a${i}`);
    const pb = buildPlaybook({ brandName: "x", category: "G1", tier: "premium", signal: { ...signal, accounts }, targetMetro: "la" });
    expect(pb.signalPolicy).toBe("brand-led");
    for (const b of ["markets", "partners", "message", "moments"]) expect(blockSignal(pb, b)).toEqual(["b", "c1", "c2"]);
    expect(blockSignal(pb, "places")).toEqual(accounts);
  });
  it("falls back to the stage signal when the brand isn't in Qloo", async () => {
    const { blockSignal } = await import("@/lib/playbook/config");
    const pb = buildPlaybook({ brandName: "x", category: "G1", tier: "premium", signal: { ...signal, brand: undefined, accounts: ["a1"] }, targetMetro: "la" });
    expect(blockSignal(pb, "markets")).toEqual(["a1", "c1", "c2"]);
  });
});
