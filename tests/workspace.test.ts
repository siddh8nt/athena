import { beforeEach, describe, expect, it, vi } from "vitest";
import { Checklist, checklistLine } from "@/lib/agent/checklist";
import type { AgentEvent } from "@/lib/blocks/types";
import type { Crawl } from "@/lib/crawl/site";

// Onboarding as a workspace (PRD §23.2 step 7.2): the agent's checklist ticked off from the run's own events, the one
// box sorted by the model with code checking its answer, and a site read page by page. The model, the crawl and the
// store are stubbed; what still needs a live run is listed in the step's report.

const ev = (tool: string, status: AgentEvent["status"], over: Partial<AgentEvent> = {}): AgentEvent => ({ t: 0, tool, why: tool, status, callIds: [], summary: "", ...over });

describe("the checklist", () => {
  const plan = () =>
    new Checklist([
      { step: "Read tidepool.example", does: "read_website", ref: "tidepool.example" },
      { step: "Read your deck", does: "read_file", ref: "deck.pdf" },
      { step: "Find you in Qloo", does: "qloo_search" },
      { step: "Ask what only you know", does: "ask_founder" },
      { step: "Write your brief", does: "finish_brief" },
    ]);

  it("ticks steps off the run's events, with the result, and the phone line follows", () => {
    const c = plan();
    expect(checklistLine(c.items())).toBe("Step 1 of 5 · Read tidepool.example");
    expect(c.track(ev("read_file", "running", { source: { label: "deck.pdf" } }))).toBe(true);
    expect(c.items()[1].state).toBe("now");
    // A page under the site is the site's own detail, not a step.
    expect(c.track(ev("read_page", "ok", { under: "Reading tidepool.example" }))).toBe(false);
    c.track(ev("read_website", "running", { source: { label: "tidepool.example" } }));
    c.track(ev("read_website", "ok", { source: { label: "tidepool.example" }, summary: "42 facts, each with its page; a second look found nothing left out", line: "Read tidepool.example: 42 facts across 12 pages" }));
    expect(c.items()[0]).toMatchObject({ state: "done", result: "42 facts across 12 pages" });
    c.track(ev("read_file", "ok", { source: { label: "deck.pdf" }, summary: "18 facts, each with where it is; a second look found nothing left out" }));
    expect(c.items()[1]).toMatchObject({ state: "done", result: "18 facts, each with where it is" });
    c.track(ev("qloo_search", "running"));
    expect(checklistLine(c.items())).toBe("Step 3 of 5 · Find you in Qloo");
  });

  it("ticks a lookup step the plan tied to the site, whatever the lookup's own label", () => {
    // 15 Oct, live: the plan gave "Find you in Qloo" the site's host, the lookup's events say "Qloo", and it never ticked.
    const c = new Checklist([{ step: "Find you in Qloo", does: "qloo_search", ref: "tidepool.example" }]);
    c.track(ev("qloo_search", "running", { source: { label: "Qloo" } }));
    c.track(ev("qloo_search", "thin", { source: { label: "Qloo" }, line: "Looked you up in Qloo: 5 brands by close names, for me to check" }));
    expect(c.items()[0]).toMatchObject({ state: "done", result: "5 brands by close names, for me to check" });
  });

  it("the agent changes the steps to come; done steps stay; what never came is skipped", () => {
    const c = plan();
    c.track(ev("read_website", "running", { source: { label: "tidepool.example" } }));
    c.track(ev("read_website", "ok", { source: { label: "tidepool.example" }, summary: "42 facts" }));
    c.replace([
      { step: "Read your deck", does: "read_file" },
      { step: "Look for wholesale terms", does: "web_search" },
      { step: "Write your brief", does: "finish_brief" },
    ]);
    expect(c.items().map((i) => `${i.state} ${i.step}`)).toEqual(["done Read tidepool.example", "todo Read your deck", "todo Look for wholesale terms", "todo Write your brief"]);
    c.track(ev("check", "ok"));
    expect(c.items()[3].state).toBe("now");
    c.finish("Tidepool Tins, every fact with its source");
    expect(c.items().map((i) => i.state)).toEqual(["done", "skipped", "skipped", "done"]);
    expect(checklistLine(c.items())).toBe("All 2 steps done");
  });

  it("keeps only steps Athena can do, at most eight", () => {
    const c = new Checklist([{ step: "  ", does: "other" }, { step: "Dance", does: "dance" as never }, ...Array.from({ length: 10 }, (_, i) => ({ step: `Step ${i}`, does: "other" as const }))]);
    expect(c.items()).toHaveLength(8);
    expect(c.items()[0].step).toBe("Step 0");
  });
});

// ---- The one box, sorted by the model ---------------------------------------------------------------------------

let answer = "";
vi.mock("@/lib/llm/vertex", () => ({
  generate: async () => ({ text: answer, sources: [], supports: [], queries: [], model: "fake", ms: 1 }),
  parseJson: (t: string) => {
    try {
      return JSON.parse(t);
    } catch {
      return undefined;
    }
  },
  domainOf: (u: string) => new URL(u).hostname.replace(/^www\./, ""),
}));

describe("sorting the one box", () => {
  it("keeps a website only when it's in the text, and plan steps only Athena can do, with their refs", async () => {
    const { sortInput } = await import("@/lib/agent/sort");
    answer = JSON.stringify({
      websites: ["tidepool.example", "https://shop.invented.example", "http://insecure.example"],
      text: "notes",
      name: "Tidepool Tins",
      plan: [
        { step: "Read tidepool.example", does: "read_website", ref: "https://www.tidepool.example/" },
        { step: "Read your deck", does: "read_file", ref: "deck.pdf" },
        { step: "Book a meeting", does: "schedule" },
        { step: "Write your brief", does: "finish_brief" },
      ],
    });
    const s = await sortInput({ said: "We're Tidepool Tins, tidepool.example. Focus on grocers, and insecure.example is our old site.", files: ["deck.pdf"], websites: [] });
    expect(s?.websites).toEqual(["https://tidepool.example/"]);
    expect(s?.text).toBe("notes");
    expect(s?.name).toBe("Tidepool Tins");
    expect(s?.plan.map((p) => `${p.does} ${p.ref ?? ""}`.trim())).toEqual(["read_website tidepool.example", "read_file deck.pdf", "finish_brief"]);
  });

  it("an answer it can't read gives nothing, and the route treats the text as the founder's words", async () => {
    const { sortInput } = await import("@/lib/agent/sort");
    answer = "not json";
    expect(await sortInput({ said: "hello", files: [], websites: [] })).toBeUndefined();
  });
});

// ---- A site read page by page -----------------------------------------------------------------------------------

const memory = new Map<string, unknown>();
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (ns: string, k: string) => (memory.has(`${ns}:${k}`) ? { value: memory.get(`${ns}:${k}`) } : undefined),
    set: async (ns: string, k: string, v: unknown) => void memory.set(`${ns}:${k}`, v),
    delete: async (ns: string, k: string) => void memory.delete(`${ns}:${k}`),
  }),
}));

const page = (path: string, title: string, text: string) => ({ url: `https://tidepool.example${path}`, title, description: "", og: {}, jsonld: [], text });
const crawl: Crawl = {
  site: "https://tidepool.example",
  pages: [
    page("/", "Tidepool Tins", "Menu\nShop\nTinned fish in bright tins\nSmoked trout $12\nFooter"),
    page("/pages/about", "About us | Tidepool Tins", "Menu\nShop\nFounded in 2019 in Portland by two sisters\nWe pack in Astoria\nFooter"),
    page("/pages/stockists", "Tidepool Tins – Where to buy", "Menu\nShop\nCorner Larder, Portland\nFern Street Grocer, Seattle\nFooter"),
  ],
  products: [],
  skipped: [],
  candidates: 3,
  thin: false,
  ms: 1,
};
let crawls = 0;
vi.mock("@/lib/crawl/site", () => ({ crawlSite: async () => (crawls++, crawl) }));
vi.mock("@/lib/knowledge/extract", async (orig) => {
  const real = await orig<typeof import("@/lib/knowledge/extract")>();
  return {
    ...real,
    // Each page's own text, one fact per line past its title, at the page.
    extractDoc: async (doc: { text: string; ref: string }) => ({
      facts: doc.text
        .split("\n")
        .slice(2)
        .filter((l) => !/^(Menu|Shop|Footer)$/.test(l))
        .map((text) => ({ text, at: doc.ref, topic: "other" })),
      rounds: 1,
      added: 0,
      clean: true,
      ms: 1,
    }),
  };
});

describe("reading a site page by page", () => {
  beforeEach(() => {
    memory.clear();
    crawls = 0;
  });

  it("reports each page as it's read, every fact at its own page, and tells a stored read again", async () => {
    const { readSite } = await import("@/lib/knowledge/site");
    const seen: string[] = [];
    const r = await readSite("https://tidepool.example", { page: (p) => seen.push(`${p.state} ${new URL(p.url).pathname}${p.facts ? ` ${p.facts.length}` : ""}`) });
    expect(seen.filter((s) => s.startsWith("running"))).toHaveLength(3);
    expect(seen).toContain("ok /pages/about 2");
    expect(r.facts.find((f) => f.text.startsWith("Founded"))?.where[0].ref).toBe("https://tidepool.example/pages/about");
    // A menu line repeated on every page is read once, on the first page.
    expect(r.facts.filter((f) => f.text === "Footer")).toHaveLength(0);
    expect(r.pages).toBe(3);

    const again: string[] = [];
    const r2 = await readSite("https://tidepool.example", { page: (p) => again.push(`${p.state} ${new URL(p.url).pathname} ${p.title ?? ""}`) });
    expect(crawls).toBe(1);
    expect(r2.facts).toHaveLength(r.facts.length);
    expect(again).toContain("ok /pages/about About us | Tidepool Tins");
  });

  it("names a page by its title less the brand, else its path", async () => {
    vi.doMock("@/lib/knowledge/uploads", () => ({ KB_TOKENS: 1, listUploads: async () => [], uploadDoc: async () => undefined, readUpload: async () => undefined }));
    vi.doMock("@/lib/knowledge/merge", () => ({ compareFacts: async () => ({ facts: [], conflicts: [] }) }));
    const { pageLabel } = await import("@/lib/knowledge/build");
    expect(pageLabel("https://tidepool.example/")).toBe("the home page");
    expect(pageLabel("https://tidepool.example/pages/about", "About us | Tidepool Tins")).toBe("the About us page");
    expect(pageLabel("https://tidepool.example/pages/stockists", "Tidepool Tins – Where to buy")).toBe("the Where to buy page");
    expect(pageLabel("https://tidepool.example/pages/x", "Tidepool Tins")).toBe("/pages/x");
  });
});
