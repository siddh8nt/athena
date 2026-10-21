import "server-only";
import { generate, parseJson } from "@/lib/llm/vertex";
import { metroById, metroIdFor } from "@/lib/playbook/metros";
import { SPECIALISTS, isSpecialist, nameOf, type SpecialistId } from "./specialists";
import type { Workflow } from "@/lib/team/types";

// A typed answer to one of the team's questions (PRD §23.2 step 8.5h). The founder can type instead of picking:
// the model reads the words against the question and says which option they mean, or keeps them as a fact in their
// own words, and whether they change the workflow ("skip events", "add Austin"). Code checks every part: an option
// must be one offered, a subagent must exist, a city must resolve. With no model, a typed answer that is an option's
// label picks it; anything else is kept as the founder's fact, never guessed at by keyword.

export type Interpreted = {
  /** The option the words pick, exactly as offered. */
  option?: string;
  /** The founder's words, kept as a fact the runs read. */
  fact?: string;
  change?: { skip?: SpecialistId[]; add?: SpecialistId[]; city?: { id: string; name: string } };
  /** One line Athena says back, when the answer changed something. */
  line?: string;
};

export type InterpretInput = {
  text: string;
  question: { question: string; options: { label: string }[] };
  workflow?: Workflow;
};

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Code's reading: an option's own label picks it; anything else stays the founder's words. */
export function codeInterpret(i: InterpretInput): Interpreted {
  const hit = i.question.options.find((o) => norm(o.label) === norm(i.text));
  return hit ? { option: hit.label } : { fact: i.text.trim() };
}

/** The model's reading, held to what's real: offered options, known subagents, a city that resolves. */
export function checkInterpret(raw: unknown, i: InterpretInput): Interpreted {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const option = typeof r.option === "string" ? i.question.options.find((o) => norm(o.label) === norm(r.option as string))?.label : undefined;
  const fact = typeof r.fact === "string" && r.fact.trim() ? r.fact.trim().slice(0, 300) : undefined;
  const { change, line } = checkChange(r.change, i.workflow);
  const out: Interpreted = option ? { option } : { fact: fact ?? i.text.trim() };
  if (change) out.change = change;
  if (line) out.line = line;
  return out;
}

/** A change to the workflow, held to what's real: known subagents, steps in the plan, a US city that resolves. */
export function checkChange(raw: unknown, workflow?: Workflow): Pick<Interpreted, "change" | "line"> {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ids = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).filter(isSpecialist))];
  const inPlan = (id: SpecialistId) => !workflow || workflow.steps.some((s) => s.id === id);
  // The Analyst is never skipped: every other step works from its crowds.
  const skip = ids(c.skip).filter((id) => id !== "analyst" && inPlan(id));
  const add = ids(c.add).filter((id) => !inPlan(id) || !workflow);
  const cityName = typeof c.city === "string" ? c.city.trim().slice(0, 80) : "";
  const cityId = cityName ? metroIdFor(cityName) : "";
  const city = cityId ? { id: cityId, name: metroById(cityId)?.name ?? cityName } : undefined;
  if (!skip.length && !add.length && !city) return {};
  const parts = [
    skip.length ? `I've taken the ${skip.map(nameOf).join(" and the ")} off the plan` : "",
    add.length ? `added the ${add.map(nameOf).join(" and the ")}` : "",
    city ? `set ${city.name} as the city to work on` : "",
  ].filter(Boolean);
  return {
    change: { ...(skip.length ? { skip } : {}), ...(add.length ? { add } : {}), ...(city ? { city } : {}) },
    line: `${parts.join(", ")}.`.replace(/^./, (m) => m.toUpperCase()),
  };
}

export async function interpret(i: InterpretInput, llm: boolean, gen: typeof generate = generate): Promise<Interpreted> {
  if (!llm || !i.text.trim()) return codeInterpret(i);
  try {
    const res = await gen({
      model: "lite",
      json: true,
      thinking: "LOW",
      temperature: 0,
      maxOutputTokens: 400,
      system: "You read a founder's typed answer to a question from their growth team. Reply with JSON only.",
      prompt:
        `The question: ${i.question.question}\n` +
        `The options offered: ${JSON.stringify(i.question.options.map((o) => o.label))}\n` +
        (i.workflow ? `The team's plan, in order: ${JSON.stringify(i.workflow.steps.filter((s) => s.id !== "athena").map((s) => ({ id: s.id, task: s.task })))}\n` : "") +
        `The subagents: ${JSON.stringify(SPECIALISTS.map((s) => ({ id: s.id, role: s.role })))}\n` +
        `The founder typed: "${i.text.slice(0, 400)}"\n` +
        "If the words mean one of the options, give it exactly as offered in option. Otherwise put what they said, as a plain fact in their words, in fact. " +
        "Only if they ask to change the team's work: change.skip lists subagent ids to drop (\"skip events\" drops the one that does events), change.add lists ids to bring in, change.city names a US city to work on (\"add Austin\").\n" +
        'Return {"option"?: string, "fact"?: string, "change"?: {"skip"?: [ids], "add"?: [ids], "city"?: string}}',
    });
    return checkInterpret(parseJson(res.text), i);
  } catch (err) {
    console.error("interpret failed", err);
    return codeInterpret(i);
  }
}
