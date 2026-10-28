import { describe, expect, it } from "vitest";
import { METROS } from "@/lib/playbook/metros";
import { across, cityWhy, crowdSize, crowdTab, navigatorPage, rankCities, roles, verdict, workedCities, type CityRead, type CrowdCities, type NavRead } from "@/lib/agent/navigator";
import type { CrowdCard } from "@/lib/journey/types";
import type { Outcome } from "@/lib/team/types";

// The Navigator's page (§23.5 e): cities ranked per crowd, overlap cities first, home base kept apart, verdicts moved
// by what the founder marked, every hot neighbourhood given a role, and crowd size read as an estimate.

const card = (id: string, name: string): CrowdCard => ({ id, name, main: id === "a", loves: [], signal: [{ id: `${id}-s`, name: "sig" }], cities: [], size: 20 }) as unknown as CrowdCard;

/** Affinities: brand a1/a2 belong to crowd A, b1 to crowd B. NYC is strong for both, LA for A only, Chicago for B only. */
function affinity() {
  const by = new Map<string, Map<string, number>>();
  for (const m of METROS) by.set(m.id, new Map([["a1", 0.3], ["a2", 0.3], ["b1", 0.3]]));
  by.get("nyc")!.set("a1", 0.9).set("a2", 0.9).set("b1", 0.9);
  by.get("la")!.set("a1", 0.8).set("a2", 0.7);
  by.get("chicago")!.set("b1", 0.8);
  return by;
}
const names = new Map([["a1", "Brand A1"], ["a2", "Brand A2"], ["b1", "Brand B1"]]);

const crowds = (): CrowdCities[] => {
  const by = affinity();
  return [
    { crowd: card("a", "Makers"), tier: "win_first", cities: rankCities(["a1", "a2"], by, names) },
    { crowd: card("b", "Hosts"), tier: "win_next", cities: rankCities(["b1"], by, names) },
  ];
};

const hood = (name: string, at: [number, number], heat: Record<string, number>, zip?: { id: string; residents: number }) => ({ name, at, cells: 4, heat, ...(zip ? { area: { zip } } : {}) });
const city = (metroId: string, name: string, extra: Partial<CityRead> = {}): CityRead => ({
  metroId,
  name,
  center: [40.7, -74],
  rivals: [],
  yours: false,
  layers: [{ crowd: "a", cells: [[40.7, -74, 0.9]] }],
  hoods: [
    hood("SoHo", [40.723, -74.0], { a: 0.95, b: 0.9 }, { id: "10012", residents: 25_000 }),
    hood("Tribeca", [40.716, -74.008], { a: 0.9, b: 0.85 }, { id: "10013", residents: 30_000 }),
    hood("Hudson Yards", [40.754, -74.0], { a: 0.5 }, { id: "10001", residents: 3_000 }),
    hood("Astoria", [40.741, -73.99], { a: 0.4 }, { id: "11102", residents: 35_000 }),
    hood("Flushing", [40.76, -73.83], { a: 0.3, b: 0.2 }, { id: "11354", residents: 60_000 }),
  ],
  ...extra,
});
const nav = (extra: Partial<NavRead> = {}): NavRead => ({ crowds: crowds(), cities: [city("nyc", "New York"), city("la", "Los Angeles")], cap: 2, calls: 31, callIds: [], ...extra });

describe("rankCities", () => {
  it("ranks each city by the crowd's mean affinity as a z-score, with the brands that lean there as the reason", () => {
    const [a, b] = crowds();
    expect(a.cities.slice(0, 2).map((c) => c.metroId)).toEqual(["nyc", "la"]);
    expect(b.cities.slice(0, 2).map((c) => c.metroId)).toEqual(["nyc", "chicago"]);
    expect(a.cities[0].z).toBeGreaterThan(0.5);
    expect(a.cities[0].reason).toMatch(/Loves Brand A[12] and Brand A[12] more than most places/);
  });
});

describe("workedCities", () => {
  it("works overlap cities first, then each crowd's top new ones, never past five", () => {
    const w = workedCities(crowds(), [], 2);
    expect(w[0]).toBe("nyc");
    expect(w).toEqual(expect.arrayContaining(["la", "chicago"]));
    expect(w.length).toBeLessThanOrEqual(5);
  });
  it("keeps a city the brand already sells in out of the new ones, and works it as home base when it's strong", () => {
    const w = workedCities(crowds(), ["nyc"], 1);
    expect(w).toEqual(["la", "chicago", "nyc"]);
  });
  it("works the home city first when the goal is to go deeper there", () => {
    expect(workedCities(crowds(), ["dc"], 2, "dc")[0]).toBe("dc");
  });
});

describe("verdict", () => {
  it("launches where two crowds are strong, tests where one is, and keeps home base apart", () => {
    const r = nav({ cities: [city("nyc", "New York"), city("chicago", "Chicago")] });
    expect(verdict(r, "nyc", [])).toBe("launch");
    expect(verdict(r, "chicago", [])).toBe("test");
    expect(verdict(r, "dc", [])).toBe("later");
    expect(verdict(r, "nyc", ["nyc"])).toBe("home");
  });
  it("launches only as many cities as the team can work, when every one is strong for every crowd", () => {
    const by = affinity();
    by.get("la")!.set("b1", 0.85);
    const both: CrowdCities[] = [
      { crowd: card("a", "Makers"), tier: "win_first", cities: rankCities(["a1", "a2"], by, names) },
      { crowd: card("b", "Hosts"), tier: "win_next", cities: rankCities(["b1"], by, names) },
    ];
    const r = nav({ crowds: both, cap: 1 });
    expect(verdict(r, "nyc", [])).toBe("launch");
    expect(verdict(r, "la", [])).toBe("test");
    expect(verdict({ ...r, cap: 2 }, "la", [])).toBe("launch");
  });
  it("moves a city down one when its step didn't work, and up one when it did", () => {
    const r = nav();
    const mark = (group: string, m: Outcome["mark"]) => ({ item: "x", agent: "navigator", kind: "step", name: "x", group, mark: m, at: 1 }) as Outcome;
    expect(verdict(r, "nyc", [], [mark("nyc", "no")])).toBe("test");
    expect(verdict(r, "chicago", [], [mark("chicago", "yes")])).toBe("launch");
    expect(verdict(r, "chicago", [], [mark("la", "no")])).toBe("test");
  });
});

describe("roles and crowd size", () => {
  it("anchors the two hottest, makes a ZIP few people live in a pop-up spot, nearby ones spillover, the rest online targets", () => {
    const r = roles(city("nyc", "New York"));
    expect(r.get("SoHo")).toBe("anchor");
    expect(r.get("Tribeca")).toBe("anchor");
    expect(r.get("Hudson Yards")).toBe("popup");
    expect(r.get("Astoria")).toBe("spillover");
    expect(r.get("Flushing")).toBe("online");
  });
  it("estimates a crowd's people from the residents of its hot ZIPs", () => {
    expect(crowdSize(city("nyc", "New York"), "a")).toBe(25_000 + 30_000);
    expect(crowdSize(city("nyc", "New York", { hoods: [] }), "a")).toBeUndefined();
  });
});

describe("the page", () => {
  it("gives each crowd tab its cities, with why and the rivals there, and hot neighbourhoods, with worked cities opening their own page", () => {
    const r = nav();
    const tab = crowdTab(r, r.crowds[0], []);
    expect(tab.sections.map((s) => s.id)).toEqual(["cities", "hoods"]);
    const table = tab.sections[0].blocks[0];
    expect(table.type === "table" && table.columns).toEqual(["City", "Fit", "Why", "Residents", "Income", "Rivals strong here", "Verdict"]);
    expect(table.type === "table" && table.rows[0].goto).toBe("city:nyc");
    expect(table.type === "table" && table.rows[0].cells.at(-1)).toBe("Launch here");
  });
  it("marks already-yours cities as home base on the crowd tab", () => {
    const r = nav();
    const tab = crowdTab(r, r.crowds[0], ["nyc"]);
    const notes = tab.sections[0].blocks.filter((b) => b.type === "note");
    expect(notes.some((b) => b.type === "note" && /Already yours: New York \(strong for this crowd\)/.test(b.text))).toBe(true);
  });
  it("opens Across with the overview and overlap cities, a page per city, and next steps grouped by city", () => {
    const a = across(nav(), []);
    expect(a.sections.map((s) => s.id)).toEqual(["overview", "city:nyc", "city:la", "next"]);
    const overview = a.sections[0].blocks.find((b) => b.type === "table");
    expect(overview?.type === "table" && overview.rows.find((r) => r.cells[0] === "New York")?.cells[2]).toMatch(/^2 crowds/);
    const checks = a.sections.at(-1)!.blocks[0];
    expect(checks.type === "checks" && checks.checks.map((c) => c.group)).toEqual(["nyc", "la"]);
    expect(checks.type === "checks" && checks.checks[0].text).toBe("Launch in New York, starting in SoHo");
  });
  it("adds a Shops column only once the Rep's venues are in, and never lets them change a verdict", () => {
    const fill = { venues: [{ metroId: "nyc", points: [{ name: "Shop", lat: 40.7231, lon: -74.0001 }] }] };
    const page = navigatorPage(nav(), [], { fill, at: 1 });
    const nyc = page.across!.sections.find((s) => s.id === "city:nyc")!;
    const t = nyc.blocks.find((b) => b.type === "table" && !!b.label?.startsWith("Every hot neighbourhood"));
    expect(t?.type === "table" && t.columns).toContain("Shops");
    expect(t?.type === "table" && t.rows[0].cells).toContain("1");
    expect(nyc.summary).toMatch(/strong here, so it's a city to launch in$/);
    const plain = navigatorPage(nav(), [], { at: 1 }).across!.sections.find((s) => s.id === "city:nyc")!;
    const t2 = plain.blocks.find((b) => b.type === "table" && !!b.label?.startsWith("Every hot neighbourhood"));
    expect(t2?.type === "table" && t2.columns).not.toContain("Shops");
  });
});

describe("a city's verdict reads as a sentence (§23.8 f)", () => {
  const graza = { ...card("a", "Graza and Bon Appétit fans"), handle: "the Graza crowd" } as CrowdCard;
  const ivy = { ...card("b", "Liquid I.V. and Rachel Hollis fans"), handle: "the Liquid I.V. crowd" } as CrowdCard;

  it("names the strong crowds by their handles, never their full names glued together", () => {
    expect(cityWhy("launch", [graza, ivy])).toBe("The Graza crowd and the Liquid I.V. crowd are strong here, so it's a city to launch in");
    expect(cityWhy("test", [graza])).toBe("The Graza crowd is strong here, so it's one to test first");
    expect(cityWhy("later", [])).toBe("No crowd is strong here yet, so it's one for later");
    expect(cityWhy("home", [graza])).toBe("Already yours, and the Graza crowd is strong here");
  });
});
