import { describe, expect, it } from "vitest";
import { athenaPlan, type PlanCrowd } from "@/lib/agent/athena-plan";
import type { Outcome, Work } from "@/lib/team/types";
import type { CrowdPage } from "@/lib/team/page";

// Athena's plan (PRD §23.5 m): numbered steps from the subagents' saved results, shared moves first, then each crowd
// in its order; every line cited, dates only when sourced, and marked-No items gone.

const crowds: PlanCrowd[] = [
  { id: "c1", name: "Coastal cooks", tier: "win_first", why: "Their taste overlaps yours most" },
  { id: "c2", name: "Night owls", tier: "win_next", why: "Close to Coastal cooks" },
  { id: "c3", name: "Weekend hosts", tier: "watch" },
];

const city = (metroId: string, name: string, hoods: { name: string; at: [number, number]; heat: Record<string, number> }[]) => ({ metroId, name, center: [0, 0], rivals: [], yours: false, layers: [], hoods: hoods.map((h) => ({ ...h, cells: 3 })) });
const nav = {
  cap: 1,
  calls: 4,
  callIds: [],
  crowds: [
    { id: "c1", tier: "win_first", cities: [{ metroId: "m1", name: "Fernvale", z: 1.2, reason: "", leans: [] }] },
    { id: "c2", tier: "win_next", cities: [{ metroId: "m1", name: "Fernvale", z: 0.8, reason: "", leans: [] }] },
    { id: "c3", tier: "watch", cities: [{ metroId: "m2", name: "Brookton", z: 0.9, reason: "", leans: [] }] },
  ],
  cities: [
    city("m1", "Fernvale", [
      { name: "Old Dock", at: [0, 0], heat: { c1: 0.9, c2: 0.7 } },
      { name: "Mill Row", at: [0, 0.01], heat: { c1: 0.6, c2: 0.8 } },
      { name: "Far Hill", at: [0.5, 0.5], heat: { c1: 0.1, c2: 0.1 } },
    ]),
    city("m2", "Brookton", [{ name: "Riverside", at: [1, 1], heat: { c3: 0.9 } }]),
  ],
};
const shop = (name: string, crowds: Record<string, number>, extra: object = {}) => ({ id: name, name, metroId: "m1", city: "Fernvale", hood: "Old Dock", kind: "deli", crowds, stocked: false, reasons: [], callId: "x", ...extra });
const rep = {
  crowds: [],
  cities: [{ metroId: "m1", name: "Fernvale" }],
  shops: [shop("Fig Larder", { c1: 0.9, c2: 0.6 }), shop("Salt Shelf", { c1: 0.8 }), shop("Night Pantry", { c2: 0.7 }), shop("Stocked Co", { c1: 0.9, c2: 0.9 }, { stocked: true }), shop("Nope Store", { c1: 0.95 })],
  retailers: {},
  budget: "low",
  brand: { name: "Brightland", product: "olive oil" },
  competitors: [],
  calls: 3,
  callIds: [],
};
const match = {
  crowds: [],
  creators: [{ id: "creator:ana cooks", name: "Ana Cooks", platform: "youtube", band: "micro", audience: "matches", crowds: { c2: 0.7 }, found: "Qloo", audienceWhy: "", links: [] }],
  brands: [{ name: "Tide Tins", kind: "brand", crowds: { c1: 0.8, c3: 0.6 }, size: "small", sizeWhy: "", reasons: [], contact: {} }],
  podcasts: [],
  left: [],
  rates: [],
  budget: "low",
  brand: { name: "Brightland", product: "olive oil" },
  ownInQloo: true,
  checked: true,
  calls: 5,
  callIds: [],
  limits: ["YouTube creators weren't read: no YouTube key is set"],
};
const event = (id: string, name: string, date: string, crowds: string[]) => ({ id, name, kind: "market", date, url: `https://example.org/${id}`, site: "example.org", metroId: "m1", city: "Fernvale", crowds, why: "", formats: ["booth"], fee: { text: "$150 booth", url: "https://example.org/fee", site: "example.org" } });
const promo = {
  crowds: [],
  cities: [],
  events: [event("event:harbour food fair fernvale", "Harbour Food Fair", "2026-12-05", ["c1", "c2"]), event("event:late market fernvale", "Late Market", "2027-01-10", ["c2"])],
  moments: [],
  audiences: [],
  hosts: [],
  budget: "low",
  brand: { name: "Brightland", product: "olive oil" },
  launch: {},
  moved: [],
  calls: 6,
  callIds: [],
  limits: [],
  at: "2026-10-22",
};
const lines = (label: string, text: string) => ({ type: "lines", label, lines: [{ text }] });
const scout = {
  at: 1,
  tabs: [
    { crowd: { id: "c1", name: "Coastal cooks", tier: "win_first" }, sections: [{ id: "words", title: "Words", blocks: [lines("Hooks", "Small tins, big taste")] }], sources: [], method: "" },
    { crowd: { id: "c2", name: "Night owls", tier: "win_next" }, sections: [{ id: "words", title: "Words", blocks: [lines("Hooks", "After dark, still fresh")] }], sources: [], method: "" },
  ],
  across: {
    sources: [],
    method: "",
    sections: [
      { id: "order", title: "Order", blocks: [{ type: "steps", steps: [{ text: "Win Coastal cooks first", signal: "It holds when you see repeat buyers", crowd: "c1" }, { text: "Once Coastal cooks holds, win Night owls", signal: "Move on when Coastal cooks shows repeat buyers", crowd: "c2" }, { text: "Once Night owls holds, win Weekend hosts", signal: "Move on when Night owls shows repeat buyers", crowd: "c3" }] }] },
      { id: "message", title: "One message", blocks: [lines("Works for all three", "Good food, no fuss")] },
    ],
  },
} as unknown as CrowdPage;

const work = (agent: Work["agent"], extra: Partial<Work> = {}): Work => ({ agent, goal: "g", headline: "", results: [], claims: [], sources: [], ms: 0, qlooCalls: 0, at: 5, by: "rules", ...extra });
const works = {
  analyst: work("analyst"),
  navigator: work("navigator", { shared: { nav: nav as never } }),
  rep: work("rep", { shared: { rep: rep as never } }),
  matchmaker: work("matchmaker", { shared: { match: match as never } }),
  promoter: work("promoter", { shared: { promo: promo as never } }),
  scout: work("scout", { page: scout }),
};
const mark = (item: string, agent: Outcome["agent"], m: Outcome["mark"], group?: string): Outcome => ({ item, agent, kind: "x", name: item, mark: m, at: 1, ...(group ? { group } : {}) });
const no = [mark("venue:nope store", "rep", "no")];

describe("Athena's plan (§23.5 m)", () => {
  const plan = athenaPlan({ works, crowds, outcomes: no, now: 9 });
  const steps = plan.steps!;
  const text = (n: number) => steps[n - 1].lines.map((l) => l.text).join(" | ");

  it("numbers the shared moves first, then Win first, Win next and Watch", () => {
    expect(steps.map((s) => s.n)).toEqual(steps.map((_, i) => i + 1));
    const order = ["shared", "win_first", "win_next", "watch"];
    const phases = steps.map((s) => order.indexOf(s.phase));
    expect([...phases].sort((a, b) => a - b)).toEqual(phases);
    expect(steps[0]).toMatchObject({ phase: "shared", what: expect.stringMatching(/^Open in Fernvale: 2 crowds are strong there/), crowds: ["Coastal cooks", "Night owls"] });
    expect(steps[0].lines[0]).toMatchObject({ kind: "where", agent: "navigator", text: "Fernvale: start in Old Dock and Mill Row" });
  });

  it("puts a shop, a partner and an event that fit several crowds into shared steps, out of each crowd's own", () => {
    const shared = steps.filter((s) => s.phase === "shared");
    expect(shared.map((s) => s.lines.find((l) => l.agent)?.agent)).toEqual(["navigator", "rep", "matchmaker", "promoter"]);
    expect(text(2)).toContain("Fig Larder");
    expect(text(2)).not.toContain("Stocked Co");
    expect(steps[1].lines).toContainEqual({ kind: "words", agent: "scout", text: "Good food, no fuss" });
    expect(steps[1].lines).toContainEqual({ kind: "cost", agent: "rep", text: "Consignment, or a small opening order, sized to a small budget" });
    expect(text(3)).toContain("Tide Tins");
    const own = steps.filter((s) => s.phase !== "shared").map((s) => s.lines.map((l) => l.text).join(" ")).join(" ");
    expect(own).not.toMatch(/Fig Larder|Tide Tins|Harbour Food Fair/);
  });

  it("gives every date with its source, and otherwise only 'Start now' or 'once step N holds'", () => {
    const whens = steps.flatMap((s) => s.lines.filter((l) => l.kind === "when"));
    for (const l of whens) {
      if (/\d{4}/.test(l.text)) expect(l).toMatchObject({ agent: "promoter", url: expect.stringMatching(/^https:/) });
      else expect(l.text === "Start now" || /^Once steps? /.test(l.text) || l.agent === "scout").toBe(true);
    }
    expect(whens).toContainEqual({ kind: "when", agent: "promoter", text: "Dec 5, 2026, per example.org", url: "https://example.org/event:harbour food fair fernvale" });
  });

  it("waits each crowd on the one before it, with the Scout's signal for moving on", () => {
    const first = steps.filter((s) => s.phase === "win_first").map((s) => s.n);
    const next = steps.filter((s) => s.phase === "win_next");
    expect(first.length).toBeGreaterThan(0);
    for (const s of next) expect(s.depends).toEqual(first);
    expect(next[0].lines).toContainEqual({ kind: "when", agent: "scout", text: "Move on when Coastal cooks shows repeat buyers" });
    expect(next[0].lines.find((l) => l.kind === "when")?.text).toMatch(/^Once step/);
    expect(steps.filter((s) => s.phase === "win_first").every((s) => s.depends.join() === "1")).toBe(true);
  });

  it("cites every subagent that ran, and the Analyst's reason on a crowd's first step", () => {
    const cited = new Set(steps.flatMap((s) => s.lines.flatMap((l) => (l.agent ? [l.agent] : []))));
    expect([...cited].sort()).toEqual(["analyst", "matchmaker", "navigator", "promoter", "rep", "scout"]);
    expect(steps.find((s) => s.phase === "win_first")!.lines[0]).toEqual({ kind: "who", agent: "analyst", text: "Their taste overlaps yours most" });
    expect(steps.find((s) => s.phase === "win_first")!.lines).toContainEqual({ kind: "words", agent: "scout", text: "Small tins, big taste" });
  });

  it("drops what the founder marked No, notes what's pitched, and the Navigator's verdict reads the marks", () => {
    expect(steps.map((s) => s.lines.map((l) => l.text).join(" ")).join(" ")).not.toContain("Nope Store");
    const pitched = athenaPlan({ works, crowds, outcomes: [...no, mark("venue:fig larder", "rep", "pitched")] }).steps!;
    expect(pitched[1].lines.find((l) => l.kind === "through")?.text).toContain("Fig Larder (pitched, waiting to hear)");
    const skipped = athenaPlan({ works, crowds, outcomes: [mark("event:harbour food fair fernvale", "promoter", "no")] }).steps!;
    expect(JSON.stringify(skipped)).not.toContain("Harbour Food Fair");
    const notHere = athenaPlan({ works, crowds, outcomes: [mark("city:fernvale", "navigator", "no", "m1")] });
    expect(notHere.steps![0].what).not.toMatch(/^Open in/);
  });

  it("lists the subagents' limits and the inputs it went ahead without as open; flags a launch city with no shop", () => {
    expect(plan.open).toContain("The Matchmaker: YouTube creators weren't read: no YouTube key is set");
    expect(plan.open.some((o) => o.startsWith("What can you spend on growth in the next three months: I went ahead with a small budget"))).toBe(true);
    const answered = athenaPlan({ works, crowds, answers: [{ question: "What can you spend on growth in the next three months?" }] });
    expect(answered.open.some((o) => o.startsWith("What can you spend"))).toBe(false);
    const elsewhere = athenaPlan({ works: { ...works, rep: work("rep", { shared: { rep: { ...rep, shops: rep.shops.map((s) => ({ ...s, crowds: {} })) } as never } }) }, crowds });
    expect(elsewhere.disagreements).toContain("The Navigator says launch in Fernvale, but the Rep found no shop there that fits a crowd yet.");
  });

  it("reads like a plan: each city once, a cost per partner, no empty fee fit, every Win first crowd in the headline", () => {
    const wheres = steps.flatMap((s) => s.lines.filter((l) => l.kind === "where" && l.agent !== "navigator").map((l) => l.text));
    for (const t of wheres) expect(t.split("; ").map((x) => x.split(":")[0])).toEqual([...new Set(t.split("; ").map((x) => x.split(":")[0]))]);
    expect(text(2)).toContain("Fernvale: Old Dock");
    expect(steps[2].lines.find((l) => l.kind === "cost")?.text).toMatch(/^Tide Tins: [a-z].*\(/);
    expect(steps.flatMap((s) => s.lines).some((l) => /· (Ask|See the fee)$/.test(l.text))).toBe(false);
    expect(steps.some((s) => / at$/.test(s.what))).toBe(false);
    expect(plan.headline).toMatch(/winning Coastal cooks first, then Night owls and Weekend hosts/);
    const two = athenaPlan({ works, crowds: crowds.map((c) => (c.id === "c2" ? { ...c, tier: "win_first" as const } : c)) });
    expect(two.headline).toMatch(/winning Coastal cooks and Night owls first, then Weekend hosts/);
    // The crowd after two Win first crowds waits for both of them, not only the second.
    const firsts = (two.steps ?? []).filter((s) => s.phase === "win_first").map((s) => s.n);
    const next = (two.steps ?? []).find((s) => s.phase !== "win_first" && s.phase !== "shared");
    expect(next?.depends).toEqual(firsts);
  });

  it("names each step's results with the subagent that owns them, for the Executive's marks (§23.5 n)", () => {
    const items = (plan.steps ?? []).flatMap((s) => s.items ?? []);
    expect(items.length).toBeGreaterThan(0);
    const owner: Record<string, string> = { venue: "rep", creator: "matchmaker", partner: "matchmaker", podcast: "matchmaker", event: "promoter" };
    for (const i of items) expect(i.agent).toBe(owner[i.kind]);
    // What the founder marked No is in no step's items either.
    for (const o of no) expect(items.some((i) => i.id === o.item)).toBe(false);
  });

  it("records which works it read, so a newer run shows it out of date", () => {
    expect(plan.from).toMatchObject({ navigator: 5, rep: 5, scout: 5 });
    expect(plan.at).toBe(9);
    expect(athenaPlan({ works: {}, crowds: [] })).toMatchObject({ steps: [], headline: "The plan fills in as the subagents finish." });
  });

  it("never shows a crowd's raw id, even when its crowds haven't reached the plan", () => {
    const bare = athenaPlan({ works, crowds: [], outcomes: no, now: 9 }).steps!;
    expect(bare.length).toBeGreaterThan(0);
    const ids = new Set(crowds.map((c) => c.id));
    for (const s of bare) {
      for (const c of s.crowds) expect(ids.has(c), c).toBe(false);
      for (const id of ids) expect(s.what).not.toMatch(new RegExp(`\\b${id}\\b`));
    }
  });
});
