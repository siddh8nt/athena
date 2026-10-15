import { describe, expect, it } from "vitest";
import { SPECIALISTS, SPECIALIST_IDS, nameOf, waitingOn } from "@/lib/agent/specialists";
import { GOALS, checkCustom, checkGoals, customQuestion, goalQuestion, pickGoals, proposeGoals, teamFor } from "@/lib/agent/goals";
import { applyOutcomes, itemId, latest, outcomeLine, patterns, staleRuns, whatChanged, whatsWorking } from "@/lib/agent/outcomes";
import type { Outcome, TeamState, Work } from "@/lib/team/types";

// Fictional names only (no Qloo data in the repo).
const o = (agent: Outcome["agent"], kind: string, name: string, group: string, mark: Outcome["mark"], at = 1): Outcome => ({ item: itemId(kind, name), agent, kind, name, group, mark, at });

describe("the team registry", () => {
  it("has six specialists, each with a mission, a done-when, a budget and the kinds it returns", () => {
    expect(SPECIALISTS.map((s) => s.id)).toEqual([...SPECIALIST_IDS]);
    for (const s of SPECIALISTS) {
      expect(s.mission && s.doneWhen && s.rules.length && s.kinds.length).toBeTruthy();
      expect(s.budget.qloo).toBeGreaterThan(0);
    }
    expect(nameOf("athena")).toBe("Athena");
  });

  it("says why a specialist waits, and on whom, never hiding it", () => {
    expect(waitingOn("analyst", { crowds: false, city: false })).toBeUndefined();
    expect(waitingOn("rep", { crowds: false, city: false })).toBe("needs the crowds first, from the Analyst");
    expect(waitingOn("rep", { crowds: true, city: false })).toBe("needs a city first, from the Navigator");
    expect(waitingOn("rep", { crowds: true, city: true })).toBeUndefined();
  });
});

describe("goals", () => {
  it("proposes 3–5 goals from the graph's facts, the recommended first, only goals the team can deliver", () => {
    const g = proposeGoals({ channel: "offline", stockists: 2, city: "Fernvale", crowds: true, winNext: false });
    expect(g.length).toBeGreaterThanOrEqual(3);
    expect(g.length).toBeLessThanOrEqual(5);
    expect(g[0].recommended).toBe(true);
    expect(g.filter((x) => x.recommended)).toHaveLength(1);
    expect(g.every((x) => x.team.length > 0)).toBe(true);
    expect(g.find((x) => x.id === "deepen_home")?.label).toBe("Win more of Fernvale");
  });

  it("puts knowing the crowd first when there are no crowds yet, and growing online first for an online brand", () => {
    expect(proposeGoals({ channel: "both", stockists: 0, crowds: false, winNext: false })[0].id).toBe("know_crowd");
    const online = proposeGoals({ channel: "online", stockists: 0, crowds: true, winNext: false });
    expect(online[0].id).toBe("online");
    expect(online.some((x) => x.id === "deepen_home")).toBe(false);
  });

  it("checks the model's goals: real specialists only, symmetric conflicts, the recommended moved first", () => {
    const g = checkGoals([
      { id: "a_goal", label: "Grow online", team: ["promoter", "wizard"], conflicts: [] },
      { id: "b_goal", label: "Win at home", team: ["rep"], conflicts: ["a_goal", "ghost"], recommended: true },
      { id: "c_goal", label: "Nobody does this", team: ["wizard"] },
    ]);
    expect(g.map((x) => x.id)).toEqual(["b_goal", "a_goal"]);
    expect(g[0].recommended).toBe(true);
    expect(g[1].team).toEqual(["promoter"]);
    expect(g[1].conflicts).toEqual(["b_goal"]);
    expect(g[0].conflicts).toEqual(["a_goal"]);
    expect(checkGoals("nonsense")).toEqual([]);
  });

  it("asks through step 3's question, and keeps conflicting picks apart", () => {
    const goals = proposeGoals({ channel: "offline", stockists: 6, city: "Fernvale", crowds: true, winNext: true });
    const q = goalQuestion(goals);
    expect(q.multi).toBe(true);
    const launch = q.options.find((x) => x.label === "Launch in a new city");
    expect(launch?.conflicts).toEqual(["Win more of Fernvale"]);
    const picked = pickGoals(goals, "Launch in a new city, Win more of Fernvale");
    expect(picked.map((x) => x.id)).toEqual(["launch_city"]);
    // A label can hold the joining comma itself.
    const home = proposeGoals({ channel: "offline", stockists: 6, city: "Fernvale, OR", crowds: true, winNext: true });
    expect(pickGoals(home, "Win more of Fernvale, OR, Borrow a crowd through partners").map((x) => x.id)).toEqual(["deepen_home", "partners"]);
  });

  it("hands one goal to several specialists, in the order the work flows", () => {
    const launch = GOALS.find((g) => g.id === "launch_city")!;
    expect(teamFor([{ ...launch, why: "" }])).toEqual(["navigator", "rep", "promoter"]);
  });

  it("splits a custom goal into the team's part and the rest named plainly, never a dead end", () => {
    const g = checkCustom("Raise a seed round", { team: ["analyst", "fake"], outside: "Fundraising itself is outside what Athena does." });
    expect(g?.team).toEqual(["analyst"]);
    expect(g?.outside).toMatch(/outside/);
    expect(g?.custom).toBe(true);
    expect(checkCustom("x", {})).toBeUndefined();
    expect(customQuestion("Raise a seed round").options.length).toBeGreaterThanOrEqual(2);
  });
});

describe("outcomes", () => {
  const marks = [
    o("rep", "venue", "Fig Larder", "café", "no"),
    o("rep", "venue", "Wren Pantry", "café", "no"),
    o("rep", "venue", "Moss & Co", "café", "no"),
    o("rep", "venue", "Tidewell Cellar", "bottle shop", "yes"),
    o("rep", "venue", "Copper Vine", "bottle shop", "yes"),
  ];

  it("reads as the founder would say it", () => {
    expect(outcomeLine(marks, "rep")).toBe("three cafés said no, two bottle shops said yes");
    expect(outcomeLine(marks, "promoter")).toBe("");
  });

  it("lets a later mark replace an earlier one", () => {
    expect(latest([o("rep", "venue", "Fig Larder", "café", "pitched", 1), o("rep", "venue", "Fig Larder", "café", "yes", 2)]).map((x) => x.mark)).toEqual(["yes"]);
  });

  it("changes the next run: heard-back results leave, groups that said yes move up", () => {
    const items = [
      { id: itemId("venue", "Fig Larder"), kind: "venue", group: "café" },
      { id: itemId("venue", "Lantern Café"), kind: "venue", group: "café" },
      { id: itemId("venue", "Harbour Bottles"), kind: "venue", group: "bottle shop" },
    ];
    const r = applyOutcomes(items, marks, "rep");
    expect(r.dropped).toBe(1);
    expect(r.items.map((x) => x.id)).toEqual([itemId("venue", "Harbour Bottles"), itemId("venue", "Lantern Café")]);
    expect(r.moved).toBe(true);
  });

  it("spots patterns across agents", () => {
    const all = [...marks.slice(0, 3), o("promoter", "event", "Night Market", "market", "yes"), o("promoter", "event", "Fern Fest", "festival", "yes"), o("promoter", "event", "Dock Fair", "fair", "no")];
    expect(patterns(all)[0]).toBe("Your crowd responds at events, not on shelves: 2 of 3 yes against 0 of 3.");
  });

  it("tracks staleness from new outcomes and graph edits", () => {
    const work = { agent: "rep", results: [], at: 5 } as unknown as Work;
    const team: TeamState = { goals: [], works: { rep: work, navigator: { ...work, agent: "navigator" } }, outcomes: [o("rep", "venue", "Fig Larder", "café", "no", 9)], rev: { rep: 1, navigator: 1 } };
    expect(staleRuns(team, 1)).toEqual([{ agent: "rep", why: "1 new outcome since it last ran" }]);
    expect(staleRuns(team, 2).map((s) => s.agent)).toEqual(["navigator", "rep"]);
  });

  it("says what changed against the last run, and keeps one overview", () => {
    const w = (names: string[]) => ({ results: names.map((n) => ({ id: itemId("venue", n), name: n })) }) as unknown as Work;
    expect(whatChanged(undefined, w(["A"]))).toBeUndefined();
    expect(whatChanged(w(["Fig Larder", "Wren Pantry"]), w(["Fig Larder", "Harbour Bottles"]))).toBe("New: Harbour Bottles. Gone: Wren Pantry.");
    expect(whatChanged(w(["A"]), w(["A"]))).toBe("Same results as last time.");
    const ov = whatsWorking({ goals: [], works: {}, outcomes: marks });
    expect(ov.counts.yes).toBe(2);
    expect(ov.lines.some((l) => l.startsWith("Rep:"))).toBe(true);
  });
});
