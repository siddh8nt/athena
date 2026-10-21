import "server-only";
import { generate, parseJson } from "@/lib/llm/vertex";
import { TOOLS } from "./tools";
import { ATHENA, SPECIALISTS, isSpecialist, nameOf, type AgentId, type SpecialistId } from "./specialists";
import { checkChange } from "./interpret";
import type { BrandBrief } from "@/lib/brief/types";
import type { Answer, Route, TeamState } from "@/lib/team/types";

// One router per message (PRD §23.2 step 8.5n). Every message the founder types to Athena is read once by the model,
// with what she knows about herself (built from the registry: each subagent's mission, tools and deliverables, the
// data sources, what she can't do) and what the team knows (the knowledge base, the answers, the goals, the workflow,
// the works, the open questions, the recent messages verbatim and a summary of older ones). It decides one move:
// reply, use her tools, edit the Brand Graph, hand to a subagent behind the scenes, change the workflow, or ask a
// clarifying question. This replaces the old split between the graph's reader and the team's. Code checks the move:
// a subagent must exist, a change must be one the workflow can take, a question must offer real options. With no
// model the message goes where it went before: to the subagent whose page it was typed on, or to the graph's reader.

export type Move = Route["do"];
export type { Route };

export type RouteInput = {
  message: string;
  /** The chat so far, oldest first: the last few go verbatim, the rest as a summary. */
  history: { who: string; text: string }[];
  /** The page it was typed on: a subagent's page means the founder is looking at that subagent's work. */
  page?: AgentId | "dashboard";
  brand: { name: string; sells?: string; home?: string };
  /** The Brand Knowledge Base: what the graph holds, as short facts. */
  facts: string[];
  answers: Answer[] | { question: string; answer: string }[];
  team: TeamState;
  /** Questions still waiting on the founder. */
  open: string[];
};

const DATA = [
  "Qloo's taste graph: the brand's taste fingerprint, the crowds around it, what they love, where their taste concentrates, venues and brands and podcasts they over-index on",
  "the US Census: how many people a crowd's places reach",
  "Ticketmaster: events and their dates",
  "Wikipedia page views: what is rising",
  "the web: the brand's own site, shops, press and events, read with sources",
];

const CANNOT = [
  "send emails, pitches or messages for the founder, or post anywhere: she writes the words, the founder sends them",
  "spend money, buy ads, or place orders",
  "see the brand's sales, analytics or inbox unless the founder adds them as files",
  "work outside the United States: cities and regions are US only",
  "work on several cities or every crowd at once: one city and the crowd to win first, then the next",
];

/** The Brand Knowledge Base as short facts: what the brief holds, then the notes the founder kept. */
export function briefFacts(b: BrandBrief | undefined, notes: string[]): string[] {
  if (!b) return notes.slice(0, 30);
  const list = (label: string, xs: string[]) => (xs.length ? [`${label}: ${xs.slice(0, 12).join(", ")}`] : []);
  return [
    ...(b.channels ? [`How it sells: ${b.channels.value}`] : []),
    ...list("Websites", b.websites.map((w) => w.value)),
    ...list("Stockists", b.stockists.map((s) => (s.value.city ? `${s.value.name} (${s.value.city})` : s.value.name))),
    ...list("Comparable brands", b.comparables.map((c) => c.value)),
    ...list("Competitors", b.competitors.map((c) => c.value)),
    ...list("Cities", (b.cities ?? []).map((c) => c.value.name)),
    ...(b.traits?.length ? [`Traits: ${b.traits.join(", ")}`] : []),
    ...b.notes.slice(0, 12).map((n) => n.value),
    ...notes.slice(0, 20),
  ];
}

/** What Athena knows she is and can do, from the registry: it changes when a subagent or a tool does. */
export function selfKnowledge(): string {
  const team = SPECIALISTS.map((s) => {
    const tools = TOOLS.filter((t) => t.for?.includes(s.id)).map((t) => t.name);
    return `- The ${s.name} (id "${s.id}"): ${s.mission} Delivers: ${s.delivers.join("; ")}.${tools.length ? ` Tools: ${tools.join(", ")}.` : ""}${s.needs.length ? ` ${s.needs.map((n) => `It ${n.why}, from the ${nameOf(n.from)}`).join("; ")}.` : ""}`;
  });
  return [
    `You are ${ATHENA.name}, who leads a growth team for a consumer brand's founder. ${ATHENA.mission}`,
    "Your six subagents (only you speak to the founder; they work behind you):",
    ...team,
    `Your data sources: ${DATA.join("; ")}.`,
    `You can't: ${CANNOT.join("; ")}.`,
    "You also keep the Brand Graph, what the team knows about the brand, which the founder can edit by telling you.",
  ].join("\n");
}

/** What the team knows this turn, kept short: the model reads it with every message. */
export function teamKnowledge(i: RouteInput): string {
  const t = i.team;
  const works = Object.values(t.works).flatMap((w) =>
    w ? [`- The ${nameOf(w.agent)}: ${w.headline}${w.results.length ? ` (${w.results.slice(0, 6).map((r) => `${r.kind}: ${r.name}, because ${r.why.slice(0, 140)}`).join("; ")})` : ""}${w.handoff ? `. Waiting on: ${w.handoff.need}` : ""}`] : [],
  );
  const steps = t.workflow?.steps.map((s) => `${s.id === "athena" ? "your plan" : `the ${nameOf(s.id)}`}: ${s.state}`) ?? [];
  const recent = i.history.slice(-8);
  const older = i.history.slice(0, -8).filter((m) => m.who === "you").map((m) => m.text.slice(0, 120));
  return [
    `The brand: ${i.brand.name}${i.brand.sells ? `, which sells ${i.brand.sells}` : ""}${i.brand.home ? `, based in ${i.brand.home}` : ""}.`,
    i.facts.length ? `What the Brand Graph holds:\n${i.facts.slice(0, 40).map((f) => `- ${f}`).join("\n")}` : "The Brand Graph is still thin.",
    t.goals.length ? `The founder's goals: ${t.goals.filter((g) => g.id !== "know_crowd").map((g) => g.label).join("; ") || "not picked yet"}.` : "No goals picked yet.",
    steps.length ? `The workflow: ${steps.join("; ")}.` : "No workflow yet: the founder starts it from the dashboard.",
    works.length ? `What the team has found:\n${works.join("\n")}` : "The team hasn't found anything yet.",
    t.plan ? `Your plan so far: ${t.plan.headline}` : "",
    i.answers.length ? `The founder's answers:\n${i.answers.slice(-12).map((a) => `- ${a.question} ${a.answer}`).join("\n")}` : "",
    i.open.length ? `Still waiting on the founder: ${i.open.slice(0, 6).join("; ")}.` : "",
    i.page && i.page !== "athena" && i.page !== "dashboard" ? `The founder is on the ${nameOf(i.page)}'s page, looking at its work.` : i.page === "dashboard" ? "The founder is on the dashboard." : "",
    older.length ? `Earlier, the founder said (oldest first): ${older.join(" / ")}` : "",
    recent.length ? `The latest messages, verbatim:\n${recent.map((m) => `${m.who === "you" ? "Founder" : "Athena"}: ${m.text.slice(0, 400)}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** With no model, the message goes where it went before step 8.5n. */
export function codeRoute(i: Pick<RouteInput, "page" | "message">): Route {
  if (i.page && isSpecialist(i.page)) return { do: "handoff", to: i.page, task: i.message.trim().slice(0, 300), reply: `I've asked the ${nameOf(i.page)}.` };
  return { do: "graph" };
}

const MOVES: Move[] = ["reply", "tools", "graph", "handoff", "workflow", "clarify"];
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** The model's move, held to what's real. A move that doesn't check out falls back to a sensible one, never an error. */
export function checkRoute(raw: unknown, i: RouteInput): Route {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const move = MOVES.find((m) => m === r.do);
  const reply = clean(r.reply, 1600);
  if (move === "reply" && reply) return { do: "reply", reply };
  if (move === "tools") return { do: "tools", ...(reply ? { reply: reply.slice(0, 300) } : {}) };
  if (move === "graph") return { do: "graph" };
  if (move === "handoff" && isSpecialist(r.to)) {
    const to = r.to;
    return { do: "handoff", to, task: clean(r.task, 300) || i.message.slice(0, 300), reply: reply.slice(0, 300) || `I've asked the ${nameOf(to)}.` };
  }
  if (move === "workflow") {
    const c = checkChange(r.change, i.team.workflow);
    if (c.change) return { do: "workflow", change: c.change, reply: reply.slice(0, 300) || c.line || "I've changed the plan." };
    // Bringing in a subagent that's already in the plan changes nothing: what was asked is fresh work from it.
    const again = (Array.isArray((r.change as Record<string, unknown> | undefined)?.add) ? ((r.change as Record<string, unknown>).add as unknown[]) : []).find(
      (id): id is SpecialistId => isSpecialist(id) && !!i.team.workflow?.steps.some((s) => s.id === id),
    );
    if (again) return { do: "handoff", to: again, task: i.message.trim().slice(0, 300), reply: `I've asked the ${nameOf(again)} to work on it again.` };
  }
  if (move === "clarify") {
    const question = clean(r.question, 240);
    const options = (Array.isArray(r.options) ? r.options : []).map((o) => ({ label: clean(typeof o === "string" ? o : (o as Record<string, unknown>)?.label, 100) })).filter((o) => o.label).slice(0, 4);
    if (question && options.length >= 2) return { do: "clarify", question, options, ...(reply ? { reply: reply.slice(0, 300) } : {}) };
    if (question) return { do: "reply", reply: reply ? `${reply} ${question}` : question };
  }
  // A move that didn't check out: a reply it wrote stands; otherwise her tools answer it.
  return reply ? { do: "reply", reply } : { do: "tools" };
}

const PROMPT = `Decide your one move for the founder's latest message, and write what you say.
- "reply": you can answer from what you and the team already know: what you can do, what a subagent found and why, a follow-up on something said before, a request outside what you do (say plainly what you can't, and what you can do instead). Write the reply as natural prose, 2 to 6 sentences, explaining your reasoning and naming which subagent found what. Every fact in it comes from the brief or the team's work below, each result's own "because" for why it was picked; never add what a place serves or is known for from your own knowledge, and when the founder needs more than the team found, choose "tools" or "handoff". No lists, no headings, no internal numbers or ids. Call the six your subagents (never specialists or agents) and name the ones you mean: ${SPECIALISTS.map((x) => `the ${x.name}`).join(", ")}.
- "tools": answering needs a fresh look in the data (a lookup, a comparison, a number not already found). Say one short line in reply about what you'll look up.
- "graph": the founder is telling you something about the brand to add, change or remove in the Brand Graph (a stockist, a city, a competitor, a price, a fact).
- "handoff": the founder wants a subagent's work done again, done differently or taken further ("find more shops", "make the words more playful"). Writing something for the founder to send (a pitch, an email, an ask, a note to a shop or a partner) is always a handoff: the subagent who found the recipient writes it, checked against the evidence and with the contact it found; you never draft it yourself in a reply. Give to (its id), task (what it should do, in a sentence) and reply (one line saying who you've asked and why).
- "workflow": the founder wants the plan's steps changed: a subagent skipped or brought in, or a US city to work on. "add" is only for a subagent not in the plan yet; one already in it that should read or work again is a "handoff". Give change: {"skip"?: [ids], "add"?: [ids], "city"?: "City name"} and a one-line reply.
- "clarify": the message could mean two or more quite different things, and guessing wrong would waste the team's work. This includes a message that points back ("that one", "the bigger one", "do it") when more than one earlier thing fits: ask before starting a subagent on a guess. Ask one short question with 2 to 4 options, each a plain reading of what they might mean, naming the things it could refer to.
Return JSON only: {"do": "reply"|"tools"|"graph"|"handoff"|"workflow"|"clarify", "reply"?: string, "to"?: string, "task"?: string, "change"?: {...}, "question"?: string, "options"?: [string]}`;

export async function routeMessage(i: RouteInput, llm: boolean, gen: typeof generate = generate): Promise<Route> {
  if (!llm || !i.message.trim()) return codeRoute(i);
  try {
    const res = await gen({
      model: "flash",
      json: true,
      thinking: "LOW",
      temperature: 0.3,
      maxOutputTokens: 1200,
      budgetMs: 20_000,
      system: selfKnowledge(),
      prompt: `${teamKnowledge(i)}\n\nThe founder's latest message: "${i.message.slice(0, 600)}"\n\n${PROMPT}`,
    });
    return checkRoute(parseJson(res.text), i);
  } catch (err) {
    console.error("route failed", err);
    return codeRoute(i);
  }
}

/** A reply as it streams: a few words at a time, at a reading pace the client keeps. */
export function chunks(text: string): string[] {
  return text.match(/\S+\s*/g)?.reduce<string[]>((out, w, n) => (n % 3 ? ((out[out.length - 1] += w), out) : [...out, w]), []) ?? [];
}
