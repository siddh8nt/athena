import type { AgentBudget } from "./loop";

// The team (PRD §23.2 step 8b): Athena leads six specialists. Each is a real agent with its own instructions, tools,
// budget and transcript; the Brand Graph and what the team has found are their shared memory. A specialist is one
// entry here; its tools are every tool in the registry that names it (lib/agent/tools.ts, `for`). Client-safe.

export const SPECIALIST_IDS = ["analyst", "scout", "navigator", "rep", "matchmaker", "promoter"] as const;
export type SpecialistId = (typeof SPECIALIST_IDS)[number];
export type AgentId = "athena" | SpecialistId;

/** What a specialist needs from the team before it can start, and who provides it. */
export type Need = { key: "crowds" | "city"; from: AgentId; why: string; /** The brand's home city will do in its place. */ home?: boolean };

export type Specialist = {
  id: SpecialistId;
  name: string;
  /** One line for the left panel. */
  role: string;
  /** What it's for, and when it's done: the model reads both; it decides the order. */
  mission: string;
  doneWhen: string;
  /** How it decides from evidence, in plain words for the model. Code's decider reads the same rules from each tool's `when`. */
  rules: string[];
  /** What goals it can deliver, so Athena only suggests goals the team can do. */
  delivers: string[];
  needs: Need[];
  budget: AgentBudget;
  /** The result kinds it returns, for the Brand Graph and the outcome marks. */
  kinds: string[];
};

const CROWDS: Need = { key: "crowds", from: "analyst", why: "needs the crowds first" };

export const SPECIALISTS: Specialist[] = [
  {
    id: "analyst",
    name: "Analyst",
    role: "Fingerprint, crowds and rivals",
    mission: "Measure who the brand speaks to: its taste fingerprint, the crowds around it ranked as most valuable fits, and where it stands against its rivals.",
    doneWhen: "The crowds are measured and stable enough to act on, ranked Win first / Win next / Watch, and the rivals are placed.",
    rules: [
      "When the brand isn't in Qloo, seed the taste graph from 3–5 similar brands and short product traits.",
      "Probe only on evidence: a soft crowd (stability under 0.6), Win first and Win next too close to call, founder facts not yet on the map, or a brand missing from Qloo.",
      "Don't probe when the crowds are stable and the ranking is clear. Stop probing when the crowds hold, the probe cap is hit, or a probe changed nothing.",
      "Asked about one entity, answer from what's measured; probe it only when that would change the crowds or the ranking.",
    ],
    delivers: ["know who your customers are", "find your strongest crowd", "see where you stand against rivals"],
    needs: [],
    budget: { qloo: 150, ms: 150_000, turns: 8 },
    kinds: ["crowd", "rival"],
  },
  {
    id: "scout",
    name: "Scout",
    role: "Next crowd, path, words and mood board",
    mission: "Find the crowd to win after the current one, the path to it through what both crowds love, the words that speak to it, and a mood board of its taste.",
    doneWhen: "The next crowd is named with the bridges that lead to it, the message themes and hooks are written, and the mood board is set.",
    rules: [
      "The next crowd is the Win next fit; when there's none, the crowd that meets the main one most strongly.",
      "The path is what both crowds love; a crowd with no shared loves is a leap, and you say so.",
      "Words come from the crowd's own themes and references, never invented ones.",
    ],
    delivers: ["reach a new crowd", "find the words for your crowd", "set a look and feel"],
    needs: [CROWDS],
    budget: { qloo: 40, ms: 100_000, turns: 6 },
    kinds: ["crowd", "message", "mood"],
  },
  {
    id: "navigator",
    name: "Navigator",
    role: "Cities and neighbourhoods",
    mission: "Choose the cities to grow in and the neighbourhoods within them where the crowd's taste concentrates.",
    doneWhen: "The cities are ranked with their reach and income, the list is sized to what the team can work, and the first city's neighbourhoods are mapped.",
    rules: [
      "Rank cities by the crowd's taste; when two are close, break the tie on reach (residents) and median income.",
      "Size the list to capacity: the founder's stated regions, else two.",
      "Never suggest a city the brand already sells in as new.",
    ],
    delivers: ["launch in a city", "choose where to grow next"],
    needs: [CROWDS],
    budget: { qloo: 40, ms: 100_000, turns: 6 },
    kinds: ["city", "neighbourhood"],
  },
  {
    id: "rep",
    name: "Rep",
    role: "Shops, retailers and the pitch",
    mission: "Find the independent shops and venues in the city whose regulars match the crowd, the bigger retailers to step up to, and write the pitch.",
    doneWhen: "There is a shortlist of venues and retailers the brand isn't in yet, and a pitch for the top one.",
    rules: [
      "Never suggest a shop or retailer the brand is already stocked in.",
      "When few venues come back, widen to the next neighbourhood.",
      "Read the outcomes first: kinds of venue that said no are tried less, kinds that said yes more.",
    ],
    delivers: ["get into shops", "step up to bigger retailers"],
    needs: [CROWDS, { key: "city", from: "navigator", why: "needs a city first" }],
    budget: { qloo: 40, ms: 100_000, turns: 6 },
    kinds: ["venue", "retailer", "draft"],
  },
  {
    id: "matchmaker",
    name: "Matchmaker",
    role: "Brands and podcasts, both ways, and the ask",
    mission: "Find brands and podcasts to partner with whose audience loves the brand's crowd and whose own crowd would love the brand back, and write the ask.",
    doneWhen: "There is a list of two-way partners and podcasts, with an ask for the top one.",
    rules: [
      "A partner must fit both ways: drop one-way partners whose crowd wouldn't love the brand back.",
      "Read the outcomes first: partners like ones that said no are tried less.",
    ],
    delivers: ["find partners", "get on podcasts"],
    needs: [CROWDS],
    budget: { qloo: 60, ms: 110_000, turns: 6 },
    kinds: ["partner", "podcast", "draft"],
  },
  {
    id: "promoter",
    name: "Promoter",
    role: "Events, moments and online audiences",
    mission: "Find the events and moments the crowd turns up for, with their lead times, the online audiences and creators it follows, and write the inquiry.",
    doneWhen: "There are dated events with lead times still open, the online audiences and creators to reach, and an inquiry for the top event.",
    rules: [
      "Every date comes from a source; never estimate one.",
      "When an event's lead time has passed, move to its next occurrence or the next event.",
      "Online audiences need no city; events do.",
    ],
    delivers: ["show up at events", "reach people online"],
    // Events need a city: the Navigator's when it's on the goal, else the home city; online audiences need none.
    needs: [CROWDS, { key: "city", from: "navigator", why: "needs a city for events first", home: true }],
    budget: { qloo: 40, ms: 100_000, turns: 6 },
    kinds: ["event", "audience", "creator", "draft"],
  },
];

export const ATHENA = {
  id: "athena" as const,
  name: "Athena",
  role: "Leads the team",
  mission: "Turn the founder's goals into work for the specialists, run them, answer small asks herself, and keep track of what's working.",
};

export const specialist = (id: SpecialistId): Specialist => SPECIALISTS.find((s) => s.id === id)!;
export const isSpecialist = (id: unknown): id is SpecialistId => typeof id === "string" && (SPECIALIST_IDS as readonly string[]).includes(id);
export const nameOf = (id: AgentId) => (id === "athena" ? ATHENA.name : specialist(id).name);

/** Why a specialist can't start yet ("needs a city first, from the Navigator"), or undefined when it can. */
export function waitingOn(id: SpecialistId, have: { crowds: boolean; city: boolean; home?: boolean }): string | undefined {
  const need = specialist(id).needs.find((n) => !have[n.key] && !(n.home && have.home));
  return need ? `${need.why}, from the ${nameOf(need.from)}` : undefined;
}

/** Who the team panel shows (§23.2 step 8.2f): Athena and the Analyst from the start; any other specialist once a chosen goal includes it. */
export const panelIds = (team: { goals: { team: readonly string[] }[] }): AgentId[] => ["athena", ...SPECIALIST_IDS.filter((id) => id === "analyst" || team.goals.some((g) => g.team.includes(id)))];
