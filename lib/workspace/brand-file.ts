import type { BrandBrief } from "@/lib/brief/types";
import type { Journey } from "@/lib/journey/types";
import { briefFacts } from "@/lib/brief/facts";
import { execPlan, planView, type Stage } from "@/lib/exec/plan";
import { emptyTeam, type PlanStep } from "@/lib/team/types";

// The brand context file (PRD §23.6 f): `athena-brand.md`, the brief, crowds, Athena's order and the open tasks,
// written for an AI assistant to read. It's the reverse of onboarding's "Copies a prompt for your AI assistant": that
// asks the founder's assistant what it knows; this hands it what Athena knows. Pure, so the browser builds it from
// its own journey with no server state; the MCP server serves the same text, and the judges' demo builds it from the
// seeded Fishwife workspace. Plain words throughout: no ids, no internals.

/** What a plan row's stage means in plain words, so an outside tool reads it without knowing Athena's internals. */
export const STAGE_NOTE: Record<Stage, string> = {
  queued: "waiting to find a contact",
  reading: "Athena is reading pages for a contact",
  drafting: "Athena is drafting the outreach",
  ready: "draft ready to send",
  needs: "needs a way to reach them",
  sent: "pitched, waiting for a reply",
  waiting: "pitched, waiting for a reply",
  follow: "time to follow up",
  yes: "they said yes",
  no: "they said no",
};
/** The rows the founder can act on next: not already sent-and-waiting, not closed. */
export const ACTIONABLE: Stage[] = ["queued", "reading", "drafting", "ready", "needs", "follow"];

const PHASE: Record<PlanStep["phase"], string> = { shared: "for every crowd", win_first: "Win first", win_next: "Win next", watch: "Watch" };

/** Open tasks listed in the file, so it stays a size an assistant reads in one go. */
const TASKS = 40;

export const BRAND_FILE = "athena-brand.md";

/** The file's text for one workspace. `now` dates it and sets which follow-ups are due. */
export function brandFile(saved: { brief?: BrandBrief; journey?: Journey }, now = Date.now()): string {
  const { brief, journey } = saved;
  const team = journey?.team ?? emptyTeam();
  const name = brief?.name?.value ?? "The brand";
  const out: string[] = [];
  const day = new Date(now).toISOString().slice(0, 10);

  out.push(`# ${name}: brand context from Athena`, "");
  out.push(
    `For an AI assistant: this is what Athena, a growth strategist for consumer brands, knows about ${name}: the brand, the crowds most likely to buy it, Athena's growth plan in order, and the outreach still open. Treat it as the founder's own brief, and prefer it over guesses. Written ${day}; the founder can download a fresh copy from Athena at any time.`,
    "",
  );

  out.push("## The brand", "");
  const about = [
    brief?.sells?.value && `Sells: ${brief.sells.value}`,
    brief?.activeCity?.value && `Home city: ${brief.activeCity.value}`,
    brief?.tierHint?.value && `Price tier: ${brief.tierHint.value}`,
    brief?.stageHint?.value && `Stage: ${brief.stageHint.value === "prelaunch" ? "not launched yet" : brief.stageHint.value}`,
  ].filter(Boolean) as string[];
  const facts = briefFacts(brief, (journey?.facts ?? []).map((f) => f.text));
  for (const f of [...about, ...facts]) out.push(`- ${f}`);
  if (!about.length && !facts.length) out.push("- Athena hasn't been told about the brand yet.");
  if (team.answered?.length) {
    out.push("", "The founder's answers to Athena's questions:", "");
    for (const a of team.answered.slice(0, 20)) out.push(`- ${a.question} ${a.answer}`);
  }
  out.push("");

  const crowds = (journey?.crowds?.crowds ?? []).filter((c) => !c.nearMiss);
  if (crowds.length) {
    out.push("## Crowds", "", "The groups of people whose taste fits the brand, strongest first.", "");
    for (const c of crowds.slice(0, 6)) {
      out.push(`### ${c.name}${c.main ? " (the main crowd)" : ""}`, "");
      if (c.loves.length) out.push(`- Also loves: ${c.loves.slice(0, 10).map((l) => l.name).join(", ")}`);
      if (c.cities.length) out.push(`- Strongest cities: ${c.cities.slice(0, 5).map((m) => m.name).join(", ")}`);
      out.push("");
    }
  }

  const plan = team.plan;
  if (plan) {
    out.push("## Athena's plan, in order", "");
    if (plan.headline) out.push(plan.headline, "");
    for (const s of plan.steps ?? []) {
      const who = s.crowds.length ? ` (${PHASE[s.phase]}: ${s.crowds.join(", ")})` : s.phase === "shared" ? ` (${PHASE.shared})` : "";
      out.push(`${s.n}. ${s.what}${who}`);
      for (const l of s.lines.slice(0, 6)) out.push(`   - ${l.text}`);
    }
    if (plan.open.length) {
      out.push("", "Still to hear from the founder:", "");
      for (const q of plan.open.slice(0, 10)) out.push(`- ${q}`);
    }
    out.push("");
  }

  const view = planView(team, now);
  const byId = new Map(execPlan(team).items.map((it) => [it.id, it]));
  const open = (view?.items ?? []).filter((r) => ACTIONABLE.includes(r.stage));
  if (open.length) {
    out.push("## Open tasks", "", "The outreach the founder can act on next, in Athena's order, with where each one stands. Athena keeps the drafts.", "");
    for (const r of open.slice(0, TASKS)) {
      const it = byId.get(r.id);
      const where = [...(it?.crowds ?? []).slice(0, 2), ...(it?.cities ?? []).slice(0, 1)].join(", ");
      out.push(`- ${it?.action ?? r.name}: ${STAGE_NOTE[r.stage]}${where ? ` (${where})` : ""}`);
    }
    if (open.length > TASKS) out.push(`- …and ${open.length - TASKS} more in Athena's Execute Plan.`);
    out.push("");
  } else if (!plan) {
    out.push("## Plan", "", "Athena's team hasn't written the plan yet. Ask the founder to open Athena to start it.", "");
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
