import { describe, expect, it } from "vitest";
import { linkerFor, refsFor, segments, type Ref } from "@/lib/refs";
import { briefSourceWords, pagesOf, sourceName, sourceWords } from "@/lib/sources";
import { emptyTeam, type Work } from "@/lib/team/types";
import type { CrowdCard } from "@/lib/journey/types";

const crowd = {
  id: "c1",
  name: "Liquid I.V. and Rachel Hollis fans",
  handle: "the Liquid I.V. crowd",
  after: ["Liquid I.V.", "The Rachel Hollis Podcast"],
  shared: "Wellness routines and country radio.",
  loves: [{ name: "Liquid I.V.", kind: "brand" }, { name: "The Rachel Hollis Podcast", kind: "podcast" }],
  cities: [],
} as unknown as CrowdCard;

const work = {
  agent: "navigator",
  headline: "Three shops",
  results: [{ id: "venue:erewhon", kind: "venue", name: "Erewhon", why: "Natural grocer the crowd shops at", sources: ["S1"], callIds: [] }],
  claims: [],
  sources: [{ id: "S1", tool: "web_search", summary: "Searched shops", callIds: [], pages: [{ title: "Erewhon stores", url: "https://www.erewhon.com/stores" }] }],
  qlooCalls: 4,
} as unknown as Work;

const texts = (s: ReturnType<typeof segments>) => s.map((p) => (typeof p === "string" ? p : `[${p.text}]`)).join("");

describe("names link to where they came from (§23.8 c)", () => {
  const refs = refsFor({ crowds: [crowd], calls: 20, team: { ...emptyTeam(), works: { navigator: work } } });
  const link = linkerFor(refs);

  it("knows a crowd by its name and its handle, with its read and its source", () => {
    const c = refs.find((r) => r.kind === "crowd")!;
    expect(c.names).toContain("the Liquid I.V. crowd");
    expect(c.names).toContain("The Liquid I.V. crowd");
    expect(c.about[0]).toEqual({ text: "Wellness routines and country radio.", read: true });
    expect(c.from).toBe("Qloo's taste graph, 20 calls");
    expect(c.agent).toBe("analyst");
  });

  it("knows what a subagent found, in the founder's words, with the page it read", () => {
    const e = refs.find((r) => r.title === "Erewhon")!;
    expect(e).toMatchObject({ kind: "shop", agent: "navigator", from: "the web: Erewhon stores", url: "https://www.erewhon.com/stores" });
  });

  it("links exact whole names, the longest first, once per block", () => {
    const s = segments("Liquid I.V. and Rachel Hollis fans shop at Erewhon. The Liquid I.V. crowd loves Erewhon too.", link);
    expect(texts(s)).toBe("[Liquid I.V. and Rachel Hollis fans] shop at [Erewhon]. The Liquid I.V. crowd loves Erewhon too.");
  });

  it("leaves a name inside another word, or text that names nothing, plain", () => {
    expect(texts(segments("Erewhonish stores near you", link))).toBe("Erewhonish stores near you");
    expect(segments("Nothing known here", link)).toEqual(["Nothing known here"]);
  });

  it("gives each name to its first source only, and drops names too short to link safely", () => {
    const twice = refsFor({ crowds: [crowd], team: { ...emptyTeam(), works: { navigator: { ...work, results: [{ ...work.results[0], name: crowd.name }] } } } });
    expect(twice.filter((r) => r.names.includes(crowd.name))).toHaveLength(1);
    const short = linkerFor([{ id: "x", names: ["Bar"], title: "Bar", kind: "shop", about: [], from: "the web" } satisfies Ref]);
    expect(segments("A Bar nearby", short)).toEqual(["A Bar nearby"]);
  });
});

describe("sources named, not numbered (§23.8 d)", () => {
  it("names a source as the founder reads it, never by its tool", () => {
    expect(sourceName({ tool: "qloo_insights", callIds: ["a", "b"] })).toBe("Qloo · 2 calls");
    expect(sourceName({ tool: "census_market", callIds: ["a"] })).toBe("Census");
    expect(sourceName({ tool: "web_search", callIds: [] })).toBe("the web");
    expect(sourceName({ tool: "something_new", callIds: [] })).toBe("the team's work");
    expect(sourceWords({ tool: "read_website", callIds: [], pages: [{ url: "https://www.graza.co/about" }] })).toBe("your site: graza.co");
  });

  it("keeps the pages a tool read, from its arguments or its results", () => {
    expect(pagesOf("read_page", { url: "https://a.com/x" }, {})).toEqual([{ url: "https://a.com/x" }]);
    expect(pagesOf("web_search", {}, { sources: [{ title: "A", uri: "https://a.com" }, { uri: "not a url" }] })).toEqual([{ title: "A", url: "https://a.com" }]);
    expect(pagesOf("qloo_insights", {}, {})).toBeUndefined();
  });

  it("says where a Brand Graph fact came from", () => {
    expect(briefSourceWords({ kind: "message" } as never).from).toBe("you said");
    expect(briefSourceWords({ kind: "web", ref: "https://www.nytimes.com/x" } as never)).toEqual({ from: "the web: nytimes.com", url: "https://www.nytimes.com/x" });
    expect(briefSourceWords(undefined).from).toBe("my read of your brand");
  });
});
