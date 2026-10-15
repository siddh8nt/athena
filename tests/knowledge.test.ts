import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyMerge, mergeTargets, whereLabel, type Fact } from "@/lib/knowledge/types";
import { readFileDoc } from "@/lib/knowledge/read";
import type { AgentEvent } from "@/lib/blocks/types";

// The knowledge base (PRD §23.2 step 4): merging, the meter, and how strikes and settled choices shape what the agent
// is given. The model calls are stubbed; the live check is tests/live/knowledge.live.ts.

const fact = (id: string, text: string, kind: Fact["where"][number]["kind"], ref: string, at?: string): Fact => ({ id, text, topic: "other", where: [{ kind, ref, at }] });

describe("merging duplicates", () => {
  it("joins groups that share a fact, and the kept fact carries every place", () => {
    expect(Object.fromEntries(mergeTargets([["a", "b"], ["b", "c"], ["d", "e"]]))).toEqual({ b: "a", c: "a", e: "d" });
    const facts = [fact("a", "Tins are $10", "file", "deck.pptx", "slide 3"), fact("b", "A tin costs $10", "file", "sheet.xlsx", "Prices!B2"), fact("c", "Made in Portland", "pasted", "summary")];
    const out = applyMerge(facts, [["a", "b", "zz"]]);
    expect(out.map((f) => f.id)).toEqual(["a", "c"]);
    expect(out[0].where.map(whereLabel)).toEqual(["deck.pptx, slide 3", "sheet.xlsx, Prices!B2"]);
    // The input is left alone.
    expect(facts[0].where).toHaveLength(1);
  });

  it("labels a page by host and path", () => {
    expect(whereLabel({ kind: "website", ref: "https://www.eatfishwife.com/pages/about/" })).toBe("eatfishwife.com/pages/about");
  });
});

describe("reading a file with its locations", () => {
  it("a CSV keeps every row with where it is, and its stockists are read in code", () => {
    const csv = "Store,City,State\nLou's Market,Portland,OR\nCorner Larder,Seattle,WA\n";
    const doc = readFileDoc("stockists.csv", new TextEncoder().encode(csv));
    expect(doc.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(doc.text).toContain("Corner Larder");
    expect(doc.stockists.map((s) => s.name)).toEqual(["Lou's Market", "Corner Larder"]);
  });
});

// ---- Building the knowledge base, with the reads stubbed --------------------------------------------------------

const WS = "0b9e7a52-3c1d-4f8e-9a2b-5d6c7e8f9a0b";
const up = (name: string, tokens: number) => ({ hash: name.padEnd(64, "0").replace(/[^0-9a-f]/g, "a").slice(0, 64), name, bytes: 1, kind: "x", tokens, pages: 1, status: "", at: 0 });
const files = { deck: up("deck.pptx", 30_000), sheet: up("sheet.xlsx", 10_000) };
const byFile: Record<string, Fact[]> = {
  "deck.pptx": [fact("d1", "A tin of Little Sardines is $10", "file", "deck.pptx", "slide 3"), fact("d2", "In 180 stores", "file", "deck.pptx", "slide 5")],
  "sheet.xlsx": [fact("x1", "Little Sardines wholesale list price $9", "file", "sheet.xlsx", "Prices!B4"), fact("x2", "Ships from Portland", "file", "sheet.xlsx", "Ops!A2")],
};
let listed = [files.deck, files.sheet];

vi.mock("@/lib/knowledge/uploads", () => ({
  KB_TOKENS: 1_000_000,
  listUploads: async () => listed,
  uploadDoc: async (_ws: string, u: { name: string; hash: string }) => ({ kind: "file", ref: u.name, hash: u.hash, text: "x", parts: [], stockists: [], status: "" }),
  readUpload: async () => ({ facts: [], rounds: 1, added: 0, clean: true, ms: 1 }),
}));
vi.mock("@/lib/knowledge/extract", () => ({
  toFacts: (doc: { ref: string }) => byFile[doc.ref] ?? [],
  extractDoc: async () => ({ facts: [], rounds: 1, added: 0, clean: true, ms: 1 }),
}));
vi.mock("@/lib/knowledge/site", () => ({
  readSite: async (_site: string, opts: { page?: (p: { url: string; title?: string; state: string; facts?: unknown[] }) => void } = {}) => ({
    ...(opts.page?.({ url: "https://www.eatfishwife.com/pages/about", title: "Our Story | Fishwife", state: "running" }),
    opts.page?.({ url: "https://www.eatfishwife.com/pages/about", title: "Our Story | Fishwife", state: "ok", facts: [fact("w1", "Tinned fish from the Pacific Northwest", "website", "https://www.eatfishwife.com/pages/about")] }),
    {}),
    facts: [fact("w1", "Tinned fish from the Pacific Northwest", "website", "https://www.eatfishwife.com/pages/about")],
    coverage: { source: "https://eatfishwife.com", facts: 1, added: 0, clean: true },
  }),
}));
vi.mock("@/lib/knowledge/merge", () => ({
  compareFacts: async (facts: Fact[]) => ({
    facts,
    conflicts: [{ id: "c-d1-x1", about: "Price of a tin of Little Sardines", options: [{ value: "$10", facts: ["d1"] }, { value: "$9", facts: ["x1"] }], recommended: 0, why: "The deck is the retail price." }],
  }),
}));

async function build(over: Partial<import("@/lib/knowledge/build").KnowledgeInput> = {}) {
  const { buildKnowledge } = await import("@/lib/knowledge/build");
  const events: AgentEvent[] = [];
  const k = await buildKnowledge({ ws: WS, hashes: [files.deck.hash, files.sheet.hash], websites: ["https://eatfishwife.com"], struck: [], settled: {}, ...over }, (e) => events.push(e));
  const given = (id: string) => k.sources.some((s) => s.facts.some((f) => f.id === id));
  return { k, events, given };
}

describe("building the knowledge base", () => {
  beforeEach(() => {
    listed = [files.deck, files.sheet];
  });

  it("reads every source as a narrated step, compares them, and groups a site's pages as one source", async () => {
    const { k, events, given } = await build();
    const steps = events.map((e) => `${e.status} ${e.tool}: ${e.why}`);
    for (const why of ["read_file: Reading deck.pptx", "read_file: Reading sheet.xlsx", "read_website: Reading eatfishwife.com", "compare: Putting it all together"]) {
      expect(steps).toContain(`running ${why}`);
      expect(steps).toContain(`ok ${why}`);
    }
    // Each page is its own line under the site's step, named for the page and saying what it found.
    const pages = events.filter((e) => e.tool === "read_page");
    expect(pages.map((e) => e.status)).toEqual(["running", "ok"]);
    expect(pages.every((e) => e.under === "Reading eatfishwife.com" && e.source?.url === "https://www.eatfishwife.com/pages/about")).toBe(true);
    expect(pages[1].line).toMatch(/^Read the Our Story page: /);
    expect(pages[1].found).toEqual(["Tinned fish from the Pacific Northwest"]);
    expect(k.knowledge.conflicts).toHaveLength(1);
    expect(k.knowledge.coverage.every((c) => c.clean)).toBe(true);
    // Athena's pick is in use; the other side is set aside, not given to the agent.
    expect(k.settled).toEqual({ "c-d1-x1": 0 });
    expect(given("d1")).toBe(true);
    expect(given("x1")).toBe(false);
    expect(k.sources.map((s) => s.ref)).toEqual(["deck.pptx", "sheet.xlsx", "eatfishwife.com"]);
  });

  it("the founder's pick wins", async () => {
    const { k, given } = await build({ settled: { "c-d1-x1": 1 } });
    expect(k.settled).toEqual({ "c-d1-x1": 1 });
    expect(given("x1")).toBe(true);
    expect(given("d1")).toBe(false);
  });

  it("a struck fact is marked, never given, and a disagreement left with one side is settled", async () => {
    const { k, given } = await build({ struck: ["x1", "d2"] });
    expect(k.knowledge.facts.filter((f) => f.struck).map((f) => f.id)).toEqual(["d2", "x1"]);
    expect(k.knowledge.conflicts).toEqual([]);
    expect(given("d2")).toBe(false);
    expect(given("x1")).toBe(false);
    expect(given("d1")).toBe(true);
  });

  it("an out-of-range pick falls back to Athena's", async () => {
    const { k } = await build({ settled: { "c-d1-x1": 7 } });
    expect(k.settled).toEqual({ "c-d1-x1": 0 });
  });

  it("reads files in the founder's order while they fit the limit, and always the first", async () => {
    const big = up("big.pdf", 990_000);
    listed = [files.deck, big, files.sheet];
    const { events } = await build({ hashes: [big.hash, files.deck.hash, files.sheet.hash], websites: [] });
    const read = events.filter((e) => e.tool === "read_file" && e.status === "running").map((e) => e.why);
    expect(read).toEqual(["Reading big.pdf"]);
  });
});
