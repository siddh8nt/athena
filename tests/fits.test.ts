import { describe, expect, it } from "vitest";
import { nextPeak, paramScores, rankFits, seasonIndex, upcomingLift, weightsOf, type CrowdEvidence } from "@/lib/fits/score";
import { buildCalendar } from "@/lib/fits/calendar";

// A summer-peaking profile (June–August high) and a winter one.
const summer = [0.7, 0.75, 0.85, 0.95, 1.1, 1.3, 1.4, 1.3, 1.0, 0.85, 0.75, 0.75];
const winter = [1.3, 1.1, 0.95, 0.85, 0.8, 0.75, 0.75, 0.8, 0.9, 1.05, 1.25, 1.5];

const crowd = (id: string, o: Partial<CrowdEvidence>): CrowdEvidence => ({ id, name: id, members: 10, core: 4, stability: 0.6, fit: 0.5, specificity: 0, ...o });

describe("fits score", () => {
  it("scores every parameter on a fixed scale, and names what's missing", () => {
    const p = paramScores(crowd("a", { reach: { people: 2e7, fresh: 1e7, metros: ["Austin"] }, momentum: { yoy: 0.1, titles: [] } }), "2026-10-14");
    expect(p.fit.score).toBeCloseTo(0.5);
    expect(p.reach.score).toBeCloseTo(1 / Math.log10(331));
    expect(p.efficiency.score).toBeCloseTo(0.5);
    expect(p.momentum.score).toBeCloseTo(0.6);
    expect(p.moments.score).toBeUndefined();
    expect(rankFits([crowd("a", {})], { date: "2026-10-14" }).fits[0].missing).toEqual(["reach", "momentum", "moments"]);
  });

  it("ranks two brands' crowds differently, with reasons from the numbers", () => {
    const date = "2026-10-14";
    const a = rankFits([crowd("x", { fit: 0.6 }), crowd("y", { fit: 0.45, specificity: 0.15 })], { date });
    const b = rankFits([crowd("x", { fit: 0.45 }), crowd("y", { fit: 0.6, specificity: 0.15 })], { date });
    expect(a.fits[0].crowd).toBe("x");
    expect(b.fits[0].crowd).toBe("y");
    expect(b.fits[0].reasons.join(" ")).toMatch(/60th percentile|points more/);
  });

  it("lets an adjacent crowd beat the nearest one on value", () => {
    const near = crowd("near", { fit: 0.62, reach: { people: 3e5, fresh: 3e5, metros: [] }, momentum: { yoy: -0.3, titles: [] }, stability: 0.4 });
    const adj = crowd("adjacent", { fit: 0.5, reach: { people: 2e7, fresh: 2e7, metros: [] }, momentum: { yoy: 0.25, titles: [] }, specificity: 0.1 });
    const r = rankFits([near, adj], { date: "2026-10-14" });
    expect(r.fits[0].crowd).toBe("adjacent");
    expect(r.fits[0].tier).toBe("win_first");
  });

  it("moves moments and 'when' with the run date", () => {
    const c = crowd("s", { season: { index: summer, years: 9, titles: ["Surfing"] } });
    const october = rankFits([c], { date: "2026-10-14" }).fits[0];
    const april = rankFits([c], { date: "2027-04-10" }).fits[0];
    expect(april.params.moments.score!).toBeGreaterThan(october.params.moments.score!);
    expect(october.when).not.toEqual(april.when);
    expect(april.when).toMatch(/May|June/);
    expect(upcomingLift(winter, "2026-10-14")).toBeGreaterThan(upcomingLift(summer, "2026-10-14"));
  });

  it("keeps weight changes only within bounds and with a source", () => {
    const { weights, kept } = weightsOf([
      { param: "reach", weight: 5, reason: "capacity for national rollout", sources: ["s2"] },
      { param: "momentum", weight: 1.5, reason: "", sources: ["s2"] },
      { param: "fit", weight: 1.5, reason: "no source", sources: [] },
    ]);
    expect(weights.reach).toBe(2);
    expect(weights.momentum).toBe(1);
    expect(kept).toHaveLength(1);
  });

  it("changes the ranking when context changes reach (already sells there)", () => {
    const date = "2026-10-14";
    const la = crowd("la", { reach: { people: 2e7, fresh: 2e7, metros: ["Los Angeles"] } });
    const ny = crowd("ny", { reach: { people: 8e6, fresh: 8e6, metros: ["New York"] } });
    expect(rankFits([la, ny], { date }).fits[0].crowd).toBe("la");
    const sold = { ...la, reach: { people: 2e7, fresh: 1e6, metros: [] } };
    expect(rankFits([sold, ny], { date }).fits[0].crowd).toBe("ny");
  });

  it("tiers soft crowds as Watch", () => {
    const r = rankFits([crowd("a", {}), crowd("soft", { stability: 0.3, core: 0 })], { date: "2026-10-14" });
    expect(r.fits.find((f) => f.crowd === "soft")!.tier).toBe("watch");
  });

  it("finds a recurring season from years of monthly views", () => {
    const months: [string, number][] = [];
    for (let y = 2016; y <= 2025; y++) for (let m = 0; m < 12; m++) months.push([`${y}-${String(m + 1).padStart(2, "0")}`, Math.round(1000 * summer[m] * (1 + (y - 2016) / 10))]);
    const s = seasonIndex(months)!;
    expect(s.years).toBe(10);
    expect(s.index[6]).toBeGreaterThan(1.3);
    expect(nextPeak(s.index, "2026-10-14")!.month).toBe(5);
    expect(seasonIndex(months.slice(0, 30))).toBeUndefined();
  });
});

describe("fits calendar", () => {
  it("buckets moments into horizons, with lead times only when sourced", () => {
    const cal = buildCalendar({
      date: "2026-10-14",
      retail: [
        { name: "Halloween", date: "2026-10-31", days: 17 },
        { name: "Christmas", date: "2026-12-25", days: 72 },
      ],
      leadTimes: [{ moment: "Christmas", days: 120, basis: "s4: retailer buying calendar" }],
      categories: [{ title: "Ice cream", index: summer, years: 10 }],
      crowds: [{ id: "c0", name: "Surfers", events: [{ name: "Show", date: "2026-11-01", days: 18, artist: "Band", metro: "Austin" }] }],
    });
    expect(cal.horizons.now.map((m) => m.name)).toEqual(["Halloween", "Show"]);
    expect(cal.horizons.now[0].lead).toBeUndefined();
    expect(cal.horizons.next_quarter[0].startBy).toBe("2026-08-27");
    const ice = cal.horizons.year.find((m) => m.kind === "category")!;
    expect(ice.date).toBe("2027-06-01");
    expect(ice.lead?.days).toBeGreaterThan(0);
    expect(cal.recurring[0].peaks[0].month).toBe(6);
  });
});
