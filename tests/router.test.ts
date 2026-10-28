import { describe, expect, it } from "vitest";
import { GOALS } from "@/lib/agent/goals";
import { fallbackWorkflow } from "@/lib/agent/workflow";
import { checkRoute, chunks, codeRoute, readScope, routeMessage, selfKnowledge, teamKnowledge, type RouteInput } from "@/lib/agent/router";
import { SPECIALISTS } from "@/lib/agent/specialists";
import { emptyTeam, type Goal } from "@/lib/team/types";

const goal = (id: string): Goal => ({ ...GOALS.find((g) => g.id === id)!, recommended: false });
const input = (over: Partial<RouteInput> = {}): RouteInput => ({
  message: "What can you do?",
  history: [],
  brand: { name: "Brightland", sells: "olive oil", home: "Los Angeles" },
  facts: ["Stockists: Erewhon (Los Angeles)"],
  answers: [],
  team: { ...emptyTeam(), workflow: fallbackWorkflow([goal("step_up")], { fits: false, home: false }) },
  open: [],
  ...over,
});

describe("Execute Plan's chat moves (§23.5 q)", () => {
  it("finds contacts for the items the founder's words cover, a few at most", () => {
    const r = checkRoute({ do: "contacts", scope: { agents: ["rep", "lawyer"], cities: ["Brooklyn"], limit: 400 }, reply: "Finding the Brooklyn shops." }, input());
    expect(r).toEqual({ do: "contacts", scope: { agents: ["rep"], cities: ["Brooklyn"], limit: 24 }, reply: "Finding the Brooklyn shops." });
  });

  it("keeps only the scope fields the model gave, held to what's real", () => {
    expect(readScope({ agents: ["scout", 3], kinds: ["Podcast"], names: [""], crowds: "x" })).toEqual({ agents: ["scout"], kinds: ["podcast"] });
    expect(readScope(undefined)).toEqual({});
  });

  it("sets the follow-up wait in whole days, with rules only for some items", () => {
    expect(checkRoute({ do: "followup", days: 14, reply: "Two weeks it is." }, input())).toEqual({ do: "followup", days: 14, rules: [], reply: "Two weeks it is." });
    const r = checkRoute({ do: "followup", rules: [{ days: 10, scope: { kinds: ["retailer"] }, text: "Retailers: 10 days" }, { days: 30, scope: {}, text: "Everything" }] }, input());
    expect(r).toMatchObject({ do: "followup", rules: [{ days: 10, scope: { kinds: ["retailer"] }, text: "Retailers: 10 days" }] });
    expect(r).not.toHaveProperty("days");
  });

  it("reads a wait it can't hold as no move at all", () => {
    expect(checkRoute({ do: "followup", days: 400 }, input()).do).not.toBe("followup");
  });
});

describe("router", () => {
  it("knows every subagent from the registry, and what she can't do", () => {
    const k = selfKnowledge();
    for (const s of SPECIALISTS) expect(k).toContain(s.name);
    expect(k).toMatch(/can't/);
    expect(k).toMatch(/Qloo/);
  });

  it("gives the model the recent messages verbatim and the older ones in short", () => {
    const history = Array.from({ length: 12 }, (_, n) => ({ who: n % 2 ? "athena" : "you", text: `message ${n}` }));
    const k = teamKnowledge(input({ history }));
    expect(k).toContain("Founder: message 10");
    expect(k).toContain("Earlier, the founder said");
    expect(k).toContain("message 0");
  });

  it("names the founder's crowds as every page does, with their handles, and says members are never people (§23.8 b)", () => {
    const k = teamKnowledge(input({ crowds: [{ name: "Liquid I.V. and Rachel Hollis fans", handle: "the Liquid I.V. crowd", shared: "Wellness routines and country radio." }] }));
    expect(k).toContain('"handle":"the Liquid I.V. crowd"');
    expect(selfKnowledge()).toMatch(/never people/);
    expect(teamKnowledge(input())).not.toContain("The founder's crowds");
  });

  it("with no model, sends a message on a subagent's page to that subagent, and anything else to the graph's reader", async () => {
    expect(codeRoute({ page: "rep", message: "Make it more playful" })).toMatchObject({ do: "handoff", to: "rep", task: "Make it more playful" });
    expect(codeRoute({ page: "dashboard", message: "We're in Whole Foods now" })).toEqual({ do: "graph" });
    expect(await routeMessage(input({ page: "athena" }), false)).toEqual({ do: "graph" });
  });

  it("keeps a checked reply, and a handoff only to a subagent that exists", () => {
    expect(checkRoute({ do: "reply", reply: "The Navigator found three shops." }, input())).toEqual({ do: "reply", reply: "The Navigator found three shops." });
    expect(checkRoute({ do: "handoff", to: "rep", task: "Warmer words", reply: "I've asked the Rep." }, input())).toMatchObject({ do: "handoff", to: "rep" });
    // An unknown subagent: the reply it wrote stands; with none, her tools answer it.
    expect(checkRoute({ do: "handoff", to: "lawyer", reply: "On it." }, input())).toEqual({ do: "reply", reply: "On it." });
    expect(checkRoute({ do: "handoff", to: "lawyer" }, input())).toEqual({ do: "tools" });
    expect(checkRoute({ do: "nonsense" }, input())).toEqual({ do: "tools" });
    expect(checkRoute(null, input())).toEqual({ do: "tools" });
  });

  it("holds a workflow change to the plan: never skips the Analyst, adds only a subagent not in it", () => {
    expect(checkRoute({ do: "workflow", change: { skip: ["analyst"] } }, input())).toEqual({ do: "tools" });
    const r = checkRoute({ do: "workflow", change: { skip: ["rep"], add: ["promoter"] }, reply: "" }, input());
    expect(r).toMatchObject({ do: "workflow", change: { skip: ["rep"], add: ["promoter"] } });
    expect(r.do === "workflow" && r.reply).toMatch(/Rep/);
  });

  it("hands to a subagent already in the plan when the move would only bring it in again", () => {
    const r = checkRoute({ do: "workflow", change: { add: ["rep"] }, reply: "I have added the Rep back." }, input({ message: "Have the Rep look again, fresh." }));
    expect(r).toEqual({ do: "handoff", to: "rep", task: "Have the Rep look again, fresh.", reply: "I've asked the Rep to work on it again." });
  });

  it("asks a clarifying question only with real options; a question with none is said as a reply", () => {
    expect(checkRoute({ do: "clarify", question: "Which city?", options: ["Austin", { label: "Denver" }] }, input())).toEqual({
      do: "clarify",
      question: "Which city?",
      options: [{ label: "Austin" }, { label: "Denver" }],
    });
    expect(checkRoute({ do: "clarify", question: "Which city?", options: ["Austin"] }, input())).toEqual({ do: "reply", reply: "Which city?" });
  });

  it("reads the model's move through the check, and falls back to code's when the call fails", async () => {
    const ok = async () => ({ text: JSON.stringify({ do: "reply", reply: "I can find your crowds." }) }) as never;
    expect(await routeMessage(input(), true, ok)).toEqual({ do: "reply", reply: "I can find your crowds." });
    const bad = async () => {
      throw new Error("down");
    };
    expect(await routeMessage(input({ page: "navigator" }), true, bad as never)).toMatchObject({ do: "handoff", to: "navigator" });
    // Flash busy: the lighter model reads it before code's route does.
    const busy = async (o: { model: string }) => {
      if (o.model === "flash") throw new Error("Vertex 429");
      return { text: JSON.stringify({ do: "reply", reply: "Read by the lighter model." }) };
    };
    expect(await routeMessage(input({ page: "navigator" }), true, busy as never)).toEqual({ do: "reply", reply: "Read by the lighter model." });
  });

  it("streams a reply in pieces that join back to it", () => {
    const text = "The Navigator found three shops near Silver Lake, and the Rep wrote to each.";
    const c = chunks(text);
    expect(c.length).toBeGreaterThan(2);
    expect(c.join("")).toBe(text);
  });
});
