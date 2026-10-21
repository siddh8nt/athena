import type { AgentEvent } from "@/lib/blocks/types";
import type { Claim } from "@/lib/agent/cite";
import type { FitsResult, SourceRef } from "@/lib/fits/types";
import type { CrowdsResult, FitsRun } from "@/lib/journey/types";
import type { Galaxy } from "@/lib/taste/galaxy";
import type { SeedInput } from "@/lib/taste/seed";
import type { FounderQuestion } from "@/lib/agent/tools";
import type { AgentId, SpecialistId } from "@/lib/agent/specialists";
import type { CrowdPage } from "./page";
import type { SavedNav } from "@/lib/agent/navigator";
import type { RepRead } from "@/lib/agent/rep";
import type { MatchRead } from "@/lib/agent/matchmaker";
import type { PromoRead } from "@/lib/agent/promoter";

// The team as the client sees it (PRD §23.2 step 8): goals, each specialist's work, and the founder's outcome marks.
// Pure types, client-safe.

/** A goal the founder picks (§23.2 step 8a): it stays on top, with the specialists behind it. */
export type Goal = {
  id: string;
  label: string;
  why: string;
  team: SpecialistId[];
  /** Goals that can't be picked with this one. */
  conflicts: string[];
  recommended?: boolean;
  /** A goal the founder typed. `outside` names plainly the part no specialist covers. */
  custom?: boolean;
  outside?: string;
};

/** One result a specialist returns, with the sources (and so the Qloo calls) that back it. */
export type WorkItem = {
  /** Stable across runs: kind and name, so an outcome mark finds it again. */
  id: string;
  kind: string;
  name: string;
  why: string;
  /** Its group for outcomes ("café", "bottle shop", "podcast"), so marks read as patterns. */
  group?: string;
  detail?: string;
  /** A Qloo id, when it's an entity. */
  ref?: string;
  sources: string[];
  callIds: string[];
};

/** A specialist's finished run (§23.2 step 8c): its time, its Qloo calls and the nodes it added to the graph. */
export type Work = {
  agent: SpecialistId;
  goal: string;
  headline: string;
  results: WorkItem[];
  claims: Claim[];
  /** Work handed back to Athena ("the Rep needs a city first"). */
  handoff?: { need: string };
  sources: SourceRef[];
  ms: number;
  qlooCalls: number;
  /** When it finished (ms since epoch), for staleness. */
  at: number;
  /** What the outcomes changed, as the specialist read them before deciding ("three cafés said no…"). */
  outcomes?: string;
  /** Against the last run of the same specialist: what's new and what's gone. */
  changed?: string;
  /** What the team learnt that others can use: the city chosen, the crowd to aim at. */
  /** `nav`: the Navigator's read, so a later run's Rep and Promoter work the same cities (§23.5 i). */
  /** `match`: the Matchmaker's read, so an ask works from the partners already found (§23.5 g). */
  shared?: { city?: { id: string; name: string }; crowd?: string; nav?: SavedNav; rep?: RepRead; pitch?: Record<string, { subject: string; body: string }>; match?: MatchRead; ask?: Record<string, { subject: string; body: string }>; promo?: PromoRead; inquiry?: Record<string, { subject: string; body: string }> };
  /** Its page (§23.5 b): a tab per crowd and Across all three; saved with the work, so others reuse it. */
  page?: CrowdPage;
  /** How the run decided: the model, or code's evidence rules when the model wasn't there. */
  by: "agent" | "rules";
};

export const MARKS = ["pitched", "yes", "no", "no_reply", "went"] as const;
export type Mark = (typeof MARKS)[number];
export const MARK_LABEL: Record<Mark, string> = { pitched: "Pitched", yes: "Yes", no: "No", no_reply: "No reply", went: "Went" };
/** The Promoter's events are applied for, booked, gone to or skipped (§23.5 h): the same marks, its own words. */
export const PROMO_LABEL: Record<Mark, string> = { pitched: "Applied", yes: "Booked", went: "Went", no: "Skipped", no_reply: "No reply" };
/** The marks a subagent's results take: "Went" is the Promoter's alone. */
export const marksFor = (agent?: string): Mark[] => (agent === "promoter" ? ["pitched", "yes", "went", "no"] : MARKS.filter((m) => m !== "went"));
export const markLabel = (m: Mark, agent?: string) => (agent === "promoter" ? PROMO_LABEL[m] : MARK_LABEL[m]);

export type Outcome = { item: string; agent: SpecialistId; kind: string; name: string; group?: string; mark: Mark; at: number };

export type AgentStatus =
  | { state: "idle" }
  | { state: "working"; step: string }
  | { state: "waiting"; reason: string }
  | { state: "done"; last: string };

export type Asked = FounderQuestion & { id: string };

/** A step's state on the workflow diagram (§23.2 step 8.5c). */
export type StepState = "todo" | "running" | "paused" | "done";

/** One step of Athena's workflow (§23.2 step 8.5e): who does it, what for, after which steps, and what it asks first. */
export type WorkflowStep = {
  /** The subagent's id, or "athena" for her synthesis: one step each. */
  id: SpecialistId | "athena";
  task: string;
  /** Steps that must be done first, by id. */
  needs: (SpecialistId | "athena")[];
  why: string;
  /** The founder inputs (lib/team/inputs.ts) Athena asks just before this step, when not already known. */
  inputs: string[];
  state: StepState;
};

/** Athena's plan of work for the goals (§23.2 step 8.5e): built by the model and checked by code, or code's own. */
export type Workflow = { goals: string[]; steps: WorkflowStep[]; by: "agent" | "rules" };

/** A founder's answer the team keeps (§23.2 step 8.5g): shown in "Your answers", editable, read by every run. */
/** `from: "graph"`: Athena took it from the Brand Graph instead of asking. */
export type Answer = { id: string; agent: AgentId; question: string; answer: string; from?: "graph" };

/** One line of Athena's plan, cited to the subagent whose work it comes from (§23.2 step 8.5m). */
export type PlanLine = { kind: "who" | "where" | "through" | "words" | "when"; agent: SpecialistId; text: string };

/** Athena's growth plan (§23.2 step 8.5m): per target crowd, who, where, through what, the words and when; then what's left. */
export type GrowthPlan = {
  headline: string;
  crowds: { crowd: string; tier: string; lines: PlanLine[] }[];
  disagreements: string[];
  open: string[];
  /** The subagents' works it was read from, by when each finished, so a newer run shows the plan as out of date. */
  from: Partial<Record<SpecialistId, number>>;
  at: number;
};

/**
 * Athena's one move for a typed message (§23.2 step 8.5n), decided by the model and checked by code: reply, use her
 * tools, edit the Brand Graph, hand to a subagent behind the scenes, change the workflow, or ask a clarifying question.
 */
export type Route =
  | { do: "reply"; reply: string }
  | { do: "tools"; reply?: string }
  | { do: "graph" }
  | { do: "handoff"; to: SpecialistId; task: string; reply: string }
  | { do: "workflow"; change: { skip?: SpecialistId[]; add?: SpecialistId[]; city?: { id: string; name: string } }; reply: string }
  | { do: "clarify"; question: string; options: { label: string }[]; reply?: string };

/** The team route's stream. Every specialist's steps carry its id, so each has its own transcript. */
export type TeamEvent =
  | { type: "goals"; goals: Goal[] }
  | { type: "custom"; goal: Goal }
  | { type: "assign"; goal: Goal; team: SpecialistId[]; line: string }
  | { type: "status"; agent: AgentId; status: AgentStatus }
  | { type: "step"; agent: AgentId; event: AgentEvent }
  | { type: "ask"; agent: AgentId; ask: Asked }
  /** An input the Brand Graph already answers: kept with the founder's answers, never asked. */
  | { type: "known"; agent: SpecialistId; answer: Answer }
  | { type: "work"; agent: SpecialistId; work: Work }
  /** A specialist that needs what another is waiting on the founder for: it waits too, and runs once they've answered. */
  | { type: "held"; agent: SpecialistId; on: SpecialistId }
  /** Athena's words in the chat. `run`: the subagent whose step trail goes under it. */
  | { type: "reply"; text: string; agent?: SpecialistId; run?: SpecialistId }
  /** Athena's reply as it streams, a few words at a time; the reply event that follows replaces it. */
  | { type: "delta"; text: string }
  /** A move the client carries out: the graph's reader, a subagent behind the scenes, or a change to the workflow. */
  | { type: "route"; route: Route }
  /** The workflow as it stands, whole, after every change (§23.2 step 8.5f). */
  | { type: "workflow"; workflow: Workflow }
  /** Athena's growth plan, the workflow's last step. */
  | { type: "plan"; plan: GrowthPlan }
  /** The crowds and ranking after the Analyst measured, probed or re-ranked, for the journey to keep. */
  | { type: "memory"; crowds?: CrowdsResult; seed?: SeedInput; fits?: FitsResult; probes: string[]; calendar?: FitsRun["calendar"]; reach?: FitsRun["reach"]; answer?: FitsRun["answer"]; sources?: FitsRun["sources"] }
  /** The Taste Galaxy as it forms, round by round, while the Analyst measures. */
  | { type: "galaxy"; galaxy: Galaxy }
  | { type: "done"; qlooCalls: number; ms: number };

/** What the journey keeps of the team. Optional on the journey, so saves from before step 8 load. */
export type TeamState = {
  proposed?: Goal[];
  goals: Goal[];
  works: Partial<Record<SpecialistId, Work>>;
  /** Each specialist's run before the current one, for "what changed". */
  previous?: Partial<Record<SpecialistId, Work>>;
  outcomes: Outcome[];
  /** The Brand Graph revision each specialist last ran on. */
  rev?: Partial<Record<SpecialistId, number>>;
  /** Athena's workflow for the goals (§23.2 step 8.5e). */
  workflow?: Workflow;
  /** The founder's answers to the team's questions (§23.2 step 8.5g). */
  answered?: Answer[];
  /** Athena's growth plan, once the workflow's last step has run. */
  plan?: GrowthPlan;
};

export const emptyTeam = (): TeamState => ({ goals: [], works: {}, outcomes: [] });
