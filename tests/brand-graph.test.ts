import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBrief, itemKey, type BrandBrief, type Source } from "@/lib/brief/types";
import type { LiveFact } from "@/lib/knowledge/types";
import type { CrowdsResult, FitsRun } from "@/lib/journey/types";
import type { QlooClient } from "@/lib/qloo/client";
import type { QlooEntity } from "@/lib/qloo/types";
import { FOLD_AT, allNodes, buildGraph, budgetFor, listGroups } from "@/lib/graph/build";
import { NODE_TYPES, typesInOrder, type GraphInput } from "@/lib/graph/types";
import { READS, staleLine, type RunId } from "@/lib/graph/stale";
import { PREVIEW_AT, applyEdit, applyFiles, dropWrong, emptyGraphState, fillOther, graphState, previewLine, previewOf, rerun, undo, validOp, type Op } from "@/lib/graph/edit";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/methods/resolve", () => ({ resolveBrand: vi.fn(), resolveVenue: vi.fn() }));
vi.mock("@/lib/places/location", () => ({ resolveTyped: vi.fn() }));
vi.mock("@/lib/llm/vertex", () => ({ generateStreamHedged: vi.fn(), parseJson: (s: string) => JSON.parse(s) }));

import { resolveBrand, resolveVenue } from "@/lib/methods/resolve";
import { resolveTyped } from "@/lib/places/location";
import { generateStreamHedged } from "@/lib/llm/vertex";
import { interpret, resolveOps } from "@/lib/graph/interpret";

// The Brand Graph (PRD §13.12, §23.2 step 7) on a fictional brand: the registry, the graph's size and folding, sources
// and reasons, facts-never-taste, and the done-when: an edit in chat and one on the graph each change the right nodes,
// say what changed, undo, and hold exactly the runs that read what moved. Every name here is made up.

const WEB: Source = { kind: "website", ref: "https://tidepool.example" };
const YOU: Source = { kind: "message" };
const s = <T>(value: T, source: Source = WEB) => ({ value, source });

function brief(): BrandBrief {
  return {
    ...emptyBrief(),
    name: s("Tidepool Tins", YOU),
    sells: s("Tinned fish in bright tins"),
    channels: s("Own site and a few grocers"),
    channel: s("both" as const),
    tierHint: s("mainstream" as const),
    stageHint: s("early" as const),
    activeCity: s("Portland, OR", YOU),
    comparables: [s("Gullwing Pantry"), s("Saltmarsh Oils"), s("Kestrel Kitchen")],
    competitors: [s("Brine & Co"), s("Harbor Shelf")],
    stockists: [s({ name: "Corner Larder", city: "Portland" }), s({ name: "Fern Street Grocer", city: "Portland" }), s({ name: "The Pantry Box", city: "Seattle" })],
    notes: [s("Wants to be in 50 shops by next year", YOU)],
  };
}

const facts: LiveFact[] = [
  { id: "f1", text: "Gross margin is 48% at wholesale", where: "deck.pdf, slide 4", source: "deck.pdf" },
  { id: "f2", text: "Sold out the first run of 2,000 tins", where: "https://tidepool.example/about", source: "https://tidepool.example/about" },
];

const crowds = {
  seed: { lookalikes: [], tags: [], missing: [] },
  calls: 0,
  callIds: [],
  crowds: [
    { id: "c1", name: "Picnic planners", main: true, loves: [{ name: "Sunday Market Radio", kind: "podcast" }, { name: "Lantern Bakery", kind: "brand" }], signal: [], cities: [], size: 10 },
    { id: "c2", name: "Natural wine regulars", main: false, loves: [{ name: "Vinyl Bar Nine", kind: "place" }, { name: "Lantern Bakery", kind: "brand" }], signal: [], cities: [], size: 8 },
  ],
  meetings: [{ a: "c1", b: "c2", items: [{ id: "x", name: "Lantern Bakery", a: 0.9, b: 0.8, score: 0.7 }] }],
} as unknown as CrowdsResult;

const fits = {
  key: "k",
  fits: { fits: [{ crowd: "c1", name: "Picnic planners", rank: 1, tier: "win_first", score: 0.8, params: {}, reasons: ["Strong reach near your stockists"], when: "Peaks in late May" }, { crowd: "c2", name: "Natural wine regulars", rank: 2, tier: "watch", score: 0.3, params: {}, reasons: ["Small so far"] }], weights: {}, changes: [], excluded: [], date: "2026-10-01" },
  calendar: { date: "2026-10-01", horizons: { now: [{ name: "Holiday gifting", kind: "retail", date: "2026-11-27", days: 43, startBy: "2026-10-28" }], next_quarter: [], season: [], year: [] }, recurring: [] },
  answer: {},
  sources: [],
} as unknown as FitsRun;

const input = (over: Partial<GraphInput> = {}): GraphInput => ({ brief: brief(), facts, ...over });
const ids = (g: GraphInput) => allNodes(g).nodes.map((n) => n.id);
const ALL_RUNS = Object.keys(READS) as RunId[];

describe("the registry", () => {
  it("gives every type a label, a shape, a colour and an edit kind, and only facts are editable", () => {
    for (const [type, t] of typesInOrder()) {
      expect(t.label && t.plural && t.shape && t.colour, type).toBeTruthy();
      expect(["fact", "taste", "none"]).toContain(t.edit);
    }
    expect(NODE_TYPES.crowd.edit).toBe("taste");
    expect(NODE_TYPES.loved.edit).toBe("taste");
    expect(NODE_TYPES.brand.edit).toBe("none");
    // Shape carries the type, so no two types the founder edits share a shape and a colour.
    const looks = typesInOrder().map(([, t]) => `${t.shape}|${t.colour}`);
    expect(new Set(looks).size).toBe(looks.length);
  });
});

describe("building the graph", () => {
  it("starts with 15–25 nodes once the crowds and fits land", () => {
    const g = buildGraph(input({ crowds, fits }));
    expect(g.nodes.length).toBeGreaterThanOrEqual(15);
    expect(g.nodes.length).toBeLessThanOrEqual(budgetFor(input({ crowds, fits })));
    expect(g.nodes.length).toBeLessThanOrEqual(31);
    expect(buildGraph(input()).nodes.length).toBeGreaterThanOrEqual(15);
    expect(buildGraph(input()).nodes.length).toBeLessThanOrEqual(25);
  });

  it("gives every node a source and every edge a reason and a source, with no dangling edges", () => {
    const g = allNodes(input({ crowds, fits }));
    const at = new Set(g.nodes.map((n) => n.id));
    for (const n of g.nodes) expect(n.source?.kind, n.id).toBeTruthy();
    for (const e of g.edges) {
      expect(e.reason.length, e.id).toBeGreaterThan(5);
      expect(e.source?.kind, e.id).toBeTruthy();
      expect(at.has(e.from) && at.has(e.to), e.id).toBe(true);
    }
  });

  it("puts tier and reason on crowds, and when on time-sensitive nodes", () => {
    const g = allNodes(input({ crowds, fits }));
    const c1 = g.nodes.find((n) => n.id === "crowd:c1");
    expect(c1?.tier).toEqual({ label: "Win first", reason: "Strong reach near your stockists", watch: false });
    expect(c1?.when).toBe("Peaks in late May");
    expect(g.nodes.find((n) => n.id === "crowd:c2")?.tier?.watch).toBe(true);
    const m = g.nodes.find((n) => n.type === "moment");
    expect(m?.when).toBe("Nov 27, start by Oct 28");
    expect(m?.from).toBe("from the retail calendar");
    expect(g.edges.some((e) => e.kind === "shares_fans" && e.reason.includes("Lantern Bakery"))).toBe(true);
  });

  it("folds a type past 12 into one group, and the list view keeps every node", () => {
    const b = brief();
    b.stockists = Array.from({ length: FOLD_AT + 2 }, (_, i) => s({ name: `Shop ${i + 1}`, city: "Portland" }));
    const g = buildGraph({ brief: b, facts });
    const group = g.nodes.find((n) => n.id === "group:stockist");
    expect(group?.members).toHaveLength(FOLD_AT + 2);
    expect(group?.label).toBe("14 stockists");
    expect(g.nodes.filter((n) => n.type === "stockist")).toHaveLength(1);
    expect(g.edges.filter((e) => e.to === "group:stockist")).toHaveLength(1);
    expect(listGroups({ brief: b, facts }).find((x) => x.type === "stockist")?.nodes).toHaveLength(FOLD_AT + 2);
  });

  it("puts every multimodal fact on the graph with its file or page", () => {
    const g = allNodes(input());
    const deck = g.nodes.find((n) => n.id === "fact:f1");
    expect(deck?.source).toEqual({ kind: "file", ref: "deck.pdf", at: "slide 4" });
    expect(g.nodes.find((n) => n.id === "fact:f2")?.source.kind).toBe("website");
  });
});

describe("facts, never taste", () => {
  const nodes = allNodes(input({ crowds, fits })).nodes;
  it("refuses an edit to a crowd, what it loves, the brand or a group", () => {
    for (const node of ["crowd:c1", "loved:lantern bakery", "brand", "group:stockist", "nowhere"]) {
      expect(validOp({ op: "wrong", node }, nodes), node).toBeUndefined();
      expect(validOp({ op: "remove", node }, nodes), node).toBeUndefined();
    }
    expect(validOp({ op: "wrong", node: itemKey.comparable("Gullwing Pantry") }, nodes)).toEqual({ op: "wrong", node: "comparable:gullwing pantry" });
  });

  it("checks set values against the registry and drops what it doesn't know", () => {
    expect(validOp({ op: "set", field: "tierHint", value: "Premium" }, nodes)).toEqual({ op: "set", field: "tierHint", value: "premium" });
    expect(validOp({ op: "set", field: "tierHint", value: "fancy" }, nodes)).toBeUndefined();
    expect(validOp({ op: "set", field: "crowd", value: "x" }, nodes)).toBeUndefined();
    expect(validOp({ op: "add", type: "crowd", value: "x" }, nodes)).toBeUndefined();
    expect(validOp({ op: "add", type: "stockist", value: "  Corner   Larder ", city: "Portland" }, nodes)).toEqual({ op: "add", type: "stockist", value: "Corner Larder", city: "Portland" });
  });
});

describe("remove and wrong", () => {
  const ran: RunId[] = ALL_RUNS;
  const node = itemKey.stockist({ name: "The Pantry Box", city: "Seattle" });

  it("remove hides a node but the agents still read it", () => {
    const a = applyEdit(input(), emptyGraphState(), [{ op: "remove", node }], { by: "graph", ran })!;
    expect(a.state.hidden).toEqual([node]);
    expect(a.brief.stockists).toHaveLength(3);
    expect(a.state.held).toEqual({});
    expect(ids({ ...input(), hidden: a.state.hidden })).not.toContain(node);
    expect(a.edit.note).toBe("Hid The Pantry Box: from you");
  });

  it("wrong drops it from the brief, and a later file can't bring it back", () => {
    const a = applyEdit(input(), emptyGraphState(), [{ op: "wrong", node }], { by: "graph", ran })!;
    expect(a.brief.stockists.map((x) => x.value.name)).toEqual(["Corner Larder", "Fern Street Grocer"]);
    expect(a.brief.wrong).toEqual([{ key: node, text: "The Pantry Box as a stockist" }]);
    expect(Object.keys(a.state.held).sort()).toEqual(["fits", "message", "moments", "online", "partners", "places", "retailers", "strategy", "where"]);
    const later = applyFiles({ brief: a.brief, facts: a.facts }, a.state, { facts: [], stockists: [{ ref: "list.csv", list: [{ name: "The Pantry Box", city: "Seattle" }] }], read: ["list.csv"] }, { ran });
    expect(later).toBeUndefined();
    expect(dropWrong(a.brief).stockists).toHaveLength(2);
  });

  it("a wrong trait leaves the fact strip, and a wrong file fact stays out when read again", () => {
    const a = applyEdit(input(), emptyGraphState(), [{ op: "wrong", node: "trait:tierHint" }, { op: "wrong", node: "fact:f1" }], { by: "graph", ran })!;
    expect(a.brief.tierHint).toBeUndefined();
    expect(a.facts.map((f) => f.id)).toEqual(["f2"]);
    const again = applyFiles({ brief: a.brief, facts: a.facts }, a.state, { facts: [{ ...facts[0], id: "f9" }], stockists: [], read: ["deck-v2.pdf"] }, { ran });
    expect(again).toBeUndefined();
  });
});

describe("done when: an edit in chat and one on the graph", () => {
  const ran: RunId[] = ALL_RUNS;

  it("a chat edit changes the right node, says what changed, holds the right runs, and undoes", () => {
    const before = input({ crowds, fits });
    const a = applyEdit(before, emptyGraphState(), [{ op: "set", field: "tierHint", value: "premium" }], { by: "chat", ran, at: 1 })!;
    expect(a.edit.note).toBe("Moved to premium: from your message");
    expect(a.edit.changed).toEqual(["trait:tierHint"]);
    expect(a.edit.keys).toEqual(["tier"]);
    expect(a.brief.tierHint).toMatchObject({ value: "premium", source: { kind: "message" }, confirmed: true });
    // The tier is read by the fits, the strategies and the journey's stops, not by the crowds or the retailer lists.
    expect(Object.keys(a.state.held).sort()).toEqual(["fits", "message", "moments", "partners", "places", "strategy", "where"]);
    expect(staleLine("where", a.state.held.where!)).toBe("Cities may change: you moved it to premium.");
    const u = undo({ ...before, brief: a.brief, facts: a.facts }, a.state, ran)!;
    expect(u.brief).toEqual(before.brief);
    expect(u.state.held).toEqual({});
    expect(u.state.log).toEqual([]);
    expect(u.undone.id).toBe(a.edit.id);
  });

  it("a graph edit adds a resolved comparable, flags the crowds and what reads them, and undoes", () => {
    const before = input({ crowds, fits });
    const op: Op = { op: "add", type: "comparable", value: "Moss & Tide", id: "Q-fake-1" };
    const a = applyEdit(before, emptyGraphState(), [op], { by: "graph", ran })!;
    expect(a.edit.note).toBe("Added Moss & Tide as a brand like you: from you");
    expect(a.edit.changed).toEqual(["comparable:moss tide"]);
    expect(a.brief.comparables.at(-1)?.source).toEqual({ kind: "message", ref: "you" });
    expect(Object.keys(a.state.held).sort()).toEqual(["crowds", "fits", "message", "moments", "partners", "places", "strategy", "where"]);
    expect(staleLine("where", a.state.held.where!)).toBe("Cities may change: you added a comparable.");
    const u = undo({ ...before, brief: a.brief, facts: a.facts }, a.state, ran)!;
    expect(u.brief.comparables).toEqual(before.brief.comparables);
    expect(u.state.held).toEqual({});
  });

  it("names on each run's flag only the changes that run reads", () => {
    const a = applyEdit(input({ crowds, fits }), emptyGraphState(), [{ op: "set", field: "tierHint", value: "premium" }, { op: "set", field: "channel", value: "online" }], { by: "chat", ran, at: 1 })!;
    expect(staleLine("fits", a.state.held.fits!)).toBe("Most valuable fits may change: you moved it to premium and you changed where it mostly sells.");
    expect(staleLine("where", a.state.held.where!)).toBe("Cities may change: you moved it to premium.");
  });

  it("flags only the runs that already ran", () => {
    const a = applyEdit(input(), emptyGraphState(), [{ op: "add", type: "comparable", value: "Moss & Tide", id: "Q-fake-1" }], { by: "graph", ran: ["crowds"] })!;
    expect(Object.keys(a.state.held)).toEqual(["crowds"]);
  });

  it("holds a run on what it ran on through a second edit, and lets go when an undo puts it back", () => {
    const one = applyEdit(input(), emptyGraphState(), [{ op: "set", field: "stageHint", value: "scaling" }], { by: "chat", ran })!;
    const two = applyEdit({ brief: one.brief, facts: one.facts }, one.state, [{ op: "add", type: "note", value: "Ships to Canada too" }], { by: "chat", ran })!;
    expect(two.state.held.fits?.brief.stageHint?.value).toBe("early");
    expect(two.state.held.fits?.why).toBe("you added a fact");
    const back = undo({ brief: two.brief, facts: two.facts }, two.state, ran)!;
    expect(back.state.held.fits?.brief.stageHint?.value).toBe("early");
    const start = undo({ brief: back.brief, facts: back.facts }, back.state, ran)!;
    expect(start.state.held).toEqual({});
  });

  it("an edit that changes nothing isn't an edit", () => {
    expect(applyEdit(input(), emptyGraphState(), [{ op: "set", field: "tierHint", value: "mainstream" }], { by: "chat", ran })).toBeUndefined();
    expect(applyEdit(input(), emptyGraphState(), [{ op: "add", type: "comparable", value: "gullwing  pantry" }], { by: "chat", ran })).toBeUndefined();
  });

  it("says which item made room when a long edit fills a list", () => {
    const cities = ["Austin, TX", "Denver, CO", "Chicago, IL", "Boston, MA", "Atlanta, GA", "Miami, FL", "Seattle, WA", "Phoenix, AZ", "Nashville, TN"];
    const a = applyEdit({ brief: brief(), facts }, emptyGraphState(), cities.map((value) => ({ op: "add", type: "city", value, id: value }) as Op), { by: "chat", ran: [] })!;
    expect(a.brief.cities).toHaveLength(8);
    expect(a.edit.note).toBe("Added Austin, TX as a city to grow in and 8 more; Phoenix, AZ made room: from your message");
  });

  it("keeps Undo for the latest three edits", () => {
    let cur = { brief: brief(), facts, state: emptyGraphState() };
    for (const v of ["a", "b", "c", "d", "e"]) {
      const a = applyEdit({ brief: cur.brief, facts: cur.facts }, cur.state, [{ op: "add", type: "note", value: `Note ${v}` }], { by: "chat", ran: [] })!;
      cur = { brief: a.brief, facts: a.facts, state: a.state };
    }
    expect(cur.state.log.map((e) => !!e.before)).toEqual([false, false, true, true, true]);
  });

  it("a full list makes room by dropping its lowest-ranked item and says so", () => {
    const b = brief();
    b.comparables = [s("One", YOU), s("Two"), s("Three"), s("Four", { kind: "agent_guess" }), s("Five")];
    const a = applyEdit({ brief: b, facts }, emptyGraphState(), [{ op: "add", type: "comparable", value: "Six", id: "Q6" }], { by: "chat", ran: [] })!;
    expect(a.brief.comparables.map((c) => c.value)).toEqual(["One", "Two", "Three", "Five", "Six"]);
    expect(a.edit.note).toBe("Added Six as a brand like you, in place of Four: from your message");
  });
});

describe("re-run", () => {
  it("lets go of the run and what reads it, and bumps its key", () => {
    const a = applyEdit(input(), emptyGraphState(), [{ op: "add", type: "comparable", value: "Moss & Tide", id: "Q1" }], { by: "graph", ran: ALL_RUNS })!;
    const r = rerun(a.state, "crowds");
    expect(r.held.crowds).toBeUndefined();
    expect(r.held.fits).toBeUndefined();
    expect(r.held.strategy).toBeUndefined();
    expect(r.held.where).toBeDefined();
    expect(r.rev).toEqual({ crowds: 1 });
    expect(rerun(r, "crowds").rev).toEqual({ crowds: 2 });
  });
});

describe("big edits", () => {
  it("are shown first as one line, and apply as one edit with one Undo", () => {
    const ops: Op[] = Array.from({ length: PREVIEW_AT + 2 }, (_, i) => ({ op: "add", type: "note", value: `Fact number ${i + 1}` }));
    const p = previewOf(input(), emptyGraphState(), ops);
    expect(p.count).toBe(10);
    expect(previewLine(p)).toMatch(/^This changes 10 things: Added “Fact number 1” as a fact; .*; and 6 more\. Apply\?$/);
    const a = applyEdit(input(), emptyGraphState(), ops, { by: "chat", ran: [] })!;
    expect(a.state.log).toHaveLength(1);
    expect(a.edit.note).toBe("Added “Fact number 1” as a fact and 9 more; Wants to be in 50 shops by next year made room: from your message");
  });
});

describe("files read after onboarding", () => {
  it("add new facts and stockists as one edit, ranked below the founder's words", () => {
    const read = { facts: [facts[0], { id: "f3", text: "Retail price is $9 a tin", where: "pricing.xlsx", source: "pricing.xlsx" }], stockists: [{ ref: "pricing.xlsx", list: [{ name: "Gull Point Market", city: "Astoria" }] }], read: ["pricing.xlsx"] };
    const a = applyFiles(input(), emptyGraphState(), read, { ran: ["retailers", "crowds"] })!;
    expect(a.facts.map((f) => f.id)).toEqual(["f1", "f2", "f3"]);
    expect(a.brief.stockists.at(-1)).toEqual({ value: { name: "Gull Point Market", city: "Astoria" }, source: { kind: "file", ref: "pricing.xlsx" } });
    expect(a.edit.note).toBe("Added 1 fact and 1 stockist: from pricing.xlsx");
    expect(a.edit.changed.sort()).toEqual(["fact:f3", itemKey.stockist({ name: "Gull Point Market", city: "Astoria" })].sort());
    expect(Object.keys(a.state.held)).toEqual(["retailers"]);
    expect(staleLine("retailers", a.state.held.retailers!)).toBe("Next retailers may change: you added pricing.xlsx.");
    expect(applyFiles({ brief: a.brief, facts: a.facts }, a.state, read, { ran: [] })).toBeUndefined();
  });
});

describe("saved state and answers", () => {
  it("reads a save from before the graph, or a damaged one, as empty", () => {
    expect(graphState(undefined)).toEqual(emptyGraphState());
    expect(graphState({ hidden: ["a", 3], log: [{ nope: 1 }], held: "x" })).toEqual({ hidden: ["a"], log: [], held: {}, rev: {}, gone: [] });
  });

  it("fills a typed answer into the question's empty field", () => {
    expect(fillOther({ op: "add", type: "stockist", value: "Corner Larder", city: "" }, "  Boise  ")).toEqual({ op: "add", type: "stockist", value: "Corner Larder", city: "Boise" });
  });
});

const entity = (id: string, name: string, address?: string) => ({ entity_id: id, name, ...(address ? { properties: { address } } : {}) }) as unknown as QlooEntity;
const qloo = {} as QlooClient;

describe("additions are resolved, or become a question", () => {
  beforeEach(() => {
    for (const f of [resolveBrand, resolveVenue, resolveTyped]) vi.mocked(f).mockReset();
  });

  it("adds a brand Qloo knows by its id, and asks “Did you mean…?” when it isn't sure", async () => {
    vi.mocked(resolveBrand).mockResolvedValueOnce({ entity: entity("Q1", "Moss & Tide (FIXTURE)"), options: [], callId: "c" });
    vi.mocked(resolveBrand).mockResolvedValueOnce({ options: [entity("Q2", "Brine and Company"), entity("Q3", "Brinery")], callId: "c" });
    const r = await resolveOps(qloo, [{ op: "add", type: "comparable", value: "moss and tide" }, { op: "add", type: "competitor", value: "Brine Co" }, { op: "remove", node: "x" }], brief());
    expect(r.ops).toEqual([{ op: "add", type: "comparable", value: "Moss & Tide", id: "Q1" }, { op: "remove", node: "x" }]);
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0].question).toBe("Did you mean Brine and Company?");
    expect(r.questions[0].options.map((o) => o.label)).toEqual(["Brine and Company", "Brinery"]);
    expect(r.questions[0].choices[1]).toEqual([{ op: "add", type: "competitor", value: "Brinery", id: "Q3" }]);
    expect(r.questions[0].other).toEqual({ op: "add", type: "competitor", value: "" });
    expect(r.calls).toBe(2);
  });

  it("asks which city a shop is in, offering the brand's own cities", async () => {
    const r = await resolveOps(qloo, [{ op: "add", type: "stockist", value: "Dune Deli" }], brief());
    expect(r.ops).toEqual([]);
    expect(r.questions[0].question).toBe("Which city is Dune Deli in?");
    expect(r.questions[0].options.map((o) => o.label)).toEqual(["Portland, OR", "Portland", "Seattle"]);
    expect(resolveVenue).not.toHaveBeenCalled();
  });

  it("places a shop by its city, and asks for an address when it can't", async () => {
    vi.mocked(resolveVenue).mockResolvedValueOnce({ status: "matched", entity: entity("V1", "Dune Deli", "12 Shore Rd"), callIds: ["a"] } as never);
    vi.mocked(resolveVenue).mockResolvedValueOnce({ status: "unresolved", callIds: ["b", "c"] } as never);
    const r = await resolveOps(qloo, [{ op: "add", type: "stockist", value: "Dune Deli", city: "Astoria" }, { op: "add", type: "stockist", value: "Nowhere Mart", city: "Astoria" }], brief());
    expect(r.ops).toEqual([{ op: "add", type: "stockist", value: "Dune Deli", city: "Astoria", id: "V1", address: "12 Shore Rd" }]);
    expect(r.questions[0].question).toBe("What's the street address of Nowhere Mart in Astoria?");
    expect(r.questions[0].other).toEqual({ op: "add", type: "stockist", value: "Nowhere Mart", city: "Astoria", address: "" });
    expect(r.calls).toBe(3);
  });

  it("resolves a city to grow in and a typed home city through the place resolver", async () => {
    vi.mocked(resolveTyped).mockResolvedValueOnce({ status: "ok", id: "P1", label: "Boise, ID", detail: "" });
    vi.mocked(resolveTyped).mockResolvedValueOnce({ status: "ask", question: "Which Springfield?", options: [{ id: "P2", label: "Springfield, IL", detail: "Illinois" }, { id: "P3", label: "Springfield, MO", detail: "Missouri" }] } as never);
    const r = await resolveOps(qloo, [{ op: "add", type: "city", value: "boise" }, { op: "set", field: "activeCity", value: "springfield" }], brief());
    expect(r.ops).toEqual([{ op: "add", type: "city", value: "Boise, ID", id: "P1" }]);
    expect(r.questions[0].question).toBe("Which Springfield?");
    expect(r.questions[0].choices).toEqual([[{ op: "set", field: "activeCity", value: "Springfield, IL" }], [{ op: "set", field: "activeCity", value: "Springfield, MO" }]]);
  });

  it("turns a lookup that fails into a question, never an error", async () => {
    vi.mocked(resolveBrand).mockRejectedValueOnce(new Error("down"));
    const r = await resolveOps(qloo, [{ op: "add", type: "comparable", value: "Moss & Tide" }], brief());
    expect(r.ops).toEqual([]);
    expect(r.questions[0].question).toBe("Which comparable did you mean by “Moss & Tide”?");
  });
});

describe("reading a chat message", () => {
  const nodes = allNodes(input({ crowds, fits })).nodes;

  it("keeps the model's fact edits, drops its taste edits, and turns what it's unsure of into a question", async () => {
    vi.mocked(generateStreamHedged).mockResolvedValueOnce({
      text: JSON.stringify({
        ops: [{ op: "set", field: "tierHint", value: "premium" }, { op: "wrong", node: "crowd:c1" }, { op: "remove", node: "comparable:kestrel kitchen" }],
        unsure: [{ question: "Did you mean the Seattle shop?", options: [{ label: "The Pantry Box, Seattle", ops: [{ op: "wrong", node: "stockist:the pantry box seattle" }] }, { label: "A crowd", ops: [{ op: "wrong", node: "crowd:c2" }] }] }],
        reply: "Moved you to premium and took Kestrel Kitchen off the graph.",
      }),
    } as never);
    const r = (await interpret("we're premium now, drop kestrel, and that pantry place is wrong", { brief: brief(), nodes, history: [] }))!;
    expect(r.ops).toEqual([{ op: "set", field: "tierHint", value: "premium" }, { op: "remove", node: "comparable:kestrel kitchen" }]);
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0].options.map((o) => o.label)).toEqual(["The Pantry Box, Seattle"]);
    expect(r.reply).toBe("Moved you to premium and took Kestrel Kitchen off the graph.");
  });

  it("hands a request for the team to Athena, keeping any facts the same message states", async () => {
    vi.mocked(generateStreamHedged).mockResolvedValueOnce({ text: JSON.stringify({ ops: [{ op: "set", field: "tierHint", value: "premium" }], reply: "", team: true }) } as never);
    const r = (await interpret("we're premium now; who should we pitch in Portland?", { brief: brief(), nodes, history: [] }))!;
    expect(r.team).toBe(true);
    expect(r.ops).toEqual([{ op: "set", field: "tierHint", value: "premium" }]);
    vi.mocked(generateStreamHedged).mockResolvedValueOnce({ text: JSON.stringify({ ops: [], reply: "Noted.", team: "yes" }) } as never);
    expect((await interpret("noted", { brief: brief(), nodes, history: [] }))!.team).toBeUndefined();
  });

  it("returns nothing when the model doesn't answer, so the route can point at the graph", async () => {
    vi.mocked(generateStreamHedged).mockResolvedValueOnce({ text: "" } as never);
    expect(await interpret("hi", { brief: brief(), nodes, history: [] }).catch(() => undefined)).toBeUndefined();
  });
});
