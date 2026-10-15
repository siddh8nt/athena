import { describe, expect, it } from "vitest";
import { QlooClient, MemoryCache } from "@/lib/qloo/client";
import { FixtureTransport } from "@/lib/qloo/fixture";
import { goalFacts, proposeFor, runTeam } from "@/lib/agent/team";
import { buildCtx } from "@/lib/agent/team-ctx";
import { GOALS } from "@/lib/agent/goals";
import { emptyBrief, type BrandBrief } from "@/lib/brief/types";
import { growthQuestion, seedOf } from "@/lib/journey/flow";
import { emptyTeam, type TeamEvent } from "@/lib/team/types";
import type { Galaxy } from "@/lib/taste/galaxy";
import { POST as settle } from "@/app/api/settle/route";

// Step 8.1, one flow: the growth question asked once, the Analyst measuring and ranking the crowds once (the Galaxy
// streaming as it forms), the goals reading the founder's answer, and only the goals' specialists running after.
// Every name here is fictional.

const said = (value: string) => ({ value, source: { kind: "message" as const } });
const found = (value: string) => ({ value, source: { kind: "website" as const } });
const brief = (over: Partial<BrandBrief> = {}): BrandBrief => ({ ...emptyBrief(), name: said("Tidewell Tins"), sells: said("tinned fish"), proxies: ["Lookalike One", "Lookalike Two"], traits: ["tinned fish"], ...over });

async function team(b: BrandBrief, answers?: { question: string; answer: string }[]) {
  // A fresh seed per test, so the crowds are measured here (not read from another test's cache).
  const qloo = new QlooClient({ transport: new FixtureTransport(), cache: new MemoryCache() });
  const state = emptyTeam();
  const t = await buildCtx({ brief: b, seed: seedOf(b), probes: [], team: state, enrich: {}, llm: false, qloo, answers });
  const events: TeamEvent[] = [];
  const go = (ids: string[]) => runTeam({ goals: GOALS.filter((g) => ids.includes(g.id)).map((g) => ({ ...g })), team: t, state, graphRev: 0, qloo, env: {} as never, send: (e) => events.push(e), llm: false });
  return { t, events, go };
}

describe("the growth question (§23.2 step 8.1a)", () => {
  it("puts what the research found first, says so, and allows Other", () => {
    const q = growthQuestion(brief({ channel: found("offline") as BrandBrief["channel"] }));
    expect(q.question).toBe("How does Tidewell Tins sell today?");
    expect(q.options.map((o) => o.channel)).toEqual(["offline", "online", "both"]);
    expect(q.options[0].hint).toBe("From what I found");
    expect(q.options.slice(1).every((o) => !o.hint)).toBe(true);
    expect(q.multi).toBe(false);
    expect(q.assumedChannel).toBe("offline");
  });

  it("with nothing found, recommends nothing and assumes both", () => {
    const q = growthQuestion(brief());
    expect(q.options.some((o) => o.hint)).toBe(false);
    expect(q.assumedChannel).toBe("both");
  });
});

describe("the Analyst ranks once (§23.2 step 8.1a–b)", () => {
  it("measures, streams the Galaxy as it forms, and ranks the crowds with a calendar", async () => {
    const { t, events, go } = await team(brief({ name: said("Fresh Seed Tins"), proxies: ["Lookalike Three", "Lookalike Four"] }));
    const rounds: Galaxy[] = [];
    t.onGalaxy = (g) => rounds.push(g);
    await go(["know_crowd"]);
    expect(t.crowds?.crowds.length).toBeGreaterThan(0);
    expect(rounds.length).toBeGreaterThan(0);
    expect(t.fits?.fits.length).toBeGreaterThan(0);
    expect(t.fits!.fits.some((f) => f.tier === "win_first")).toBe(true);
    expect(t.ranked?.calendar).toBeTruthy();
    expect(t.ranked?.answer.headline).toBeTruthy();
    expect(events.filter((e) => e.type === "work").map((e) => (e as Extract<TeamEvent, { type: "work" }>).agent)).toEqual(["analyst"]);
  }, 120_000);

  it("runs only the specialists a goal needs afterwards, on the Analyst's ranking", async () => {
    const { t, events, go } = await team(brief());
    await go(["know_crowd"]);
    const ranking = t.fits;
    events.length = 0;
    await go(["partners"]);
    const ran = new Set(events.flatMap((e) => (e.type === "work" ? [e.agent] : [])));
    expect([...ran].sort()).toEqual(["matchmaker", "scout"]);
    expect(t.fits).toBe(ranking);
  }, 120_000);
});

describe("goals read the founder's answer (§23.2 step 8.1a)", () => {
  it("passes the growth answer to the model that proposes the goals", async () => {
    const answer = { question: "How does Tidewell Tins sell today?", answer: "Mostly at farmers' markets, some online" };
    const { t } = await team(brief(), [answer]);
    let prompt = "";
    await proposeFor(t, goalFacts(t), true, (async (o: { prompt: string }) => ((prompt = o.prompt), { text: "{}" })) as never);
    expect(prompt).toContain("farmers' markets");
  });
});

describe("a conflict answered with Other (§23.2 step 8.1e)", () => {
  it("is stored in the founder's words, with their caveats, and keeps the values they named", async () => {
    const req = new Request("http://x/api/settle", { method: "POST", body: JSON.stringify({ about: "Price per tin", options: ["$9", "$12"], answer: "$9, but $12 for the gift tins", picked: [0] }) });
    const r = (await (await settle(req)).json()) as { keep: number[]; fact: string; said: string };
    expect(r.keep).toEqual([0]);
    expect(r.said).toBe("$9, but $12 for the gift tins");
    expect(r.fact).toContain("$12 for the gift tins");
  });
});
