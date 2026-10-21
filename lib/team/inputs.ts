import type { SpecialistId } from "@/lib/agent/specialists";
import type { Asked } from "./types";

// What only the founder knows and a subagent's step needs (PRD §23.2 step 8.5g): Athena asks each one in the chat just
// before the step that needs it, and only when it isn't already known. Client-safe: the server asks them, the client
// shows and edits the answers.

export type Input = Asked & { helps: SpecialistId[] };

export const INPUTS: Input[] = [
  { id: "input_regions", question: "Which regions can you reach: ship to, visit, sell in?", why: "The Navigator ranks only cities you can serve.", helps: ["navigator"], unranked: true, multi: false, assumed: "anywhere in the US", options: [{ label: "Anywhere in the US" }, { label: "Near home only" }, { label: "One or two coasts" }] },
  { id: "input_stockists", question: "Which shops already stock you? Name them, or add a stockist sheet.", why: "The Rep leaves them out and finds shops like them.", helps: ["rep"], unranked: true, multi: false, assumed: "no stockists yet", options: [{ label: "None yet" }, { label: "Only online, my own store" }] },
  { id: "input_budget", question: "What can you spend on growth in the next three months?", why: "The Rep and the Promoter size shop pitches and events to it.", helps: ["rep", "promoter"], unranked: true, multi: false, assumed: "a small budget", options: [{ label: "Under $1,000" }, { label: "$1,000 to $10,000" }, { label: "Over $10,000" }] },
  { id: "input_launch", question: "When is your next launch or push?", why: "The Promoter picks events with lead times that fit it.", helps: ["promoter"], unranked: true, multi: false, assumed: "no fixed date", options: [{ label: "Within a month" }, { label: "In 1 to 3 months" }, { label: "No fixed date" }] },
];

export const inputById = (id: string) => INPUTS.find((q) => q.id === id);

/** The inputs a subagent's step needs, in the order Athena asks them. */
export const inputsFor = (agent: SpecialistId | "athena") => (agent === "athena" ? [] : INPUTS.filter((q) => q.helps.includes(agent)).map((q) => q.id));

/**
 * The inputs still to ask before a step: those it needs that the founder hasn't answered (matched by the question, as
 * the runs read answers) and the Brand Graph doesn't already say. Stockists on the graph answer the stockists input.
 */
export function missingInputs(ids: string[], answers: { question: string }[], known: { stockists: number }): Input[] {
  const asked = new Set(answers.map((a) => a.question.trim().toLowerCase()));
  return ids
    .map(inputById)
    .filter((q): q is Input => !!q)
    .filter((q) => !asked.has(q.question.toLowerCase()) && !(q.id === "input_stockists" && known.stockists > 0));
}
