import { describe, expect, it, vi } from "vitest";
import { emptyBrief, type BrandBrief, type Source } from "@/lib/brief/types";
import type { LiveFact } from "@/lib/knowledge/types";
import { THEMES, byTheme, bySource, mergeNotes, readSynth, themesOf, unread } from "@/lib/knowledge/notes";
import { allNodes, buildGraph, listGroups } from "@/lib/graph/build";
import { applyEdit, applyFiles, emptyGraphState, undo, validOp, type Op } from "@/lib/graph/edit";
import { themeId, type GraphInput } from "@/lib/graph/types";
import { knowledgeParts } from "@/lib/agent/fits";
import { panelIds } from "@/lib/agent/specialists";

vi.mock("server-only", () => ({}));
const store = new Map<string, unknown>();
vi.mock("@/lib/store", () => ({
  getStore: () => ({ get: async (ns: string, k: string) => (store.has(`${ns}:${k}`) ? { value: store.get(`${ns}:${k}`) } : undefined), set: async (ns: string, k: string, v: unknown) => void store.set(`${ns}:${k}`, v) }),
}));
vi.mock("@/lib/llm/vertex", () => ({ generate: vi.fn(), llmConfigured: () => true, parseJson: (s: string) => JSON.parse(s) }));

// Knowledge, not raw facts (PRD §23.2 step 8.2): synthesis into themes, the graph collapsed and expandable, the list by
// theme, edits that show everywhere, survive re-synthesis and undo, a later file merging in, the agents' context, and
// the team panel. Every name here is made up.

const WEB: Source = { kind: "website", ref: "https://tidepool.example" };
const s = <T>(value: T, source: Source = WEB) => ({ value, source });
const brief = (): BrandBrief => ({ ...emptyBrief(), name: s("Tidepool Tins"), sells: s("Tinned fish"), stockists: [s({ name: "Corner Larder", city: "Portland" })], competitors: [s("Brine & Co")] });

const raw: LiveFact[] = [
  { id: "r1", text: "A tin costs $9", where: "tidepool.example/shop", source: "https://tidepool.example/shop" },
  { id: "r2", text: "Tins are $9 each", where: "deck.pdf, slide 2", source: "deck.pdf" },
  { id: "r3", text: "Sold at Corner Larder in Portland", where: "tidepool.example/stockists", source: "https://tidepool.example/stockists" },
  { id: "r4", text: "Gross margin is 48% at wholesale", where: "deck.pdf, slide 4", source: "deck.pdf" },
  { id: "r5", text: "Founded in 2021 by two sisters", where: "tidepool.example/about", source: "https://tidepool.example/about" },
  { id: "r6", text: "Wants 50 shops next year", where: "deck.pdf, slide 7", source: "deck.pdf" },
];
const reply = {
  themes: [
    { name: "Products and prices", notes: [{ text: "A tin costs $9.", facts: ["r1", "r2"] }] },
    { name: "Where it sells", notes: [{ text: "Sold at Corner Larder in Portland.", facts: ["r3"], about: ["corner larder", "Nowhere Shop"] }] },
    { name: "Money", notes: [{ text: "Gross margin is 48% at wholesale.", facts: ["r4"] }, { text: "Margin is 50%.", facts: ["r4"] }] },
    { name: "The story", notes: [{ text: "Founded in 2021 by two sisters.", facts: ["r5"] }] },
    { name: "Plans and goals", notes: [{ text: "Wants to be in 50 shops next year.", facts: ["r6", "nope"] }] },
  ],
  asks: [{ about: "The price of a tin", facts: ["r1"], options: [{ value: "$9", text: "A tin costs $9." }, { value: "$10", text: "A tin costs $10." }] }],
};
const notes = () => readSynth(reply, raw, ["Corner Larder", "Portland"])!.notes;
const input = (facts: LiveFact[], over: Partial<GraphInput> = {}): GraphInput => ({ brief: brief(), facts, ...over });
const edit = (facts: LiveFact[], ops: Op[], state = emptyGraphState()) => applyEdit(input(facts), state, ops, { by: "graph", ran: ["fits"] })!;

describe("synthesis", () => {
  it("reads the model's themes: duplicates merged, numbers exact, every note traced to its raw facts and linked to known nodes", () => {
    const n = notes();
    expect(themesOf(n)).toEqual(["Products and prices", "Where it sells", "Money", "The story", "Plans and goals"]);
    expect(themesOf(n).length).toBeGreaterThanOrEqual(THEMES.min);
    const price = n.find((x) => x.theme === "Products and prices")!;
    expect(price.from).toEqual(["r1", "r2"]);
    expect(price.where).toContain("deck.pdf, slide 2");
    // The founder's file is the note's source over the site.
    expect(price.source).toBe("deck.pdf");
    // "Margin is 50%" is not in any raw fact: it is dropped, never shown.
    expect(n.some((x) => x.text.includes("50%"))).toBe(false);
    expect(n.find((x) => x.theme === "Where it sells")!.about).toEqual(["Corner Larder"]);
    expect(n.find((x) => x.theme === "Plans and goals")!.from).toEqual(["r6"]);
  });

  it("keeps a raw fact the model left out, and raises true disagreements as asks", () => {
    const r = readSynth({ themes: reply.themes.slice(0, 2), asks: reply.asks }, raw)!;
    expect(r.notes.filter((x) => x.theme === "More from your sources").flatMap((x) => x.from)).toEqual(["r4", "r5", "r6"]);
    expect(r.asks).toEqual([{ about: "The price of a tin", note: r.notes[0].id, options: reply.asks[0].options }]);
    expect(readSynth({ themes: [] }, raw)).toBeUndefined();
  });

  it("groups by source page or file without the model, and leaves the founder's answers alone", () => {
    const n = bySource([...raw, { id: "said_1", text: "We ship in 3 days", where: "you told me", source: "the founder" }]);
    expect(themesOf(n)).toEqual(["Your site: shop", "deck.pdf", "Your site: stockists", "Your site: about"]);
    expect(n.some((x) => x.from?.includes("said_1"))).toBe(false);
  });

  it("is cached per workspace, and falls back to the sources when the model fails", async () => {
    const { synthesize } = await import("@/lib/knowledge/synth");
    const gen = vi.fn().mockResolvedValue({ text: JSON.stringify(reply) });
    const a = await synthesize({ ws: "ws1", raw, themes: [], entities: [] }, { llm: true, gen: gen as never });
    const b = await synthesize({ ws: "ws1", raw, themes: [], entities: [] }, { llm: true, gen: gen as never });
    expect(a.by).toBe("model");
    expect(b).toEqual(a);
    expect(gen).toHaveBeenCalledTimes(1);
    const bad = await synthesize({ ws: "ws2", raw, themes: [], entities: [] }, { llm: true, gen: vi.fn().mockRejectedValue(new Error("x")) as never });
    expect(bad.by).toBe("source");
    expect(bad.notes.length).toBe(bySource(raw).length);
    expect((await synthesize({ raw, themes: [], entities: [] }, { llm: false })).by).toBe("source");
  });
});

describe("the graph and the list", () => {
  it("shows themes collapsed; a theme opens to its notes, and a note to its sources; a note links to the node it is about", () => {
    const n = notes();
    const closed = buildGraph(input(n));
    expect(closed.nodes.filter((x) => x.type === "theme")).toHaveLength(5);
    expect(closed.nodes.some((x) => x.type === "fact")).toBe(false);
    expect(closed.nodes.length).toBeLessThanOrEqual(25);
    const where = themeId("Where it sells");
    const open = buildGraph(input(n, { open: [where] }));
    const note = open.nodes.find((x) => x.type === "fact")!;
    expect(note.parent).toBe(where);
    expect(open.edges.some((e) => e.from === note.id && e.to === "stockist:corner larder|portland")).toBe(allNodes(input(n)).nodes.some((x) => x.id === "stockist:corner larder|portland"));
    expect(open.edges.some((e) => e.kind === "about" && e.from === note.id && e.reason === "About Corner Larder")).toBe(true);
    const deeper = buildGraph(input(n, { open: [where, note.id] }));
    expect(deeper.nodes.filter((x) => x.type === "source").map((x) => x.label)).toEqual(["tidepool.example/stockists"]);
  });

  it("lists every note under its theme", () => {
    const g = listGroups(input(notes()));
    expect(g.find((x) => x.type === "theme")!.nodes.map((x) => x.label)).toHaveLength(5);
    expect(g.find((x) => x.type === "fact")!.nodes.every((x) => !!x.parent)).toBe(true);
  });
});

describe("editing the knowledge", () => {
  const priceId = () => notes().find((x) => x.theme === "Products and prices")!.id;

  it("edits, moves, splits, merges and deletes a note, renames and removes a theme: each one edit, held runs, Undo", () => {
    const n = notes();
    const id = priceId();
    const e = edit(n, [{ op: "note", id, text: "A tin costs $9 at retail." }]);
    expect(e.facts.find((x) => x.id === id)).toMatchObject({ text: "A tin costs $9 at retail.", mine: true });
    expect(e.edit.note).toMatch(/^Changed a note/);
    expect(e.state.held.fits?.why).toBe("you edited a note");
    expect(undo(input(e.facts), e.state, ["fits"])!.facts).toEqual(n);

    const m = edit(n, [{ op: "move", id, theme: "Money" }]);
    expect(m.facts.find((x) => x.id === id)!.theme).toBe("Money");
    const sp = edit(n, [{ op: "split", id, parts: ["A tin costs $9.", "Sold by the tin."] }]);
    expect(sp.facts.filter((x) => x.theme === "Products and prices").map((x) => x.text)).toEqual(["A tin costs $9.", "Sold by the tin."]);
    const ids = n.filter((x) => x.theme === "Money" || x.theme === "The story").map((x) => x.id);
    const mg = edit(n, [{ op: "merge", ids }]);
    expect(mg.facts.length).toBe(n.length - 1);
    expect(mg.facts.find((x) => x.mine)!.from).toEqual(["r4", "r5"]);
    const rn = edit(n, [{ op: "theme", theme: "Money", to: "Margins" }]);
    expect(themesOf(rn.facts)).toContain("Margins");

    const d = edit(n, [{ op: "drop", id }]);
    expect(d.facts.some((x) => x.id === id)).toBe(false);
    expect(d.state.gone).toEqual(["r1", "r2"]);
    const back = undo(input(d.facts), d.state, ["fits"])!;
    expect(back.facts).toEqual(n);
    expect(back.state.gone).toEqual([]);
    const rm = edit(n, [{ op: "theme", theme: "Plans and goals" }]);
    expect(themesOf(rm.facts)).not.toContain("Plans and goals");
    expect(rm.state.gone).toEqual(["r6"]);
  });

  it("checks a chat edit against the notes and themes on the graph", () => {
    const nodes = allNodes(input(notes())).nodes;
    expect(validOp({ op: "drop", id: priceId() }, nodes)).toEqual({ op: "drop", id: priceId() });
    expect(validOp({ op: "drop", id: "nx" }, nodes)).toBeUndefined();
    expect(validOp({ op: "theme", theme: "money", to: "Margins" }, nodes)).toEqual({ op: "theme", theme: "Money", to: "Margins" });
    expect(validOp({ op: "theme", theme: "Nope" }, nodes)).toBeUndefined();
  });

  it("keeps edited notes and deletions through a re-synthesis", () => {
    const n = notes();
    const id = priceId();
    const e = edit(n, [{ op: "note", id, text: "A tin costs $9 at retail." }]);
    const d = edit(e.facts, [{ op: "drop", id: n.find((x) => x.theme === "The story")!.id }], e.state);
    const again = mergeNotes(d.facts, notes(), d.state.gone!);
    expect(again.find((x) => x.id === id)!.text).toBe("A tin costs $9 at retail.");
    expect(again.some((x) => x.from?.includes("r5"))).toBe(false);
    expect(again.filter((x) => x.from?.includes("r1"))).toHaveLength(1);
    expect(unread(raw, d.facts, d.state.gone!).map((x) => x.id)).toEqual(["r3", "r4", "r6"]);
  });
});

describe("a later file", () => {
  it("merges into the themes already there, as one edit with Undo", () => {
    const n = notes();
    const later: LiveFact = { id: "nlater", text: "A gift box of 3 tins costs $25.", where: "prices.xlsx, Sheet1, row 3", source: "prices.xlsx", theme: "Products and prices", from: ["r9"] };
    const a = applyFiles(input(n), emptyGraphState(), { facts: [later], stockists: [], read: ["prices.xlsx"] }, { ran: ["fits"] })!;
    expect(themesOf(a.facts)).toEqual(themesOf(n));
    expect(a.facts.filter((x) => x.theme === "Products and prices")).toHaveLength(2);
    expect(a.edit.note).toBe("Added 1 note in 1 theme: from prices.xlsx");
    expect(undo(input(a.facts), a.state, ["fits"])!.facts).toEqual(n);
  });
});

describe("the agents and the team panel", () => {
  it("gives the agents the notes by theme, with their source ids; deleted notes don't feed them", () => {
    const n = notes();
    const d = edit(n, [{ op: "theme", theme: "Money" }]);
    const parts = knowledgeParts(d.facts);
    expect(parts.map((p) => p.summary)).toEqual(["1 note on Products and prices", "1 note on Where it sells", "1 note on The story", "1 note on Plans and goals"]);
    expect(byTheme(d.facts)[0].notes[0]).toMatch(/\| A tin costs \$9\. \| .*\(raw r1, r2\)$/);
  });

  it("shows Athena and the Analyst from the start, and a specialist only once a chosen goal includes it", () => {
    expect(panelIds({ goals: [] })).toEqual(["athena", "analyst"]);
    expect(panelIds({ goals: [{ team: ["analyst", "navigator"] }, { team: ["rep"] }] })).toEqual(["athena", "analyst", "navigator", "rep"]);
  });
});
