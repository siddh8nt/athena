import type { AgentEvent } from "@/lib/blocks/types";
import type { Claim } from "@/lib/agent/cite";
import type { FitsResult, SourceRef } from "@/lib/fits/types";
import type { CrowdsResult, FitsRun } from "@/lib/journey/types";
import type { Galaxy } from "@/lib/taste/galaxy";
import type { SeedInput } from "@/lib/taste/seed";
import type { FounderQuestion } from "@/lib/agent/tools";
import type { AgentId, SpecialistId } from "@/lib/agent/specialists";

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
  shared?: { city?: { id: string; name: string }; crowd?: string };
  /** How the run decided: the model, or code's evidence rules when the model wasn't there. */
  by: "agent" | "rules";
};

export const MARKS = ["pitched", "yes", "no", "no_reply"] as const;
export type Mark = (typeof MARKS)[number];
export const MARK_LABEL: Record<Mark, string> = { pitched: "Pitched", yes: "Yes", no: "No", no_reply: "No reply" };

export type Outcome = { item: string; agent: SpecialistId; kind: string; name: string; group?: string; mark: Mark; at: number };

export type AgentStatus =
  | { state: "idle" }
  | { state: "working"; step: string }
  | { state: "waiting"; reason: string }
  | { state: "done"; last: string };

export type Asked = FounderQuestion & { id: string };

/** The team route's stream. Every specialist's steps carry its id, so each has its own transcript. */
export type TeamEvent =
  | { type: "goals"; goals: Goal[] }
  | { type: "custom"; goal: Goal }
  | { type: "assign"; goal: Goal; team: SpecialistId[]; line: string }
  | { type: "status"; agent: AgentId; status: AgentStatus }
  | { type: "step"; agent: AgentId; event: AgentEvent }
  | { type: "ask"; agent: AgentId; ask: Asked }
  | { type: "work"; agent: SpecialistId; work: Work }
  | { type: "reply"; text: string; agent?: SpecialistId }
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
};

export const emptyTeam = (): TeamState => ({ goals: [], works: {}, outcomes: [] });
