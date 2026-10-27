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
  /** Steps in the plan that run first for the run order alone (§23.5 i): nothing of theirs is used, so re-running one
   *  doesn't re-run this. */
  after?: (SpecialistId | "athena")[];
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

/** One line of a plan step, cited to the subagent whose result it comes from (§23.5 m). `url`: its source, for a date. */
export type PlanLine = { kind: "who" | "where" | "through" | "words" | "when" | "cost"; agent?: SpecialistId; text: string; url?: string };

/** A result a plan step acts on, with the subagent that owns it, so the Executive's mark goes back to that subagent (§23.5 n). */
export type PlanItem = { id: string; kind: string; name: string; agent: SpecialistId; group?: string };

/** One numbered step of Athena's plan (§23.5 m): what to do, for which crowds, and the earlier steps it waits on.
 *  `notes`: where the subagents disagree about this step, one line each, shown on its task (§23.5 q). */
export type PlanStep = { n: number; what: string; crowds: string[]; phase: "shared" | "win_first" | "win_next" | "watch"; lines: PlanLine[]; depends: number[]; items?: PlanItem[]; notes?: string[] };

/** A task's status on the Executive's board (§23.5 n). */
export const TASK_STATUSES = ["todo", "doing", "done", "skipped"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_LABEL: Record<TaskStatus, string> = { todo: "To do", doing: "Doing", done: "Done", skipped: "Skipped" };

/** One tracked task (§23.5 n): from which subagent, the action, what it needs, its status and its outcome mark. */
export type Task = {
  id: string;
  /** The plan step it came from. */
  step: number;
  stepWhat: string;
  phase: PlanStep["phase"];
  crowds: string[];
  agent: SpecialistId | "athena";
  action: string;
  needs: string;
  /** The result it acts on, when there is one: its mark goes back to `agent`. */
  item?: Omit<PlanItem, "agent">;
  status: TaskStatus;
  mark?: Mark;
  /** No longer in Athena's plan (marked No), kept so the board still shows it. */
  left?: boolean;
};

/** What the founder did on the board: a status set by hand, when, and the task as it was, so one that leaves the plan stays. */
export type TaskNote = { status?: TaskStatus; at: number; task?: Task };

/** Athena's growth plan (§23.5 m): numbered steps, shared moves first, then Win first, Win next and Watch; then what's left. */
export type GrowthPlan = {
  headline: string;
  /** Missing on a plan saved before the steps: the view asks for an update. */
  steps?: PlanStep[];
  disagreements: string[];
  open: string[];
  /** The subagents' works it was read from, by when each finished, so a newer run shows the plan as out of date. */
  from: Partial<Record<SpecialistId, number>>;
  at: number;
};

/** What a plan says, as a short hash: the same plan written again after a mark has the same one, whenever it was written. */
export function planSig(p?: GrowthPlan): string {
  if (!p) return "";
  const s = JSON.stringify([p.headline, p.steps ?? [], p.open, p.disagreements]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

/** Where a contact detail came from (§23.5 q): the subagent or Qloo that already had it, a page read, a search, or the founder. */
export type Src = { label: string; url?: string };
export type Field = { value: string; src: Src };

/**
 * One place's, organisation's or person's ways in (§23.5 q), saved once per key and shared by every item that is it: a
 * venue that is a Rep shop and a Promoter host is one contact. Nothing is guessed: each field carries its source, and a
 * field the lookup read for and didn't find is simply absent ("not published").
 */
export type Contact = {
  key: string;
  name: string;
  address?: Field;
  website?: Field;
  phone?: Field;
  email?: Field;
  /** A contact or booking form. */
  form?: Field;
  /** DM links: a profile on Instagram, TikTok, X, YouTube… `ok`: the page Athena's server saw it on (§23.5 r). */
  social?: (Field & { label: string; ok?: Src })[];
  /** Two or more profiles on one site look like theirs (§23.5 r): the founder picks one; the first is the default. */
  ask?: { site: string; options: { url: string; src: Src }[] };
  /** What the lookup read, in order ("Their site's contact page", "A web search"), for the card's method line. */
  checked: string[];
  /** Every page the lookup actually opened, for the row's "pages read" and the page's live count (§23.5 r). */
  pages?: string[];
  /** "you": the founder typed it (Add it yourself); it wins over anything found. */
  by: "found" | "you";
  at: number;
};

/** The ways in a founder gives for an item, as they gave them. */
export type GivenContact = { address?: string; website?: string; phone?: string; email?: string; dm?: string };

/** The call or walk-in script (§23.5 q): opener, why them, the offer, an answer to "send me something", the close. */
export type CallScript = { opener: string; why: string; offer: string; send: string; close: string };

/** An item's three drafts (§23.5 q), from the owning subagent's pitch where there is one. Copied or opened, never sent. */
export type Drafts = { email: { subject: string; body: string }; dm: string; call: CallScript; at: number };

/** A follow-up wait for the items a rule covers, as Athena read the founder's words ("give retailers two weeks"). */
export type WaitScope = { agents?: SpecialistId[]; kinds?: string[]; groups?: string[]; crowds?: string[]; cities?: string[]; names?: string[] };
export type WaitRule = { days: number; scope: WaitScope; text: string; at: number };

/** The Executive's own state (§23.5 q): started or left for later, the contacts and drafts it found, the follow-up waits. */
export type ExecState = {
  /** When the founder started it; until then the dashboard shows Start the Executive. */
  started?: number;
  /** When they said Later. */
  later?: number;
  /** What its lookups found, by contact key. */
  contacts: Record<string, Contact>;
  /** What the founder added themselves (Add it yourself), by contact key; it wins over anything found. */
  yours?: Record<string, Contact>;
  /** By item id. */
  drafts: Record<string, Drafts>;
  /** What the founder logged as spent on an item, for Spend against budget. */
  spend?: Record<string, { usd: number; at: number }>;
  /** The default wait (asked on the first Pitched mark) and the founder's rules for particular cases. */
  wait?: { days?: number; rules: WaitRule[] };
  /** When the founder opened an item's draft in the mail app, so "Did these go out?" asks once (§23.5 r). */
  opened?: Record<string, number>;
  /** What the founder chose for a mid-run question: phone-only shops get call scripts, or walk-in scripts. */
  prefs?: { phoneOnly?: "call" | "walk" };
  /** The mid-run questions already asked, by id, so each asks once. */
  asked?: string[];
  /** Now's steps the founder started before the steps they wait on held ("Start anyway"). */
  early?: number[];
};

/**
 * Athena's one move for a typed message (§23.2 step 8.5n), decided by the model and checked by code: reply, use her
 * tools, edit the Brand Graph, hand to a subagent behind the scenes, change the workflow, or ask a clarifying question.
 * `contacts`: the Executive finds contacts for the items a request covers (§23.5 q). `followup`: the founder set the
 * follow-up wait, or a wait for particular cases.
 */
export type Route =
  | { do: "reply"; reply: string }
  | { do: "tools"; reply?: string }
  | { do: "graph" }
  | { do: "handoff"; to: SpecialistId; task: string; reply: string }
  | { do: "workflow"; change: { skip?: SpecialistId[]; add?: SpecialistId[]; city?: { id: string; name: string } }; reply: string }
  | { do: "clarify"; question: string; options: { label: string }[]; reply?: string }
  | { do: "contacts"; scope: WaitScope & { limit?: number }; reply: string }
  | { do: "followup"; days?: number; rules: Omit<WaitRule, "at">[]; reply: string }
  /** What happened, in the founder's words (§23.5 r): "Emailed Museum of Sex", "they said yes", "spent $200 on the booth". */
  | {
      do: "outcome";
      marks: { item: string; name: string; mark: Mark }[];
      spend?: { item: string; name: string; usd: number }[];
      /** A way to reach an item the founder gave in chat (§23.5 r): it wins over anything found, as one typed would. */
      contacts?: ({ item: string; name: string } & GivenContact)[];
      reply: string;
    };

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
  /** Athena's words in the chat. `run`: the subagent whose step trail goes under it. `asks`: the questions the line
   *  leads into; one answered earlier in the same stream isn't shown, so the line counts only those still to show. */
  | { type: "reply"; text: string; agent?: SpecialistId; run?: SpecialistId; asks?: { agent: SpecialistId; ids: string[] } }
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
  /** The Executive at work (§23.5 q): its narration, and how far through the items it's been asked for. `key`: the
   *  contact it's on; `row`: that contact's short row text ("Reading 3 pages…", "Drafting…") (§23.5 r). */
  | { type: "exec"; line: string; done: number; of: number; key?: string; row?: string }
  /** A contact it found, saved by key; `items`: the rows it fills. */
  | { type: "contact"; contact: Contact; items: string[] }
  | { type: "drafts"; item: string; drafts: Drafts }
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
  /** What the founder set on each task of Execute Plan, by item id (§23.5 n, q). */
  tasks?: Record<string, TaskNote>;
  /** The Executive's contacts, drafts and follow-up waits (§23.5 q). */
  exec?: ExecState;
};

export const emptyTeam = (): TeamState => ({ goals: [], works: {}, outcomes: [] });
