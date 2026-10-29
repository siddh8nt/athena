import { describe, expect, it } from "vitest";
import { budgetOf, contactOf, draftFor, entryRoute, nearestHood, offerFor, rankShops, repPage, wholesaleOf, type RepRead, type Shop } from "@/lib/agent/rep";
import type { Block } from "@/lib/team/page";

// The Rep's page (PRD §23.5 f): multi-crowd shops first, stockists never pitched and grey on the map, filters, a draft
// addressed only to a public email, doors sized to the budget, and an entry route per city.

const shop = (name: string, crowds: Record<string, number>, extra: Partial<Shop> = {}): Shop => ({
  rank: 1,
  id: `id-${name}`,
  name,
  reasons: [],
  tags: [],
  contact: {},
  metroId: "nyc",
  city: "New York",
  hood: "Williamsburg",
  role: "anchor",
  lat: 40.71,
  lon: -73.95,
  kind: "Specialty food",
  crowds,
  stocked: false,
  callId: "c1",
  ...extra,
});

const read = (shops: Shop[], over: Partial<RepRead> = {}): RepRead => ({
  crowds: [
    { id: "a", name: "Pantry cooks", tier: "win_first", brands: [], cities: ["nyc"] },
    { id: "b", name: "Natural wine people", tier: "win_next", brands: [], cities: ["nyc"] },
    { id: "c", name: "Gift buyers", tier: "watch", brands: [], cities: ["nyc"] },
  ],
  cities: [{ metroId: "nyc", name: "New York", center: [40.71, -74], yours: false, notes: [], hoods: [{ name: "Williamsburg", role: "anchor" }] }],
  shops,
  retailers: {},
  budget: "low",
  brand: { name: "Brightland", product: "olive oil" },
  competitors: [],
  calls: 4,
  callIds: [],
  ...over,
});

const blocks = (r: RepRead, id: string) => repPage(r).across!.sections.find((s) => s.id === id)!.blocks;
const table = (bs: Block[]) => bs.find((b): b is Extract<Block, { type: "table" }> => b.type === "table")!;
/** Every shop is listed in full once, on its city's page (§23.5 p). */
const shops = (bs: Block[]) => bs.find((b): b is Extract<Block, { type: "table" }> => b.type === "table" && !!b.label?.startsWith("Every matching shop"))!;

describe("the Rep's page", () => {
  it("ranks a shop for two crowds above stronger single-crowd shops", () => {
    const ranked = rankShops([shop("Solo", { a: 0.95 }), shop("Both", { a: 0.55, b: 0.55 }), shop("Weak", { a: 0.1 })]);
    expect(ranked[0].name).toBe("Both");
    const page = repPage(read(ranked));
    const over = page.across!.sections.find((s) => s.id === "overview")!;
    expect(over.summary).toBe("1 shop fit two or three crowds");
    expect(JSON.stringify(over.blocks)).not.toContain("Weak");
    expect(shops(page.across!.sections.find((s) => s.id === "city:nyc")!.blocks).rows.map((r) => r.cells[0])).toEqual(["Both", "Solo"]);
  });

  it("gives each branch of a chain its own row", () => {
    const ranked = rankShops([shop("Sightglass", { a: 0.9 }), shop("Sightglass", { a: 0.8 }, { id: "id-2", hood: "Mission" })]);
    expect(ranked.map((s) => s.name)).toEqual(["Sightglass", "Sightglass (Mission)"]);
    const marked = rankShops([shop("Sightglass Coffee", { a: 0.9 }), shop("Sightglass Coffee.", { a: 0.8 }, { id: "id-2", hood: "SoMa" })]);
    expect(marked.map((s) => s.name)).toEqual(["Sightglass Coffee", "Sightglass Coffee. (SoMa)"]);
  });

  it("never pitches a stockist again and shows it grey on the map", () => {
    const r = read([shop("Already", { a: 0.9 }, { stocked: true }), shop("New", { a: 0.9 })]);
    expect(shops(blocks(r, "city:nyc")).rows.map((x) => x.cells[0])).toEqual(["New"]);
    const heat = blocks(r, "map")[0] as Extract<Block, { type: "heat" }>;
    expect(heat.pins?.find((p) => p.name === "Already")?.grey).toBe(true);
    expect(heat.pins?.find((p) => p.name === "New")?.tier).toBe("win_first");
    const lines = blocks(r, "city:nyc").find((b) => b.type === "lines") as Extract<Block, { type: "lines" }>;
    expect(lines.lines[0].text).toMatch(/already in Already; never suggested again/);
  });

  it("gives every row the six filters", () => {
    const t = shops(blocks(read([shop("Both", { a: 0.5, b: 0.5 })]), "city:nyc"));
    expect(t.facets).toEqual(["Crowd", "City", "Neighbourhood", "Tier", "Wholesale", "Has email"]);
    expect(t.rows[0].facets).toMatchObject({ Crowd: ["Pantry cooks", "Natural wine people"], Tier: ["Win first", "Win next"], "Has email": ["No email"] });
  });

  it("addresses a draft only to an email the shop published, with where it was found", () => {
    const r = read([]);
    const none = draftFor(r, shop("Quiet", { a: 0.9 }));
    expect(none.to).toBeUndefined();
    expect(none.body).toMatch(/drop by with samples/);
    const site = { brands: [], sameNiche: [], emails: [{ value: "buyer@shop.com", src: "shop.com/contact" }], src: "shop.com" };
    const found = draftFor(r, shop("Open", { a: 0.9 }, { site }));
    expect(found).toMatchObject({ to: "buyer@shop.com", toSrc: "shop.com/contact" });
    expect(contactOf(shop("Open", { a: 0.9 }, { site }))).toBe("buyer@shop.com (from shop.com/contact)");
  });

  it("names in the draft the same loves its row shows", () => {
    const r = read([], { crowds: [{ id: "a", name: "Pantry cooks", tier: "win_first", brands: [{ id: "b1", name: "Tartine" }, { id: "b2", name: "Oddfellows" }], cities: ["nyc"] }] });
    const why = [{ id: "b2", score: 0.4 }, { id: "b1", score: 0.3 }];
    const row = draftFor(r, shop("Row", { a: 0.9 }, { why, reasons: [{ kind: "contribution", label: "Loved by fans of The Mind of a Chef and Oddfellows", names: ["The Mind of a Chef", "Oddfellows"], callId: "c1" }] }));
    expect(row.body).toContain("also love The Mind of a Chef and Oddfellows");
    // A shop stored before its row kept the names still reads the crowd brands behind it.
    expect(draftFor(r, shop("Old", { a: 0.9 }, { why })).body).toContain("also love Oddfellows and Tartine");
  });

  it("names how each shop buys", () => {
    expect(wholesaleOf(shop("A", {}, { site: { brands: [], sameNiche: [], emails: [], wholesale: "x.com/wholesale", src: "x.com" } }))).toBe("Sell-with-us page");
    expect(wholesaleOf(shop("B", {}, { faire: true }))).toBe("On Faire (found by search)");
    expect(wholesaleOf(shop("C", {}))).toBe("None found: cold approach");
  });

  it("sizes the doors and the offer to the founder's budget", () => {
    expect(budgetOf([{ question: "How much can you spend on growth?", answer: "Over $10,000" }])).toBe("high");
    expect(budgetOf([])).toBe("low");
    const many = Array.from({ length: 20 }, (_, i) => shop(`S${i}`, { a: 0.9 }, { role: i < 3 ? "anchor" : "spillover" }));
    expect(blocks(read(many), "doors")[0]).toMatchObject({ rows: [{ value: offerFor("low") }, { value: "5 to start, a starting size, not a quote" }] });
    expect(repPage(read(many, { budget: "mid" })).across!.sections.find((s) => s.id === "doors")!.summary).toMatch(/^15 doors/);
    expect(repPage(read(many, { budget: "high" })).across!.sections.find((s) => s.id === "doors")!.summary).toMatch(/^20 doors/);
  });

  it("picks the entry route from what a city has", () => {
    const many = Array.from({ length: 12 }, (_, i) => shop(`S${i}`, { a: 0.9 }));
    expect(entryRoute(read(many), "nyc").route).toBe("Indie first");
    const chain = { id: "r", name: "Whole Foods", affinity: 1, rank: 1, ownLabel: false, qlooPick: true, callId: "c", cities: ["nyc"] };
    expect(entryRoute(read([shop("One", { a: 0.9 })], { retailers: { a: [chain] } }), "nyc")).toEqual({ route: "Regional chain", why: "Whole Foods is here: one buyer, many doors" });
    expect(entryRoute(read([shop("One", { a: 0.9 })]), "nyc")).toEqual({ route: "Pop-up or consignment", why: "only 1 shop fit here so far" });
  });

  it("keeps a shop in the neighbourhood Qloo names when the nearest mapped one is across the river", () => {
    const city = { metroId: "nyc", name: "New York", center: [40.71, -74] as [number, number], rivals: [], yours: false, layers: [], hoods: [{ name: "Dumbo", at: [40.703, -73.989] as [number, number], cells: 3, heat: {} }] };
    const role = new Map([["Dumbo", "anchor" as const]]);
    expect(nearestHood(city, role, 40.7223, -73.9874, "Lower East Side")).toBeUndefined();
    expect(nearestHood(city, role, 40.7223, -73.9874)).toEqual({ name: "Dumbo", role: "anchor" });
    expect(nearestHood(city, role, 40.7035, -73.9885, "Brooklyn Heights")).toEqual({ name: "Dumbo", role: "anchor" });
  });

  it("opens with a tab per crowd in tier order", () => {
    const page = repPage(read([shop("Both", { a: 0.5, b: 0.5 })]));
    expect(page.tabs.map((t) => t.crowd.tier)).toEqual(["win_first", "win_next", "watch"]);
    expect(page.across!.sections.map((s) => s.id)).toEqual(["overview", "map", "city:nyc", "pipeline", "working", "doors"]);
  });
});
