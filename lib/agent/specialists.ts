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
  /** The suggested text in its chat box: the kind of thing a founder asks this specialist. */
  prompt: string;
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
    prompt: 'Ask the Analyst: "why is this crowd first?", "how do we compare with our rivals?"',
    mission: "Measure who the brand speaks to: its taste fingerprint, the crowds around it ranked as most valuable fits, and where it stands against its rivals.",
    doneWhen: "The crowds are measured and stable enough to act on, ranked Win first / Win next / Watch, and the rivals are placed.",
    rules: [
      "When the brand isn't in Qloo, seed the taste graph from 3–5 similar brands and short product traits.",
      "Probe only on evidence: a soft crowd (stability under 0.6), Win first and Win next too close to call, founder facts not yet on the map, or a brand missing from Qloo.",
      "Fewer than three crowds held: probe once with 2–3 brands on the map most like the brand (not chains, not landmarks), adding them to any other probe, to see whether a third crowd appears. If it still doesn't, the group marked near_miss fills Watch: it sits next to the crowds and is never ranked above them.",
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
    role: "Each crowd's words, look and attention, and the path between them",
    prompt: 'Ask the Scout: "who should we win next?", "make the words more playful"',
    mission: "Read every ranked crowd on its own (who they are, the words that speak to them, a mood board, the products to lead with, where their attention goes, the rivals already there), then the paths between the crowds, the order to win them and the one message that works for all three.",
    doneWhen: "Each crowd has its words, look, product angle and attention read, and the paths, the order and the one message across all three are set.",
    rules: [
      "The next crowd is the Win next fit; when there's none, the crowd that meets the main one most strongly.",
      "The path is what both crowds love; a crowd with no shared loves is a leap, and you say so.",
      "Words come from the crowd's own themes and references, never invented ones.",
      "Read all three crowds in one read_crowds call; when the founder asks for a tone (more playful, shorter), read again with that tone. The order to win them is a sequence, never a schedule.",
    ],
    delivers: ["reach a new crowd", "find the words for your crowd", "set a look and feel"],
    needs: [CROWDS],
    budget: { qloo: 80, ms: 160_000, turns: 6 },
    kinds: ["crowd", "message", "mood", "podcast", "creator"],
  },
  {
    id: "navigator",
    name: "Navigator",
    role: "Cities and neighbourhoods",
    prompt: 'Ask the Navigator: "what about Chicago?", "which neighbourhoods first?"',
    mission: "Choose the cities to grow in for all three crowds, the overlap cities where two or three are strong at once, and in each city every neighbourhood where a crowd's taste runs hot, with what to do there.",
    doneWhen: "Each crowd's cities are ranked and sized to what the team can work, every worked city has a verdict (Launch here, Test here, Later) and its hot neighbourhoods are mapped with their Census figures and a role.",
    rules: [
      "Read all three crowds in one pass (read_cities); a city strong for two or three crowds is an efficient first launch.",
      "Size each crowd's list to capacity: the founder's stated regions, else two.",
      "Never suggest a city the brand already sells in as new: it is home base.",
      "A next step the founder marked as not working moves its city down; one that worked moves it up. Say so when it changes a verdict.",
      "A crowd size is an estimate (the residents of the ZIPs where it runs hot): say it is one.",
    ],
    delivers: ["launch in a city", "choose where to grow next"],
    needs: [CROWDS],
    budget: { qloo: 60, ms: 120_000, turns: 6 },
    kinds: ["city", "neighbourhood"],
  },
  {
    id: "rep",
    name: "Rep",
    role: "Shops, retailers and the pitch",
    prompt: 'Ask the Rep: "more independent shops, fewer chains", "write the pitch for the top shop"',
    mission:
      "For each of the three crowds, find the shops in the Navigator's cities whose regulars match it, crowd → city → neighbourhood → shop: anchors first, then spillover. A shop that fits two or three crowds is found once and ranked higher. Rank the national retailers per crowd, and write the pitch for the top shop.",
    doneWhen: "Each crowd has its shops in its cities and its national retailers, none the brand is already in, each shop with how it buys and a public contact when there is one, and a pitch for the top shop.",
    rules: [
      "Never suggest a shop or retailer the brand is already stocked in; show those as already there.",
      "When an anchor neighbourhood has few shops, widen to the nearest one and say so.",
      "Read the outcomes first: kinds of shop that said no are tried less, kinds that said yes more.",
      "Contacts come only from a shop's own pages, each with the page it was on; never guess an email. Drafts are for the founder to copy or open in mail, never sent.",
    ],
    delivers: ["get into shops", "step up to bigger retailers"],
    needs: [CROWDS, { key: "city", from: "navigator", why: "needs a city first" }],
    budget: { qloo: 130, ms: 150_000, turns: 6 },
    kinds: ["venue", "retailer", "draft"],
  },
  {
    id: "matchmaker",
    name: "Matchmaker",
    role: "Creators, brands and podcasts, both ways, and the ask",
    prompt: 'Ask the Matchmaker: "creators this crowd follows", "partners outside our category", "any podcasts for this crowd?"',
    mission:
      "For each of the three crowds, find the creators, brands and podcasts it loves whose own audience would love the brand back, each sized into a band and against the founder's budget, with public contacts only, and write the ask for the top one.",
    doneWhen:
      "Each crowd has its creators, two-way brands and podcasts, each with its band, its fit with the budget and a public contact when there is one; what was left out says why; and there is an ask for the top partner.",
    rules: [
      "A partner must fit both ways: drop one-way partners whose crowd wouldn't love the brand back, and say why.",
      "Never suggest a rival, a brand in the founder's own category or one whose values clash; list them as left out with the reason.",
      "A creator counts as a match only when Qloo's read of who follows them looks like the crowd; when there is no read, say so and tell the founder to check their audience before paying.",
      "A follower count is labelled approx. unless it comes from the platform itself; a rate is an estimate with its source, else ask for their rate card.",
      "Read the outcomes first: partners like ones that said no are tried less, ones like those that said yes more.",
      "Contacts come only from public pages, each with its source; never guess an email or use a personal address. Asks are for the founder to copy or open in mail, never sent.",
    ],
    delivers: ["find partners", "get on podcasts", "work with creators"],
    needs: [CROWDS],
    budget: { qloo: 150, ms: 180_000, turns: 6 },
    kinds: ["creator", "partner", "podcast", "draft"],
  },
  {
    id: "promoter",
    name: "Promoter",
    role: "Events, moments and online audiences",
    prompt: 'Ask the Promoter: "what events are coming up?", "which creators should we reach?"',
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
    budget: { qloo: 130, ms: 150_000, turns: 6 },
    kinds: ["event", "audience", "creator", "draft"],
  },
];

export const ATHENA = {
  id: "athena" as const,
  name: "Athena",
  role: "Leads the team",
  mission: "Turn the founder's goals into work for the subagents, run them, answer small asks herself, and keep track of what's working.",
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
export const panelIds = (team: { goals: { team: readonly string[] }[]; workflow?: { steps: { id: string }[] } }): AgentId[] => ["athena", ...SPECIALIST_IDS.filter((id) => id === "analyst" || team.goals.some((g) => g.team.includes(id)) || !!team.workflow?.steps.some((s) => s.id === id))];
