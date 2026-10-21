import { describe, expect, it } from "vitest";
import { askFor, audienceMatch, bandOf, fitOf, matchPage, offerOf, topMatch, type Creator, type MatchRead, type Partner } from "@/lib/agent/matchmaker";
import { parseFeedItems } from "@/lib/enrich/apple-podcasts";
import { readMatch } from "@/lib/team/read";
import { founderLine } from "@/lib/agent/rep";
import type { Block } from "@/lib/team/page";

// The Matchmaker (PRD §23.5 g): creators, brands and podcasts per crowd, banded and sized to the budget, contacts
// only from public pages, an ask that is never sent, and what was left out with the reason.

const creator = (name: string, extra: Partial<Creator> = {}): Creator => ({
  id: `creator:${name.toLowerCase()}`,
  name,
  platform: "youtube",
  found: "Qloo",
  crowds: { a: 0.9 },
  audience: "matches",
  audienceWhy: "Who follows them looks like Pantry cooks",
  links: [],
  ...extra,
});

const partner = (name: string, kind: "brand" | "podcast", extra: Partial<Partner> = {}): Partner => ({
  rank: 1,
  id: `q-${name}`,
  name,
  kind,
  pForward: 0.9,
  reasons: [{ kind: "rank", label: "Loved by fans of Fishwife", callId: "c1" }],
  contact: {},
  crowds: { a: 0.9 },
  sizeWhy: "From Qloo popularity",
  ...extra,
});

const read = (over: Partial<MatchRead> = {}): MatchRead => ({
  crowds: [
    { id: "a", name: "Pantry cooks", tier: "win_first", signal: [], brands: [], cities: [], loves: [] },
    { id: "b", name: "Natural wine people", tier: "win_next", signal: [], brands: [], cities: [], loves: [] },
    { id: "c", name: "Gift buyers", tier: "watch", signal: [], brands: [], cities: [], loves: [] },
  ],
  creators: [],
  brands: [],
  podcasts: [],
  left: [],
  rates: [],
  budget: "low",
  brand: { name: "Brightland", product: "olive oil" },
  ownInQloo: true,
  checked: true,
  calls: 6,
  callIds: [],
  limits: [],
  ...over,
});

const across = (r: MatchRead, id: string) => matchPage(r).across!.sections.find((s) => s.id === id)!;

describe("the Matchmaker's bands and budget", () => {
  it("bands creators by followers", () => {
    expect([bandOf(12_000), bandOf(250_000), bandOf(3_000_000), bandOf(undefined)]).toEqual(["micro", "mid", "large", undefined]);
  });

  it("sizes a band against the budget", () => {
    expect(fitOf("micro", "low")).toBe("fits");
    expect(fitOf("mid", "low")).toBe("stretch");
    expect(fitOf("large", "low")).toBe("beyond");
    expect(fitOf("large", "high")).toBe("stretch");
    expect(offerOf("creator", "large", "low")).toMatch(/^Gifting only/);
  });

  it("matches audiences by their age and gender lean", () => {
    const crowd = { age: { "25_to_29": 0.4, "55_and_older": -0.3 }, gender: { female: 0.3 } };
    expect(audienceMatch(crowd, crowd)).toBe(1);
    expect(audienceMatch(crowd, { age: { "25_to_29": -0.4, "55_and_older": 0.3 }, gender: { female: -0.3 } })).toBe(-1);
  });
});

describe("the Matchmaker's ask", () => {
  it("asks a brand first, then a creator that matches and fits", () => {
    const c = creator("Alison Roman", { band: "micro" });
    expect(topMatch(read({ creators: [c], brands: [partner("Fishwife", "brand")] }))?.name).toBe("Fishwife");
    expect(topMatch(read({ creators: [c], podcasts: [partner("Home Cooking", "podcast")] }))?.name).toBe("Alison Roman");
  });

  it("addresses an ask only to a published email, with where it was found", () => {
    const r = read();
    expect(askFor(r, creator("Alison Roman")).to).toBeUndefined();
    const d = askFor(r, creator("Alison Roman", { email: { value: "hi@alison.example", src: "the YouTube channel's description" }, work: "Shallot pasta" }));
    expect(d).toMatchObject({ to: "hi@alison.example", toSrc: "the YouTube channel's description" });
    expect(d.body).toContain('"Shallot pasta"');
    expect(d.names).toEqual(expect.arrayContaining(["Brightland", "Alison Roman", "Shallot pasta"]));
  });
});

describe("the founder's line in an ask", () => {
  it("reads right from a phrase or from a sentence that already names the brand", () => {
    expect(founderLine("Brightland", "olive oil")).toBe("I'm the founder of Brightland. We make olive oil.");
    expect(founderLine("Brightland", "Brightland sells cold-pressed olive oils.")).toBe("I'm the founder of Brightland. Brightland sells cold-pressed olive oils.");
    expect(founderLine("Brightland", "Brightland")).toBe("I'm the founder of Brightland.");
  });
});

describe("the Matchmaker's page", () => {
  it("has a tab per crowd and the Across sections in order", () => {
    const p = matchPage(read({ brands: [partner("Fishwife", "brand", { crowds: { a: 0.9, b: 0.8 } })] }));
    expect(p.tabs.map((t) => t.crowd.id)).toEqual(["a", "b", "c"]);
    expect(p.across!.sections.map((s) => s.id)).toEqual(["shared", "pipeline", "budget", "working", "left"]);
  });

  it("filters by group, band, budget fit and email, and by crowd across all three", () => {
    const r = read({ creators: [creator("Alison Roman", { band: "micro" })] });
    const tab = matchPage(r).tabs[0].sections.find((s) => s.id === "creators")!;
    const t = tab.blocks.find((b): b is Extract<Block, { type: "table" }> => b.type === "table")!;
    expect(t.facets).toEqual(["Group", "Band", "Budget fit", "Has email"]);
    const shared = across(r, "shared").blocks.find((b): b is Extract<Block, { type: "table" }> => b.type === "table")!;
    expect(shared.facets).toContain("Crowd");
  });

  it("lists what was left out with the reason", () => {
    const r = read({ left: [{ name: "Graza", kind: "brand", reason: "A rival of yours" }] });
    expect(JSON.stringify(across(r, "left").blocks)).toContain("A rival of yours");
  });

  it("survives the journey's round trip", () => {
    const r = read({ creators: [creator("Alison Roman", { band: "micro", followers: { value: 40_000, src: "YouTube", approx: false } })], brands: [partner("Fishwife", "brand", { size: "small" })], podcasts: [partner("Home Cooking", "podcast", { chart: 12 })] });
    const back = readMatch(JSON.parse(JSON.stringify(r)));
    expect(back?.creators[0]).toMatchObject({ name: "Alison Roman", band: "micro", followers: { value: 40_000 } });
    expect(back?.brands[0]).toMatchObject({ name: "Fishwife", size: "small" });
    expect(back?.podcasts[0].chart).toBe(12);
    expect(readMatch({ crowds: [] })).toBeUndefined();
  });
});

describe("parseFeedItems", () => {
  const item = (title: string, date: string) => `<item><title>${title}</title><pubDate>${date}</pubDate></item>`;
  it("reads the owner, the latest title and how often a show posts", () => {
    const xml = `<rss><channel><itunes:owner><itunes:name>Jane Host</itunes:name></itunes:owner>${item("Ep 3", "Wed, 15 Oct 2026 10:00:00 GMT")}${item("Ep 2", "Wed, 08 Oct 2026 10:00:00 GMT")}${item("Ep 1", "Wed, 01 Oct 2026 10:00:00 GMT")}</channel></rss>`;
    expect(parseFeedItems(xml)).toEqual({ owner: "Jane Host", latestTitle: "Ep 3", frequency: "Weekly" });
  });
});
