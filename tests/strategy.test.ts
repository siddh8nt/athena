import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildStrategies, readContext, type CrowdPicks, type StrategyBase, type StrategyIn } from "@/lib/strategy/build";
import type { Action, StrategyContext } from "@/lib/strategy/types";
import type { Calendar, Fit, FitsResult, Moment } from "@/lib/fits/types";
import { emptyJourney, loadedJourney, type CrowdCard, type FitsRun } from "@/lib/journey/types";
import { codeStrategy, strategyFinisher, type StrategyEvent } from "@/lib/agent/strategy";
import type { AgentState } from "@/lib/agent/tools";
import type { Source } from "@/lib/agent/loop";

// Invented test data only: fictional crowds, venues, retailers and creators, no Qloo data.

const date = "2026-10-14";

const card = (id: string, name: string, loves: string[], cities: [string, string, number][]): CrowdCard => ({
  id,
  name,
  main: false,
  loves: loves.map((n) => ({ name: n, kind: "brand" })),
  signal: [],
  cities: cities.map(([name, venue, venues]) => ({ metro: name.toLowerCase(), name, venue, venues })),
  size: 12,
});

const crowds: CrowdCard[] = [
  card("harbor", "Harbor Pantry", ["Saltmarsh Provisions", "Low Tide Bakery", "Kettle & Kelp"], [
    ["Portland", "The Salt Cellar", 6],
    ["Seattle", "Brine & Barrel", 4],
    ["Denver", "Copper Larder", 3],
    ["Austin", "Prickly Pear Pantry", 2],
  ]),
  card("trail", "Trailhead Supper", ["Ridgeback Outfitters", "Campfire Cast Iron"], [
    ["Boise", "Summit Supply", 5],
    ["Salt Lake City", "Basin Mercantile", 3],
    ["Denver", "Pinecone Provisions", 2],
  ]),
  card("drift", "Driftwood Social", ["Seaglass Radio"], [["San Diego", "Kelp House", 2]]),
];

const fit = (crowd: string, name: string, rank: number, tier: Fit["tier"]): Fit => ({ crowd, name, rank, tier, score: 0.6 - rank / 10, params: {} as Fit["params"], reasons: [], missing: [] });

const fits: FitsResult = {
  fits: [fit("harbor", "Harbor Pantry", 1, "win_first"), fit("trail", "Trailhead Supper", 2, "win_next"), fit("drift", "Driftwood Social", 3, "watch")],
  weights: { fit: 1, reach: 1, efficiency: 1, momentum: 1, moments: 1, signal: 1 },
  changes: [],
  excluded: [],
  date,
};

const m = (name: string, kind: Moment["kind"], d: string, o: Partial<Moment> = {}): Moment => ({ name, kind, date: d, days: 0, ...o });
const calendar: Calendar = {
  date,
  horizons: {
    now: [],
    next_quarter: [m("Black Friday", "retail", "2026-11-27", { startBy: "2026-10-28" }), m("Holiday entertaining season", "category", "2026-12-01", { startBy: "2026-11-01" })],
    season: [m("Lantern Food Fair", "event", "2027-03-10", { crowd: "trail", detail: "Boise" }), m("Mother's Day", "retail", "2027-05-09", { startBy: "2027-04-09" })],
    year: [m("Harbor Pantry yearly peak", "crowd", "2027-06-01", { crowd: "harbor", startBy: "2027-04-15" }), m("Trailhead Supper yearly peak", "crowd", "2027-07-01", { crowd: "trail" }), m("Back to school", "retail", "2027-08-15")],
  },
  recurring: [],
};

const picks: Record<string, CrowdPicks> = {
  harbor: {
    retailers: [{ name: "Greenleaf Grocers", rank: 1 }, { name: "Tidewater Market", rank: 2 }],
    creators: [{ name: "Juniper Vale", role: "Chef" }, { name: "Ossian Reed", role: "Food stylist" }],
    podcasts: [{ name: "The Pantry Hour" }],
    interests: [{ name: "Home cooks" }],
  },
  trail: { retailers: [{ name: "Basecamp Foods", rank: 1 }], creators: [], podcasts: [], interests: [] },
};

const empty: StrategyContext = { stockists: [], soldIn: [] };
const input = (context: StrategyContext = empty, o: Partial<StrategyIn> = {}): StrategyIn => ({
  date,
  product: "tinned fish",
  fits,
  calendar,
  crowds,
  picks,
  context,
  src: { fits: "s1", crowds: "s2", picks: "s3" },
  ...o,
});

const said = (s: string) => ({ said: s, sources: ["s4"] });
const budget = (band: "lean" | "moderate" | "ample", words = "we can spend a little each month") => ({ budget: { band, ...said(words) } });

/** Actions that differ between two runs (ignoring shapedBy), with the new run's version when there is one. */
function changed(a: Action[], b: Action[]) {
  const strip = ({ shapedBy: _, ...x }: Action) => JSON.stringify(x);
  const before = new Map(a.map((x) => [x.id, x]));
  const after = new Map(b.map((x) => [x.id, x]));
  const ids = new Set([...before.keys(), ...after.keys()]);
  return [...ids].flatMap((id) => {
    const x = before.get(id);
    const y = after.get(id);
    return x && y && strip(x) === strip(y) ? [] : [{ id, before: x, after: y }];
  });
}
const actionsOf = (r: ReturnType<typeof buildStrategies>) => r.strategies.flatMap((s) => s.actions);

describe("strategy builder", () => {
  it("gives every Win first and Win next fit a strategy, and the Watch fit none", () => {
    const r = buildStrategies(input());
    expect(r.strategies.map((s) => s.crowd)).toEqual(["harbor", "trail"]);
  });

  it("has now and next actions, and a before action for each dated moment", () => {
    const r = buildStrategies(input(empty));
    for (const s of r.strategies) {
      expect(s.actions.some((a) => a.when === "now")).toBe(true);
      expect(s.actions.some((a) => a.when === "next")).toBe(true);
      for (const a of s.actions) expect(a.startBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const harbor = r.strategies[0].actions.filter((a) => a.when === "before").map((a) => a.moment!.name);
    expect(harbor).toEqual(["Black Friday", "Holiday entertaining season", "Mother's Day", "Harbor Pantry yearly peak"]);
    // Another crowd's peak isn't in this crowd's plan; a lean budget leaves out events.
    expect(r.strategies[1].actions.filter((a) => a.when === "before").map((a) => a.moment!.name)).toEqual(["Black Friday", "Holiday entertaining season", "Mother's Day", "Trailhead Supper yearly peak"]);
    // Prep starts by the moment's lead time.
    expect(r.strategies[0].actions.find((a) => a.moment?.name === "Black Friday")!.startBy).toBe("2026-10-28");
  });

  it("cites only sources it was given", () => {
    const known = new Set(["s1", "s2", "s3"]);
    for (const a of actionsOf(buildStrategies(input(empty)))) {
      expect(a.sources.length).toBeGreaterThan(0);
      for (const s of a.sources) expect(known.has(s)).toBe(true);
    }
  });

  it("gives two crowds different where and through", () => {
    const [a, b] = buildStrategies(input()).strategies;
    expect(a.where.map((w) => w.metro)).not.toEqual(b.where.map((w) => w.metro));
    expect(a.through).not.toEqual(b.through);
    expect(a.where.filter((w) => w.now).map((w) => w.metro)).toEqual(["Portland", "Seattle"]);
  });

  it("prefers measured reach over venue cities for where", () => {
    const r = buildStrategies(input(empty, { reach: { harbor: [{ metro: "Chicago", people: 9e5 }, { metro: "Portland", people: 4e5 }] } }));
    expect(r.strategies[0].where.map((w) => w.metro)).toEqual(["Chicago", "Portland"]);
    expect(r.strategies[0].where[0].sources).toEqual(["s1"]);
  });

  it("says what it assumed when the context is silent", () => {
    const r = buildStrategies(input());
    expect(r.context).toEqual([]);
    expect(r.assumed.join(" ")).toMatch(/lean mix/);
    expect(r.assumed.join(" ")).toMatch(/2 regions/);
  });
});

describe("strategy context rules (each changes only its own actions)", () => {
  it("stockists: a retailer and a venue the brand is in, and a metro it sells in", () => {
    const base = budget("moderate");
    const a = buildStrategies(input({ ...empty, ...base }));
    const ctx: StrategyContext = { ...empty, ...base, stockists: [{ name: "Greenleaf Grocers", sources: ["s4"] }, { name: "The Salt Cellar", metro: "Seattle", sources: ["s4"] }] };
    const b = buildStrategies(input(ctx));
    const diff = changed(actionsOf(a), actionsOf(b));
    expect(diff.length).toBeGreaterThan(0);
    for (const d of diff) {
      expect(["indie", "retail", "retail_promo"]).toContain((d.after ?? d.before)!.channel);
      if (d.after) expect(d.after.shapedBy).toContain("stockists");
    }
    const harbor = b.strategies[0];
    // Seattle is left out of where; Greenleaf isn't pitched; the Salt Cellar isn't named again.
    expect(harbor.where.map((w) => w.metro)).toEqual(["Portland", "Denver", "Austin"]);
    expect(harbor.actions.find((a) => a.channel === "retail")!.text).toMatch(/Tidewater Market/);
    expect(harbor.actions.map((a) => a.text).join(" ")).not.toMatch(/Greenleaf|Salt Cellar/);
    expect(b.context.map((c) => c.key)).toEqual(["stockists", "stockists", "budget"]);
    // Who and the dated moments don't move.
    expect(harbor.who).toEqual(a.strategies[0].who);
  });

  it("budget: lean to ample changes the channel mix and nothing else", () => {
    const a = buildStrategies(input({ ...empty, ...budget("lean") }));
    const b = buildStrategies(input({ ...empty, ...budget("ample", "we have plenty to spend") }));
    expect(a.strategies[0].through).toEqual(["own", "indie", "creators"]);
    expect(b.strategies[0].through).toEqual(["own", "indie", "creators", "podcasts", "paid_social", "retail", "retail_promo"]);
    expect(b.strategies[1].through).toContain("events");
    for (const d of changed(actionsOf(a), actionsOf(b))) {
      if (d.after) expect(d.after.shapedBy).toContain("budget");
      const ch = (d.after ?? d.before)!;
      expect(ch.when === "before" ? ch.channel : "mix").toMatch(/events|mix/);
    }
    // Gift on lean, paid partnership above it.
    expect(a.strategies[0].actions.find((x) => x.channel === "creators")!.text).toMatch(/gift/);
    expect(b.strategies[0].actions.find((x) => x.channel === "creators")!.text).toMatch(/Partner/);
    // Where is unchanged.
    expect(b.strategies.map((s) => s.where)).toEqual(a.strategies.map((s) => s.where));
  });

  it("launch date: nothing starts before it, and moments before it drop out", () => {
    const a = buildStrategies(input());
    const b = buildStrategies(input({ ...empty, launch: { date: "2027-01-15", ...said("we launch on 2027-01-15") } }));
    for (const s of b.strategies) for (const x of s.actions) expect(x.startBy >= "2027-01-15").toBe(true);
    const diff = changed(actionsOf(a), actionsOf(b));
    expect(diff.length).toBeGreaterThan(0);
    for (const d of diff) {
      if (d.after) expect(d.after.shapedBy).toContain("launch");
      // A removed action is a moment before the launch.
      else expect(d.before!.moment!.date < "2027-01-15").toBe(true);
    }
    expect(b.strategies[0].actions.some((x) => x.moment?.name === "Black Friday")).toBe(false);
    // Who, where and through don't move.
    expect(b.strategies.map((s) => [s.who, s.where, s.through])).toEqual(a.strategies.map((s) => [s.who, s.where, s.through]));
  });

  it("capacity: 3 regions to 1 moves regions from now to next and nothing else", () => {
    const a = buildStrategies(input({ ...empty, capacity: { regions: 3, ...said("we can handle 3 regions") } }));
    const b = buildStrategies(input({ ...empty, capacity: { regions: 1, ...said("only 1 region at a time") } }));
    expect(a.strategies[0].where.filter((w) => w.now).length).toBe(3);
    expect(b.strategies[0].where.filter((w) => w.now).length).toBe(1);
    const diff = changed(actionsOf(a), actionsOf(b));
    expect(diff.length).toBeGreaterThan(0);
    for (const d of diff) {
      expect(d.before && d.after).toBeTruthy();
      expect(d.after!.channel).toBe("indie");
      expect(d.after!.shapedBy).toContain("capacity");
      expect([d.before!.when, d.after!.when]).toEqual(["now", "next"]);
    }
  });
});

describe("strategy context guard", () => {
  const sources = new Map<string, { data: unknown }>([
    ["s0", { data: { today: date } }],
    ["s4", { data: { text: "We have about 2,000 a month to spend. We launch on 2027-01-15 and can run 2 regions." } }],
  ]);

  it("keeps sourced context and drops the rest", () => {
    const { context, dropped } = readContext(
      {
        stockists: [{ name: "Greenleaf Grocers", sources: ["s4"] }, { name: "Nowhere Market", sources: [] }, { name: "Only Today", sources: ["s0"] }],
        budget: { band: "moderate", said: "about 2,000 a month to spend", sources: ["s4"] },
        launch: { date: "2027-01-15", said: "We launch on 2027-01-15", sources: ["s4"] },
        capacity: { regions: 2, said: "can run 2 regions", sources: ["s4"] },
      },
      sources,
      date,
    );
    expect(context.stockists.map((s) => s.name)).toEqual(["Greenleaf Grocers"]);
    expect(context.budget?.band).toBe("moderate");
    expect(context.launch?.date).toBe("2027-01-15");
    expect(context.capacity?.regions).toBe(2);
    expect(dropped).toHaveLength(2);
  });

  it("drops a number the source doesn't hold, an out-of-range capacity, a past or invalid launch, and an unknown band", () => {
    const { context, dropped } = readContext(
      {
        budget: { band: "huge", said: "plenty", sources: ["s4"] },
        launch: { date: "2026-09-01", said: "We launch on 2027-01-15", sources: ["s4"] },
        capacity: { regions: 12, said: "can run 12 regions", sources: ["s4"] },
      },
      sources,
      date,
    );
    expect(context).toEqual({ stockists: [], budget: undefined, launch: undefined, capacity: undefined });
    expect(dropped).toHaveLength(3);
    expect(readContext({ capacity: { regions: 3, said: "can run 3 regions", sources: ["s4"] } }, sources, date).context.capacity).toBeUndefined();
    expect(readContext({ launch: { date: "2027-02-30", said: "We launch on 2027-01-15", sources: ["s4"] } }, sources, date).context.launch).toBeUndefined();
    expect(readContext({ budget: { band: "lean", said: "a small budget", sources: ["s0"] } }, sources, date).context.budget).toBeUndefined();
  });

  it("dropped context changes nothing", () => {
    const { context } = readContext({ capacity: { regions: 0, said: "", sources: ["s4"] }, budget: { band: "ample", said: "lots", sources: ["s9"] } }, sources, date);
    expect(buildStrategies(input({ ...context, soldIn: [] }))).toEqual(buildStrategies(input()));
  });
});

describe("strategy finisher and code's strategy", () => {
  const result = buildStrategies(input());
  const source = (id: string, data: unknown): Source => ({ id, tool: "given", args: {}, summary: id, data, callIds: [] });
  const sources = new Map<string, Source>([
    ["s0", source("s0", { today: date })],
    ["s1", source("s1", { ranking: fits.fits.map((f) => ({ crowd: f.crowd, name: f.name, rank: f.rank, tier: f.tier })), reach: "Portland, 41,000 people" })],
    ["s2", source("s2", { crowds: crowds.map((c) => ({ id: c.id, name: c.name })) })],
  ]);
  const state = { strategies: result } as unknown as AgentState;
  const line = (crowd_id: string, text: string, s: string[] = ["s1"]) => ({ crowd_id, text, sources: s });
  const covered = [line("harbor", "Harbor Pantry ranks first, so it leads."), line("trail", "Trailhead Supper follows it.")];

  it("needs plan_strategy's strategies before it finishes", () => {
    const out = strategyFinisher.check({ headline: "Start with Harbor Pantry", lines: covered }, sources, {} as AgentState);
    expect(out.result).toBeUndefined();
    expect(out.problems?.count).toBe(1);
  });

  it("passes sourced sentences that cover every top fit", () => {
    const out = strategyFinisher.check({ headline: "Start with Harbor Pantry", lines: covered }, sources, state);
    expect(out.problems).toBeUndefined();
    const e = out.result as StrategyEvent;
    expect(e.answer.lines.map((l) => l.crowd)).toEqual(["harbor", "trail"]);
    expect(e.answer.assumptions.slice(0, result.assumed.length)).toEqual(result.assumed);
  });

  it("flags a fit with no sentence, an unsourced number and an unknown source, and still gives a result", () => {
    const out = strategyFinisher.check(
      { headline: "Start with Harbor Pantry", lines: [line("harbor", "Harbor Pantry reaches 41,000 people in Portland."), line("harbor", "Harbor Pantry reaches 99,000 people."), line("trail", "Trailhead Supper follows.", ["s9"])] },
      sources,
      state,
    );
    expect(out.problems?.count).toBe(3);
    expect(JSON.stringify(out.problems?.feedback)).toContain("Trailhead Supper");
    const e = out.result as StrategyEvent;
    expect(e.answer.lines.map((l) => l.text)).toEqual(["Harbor Pantry reaches 41,000 people in Portland."]);
  });

  it("puts code's headline in place of one with numbers", () => {
    const out = strategyFinisher.check({ headline: "Start with 2 crowds", lines: covered }, sources, state);
    expect(out.problems?.count).toBe(1);
    expect((out.result as StrategyEvent).answer.headline).toMatch(/^Start with Harbor Pantry/);
  });

  it("code's strategy covers every top fit with a sentence and no failure words", () => {
    const { context: _none, ...rest } = input();
    const base: StrategyBase = { ...rest, soldIn: [] };
    const e = codeStrategy(base, [{ name: "Greenleaf Grocers" }, { name: "The Salt Cellar", metro: "Portland" }], "s4");
    expect(e.result.strategies.map((s) => s.crowd)).toEqual(["harbor", "trail"]);
    expect(new Set(e.answer.lines.map((l) => l.crowd))).toEqual(new Set(["harbor", "trail"]));
    expect(e.answer.headline).toMatch(/^Start with Harbor Pantry/);
    expect(JSON.stringify(e)).not.toMatch(/failed|not found|unknown|error/i);
    expect(e.result.context.map((c) => c.key)).toContain("stockists");
  });
});

describe("no crowd to choose (§23.2 step 6f)", () => {
  const run: FitsRun = { key: "k", fits, calendar, answer: { headline: "", reasons: [], assumptions: [] }, sources: [] };

  it("an older save that chose a crowd by hand follows the Win first crowd", () => {
    const j = loadedJourney({ ...emptyJourney(), crowdId: "trail", crowdChosen: true, fits: run });
    expect(j.crowdId).toBe("harbor");
    expect("crowdChosen" in j).toBe(false);
    expect(loadedJourney({ ...emptyJourney(), crowdId: "trail", crowdChosen: true }).crowdId).toBe("trail");
  });

  it("the choose-a-crowd button is gone from the app", () => {
    const files = readdirSync("components").filter((f) => f.endsWith(".tsx"));
    for (const f of files) expect(readFileSync(`components/${f}`, "utf8")).not.toMatch(/Plan for this crowd instead|The plan follows this crowd/);
  });
});
