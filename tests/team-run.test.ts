import { describe, expect, it } from "vitest";
import { QlooClient, MemoryCache, type QlooTransport, type RawResult } from "@/lib/qloo/client";
import { FixtureTransport } from "@/lib/qloo/fixture";
import { athenaAsk, runTeam, toolsFor } from "@/lib/agent/team";
import { buildCtx } from "@/lib/agent/team-ctx";
import { GOALS } from "@/lib/agent/goals";
import { PLAYS } from "@/lib/agent/plays";
import type { Tool } from "@/lib/agent/tools";
import { resolveBrand } from "@/lib/methods/resolve";
import { emptyBrief } from "@/lib/brief/types";
import { nodesAdded } from "@/lib/graph/types";
import { readTeam } from "@/lib/team/read";
import type { SpecialistId } from "@/lib/agent/specialists";
import { emptyTeam, type Outcome, type TeamEvent, type TeamState, type Work } from "@/lib/team/types";

// Step 8's true-agent test, run end to end on fixtures with code's decider (no model): two brands take different
// paths and the trace says why; planted surprises (a weak crowd, an empty city, a one-way partner) change course;
// a marked outcome changes the next run; and a new play added as one registry entry is used by its specialist.
// Every name here is fictional.

type Plant = { emptyCity?: string; oneWay?: string };

/** The fixture, with a surprise planted: a city with no venues, or one partner whose crowd ranks the brand last. */
class Planted implements QlooTransport {
  readonly mode = "fixture" as const;
  own = "";
  private f = new FixtureTransport();
  constructor(private o: Plant) {}
  async post(path: string, body: Record<string, unknown>) {
    const q: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) q[k] = Array.isArray(v) ? v.map((x) => (typeof x === "object" && x && "id" in x ? String((x as { id: unknown }).id) : String(x))).join(",") : String(v);
    return this.send(path, q);
  }
  async send(path: string, q: Record<string, string>): Promise<RawResult> {
    // The brand's own record, with the narrow genre the peers are found by (the fixture has no /entities).
    if (path === "/entities") return { status: 200, body: { success: true, results: [{ entity_id: q.entity_ids, name: "Tidewell Tins", tags: [{ id: "urn:tag:genre:brand:food:tinned_fish", name: "Tinned fish", type: "urn:tag:genre:brand" }] }] as never } };
    const r = await this.f.send(path, q);
    const empty = this.o.emptyCity;
    if (empty && q["filter.type"] === "urn:entity:place" && !q["diversify.by"] && JSON.stringify(q).includes(empty)) return { status: 200, body: { success: true, results: { entities: [] } as never } };
    // Mutual fit's reverse call: each partner's crowd ranks the brand among its peers. The planted one ranks it last.
    if (this.own && q["filter.results.entities"]?.includes(this.own) && q["signal.interests.entities"]) {
      const rest = ((r.body?.results as { entities?: { entity_id: string }[] })?.entities ?? []).filter((e) => e.entity_id !== this.own);
      const own = { entity_id: this.own, name: "Tidewell Tins" };
      return { ...r, body: { ...r.body!, results: { entities: q["signal.interests.entities"] === this.o.oneWay ? [...rest, own] : [own, ...rest] } as never } };
    }
    return r;
  }
}

const said = (value: string) => ({ value, source: { kind: "message" as const } });

async function run(o: { inQloo?: boolean; rival?: boolean; home?: string; goals: string[]; state?: TeamState } & Plant) {
  const transport = new Planted(o);
  const qloo = new QlooClient({ transport, cache: new MemoryCache() });
  const own = o.inQloo ? (await resolveBrand(qloo, "Tidewell Tins")).entity : undefined;
  transport.own = own?.entity_id ?? "";
  const brief = { ...emptyBrief(), name: said("Tidewell Tins"), sells: said("tinned fish"), ...(o.rival ? { competitors: [said("Harbor Rival")] } : {}), ...(o.home ? { activeCity: said(o.home) } : {}) };
  const seed = { ...(own ? { brand: { id: own.entity_id, name: "Tidewell Tins" } } : {}), comparables: [], lookalikes: ["Lookalike One", "Lookalike Two"], traits: ["tinned fish"] };
  const state = o.state ?? emptyTeam();
  const t = await buildCtx({ brief, seed, probes: [], team: state, enrich: {}, llm: false, qloo });
  const events: TeamEvent[] = [];
  await runTeam({ goals: GOALS.filter((g) => o.goals.includes(g.id)).map((g) => ({ ...g })), team: t, state, graphRev: 0, qloo, env: {} as never, send: (e) => events.push(e), llm: false });
  const steps = (agent: SpecialistId) => events.flatMap((e) => (e.type === "step" && e.agent === agent && e.event.status !== "running" && !["today", "goal", "check", "think"].includes(e.event.tool) ? [e.event] : []));
  const work = (agent: SpecialistId) => events.flatMap((e) => (e.type === "work" && e.agent === agent ? [e.work] : [])).at(-1);
  return { events, steps, work, step: (agent: SpecialistId, tool: string) => steps(agent).find((s) => s.tool === tool) };
}

describe("the true-agent test (§23.2 step 8h)", () => {
  it("takes visibly different paths for two brands, and the trace says why", async () => {
    const known = await run({ inQloo: true, rival: true, goals: ["know_crowd"] });
    const unknown = await run({ goals: ["know_crowd"] });
    const path = (r: typeof known) => r.steps("analyst").map((s) => `${s.tool}:${s.status}`);
    expect(path(known)).not.toEqual(path(unknown));

    expect(known.step("analyst", "build_taste_graph")?.why).toMatch(/^Measuring the taste around Tidewell Tins/);
    expect(known.step("analyst", "position_rivals")?.why).toMatch(/against Harbor Rival/);
    expect(known.step("analyst", "position_rivals")?.summary).toBeTruthy();

    expect(unknown.step("analyst", "build_taste_graph")?.why).toMatch(/isn't in Qloo yet, so seeding from brands like it: Lookalike One, Lookalike Two/);
    expect(unknown.step("analyst", "position_rivals")?.why).toMatch(/[Nn]o rivals named/);
    for (const r of [known, unknown]) expect(r.work("analyst")?.headline).toMatch(/is the crowd to win first$/);
  }, 60_000);

  it("probes a weak crowd before ranking, and says why", async () => {
    const r = await run({ goals: ["know_crowd"] });
    const probe = r.step("analyst", "probe_entity");
    expect(probe?.status).toBe("ok");
    expect(probe?.why).toMatch(/is soft/);
    const tools = r.steps("analyst").map((s) => s.tool);
    expect(tools.indexOf("probe_entity")).toBeLessThan(tools.indexOf("rank_fits"));
  }, 60_000);

  it("reads shops in every city a crowd is given, and says plainly when a city has none yet", async () => {
    const plain = await run({ goals: ["launch_city"] });
    const city = plain.work("navigator")?.results.filter((x) => x.kind === "city").map((x) => x.name) ?? [];
    expect(city.length).toBeGreaterThanOrEqual(2);
    const read = plain.step("rep", "read_shops");
    expect(read?.status).toBe("ok");
    expect(read?.summary).toMatch(new RegExp(`^[0-9]+ shops in ${city[0]}`));
    const rep = plain.work("rep")!;
    expect(rep.results.some((x) => x.kind === "venue")).toBe(true);
    expect(rep.headline).toMatch(/^Start with /);
    expect(plain.step("rep", "draft_pitch")?.status).toBe("ok");

    const planted = await run({ goals: ["launch_city"], emptyCity: city[0] });
    const empty = planted.step("rep", "read_shops");
    expect(empty?.status).toBe("empty");
    expect(empty?.summary).toMatch(new RegExp(`no independent shops matched in .*${city[0]}.* yet`));
    expect(empty?.summary).not.toMatch(/failed|not found/i);
  }, 90_000);

  it("drops a one-way partner and asks the next one instead", async () => {
    const plain = await run({ inQloo: true, goals: ["partners"] });
    const top = plain.work("matchmaker")!.results.find((x) => x.kind === "partner")!;
    expect(plain.step("matchmaker", "draft_ask")?.why).toContain(top.name);

    const planted = await run({ inQloo: true, goals: ["partners"], oneWay: top.ref });
    expect(planted.step("matchmaker", "read_partners")?.summary).toContain(`dropped ${top.name}: their fans wouldn't love you back`);
    const m = planted.work("matchmaker")!;
    expect(m.results.some((x) => x.name === top.name)).toBe(false);
    const ask = planted.step("matchmaker", "draft_ask");
    expect(ask?.status).toBe("ok");
    expect(ask?.why).not.toContain(top.name);
  }, 90_000);

  it("goes deeper at home instead of choosing a new city, and steps up only when asked to", async () => {
    const home = await run({ goals: ["deepen_home"], home: "Portland, OR" });
    expect(home.step("navigator", "read_cities")?.why).toMatch(/Mapping your crowds in Portland, OR/);
    expect(home.step("rep", "read_shops")?.why).toMatch(/^Finding the shops for each crowd in Portland, OR/);

    const launch = await run({ goals: ["launch_city"], home: "Portland, OR" });
    expect(launch.step("navigator", "read_cities")?.status).toBe("ok");
    expect(launch.work("navigator")?.results.some((x) => x.kind === "city" && /Portland/.test(x.name))).toBe(false);

    const up = await run({ goals: ["step_up"], home: "Portland, OR" });
    expect(up.step("rep", "read_shops")?.status).toBe("ok");
    expect(up.work("rep")?.results.some((x) => x.kind === "retailer")).toBe(true);
  }, 120_000);

  it("says plainly why the other side can't be checked, by whether the brand is in Qloo", async () => {
    const r = await run({ goals: ["partners"] });
    expect(r.step("matchmaker", "read_partners")?.summary).toMatch(/can't be checked while Tidewell Tins isn't in Qloo/);
  }, 60_000);
});

describe("outcomes change the next run (§23.2 step 8g)", () => {
  it("reads what the founder heard back first, leaves those venues out, and says what changed", async () => {
    const first = await run({ goals: ["launch_city"] });
    const rep = first.work("rep")!;
    const venues = rep.results.filter((x) => x.kind === "venue");
    expect(venues.length).toBeGreaterThanOrEqual(2);
    const outcomes: Outcome[] = venues.slice(0, 2).map((v, i) => ({ item: v.id, agent: "rep", kind: v.kind, name: v.name, group: v.group, mark: "no", at: 1_000 + i }));
    const works = Object.fromEntries((["analyst", "navigator", "rep"] as const).map((id) => [id, first.work(id)!])) as Partial<Record<SpecialistId, Work>>;

    const next = await run({ goals: ["launch_city"], state: { ...emptyTeam(), works, outcomes } });
    const read = next.step("rep", "read_outcomes");
    expect(read?.status).toBe("ok");
    expect(next.steps("rep")[0]?.tool).toBe("read_outcomes");
    const again = next.work("rep")!;
    for (const v of venues.slice(0, 2)) expect(again.results.some((x) => x.id === v.id)).toBe(false);
    expect(again.outcomes).toBeTruthy();
    expect(again.changed).toBeTruthy();
    expect(again.headline).not.toBe(rep.headline);
  }, 120_000);

  it("keeps the shops it found, so the next run pitches from them without a new read", async () => {
    const first = await run({ goals: ["launch_city"] });
    expect(first.step("rep", "read_shops")?.status).toBe("ok");
    const works = Object.fromEntries((["analyst", "navigator", "rep"] as const).map((id) => [id, first.work(id)!])) as Partial<Record<SpecialistId, Work>>;
    const back = readTeam(JSON.parse(JSON.stringify({ ...emptyTeam(), works })));
    expect(back.works.rep?.shared?.rep?.shops.length).toBe(first.work("rep")?.shared?.rep?.shops.length);
    expect(back.works.rep?.shared?.pitch).toEqual(first.work("rep")?.shared?.pitch);

    const next = await run({ goals: ["launch_city"], state: back });
    expect(next.step("rep", "read_shops")?.why).toMatch(/^Using the \d+ shops read earlier this session/);
    expect(next.step("rep", "read_shops")?.summary).toMatch(/^From the shops read earlier this session: /);
    expect(next.step("rep", "draft_pitch")?.status).toBe("ok");
    expect(next.work("rep")?.results.filter((x) => x.kind === "venue").map((x) => x.id)).toEqual(first.work("rep")?.results.filter((x) => x.kind === "venue").map((x) => x.id));
    expect(next.work("rep")!.qlooCalls).toBeLessThan(first.work("rep")!.qlooCalls);
  }, 120_000);
});

describe("registries (§23.2 step 8e)", () => {
  it("uses a new play added as one registry entry, with no other change", async () => {
    const play: Tool = {
      name: "test_window_display",
      for: ["rep"],
      description: "A window display idea for the top venue. 0 Qloo calls.",
      properties: {},
      qloo: () => 0,
      when: (s) => (s.team?.found.places?.length && !s.ran?.includes("test_window_display") ? { args: {}, why: `Sketching a window for ${s.team.found.places[0].name}` } : undefined),
      run: async (_a, { state }) => ({ summary: `a window for ${state.team?.found.places?.[0]?.name}`, data: {} }),
    };
    PLAYS.push(play);
    try {
      expect(toolsFor("rep").map((t) => t.name)).toContain("test_window_display");
      expect(toolsFor("matchmaker").map((t) => t.name)).not.toContain("test_window_display");
      const r = await run({ goals: ["launch_city"] });
      const s = r.step("rep", "test_window_display");
      expect(s?.status).toBe("ok");
      expect(s?.why).toMatch(/^Sketching a window for /);
      expect(r.work("rep")!.claims.some((c) => c.text.startsWith("A window for "))).toBe(true);
    } finally {
      PLAYS.splice(PLAYS.indexOf(play), 1);
    }
  }, 90_000);
});

describe("the team's run record (§23.2 step 8c)", () => {
  it("shows each run's time, its Qloo calls and the nodes it adds to the Brand Graph", async () => {
    const r = await run({ goals: ["launch_city"] });
    const nav = r.work("navigator")!;
    const rep = r.work("rep")!;
    for (const w of [nav, rep]) {
      expect(w.ms).toBeGreaterThan(0);
      expect(w.qlooCalls).toBeGreaterThan(0);
    }
    expect(nodesAdded(nav)).toBe(nav.results.filter((x) => x.kind === "city").length);
    expect(nodesAdded(rep)).toBeGreaterThan(0);
    expect(nodesAdded(rep)).toBeLessThanOrEqual(6);
  }, 90_000);

  it("round-trips the team's state through the route's reader, and drops what isn't a team", async () => {
    const r = await run({ goals: ["know_crowd"] });
    const state: TeamState = { ...emptyTeam(), goals: GOALS.filter((g) => g.id === "know_crowd"), works: { analyst: r.work("analyst")! }, rev: { analyst: 3 } };
    const back = readTeam(JSON.parse(JSON.stringify(state)));
    expect(back.goals.map((g) => g.id)).toEqual(["know_crowd"]);
    expect(back.works.analyst?.headline).toBe(state.works.analyst?.headline);
    expect(back.rev?.analyst).toBe(3);
    expect(readTeam("nonsense")).toEqual(emptyTeam());
  }, 60_000);
});

describe("a question for Athena", () => {
  it("is never handed back to the founder to route: with no model she keeps it and says so", async () => {
    const events: TeamEvent[] = [];
    await athenaAsk({ question: "Is Austin worth it?", team: {} as never, qloo: {} as never, env: {} as never, send: (e) => events.push(e), llm: false });
    expect(events.some((e) => e.type === "ask")).toBe(false);
    expect(events.find((e) => e.type === "reply")).toMatchObject({ text: expect.stringContaining("kept your question") });
  });
});
