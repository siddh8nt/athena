"use client";

import { useEffect, useRef, useState } from "react";
import type { Asked } from "./Question";
import { WithWithout, type AloneRequest } from "./WithWithout";
import type { AgentEvent } from "@/lib/blocks/types";
import type { Galaxy } from "@/lib/taste/galaxy";
import type { BenchTask } from "@/lib/bench/lines";
import type { AloneStop } from "@/lib/proof/alone";
import { addEvent, lineDetail, lineText, settleRun, type Line } from "@/lib/agent/transcript";
import { ATHENA, EXECUTIVE, isSpecialist, nameOf, panelIds, specialist, type AgentId, type SpecialistId } from "@/lib/agent/specialists";
import { GOALS, pickGoals, teamFor, teamLine } from "@/lib/agent/goals";
import { fromCity, fromWork, type Handoff } from "@/lib/agent/handoffs";
import { resetFrom } from "@/lib/agent/workflow";
import { askLead } from "@/lib/team/inputs";
import { latest, staleRuns, whatsWorking } from "@/lib/agent/outcomes";
import { nodesAdded } from "@/lib/graph/types";
import { MARKS, MARK_LABEL, markLabel, marksFor, planSig, type AgentStatus, type Answer, type Contact, type ExecState, type Goal, type Mark, type Route, type TaskStatus, type TeamEvent, type TeamState, type WaitRule, type Work, type WorkItem } from "@/lib/team/types";
import { contactKey, contactOf, execPlan, execQueue, followDue, inScope, lookupsFor, planView, stageOf, statesOf, taskOf, waitOf, waitingSteps, whose, type ExecItem, type Lookup } from "@/lib/exec/plan";
import { followCard, handleOf, phoneCard, profileCard, sentCard, startCard, waitCard } from "@/lib/exec/asks";
import { pacer } from "@/lib/stream/pace";
import { withHooks, type Line as PageLine } from "@/lib/team/page";
import { CrowdTabs } from "./CrowdTabs";
import { RunProgress, StepTimer, type ProgressStep } from "./Progress";
import { NavIcon, RailToggle, useRail } from "./SideNav";
import { McpConnect } from "./McpConnect";
import type { CrowdCard } from "@/lib/journey/types";
import { salesByCrowd, salesByPlace, spanOf, usd, type Sales } from "@/lib/sales/orders";

// Athena and her six specialists in the journey (PRD §23.2 step 8): the goals on top, the team in the left panel with
// live status, each specialist's workspace (its transcript, its results with their tool calls, the founder's outcome
// marks and a quiet "how we know"), and the one "What's working" overview. The journey holds the team's state; this
// file streams the team route into it.

type Memory = Extract<TeamEvent, { type: "memory" }>;
export type TeamAsk = Asked & { agent: AgentId };

/** What only this visit sees: live statuses, each agent's transcript, replies and questions. The journey keeps the rest. */
export type TeamLive = {
  status: Partial<Record<AgentId, AgentStatus>>;
  lines: Partial<Record<AgentId, Line[]>>;
  replies: Partial<Record<AgentId, string[]>>;
  asks: TeamAsk[];
  answers: Record<string, string>;
  /** The founder's last question to each agent, shown at the top of its workspace. */
  asked: Partial<Record<AgentId, string>>;
  running: number;
  /** Specialists waiting on another's question to the founder, with the one they wait on and the run they're from. */
  held: Partial<Record<SpecialistId, { on: SpecialistId; n: number }>>;
  /** Questions that pause their run until answered, by id. */
  blocking: Record<string, { agent: AgentId; n: number }>;
  /** The Executive finding contacts (§23.5 q): its line, how far through, and the contacts it's on now. `queue`: the
   *  contacts still waiting their turn, in order; `rows`: what it's doing on each one it's on (§23.5 r). */
  exec?: { line: string; done: number; of: number; keys: string[]; queue: string[]; rows: Record<string, string> };
};

/** What the journey shows: one agent's workspace, or the founder's dashboard (§23.2 step 8.4h). */
export type View = AgentId | "dashboard" | typeof EXECUTIVE.id;

const emptyLive = (): TeamLive => ({ status: {}, lines: {}, replies: {}, asks: [], answers: {}, asked: {}, running: 0, held: {}, blocking: {} });

/** What a typed answer changed in the workflow (§23.2 step 8.5h), carried on the re-post that resumes it. */
type Change = { skip?: SpecialistId[]; add?: SpecialistId[]; city?: { id: string; name: string } };

/** Streams the team route; each event lands in the journey's team state or this visit's live view. */
export function useTeam(p: {
  team: TeamState;
  setTeam: (f: (t: TeamState) => TeamState) => void;
  /** The Brand Graph and the journey's runs, as the route reads them. */
  body: () => Record<string, unknown>;
  graphRev: number;
  onMemory: (m: Memory) => void;
  /** The Taste Galaxy as it forms while the Analyst measures (§23.2 step 8.1b). */
  onGalaxy?: (g: Galaxy) => void;
  /** Athena says it in the chat; `run` puts that subagent's live step trail under the line. */
  say: (text: string, run?: SpecialistId, handoff?: boolean) => void;
  /** Athena's reply as it streams in (§23.2 step 8.5n); her reply event replaces it. */
  stream?: (delta: string) => void;
  /** The router sent the message to the Brand Graph's reader. */
  onGraph?: (message: string) => void;
}) {
  const [live, setLive] = useState<TeamLive>(emptyLive);
  const [active, setActive] = useState<View>("athena");
  // The panel follows the subagent started last (§23.2 step 8.5i), until the founder picks a tab themselves.
  const [follow, setFollow] = useState(true);
  const followRef = useRef(true);
  followRef.current = follow;
  const lastStarted = useRef<AgentId>("athena");
  const latestTeam = useRef(p.team);
  latestTeam.current = p.team;
  // Seen at once by a post that follows, before React applies the update.
  const setTeam = (f: (t: TeamState) => TeamState) => {
    latestTeam.current = f(latestTeam.current);
    p.setTeam(f);
  };
  const run = useRef(0);
  const custom = useRef("");
  // An agent's questions come before its results: a run that asks pauses, and once the founder has answered every
  // question from it, the work carries on with the answers.
  const open = useRef(new Map<string, { agent: AgentId; n: number }>());
  const runs = useRef(new Map<number, Record<string, unknown> & { action: string }>());
  // Streams still open, and the workflow runs to resume as soon as theirs ends.
  const streaming = useRef(new Set<number>());
  const resumeAfter = useRef(new Set<number>());
  // A re-plan asked for while the workflow is already running waits for it, with what it was asked with.
  const queued = useRef<Record<string, unknown> | undefined>(undefined);
  const change = useRef<Change>({});
  const liveRef = useRef(live);
  liveRef.current = live;

  const bring = (id: AgentId) => {
    lastStarted.current = id;
    if (followRef.current) setActive(id);
  };
  /** An input the founder has already answered: a stream that started before the answer may still ask it. */
  const given = (id: string) => id.startsWith("input_") && !!latestTeam.current.answered?.some((x) => x.id === id);
  /** The workflow is running: a "plan" stream is still open. */
  const planning = () => [...streaming.current].some((m) => runs.current.get(m)?.action === "plan");
  /** A question from this run still waits on the founder. */
  const asking = (n: number) => [...open.current.values()].some((x) => x.n === n);

  const handle = (e: TeamEvent, n: number) => {
    if (e.type === "goals") p.setTeam((t) => ({ ...t, proposed: e.goals }));
    else if (e.type === "custom") start([e.goal]);
    else if (e.type === "assign") line("athena", { t: 0, tool: "assign", why: `${e.goal.label}: ${e.line || "Athena takes it herself."}`, status: "ok", callIds: [], summary: "" }, n);
    else if (e.type === "status") setLive((l) => ({ ...l, status: { ...l.status, [e.agent]: e.status } }));
    else if (e.type === "step") line(e.agent, e.event, n);
    else if (e.type === "workflow") setTeam((t) => ({ ...t, workflow: e.workflow }));
    else if (e.type === "known") setTeam((t) => ({ ...t, answered: [...(t.answered ?? []).filter((x) => x.id !== e.answer.id), e.answer].slice(-24) }));
    else if (e.type === "plan") {
      setTeam((t) => ({ ...t, plan: e.plan }));
      // The Executive turns her plan into the founder's; Athena asks once before it starts (§23.5 r), and after that
      // new items run by themselves. A quiet re-plan after a mark changes no items, so it asks nothing.
      if (!runs.current.get(n)?.resynth) askExec();
    }
    else if (e.type === "delta") p.stream?.(e.text);
    else if (e.type === "route") route(e.route, n);
    else if (e.type === "ask" && e.ask.id === "clarify") {
      // Athena's clarifying question pauses nothing: the message waits for it, the team's work carries on.
      const id = `clarify-r${n}`;
      setActive("athena");
      setLive((l) => ({ ...l, asks: [...l.asks.filter((a) => !a.id.startsWith("clarify-")), { ...e.ask, id, agent: "athena" }], answers: omit(l.answers, id) }));
    } else if (e.type === "ask" && e.ask.id === "goals") {
      // The goals question is Athena's opening question: she proposes, in the chat.
      setLive((l) => ({ ...l, asks: [...l.asks.filter((a) => a.id !== "goals"), { ...e.ask, agent: "athena" }], answers: omit(l.answers, "goals") }));
    } else if (e.type === "ask") {
      // Each run numbers its questions from one, so the run's own number keeps them apart: a later run's first question
      // never hides, or shares a Skip with, an earlier one still showing. An input (budget, regions) is one question
      // whichever run asks it.
      const id = e.ask.id === "custom" || e.ask.id.startsWith("input_") ? e.ask.id : `${e.ask.id}-r${n}`;
      // An input answered earlier in this same stream (the Rep's budget, then the Promoter's) isn't asked again: the
      // stream started before the answer, and the resume after it carries the answer.
      if (given(id)) return;
      if (id !== "custom") {
        open.current.set(id, { agent: e.agent, n });
        setLive((l) => ({ ...l, blocking: { ...l.blocking, [id]: { agent: e.agent, n } } }));
        // A question brings its subagent's tab forward, following or not.
        setActive(e.agent);
      }
      setLive((l) => ({ ...l, asks: [...l.asks.filter((a) => a.id !== id), { ...e.ask, id, agent: e.agent }], answers: omit(l.answers, id) }));
    }
    else if (e.type === "held") {
      const h = e;
      setLive((l) => ({ ...l, held: { ...l.held, [h.agent]: { on: h.on, n } } }));
    } else if (e.type === "work") {
      p.setTeam((t) => ({
        ...t,
        previous: { ...t.previous, ...(t.works[e.agent] ? { [e.agent]: t.works[e.agent] } : {}) },
        works: { ...t.works, [e.agent]: e.work },
        rev: { ...t.rev, [e.agent]: p.graphRev },
      }));
    }
    else if (e.type === "reply") {
      // A line leading into questions counts only those still to show: none left, and it isn't said.
      const left = e.asks?.ids.filter((id) => !given(id));
      if (left && !left.length) return;
      const text = e.asks && left ? askLead(nameOf(e.asks.agent), left.length) : e.text;
      const who: AgentId = e.agent ?? "athena";
      setLive((l) => ({ ...l, replies: { ...l.replies, [who]: [...(l.replies[who] ?? []), text].slice(-6) } }));
      // Only Athena speaks in the chat (§23.2 step 8.5k): a handoff she narrates carries the subagent's step trail,
      // and a subagent's answer comes into the thread as hers, with its trail under it.
      const trail = e.run ?? (isSpecialist(who) ? who : undefined);
      if (e.run) bring(e.run);
      p.say(text, trail, !!e.run);
    } else if (e.type === "memory") p.onMemory(e);
    else if (e.type === "galaxy") p.onGalaxy?.(e.galaxy);
    else if (e.type === "exec") execLine(e, n);
    // A second look keeps what the first found: its new fields win, and nothing found before is lost.
    else if (e.type === "contact") {
      setExec((x) => {
        const was = x.contacts[e.contact.key];
        const c = was ? { ...was, ...e.contact, checked: [...new Set([...was.checked, ...e.contact.checked])], social: [...(e.contact.social ?? []), ...(was.social ?? []).filter((s) => !e.contact.social?.some((n) => n.label === s.label))] } : e.contact;
        return { ...x, contacts: { ...x.contacts, [e.contact.key]: c } };
      });
      askProfile(e.contact);
    }
    else if (e.type === "drafts") setExec((x) => ({ ...x, drafts: { ...x.drafts, [e.item]: e.drafts } }));
  };
  const line = (agent: AgentId, ev: AgentEvent, n: number) => setLive((l) => ({ ...l, lines: { ...l.lines, [agent]: addEvent(l.lines[agent] ?? [], ev, n).slice(-60) } }));

  /** One call to the team route. A dropped stream settles quietly: running lines go, the last results stay. */
  const post = async (action: string, extra: Record<string, unknown> = {}) => {
    const n = ++run.current;
    runs.current.set(n, { ...extra, action });
    streaming.current.add(n);
    // The Executive's lookups run beside the team's work: they don't count as running, so nothing waits on them.
    const team = action !== "exec";
    if (team) setLive((l) => ({ ...l, running: l.running + 1 }));
    const body = p.body();
    // The founder's answers in the journey (the growth question), to the workflow's questions, and to the team's own
    // questions this visit, read as facts. The latest answer to a question stands.
    const given = Array.isArray(body.answers) ? (body.answers as { question: string; answer: string }[]) : [];
    const now = liveRef.current;
    // A skipped question counts as its recommended option, so the agent doesn't ask it again.
    const facts = now.asks.filter((a) => a.id in now.answers && !/^(goals|custom|exec)/.test(a.id));
    const all = [...given, ...(latestTeam.current.answered ?? []), ...facts.filter((a) => now.answers[a.id] || a.assumed).map((a) => ({ question: a.question, answer: now.answers[a.id] || a.assumed }))];
    const byQ = new Map(all.map((a) => [a.question, { question: a.question, answer: a.answer }]));
    const asked = [...byQ.values()].slice(-16);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, action, team: latestTeam.current, planSig: planSig(latestTeam.current.plan), graphRev: p.graphRev, answers: asked, ...extra }),
        signal: AbortSignal.timeout(480_000),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      const pace = pacer();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        buf += done ? dec.decode() : dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data:")) continue;
          const e = JSON.parse(part.slice(5)) as TeamEvent;
          await pace(e);
          handle(e, n);
        }
        if (done) break;
      }
    } catch {
      // Past the time limit or offline: what the team found so far stays up.
    } finally {
      streaming.current.delete(n);
      if (team)
        setLive((l) => ({
          ...l,
          running: Math.max(0, l.running - 1),
          lines: Object.fromEntries(Object.entries(l.lines).map(([k, v]) => [k, settleRun(v ?? [], n)])),
          // Anyone still marked working when the stream ends is settled from what they last returned.
          status: Object.fromEntries(Object.entries(l.status).map(([k, s]) => [k, s?.state === "working" ? settled(k as AgentId, latestTeam.current) : s])),
        }));
      // Answered while the workflow was still running its other steps: it resumes now, from where it stands. Events
      // land paced, so a question the stream asked after that answer may still be open: its answer resumes it then.
      // A re-plan asked for while the workflow ran goes now, once.
      const resume = resumeAfter.current.delete(n);
      if (resume ? !asking(n) : queued.current) replan();
      // Once started, what a run added to the pages is looked up with no button press (§23.5 r).
      if (team && latestTeam.current.exec?.started) void autoRun();
    }
  };

  /** The goals the workflow was planned for, as the route reads them. */
  const workflowGoals = (): Goal[] => {
    const t = latestTeam.current;
    const ids = t.workflow?.goals ?? [];
    return t.goals.filter((g) => ids.includes(g.id));
  };
  /** The workflow carries on (§23.2 step 8.5f): done steps stay done, the rest run, the plan comes last. */
  const replan = (asked: Record<string, unknown> = {}) => {
    const goals = workflowGoals();
    if (!goals.length) return;
    // One workflow stream at a time: a second would run the same steps beside the first and save their work twice,
    // the later save landing after the plan. It waits for the running one; the change it carries waits with it.
    const was = queued.current;
    const extra = was ? { ...was, ...asked, ...(was.resynth && asked.resynth ? {} : { resynth: false }) } : asked;
    if (planning()) return void (queued.current = extra);
    queued.current = undefined;
    const c = change.current;
    change.current = {};
    // A quiet re-plan after a mark leaves the founder where they are.
    if (!extra.resynth) setFollow(true);
    void post("plan", {
      goals,
      ...(c.skip?.length || c.add?.length ? { change: { skip: c.skip ?? [], add: c.add ?? [] } } : {}),
      ...(c.city ? { focus: { city: c.city.id } } : {}),
      ...extra,
    });
  };

  /** A handoff (§23.2 step 8.3b): a subagent not yet in the workflow joins it; one already in runs on what it came from. */
  const handoff = (h: Handoff) => {
    const w = latestTeam.current.workflow;
    if (w && !w.steps.some((s) => s.id === h.to)) return addToPlan(h.to, h.focus);
    setFollow(true);
    setActive(h.to);
    const g: Goal = { id: `handoff_${h.to}`, label: h.label, why: "Handed on from a result", team: [h.to], conflicts: [] };
    p.setTeam((t) => ({ ...t, goals: [...t.goals.filter((x) => x.id !== g.id), g].slice(-5) }));
    void post("run", { goals: [g], focus: h.focus });
  };
  /** A subagent the goals didn't need, added to the workflow from its tile (§23.2 step 8.5d) or a handoff. */
  const addToPlan = (id: SpecialistId, focus?: Handoff["focus"]) => {
    change.current = { ...change.current, add: [...(change.current.add ?? []), id] };
    replan(focus ? { focus } : {});
  };

  /** The picked goals go to Athena, who plans the workflow and runs it (§23.2 step 8.5e). */
  const start = (goals: Goal[]) => {
    if (!goals.length) return;
    const fresh = goals.filter((g) => g.team.length);
    for (const g of goals.filter((x) => x.outside)) p.say(g.team.length ? `I've put the ${teamLine(g.team).replace(/^With the /, "").replace(/\.$/, "")} on the part we can do. ${g.outside}` : `${g.outside} Here's what the team can do meanwhile.`);
    if (!fresh.length) return void propose();
    setTeam((t) => ({ ...t, goals: [...t.goals.filter((x) => !fresh.some((g) => g.id === x.id)), ...fresh].slice(-5) }));
    setFollow(true);
    void post("plan", { goals: fresh });
  };
  const propose = () => post("propose");

  /** A typed answer, read against its question (§23.2 step 8.5h): an option, the founder's own fact, a workflow change. */
  const read = async (q: TeamAsk, text: string): Promise<{ option?: string; fact?: string; change?: Change; line?: string }> => {
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p.body(), action: "interpret", text, question: { question: q.question, options: q.options.map((o) => ({ label: o.label })) }, team: latestTeam.current }),
        signal: AbortSignal.timeout(20_000),
      });
      return (await res.json()) as { option?: string; fact?: string; change?: Change; line?: string };
    } catch {
      return { fact: text };
    }
  };
  const isOption = (q: TeamAsk, a: string) => !a || q.options.some((o) => o.label === a) || (q.multi && a.split(", ").every((x) => q.options.some((o) => o.label === x)));
  /** Kept on the journey, editable on the dashboard ("Your answers"). */
  const keep = (q: TeamAsk, a: string) =>
    setTeam((t) => ({ ...t, answered: [...(t.answered ?? []).filter((x) => x.id !== q.id), { id: q.id, agent: q.agent, question: q.question, answer: a || q.assumed }].slice(-24) }));

  /** The founder answered a question from the team: the goals, a custom goal's closest missions, or a founder-only fact. */
  const answer = async (q: TeamAsk, a: string) => {
    if (q.id.startsWith("clarify-")) {
      // The message goes back to the router with what they meant.
      setLive((l) => ({ ...l, answers: { ...l.answers, [q.id]: a || q.assumed } }));
      const was = runs.current.get(Number(q.id.slice("clarify-r".length)));
      return void post("chat", { ...was, text: `${String(was?.text ?? "")} (Asked "${q.question}", they meant: ${a || q.assumed})`.slice(0, 600) });
    }
    if (q.id === "exec" || q.id.startsWith("exec-")) return execAnswer(q, a);
    // Seen at once by a run started below, before React applies the update.
    liveRef.current = { ...liveRef.current, answers: { ...liveRef.current.answers, [q.id]: a } };
    setLive((l) => ({ ...l, answers: { ...l.answers, [q.id]: a } }));
    const o = open.current.get(q.id);
    if (o) {
      open.current.delete(q.id);
      setLive((l) => ({ ...l, blocking: omitKey(l.blocking, q.id) }));
      let said = a;
      if (!isOption(q, a)) {
        const r = await read(q, a);
        said = r.option ?? r.fact ?? a;
        if (r.change) change.current = { skip: [...(change.current.skip ?? []), ...(r.change.skip ?? [])], add: [...(change.current.add ?? []), ...(r.change.add ?? [])], ...(r.change.city ? { city: r.change.city } : change.current.city ? { city: change.current.city } : {}) };
        if (r.line) p.say(r.line);
        liveRef.current = { ...liveRef.current, answers: { ...liveRef.current.answers, [q.id]: said } };
        setLive((l) => ({ ...l, answers: { ...l.answers, [q.id]: said } }));
      }
      keep(q, said);
      // The work carries on once every question it asked is answered.
      if ([...open.current.values()].some((x) => x.n === o.n)) return;
      const before = runs.current.get(o.n) ?? { action: "run" };
      if (before.action === "plan") {
        setActive(o.agent);
        if (streaming.current.has(o.n)) return void resumeAfter.current.add(o.n);
        return replan();
      }
      // Outside the workflow (a handoff, a question to a subagent): whoever asked, and whoever waited on them, run
      // again on the same goals with the answers.
      const asked = new Set(liveRef.current.asks.filter((x) => x.id.endsWith(`-r${o.n}`)).map((x) => x.agent));
      const waited = Object.entries(liveRef.current.held).filter(([, h]) => h?.n === o.n).map(([id]) => id as SpecialistId);
      const who = new Set<AgentId>([...asked, ...waited]);
      const goals = ((before.goals as Goal[] | undefined) ?? []).map((g) => ({ ...g, team: g.team.filter((x) => who.has(x)) })).filter((g) => g.team.length);
      setActive(o.agent);
      setLive((l) => ({
        ...l,
        held: Object.fromEntries(Object.entries(l.held).filter(([, h]) => h?.n !== o.n)),
        status: { ...l.status, ...Object.fromEntries([...who].map((id) => [id, { state: "working", step: "Working from your answers" }])) },
      }));
      const { action: _a, ...rest } = before;
      return void post("run", { ...rest, goals: goals.length ? goals : [{ id: `answered_${o.agent}`, label: "Your answers", why: "With your answers", team: [o.agent], conflicts: [] }] });
    }
    const proposed = latestTeam.current.proposed ?? [];
    if (q.id === "goals") {
      const picked = a ? pickGoals(proposed, a) : proposed.slice(0, 1);
      if (picked.length) return start(picked);
      custom.current = a;
      return void post("custom", { text: a });
    }
    if (q.id === "custom") {
      // Skip takes the closest mission the question recommended, so the goal still starts.
      const close = pickGoals(GOALS as Goal[], a || q.assumed);
      const text = custom.current;
      if (!close.length || !text) return;
      return start([{ id: `custom_${close.map((g) => g.id).join("_")}`, label: text.slice(0, 80), why: "In your words", team: teamFor(close), conflicts: [], custom: true }]);
    }
  };

  /**
   * An answer changed on the dashboard (§23.2 step 8.5g): only the step it affects runs again, with what depends on
   * it, then the plan. The steps it doesn't touch keep their results.
   */
  const editAnswer = (ans: Answer, a: string) => {
    setTeam((t) => ({ ...t, answered: (t.answered ?? []).map((x) => (x.id === ans.id ? { id: x.id, agent: x.agent, question: x.question, answer: a || x.answer } : x)) }));
    const w = latestTeam.current.workflow;
    if (!w) return;
    const hit = w.steps.filter((s) => s.inputs.includes(ans.id) || s.id === ans.agent).map((s) => s.id);
    if (!hit.length) return;
    setTeam((t) => ({ ...t, workflow: t.workflow && resetFrom(t.workflow, hit) }));
    p.say(`Thanks. ${hit.length > 1 ? "The steps" : `The ${nameOf(hit[0])}`} that read it ${hit.length > 1 ? "run" : "runs"} again, then I'll update your plan.`);
    replan();
  };

  /** The router's move, carried out here (§23.2 step 8.5n). Athena says the line; the subagent works behind her. */
  const route = (r: Route, n: number) => {
    const message = String(runs.current.get(n)?.text ?? "");
    if (r.do === "graph") return p.onGraph?.(message);
    if (r.do === "handoff") {
      p.say(r.reply, r.to);
      return askSpecialist(r.to, r.task);
    }
    if (r.do === "workflow") {
      change.current = { skip: [...(change.current.skip ?? []), ...(r.change.skip ?? [])], add: [...(change.current.add ?? []), ...(r.change.add ?? [])], ...(r.change.city ? { city: r.change.city } : change.current.city ? { city: change.current.city } : {}) };
      p.say(r.reply);
      // Before the workflow starts, the change waits for it; once it has, the plan runs again with it.
      if (latestTeam.current.workflow) replan();
    }
    if (r.do === "contacts") {
      // The items the founder's words cover, top-ranked first, looked up a few at a time (§23.5 q).
      const t = latestTeam.current;
      const its = execPlan(t).items.filter((i) => i.outreach && !i.left && inScope(r.scope, i)).sort((a, b) => a.rank - b.rank).slice(0, r.scope.limit ?? 12);
      if (!its.length) return p.say("Nothing on Execute Plan matches that yet, so there's nothing to look up. Once the team lists some, ask again.");
      const groups = lookupsFor(its, t.exec);
      if (!groups.length) return p.say(its.length > 1 ? "Those items already have their contacts on Execute Plan." : "That item already has its contact on Execute Plan.");
      p.say(r.reply);
      return void runLookups(groups);
    }
    if (r.do === "followup") {
      setWait(r.days, r.rules);
      p.say(r.reply);
    }
    if (r.do === "outcome") {
      // What the founder says happened moves the items and logs the spend (§23.5 r), as a mark on its row would.
      const plan = execPlan(latestTeam.current);
      for (const m of r.marks) {
        const it = plan.byId.get(m.item);
        if (it) markItem(it, m.mark);
      }
      for (const s of r.spend ?? []) logSpend(s.item, (latestTeam.current.exec?.spend?.[s.item]?.usd ?? 0) + s.usd);
      for (const c of r.contacts ?? []) {
        const it = plan.byId.get(c.item);
        if (it) addContact(it, c);
      }
      p.say(r.reply);
    }
  };
  /** A typed message to Athena: the router decides what to do with it. */
  const chat = (text: string, ctx: { page: AgentId | "dashboard"; history: { who: string; text: string }[] }) => {
    const open = liveRef.current.asks.filter((a) => !(a.id in liveRef.current.answers)).map((a) => a.question);
    // The plan as its rows stand, so "emailed Amorino Gelato" names a row: the server keeps no pages of its own.
    const view = planView(latestTeam.current, Date.now(), liveRef.current.exec);
    return post("chat", { text, ...ctx, open, ...(view ? { planView: view } : {}) });
  };

  const askAthena = (text: string) => {
    setActive("athena");
    return post("ask", { text });
  };
  /** A question from a specialist's workspace or "Ask Athena about this" (§23.2 step 8i). */
  const askSpecialist = (id: SpecialistId, text: string, about?: { id: string; name: string }) => {
    setActive(id);
    setLive((l) => ({ ...l, replies: { ...l.replies, [id]: [] }, asked: { ...l.asked, [id]: text } }));
    if (id === "analyst") return void post("analyst", { text, ...(about ? { asked: about } : {}) });
    void post("run", { goals: [{ id: "ask", label: text.slice(0, 160), why: `You asked the ${nameOf(id)}`, team: [id], conflicts: [] }] });
  };
  /** Bring stale specialists up to date: the workflow resumes, and the stale steps run again with what reads them. */
  const refresh = () => (latestTeam.current.workflow ? replan() : void post("run", { goals: latestTeam.current.goals }));

  /** The Scout's hooks for one crowd, rewritten in place by a tone button (§23.5 d2); kept on its page. */
  const hooks = (crowdId: string, lines: PageLine[]) =>
    p.setTeam((t) => {
      const w = t.works.scout;
      return w?.page ? { ...t, works: { ...t.works, scout: { ...w, page: withHooks(w.page, crowdId, lines) } } } : t;
    });
  // A mark changes Athena's plan (§23.5 m): once the marks settle and nothing is running, she writes it again from
  // the same results, with no new research.
  const resynth = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mark = (agent: SpecialistId, item: WorkItem, m: Mark) => {
    const before = waiting();
    setTeam((t) => ({ ...t, outcomes: [...t.outcomes, { item: item.id, agent, kind: item.kind, name: item.name, ...(item.group ? { group: item.group } : {}), mark: m, at: Date.now() }].slice(-300) }));
    // The first pitch asks how long to wait for a reply before the plan brings it up again (§23.5 q).
    if (m === "pitched" && !latestTeam.current.exec?.wait && !liveRef.current.asks.some((a) => a.id === "exec-wait"))
      athenaAsk(waitCard);
    announce(before);
    if (!latestTeam.current.plan) return;
    clearTimeout(resynth.current);
    const again = () => (liveRef.current.running ? (resynth.current = setTimeout(again, 3000)) : replan({ resynth: true }));
    resynth.current = setTimeout(again, 2500);
  };

  /** Athena's plan written again from the same results, nothing re-run (as after a mark): a plan saved before its steps named their results. */
  const rewritePlan = () => replan({ resynth: true });
  /** The founder brought back an item the brand-fit check left out (§23.6 n): it's on Execute Plan at once, and
   *  Athena writes her plan again with it, as after a mark. */
  const bringBack = (id: string) => {
    setExec((x) => ({ ...x, kept: [...new Set([...(x.kept ?? []), id])].slice(-500) }));
    clearTimeout(resynth.current);
    const again = () => (liveRef.current.running ? (resynth.current = setTimeout(again, 3000)) : replan({ resynth: true }));
    resynth.current = setTimeout(again, 1500);
  };
  // ---- Execute Plan (§23.5 q)

  const setExec = (f: (x: ExecState) => ExecState) => setTeam((t) => ({ ...t, exec: f(t.exec ?? { contacts: {}, drafts: {} }) }));
  /** Athena's own question, in the tray with the rest; asked again, it replaces the one before, and an unanswered one
   *  whose id starts with `replace` goes too. */
  const athenaAsk = (q: Omit<TeamAsk, "agent">, replace = q.id) =>
    setLive((l) => ({ ...l, asks: [...l.asks.filter((a) => a.id !== q.id && !(a.id.startsWith(replace) && !(a.id in l.answers))), { ...q, agent: "athena" }], answers: omit(l.answers, q.id) }));
  /** A mid-run question asks once, kept with the plan so a reload doesn't ask it again. */
  const askedOnce = (id: string) => {
    if (latestTeam.current.exec?.asked?.includes(id)) return false;
    setExec((x) => ({ ...x, asked: [...(x.asked ?? []), id].slice(-300) }));
    return true;
  };

  /** Once Athena's plan is in, the one question that waits on the founder: start the Executive now, or later (§23.5 r).
   *  Once started, new items run by themselves. */
  const askExec = (resumed = false) => {
    const t = latestTeam.current;
    if (t.exec?.started) return void autoRun(false, resumed);
    const k = execPlan(t).items.filter((i) => i.outreach && !i.left).length;
    if (!k || t.exec?.later) return;
    athenaAsk(startCard(k));
  };

  /** The founder's answer to the Executive's questions: Start or Later, the follow-up wait, and the mid-run ones. */
  const execAnswer = async (q: TeamAsk, a: string) => {
    liveRef.current = { ...liveRef.current, answers: { ...liveRef.current.answers, [q.id]: a } };
    setLive((l) => ({ ...l, answers: { ...l.answers, [q.id]: a } }));
    const said = a || q.assumed;
    const pick = async (fallback: string) => (isOption(q, said) ? said : ((await read(q, said)).option ?? fallback));
    if (q.id === "exec-wait") {
      if (said === "1 week") return setWait(7, []);
      setExec((x) => ({ ...x, wait: x.wait ?? { rules: [] } }));
      if (said === "Choose") return p.say("How long should I wait before bringing up a pitch with no reply? You can also give a rule for some items, like “give retailers two weeks”.");
      return void chat(`For the follow-up wait: ${said}`, { page: "dashboard", history: [] });
    }
    if (q.id.startsWith("exec-profile:")) return pickProfile(q.id.slice("exec-profile:".length), await pick(q.assumed));
    if (q.id === "exec-phone") {
      const walk = (await pick(q.assumed)) === "Walk in instead";
      setExec((x) => ({ ...x, prefs: { ...x.prefs, phoneOnly: walk ? "walk" : "call" } }));
      return p.say(walk ? "Their rows show the address first, with the same script for a visit." : "Their rows show the number first, with a call script.");
    }
    if (q.id.startsWith("exec-sent-")) return sentAnswer(q, said);
    if (q.id.startsWith("exec-follow-")) return followAnswer(q, await pick(q.assumed));
    if ((await pick("Later")) === "Start now") return void startExec();
    setExec((x) => ({ ...x, later: Date.now() }));
    p.say("Fine. Start waits on the Executive page whenever you're ready.");
  };

  /** The founder started the Executive, from Athena's question or the Executive page: everything runs from here. */
  const startExec = async () => {
    setExec((x) => ({ ...x, started: x.started ?? Date.now(), later: undefined }));
    // Started from the page with the question still up: the question goes.
    setLive((l) => ({ ...l, asks: l.asks.filter((a) => a.id !== "exec" || a.id in l.answers) }));
    await autoRun(true);
  };

  // One automatic run at a time; anything added meanwhile is looked up once it's through.
  const autoRunning = useRef(false);
  const autoAgain = useRef(false);
  /** After Start, every item not yet looked up is, with no button press (§23.5 r): Now first, then each subagent's
   *  items, a few at a time. `resumed`: a journey reloaded mid-run, so what's left isn't new. */
  const autoRun = async (first = false, resumed = false): Promise<void> => {
    if (autoRunning.current) return void (autoAgain.current = true);
    autoRunning.current = true;
    let ran = 0;
    try {
      for (;;) {
        autoAgain.current = false;
        const t = latestTeam.current;
        const groups = execQueue(execPlan(t), t.exec);
        const k = groups.reduce((s, g) => s + g.length, 0);
        if (!k) break;
        p.say(
          first && !ran
            ? `The Executive is on it: ${k} contact${k === 1 ? "" : "s"} to find, Now first, then each subagent's items, a few at a time. Rows fill in live on the Executive page. Nothing is sent: you send each draft yourself.`
            : resumed && !ran
              ? `The Executive is picking up where it left off: ${k} item${k === 1 ? "" : "s"} still to look up.`
              : `The Executive is looking up the ${k} new item${k === 1 ? "" : "s"} on the plan.`,
        );
        await runLookups(groups);
        ran += k;
        // Something added while it ran: once more for that, and only that.
        if (!autoAgain.current) break;
      }
    } finally {
      autoRunning.current = false;
    }
    if (!ran) return first ? p.say("Execute Plan is up to date: every item has its contact and drafts.") : undefined;
    const now = latestTeam.current;
    const st = statesOf(now);
    const stages = execPlan(now)
      .items.filter((i) => i.outreach && !i.left)
      .map((i) => stageOf(i, st(i.id), now.exec, Date.now()));
    const ready = stages.filter((s) => s === "ready").length;
    const needs = stages.filter((s) => s === "needs").length;
    p.say(
      `${first || resumed ? "Execute Plan is ready" : "That's looked up"}: ${ready} item${ready === 1 ? " has" : "s have"} drafts to send${needs ? `, and ${needs} ${needs === 1 ? "is" : "are"} under Needs a contact. If you have one for any of them, tell me` : ""}.`,
    );
    askFollow();
  };

  /** Two profiles on one site look like theirs: the first is on the row, and the founder can pick another (§23.5 r). */
  const askProfile = (c: Contact) => {
    if (!c.ask || c.ask.options.length < 2 || !askedOnce(`exec-profile:${c.key}`)) return;
    athenaAsk(profileCard(c));
  };
  const pickProfile = (key: string, label: string) =>
    setExec((x) => {
      const c = x.contacts[key];
      const o = c?.ask?.options.find((v) => handleOf(v.url) === label) ?? c?.ask?.options[0];
      if (!c?.ask || !o) return x;
      const site = c.ask.site;
      const { ask: _a, ...rest } = c;
      return { ...x, contacts: { ...x.contacts, [key]: { ...rest, social: [{ label: site, value: o.url, src: o.src, ok: o.src }, ...(c.social ?? []).filter((s) => s.label !== site)] } } };
    });

  /** Several places give only a phone: call scripts, or a visit (§23.5 r). Asked once, with call scripts the default. */
  const askPhone = () => {
    const t = latestTeam.current;
    if (t.exec?.prefs?.phoneOnly || t.exec?.asked?.includes("exec-phone")) return;
    const only = new Map<string, ExecItem>();
    for (const i of execPlan(t).items) {
      const c = i.outreach && !i.left ? contactOf(i, t.exec) : undefined;
      if (c?.phone && !c.email && !c.form && !c.social.length) only.set(c.key, i);
    }
    if (only.size < 2 || !askedOnce("exec-phone")) return;
    athenaAsk(phoneCard([...only.values()]));
  };

  /** After drafts were opened in the mail or DM app, "Did these go out?", each one ticked (§23.5 r). */
  const askSent = () => {
    const t = latestTeam.current;
    const plan = execPlan(t);
    const st = statesOf(t);
    const its = Object.entries(t.exec?.opened ?? {})
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => plan.byId.get(id))
      .filter((it): it is ExecItem => !!it && !st(it.id).mark);
    const q = sentCard(its);
    const l = liveRef.current;
    if (!q || l.asks.some((a) => a.id === q.id && !(a.id in l.answers))) return;
    athenaAsk(q, "exec-sent-");
  };
  const sentAnswer = (q: TeamAsk, said: string) => {
    const plan = execPlan(latestTeam.current);
    const asked = q.id.slice("exec-sent-".length).split("|").map((id) => plan.byId.get(id)).filter((it): it is ExecItem => !!it);
    const went = asked.filter((it) => said === "All of them" || `, ${said}, `.includes(`, ${it.name}, `));
    for (const it of went) markItem(it, "pitched");
    setExec((x) => ({ ...x, opened: Object.fromEntries(Object.entries(x.opened ?? {}).filter(([id]) => !asked.some((it) => it.id === id))) }));
    if (went.length) p.say(`${went.length === 1 ? `${went[0].name} is` : `${went.length} items are`} marked sent.`);
  };

  /** Pitches past their wait: their follow-ups are drafted on their rows, and Athena asks once per wait (§23.5 r). */
  const askFollow = () => {
    const t = latestTeam.current;
    const st = statesOf(t);
    const now = Date.now();
    const seen = (i: ExecItem) => `exec-follow:${i.id}:${waitOf(i, t.exec).days}`;
    const due = execPlan(t).items.filter((i) => i.outreach && !i.left && followDue(i, st(i.id), t.exec, now) && !t.exec?.asked?.includes(seen(i)));
    if (!due.length) return;
    setExec((x) => ({ ...x, asked: [...(x.asked ?? []), ...due.map(seen)].slice(-300) }));
    athenaAsk(followCard(due, Math.max(...due.map((i) => waitOf(i, t.exec).days))), "exec-follow-");
  };
  const followAnswer = (q: TeamAsk, said: string) => {
    const t = latestTeam.current;
    const plan = execPlan(t);
    const its = q.id.slice("exec-follow-".length).split("|").map((id) => plan.byId.get(id)).filter((it): it is ExecItem => !!it);
    if (said === "Wait another week") {
      if (!its.length) return;
      const days = Math.max(...its.map((i) => waitOf(i, t.exec).days)) + 7;
      setWait(undefined, [{ days, scope: { names: its.map((i) => i.name) }, text: `${its.length === 1 ? its[0].name : `${its.length} pitches`}: another week` }]);
      return p.say("I'll bring them up again in a week.");
    }
    setActive(EXECUTIVE.id);
    p.say(its.length === 1 ? `${whose(its[0].name)} follow-up is on its row, ready to copy.` : "The follow-ups are on the Executive page, each drafted on its row.");
  };

  // Back from the mail or DM app: anything opened and not marked asks "Did these go out?".
  useEffect(() => {
    const back = () => {
      if (document.visibilityState === "visible") setTimeout(askSent, 800);
    };
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);
    return () => {
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", back);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One request's lookups at a time, in the order asked: a later request starts once the one before is through.
  const lookups = useRef<Promise<unknown>>(Promise.resolve());
  /** The Executive finds contacts one small group at a time (§23.5 q): never in bulk, and nothing it has saved twice. */
  const runLookups = (groups: Lookup[][]): Promise<void> => {
    const total = groups.reduce((s, g) => s + g.length, 0);
    const go = async () => {
      if (!total) return;
      const all = groups.flat().map((l) => l.key);
      setLive((l) => ({
        ...l,
        exec: { line: total === 1 ? `Finding contacts for ${groups[0][0].name}` : `Finding contacts: 0 of ${total}`, done: 0, of: total, keys: [], queue: [...new Set([...(l.exec?.queue ?? []), ...all])], rows: l.exec?.rows ?? {} },
      }));
      // A group's contacts leave the line once it's through, found or already saved, even if its stream dropped.
      const out = (keys: string[]) =>
        setLive((l) => (l.exec ? { ...l, exec: { ...l.exec, queue: l.exec.queue.filter((k) => !keys.includes(k)), rows: Object.fromEntries(Object.entries(l.exec.rows).filter(([k]) => !keys.includes(k))) } } : l));
      let base = 0;
      for (const g of groups) {
        // Read against what's saved now: an earlier group, or a request before this one, may have found it since.
        const x = latestTeam.current.exec;
        const fresh = g
          .map((l) => {
            const known = x?.yours?.[l.key] ?? (l.again ? undefined : x?.contacts[l.key]) ?? l.known;
            return { ...l, items: l.items.filter((i) => !x?.drafts[i.id]), ...(known ? { known } : {}) };
          })
          .filter((l) => !l.known || l.items.length);
        base += g.length - fresh.length;
        out(g.filter((l) => !fresh.some((f) => f.key === l.key)).map((l) => l.key));
        if (!fresh.length) continue;
        setLive((l) => ({ ...l, exec: { ...(l.exec ?? { line: "", done: base, of: total, queue: [], rows: {} }), keys: fresh.map((f) => f.key) } }));
        await post("exec", { groups: [fresh], progress: { base, total } });
        out(fresh.map((f) => f.key));
        base += fresh.length;
        askPhone();
      }
      setLive((l) => ({ ...l, exec: undefined }));
    };
    const next = lookups.current.then(go, go);
    lookups.current = next;
    return next;
  };
  /** The Executive's line, counted across the groups of one request: each group is a post of its own. */
  const execLine = (e: Extract<TeamEvent, { type: "exec" }>, n: number) => {
    const pr = runs.current.get(n)?.progress as { base: number; total: number } | undefined;
    const base = pr?.base ?? 0;
    const of = pr?.total ?? e.of;
    const text = /^Finding contacts(: \d+ of \d+$| for )/.test(e.line) && of > 1 ? `Finding contacts: ${base + e.done} of ${of}` : e.line;
    setLive((l) => {
      const x = l.exec ?? { line: "", done: 0, of, keys: [], queue: [], rows: {} };
      // The contact it's on leaves the line; its row says what's happening, and clears when it's through.
      const rows = e.key ? (e.row ? { ...x.rows, [e.key]: e.row } : omitKey(x.rows, e.key)) : x.rows;
      return { ...l, exec: { ...x, line: text, done: base + e.done, of, rows, queue: e.key ? x.queue.filter((k) => k !== e.key) : x.queue } };
    });
  };

  /** Find contact on any item, or a few at once: top-ranked first, in small groups. */
  const findContact = (its: ExecItem[]) => runLookups(lookupsFor(its, latestTeam.current.exec));
  /** "Add it yourself": what the founder knows wins over anything found, and the item gets its drafts. */
  const addContact = (it: ExecItem, f: { address?: string; website?: string; phone?: string; email?: string; dm?: string }) => {
    const key = contactKey(it);
    if (!key) return;
    const src = { label: "From you" };
    const val = (v?: string) => v?.trim() || undefined;
    // A link typed without its scheme gets one; a bare handle stays as typed.
    const url = (v?: string) => {
      const x = val(v);
      return x && !/^https?:\/\//i.test(x) && /\.[a-z]{2,}/i.test(x) && !x.startsWith("@") ? `https://${x}` : x;
    };
    const prev = latestTeam.current.exec?.yours?.[key];
    const c: Contact = { ...(prev ?? { key, name: it.name, checked: [] }), by: "you", at: Date.now() };
    const fields = { address: val(f.address), website: url(f.website), phone: val(f.phone), email: val(f.email)?.toLowerCase() };
    for (const k of ["address", "website", "phone", "email"] as const) {
      const v = fields[k];
      if (v) c[k] = { value: v, src };
    }
    const dm = url(f.dm);
    if (dm) c.social = [{ label: dmLabel(dm), value: dm, src }, ...(c.social ?? []).filter((x) => x.value !== dm)];
    setExec((x) => ({ ...x, yours: { ...x.yours, [key]: c } }));
    if (!latestTeam.current.exec?.drafts[it.id]) void findContact([it]);
  };

  /** The follow-up wait: a new default, and the founder's rules for particular cases, the latest first. */
  const setWait = (days: number | undefined, rules: Omit<WaitRule, "at">[]) =>
    setExec((x) => {
      const d = days ?? x.wait?.days;
      return { ...x, wait: { ...(d ? { days: d } : {}), rules: [...(x.wait?.rules ?? []), ...rules.map((r) => ({ ...r, at: Date.now() }))].slice(-30) } };
    });
  /** The founder opened a draft in their mail or DM app: back here, "Did these go out?" asks (§23.5 r). */
  const openedMail = (id: string) => setExec((x) => ({ ...x, opened: { ...x.opened, [id]: Date.now() } }));
  /** What the founder spent on an item; nothing, or zero, takes it off. */
  const logSpend = (id: string, usd: number) => setExec((x) => ({ ...x, spend: usd > 0 ? { ...x.spend, [id]: { usd, at: Date.now() } } : omitKey(x.spend ?? {}, id) }));
  /** A step that waits on another, started anyway. */
  const startAnyway = (n: number) => setExec((x) => ({ ...x, early: [...new Set([...(x.early ?? []), n])] }));
  /** A mark from Execute Plan is the owning subagent's mark: it shows on that subagent's page too. */
  const markItem = (it: ExecItem, m: Mark) => {
    if (it.agent !== "athena") mark(it.agent, { id: it.id, kind: it.kind, name: it.name, ...(it.group ? { group: it.group } : {}), why: "", sources: [], callIds: [] }, m);
  };
  /** Done, Skipped or back to To do, set by hand: kept with the item as it was, so it stays if it leaves the pages. */
  const setStatus = (it: ExecItem, status: TaskStatus) => {
    const before = waiting();
    const task = taskOf(execPlan(latestTeam.current), it, status);
    setTeam((t) => ({ ...t, tasks: { ...t.tasks, [it.id]: { status, at: Date.now(), task } } }));
    announce(before);
  };
  /** Now's steps that wait on another, as they stand. */
  const waiting = () => {
    const t = latestTeam.current;
    return waitingSteps(execPlan(t), statesOf(t), t.exec);
  };
  /** When a step holds, Athena says what it opens. */
  const announce = (before: Map<number, number[]>) => {
    const after = waiting();
    const opened = [...before.keys()].filter((n) => !after.has(n));
    if (!opened.length) return;
    const what = latestTeam.current.plan?.steps?.find((s) => s.n === opened[0])?.what;
    p.say(opened.length > 1 ? "That's in hand, so the parts waiting on it can start." : `That's in hand, so the next part can start${what ? `: ${what}` : "."}`);
  };

  /** The Analyst measures and ranks the crowds, once, for the whole journey (§23.2 step 8.1a). */
  const measure = () => {
    const g = GOALS.find((x) => x.id === "know_crowd")!;
    // The Analyst is now the one at work, so its tab comes forward while it measures.
    bring("analyst");
    p.setTeam((t) => ({ ...t, goals: t.goals.some((x) => x.id === g.id) ? t.goals : [...t.goals, g] }));
    return post("run", { goals: [g] });
  };

  /** A tab picked by hand stops the following; "Follow the run" starts it again on the subagent started last. */
  const pickTab = (id: AgentId) => {
    setFollow(false);
    setActive(id);
  };
  const followRun = () => {
    setFollow(true);
    setActive(lastStarted.current);
  };

  return {
    live,
    active,
    setActive,
    follow,
    pickTab,
    followRun,
    propose,
    answer,
    editAnswer,
    askAthena,
    askSpecialist,
    chat,
    refresh,
    rewritePlan,
    bringBack,
    mark,
    hooks,
    start,
    measure,
    handoff,
    addToPlan,
    /** A journey reloaded: Start / Later asks again if the Executive isn't started; if it is, what's left runs, and
     *  drafts opened before and pitches past their wait ask. */
    offerExec: () => {
      askExec(true);
      askSent();
      askFollow();
    },
    startExec,
    findContact,
    addContact,
    setWait,
    openedMail,
    logSpend,
    startAnyway,
    markItem,
    setStatus,
  };
}

/** A DM link's label from its site. */
const DM_SITES: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)(x|twitter)\.com$/, "X"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
  [/(^|\.)facebook\.com$/, "Facebook"],
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/(^|\.)threads\.(net|com)$/, "Threads"],
];
function dmLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return DM_SITES.find(([r]) => r.test(host))?.[1] ?? "DM";
  } catch {
    return "DM";
  }
}

const omitKey = <T,>(o: Record<string, T>, k: string): Record<string, T> => Object.fromEntries(Object.entries(o).filter(([x]) => x !== k));
const omit = (o: Record<string, string>, k: string) => Object.fromEntries(Object.entries(o).filter(([x]) => x !== k));

/** An agent's status from what it last returned: done with its last result, or idle. */
function settled(id: AgentId, team: TeamState): AgentStatus {
  const w = isSpecialist(id) ? team.works[id] : undefined;
  return w ? { state: "done", last: w.headline } : { state: "idle" };
}

export function statusOf(id: AgentId, live: TeamLive, team: TeamState): AgentStatus {
  return live.status[id] ?? settled(id, team);
}

function statusText(id: AgentId, s: AgentStatus): string {
  if (s.state === "working") return s.step;
  if (s.state === "waiting") return `Waiting: ${s.reason}`;
  if (s.state === "done") return s.last;
  return id === "athena" ? ATHENA.role : specialist(id).role;
}

/** The left panel (§23.2 step 8f): Athena and the six, each with live status. On a phone the list is a menu. */
export function TeamPanel({ live, team, active, onOpen, athena }: { live: TeamLive; team: TeamState; active: View; onOpen: (id: View) => void; athena?: string }) {
  const ids = panelIds(team);
  const on = (id: View) => team.goals.some((g) => isSpecialist(id) && g.team.includes(id));
  // Collapsed to a rail of icons with live status, or open to the list; the choice is remembered.
  const [rail, flip] = useRail();
  // Whoever holds a question the run waits on pulses gently until it is answered (§23.5 a3).
  const paused = new Set<View>(
    live.asks.filter((a) => !(a.id in live.answers) && (a.id in live.blocking || a.id === "goals")).map((a) => a.agent),
  );
  const item = (id: View, name: string, status: AgentStatus["state"] | undefined, sub: string | undefined, title: string) => (
    <button type="button" className={`nav-item${status ? ` team-${status}` : ""}${active === id ? " on" : ""}${id !== "dashboard" && on(id) ? " team-on-goal" : ""}${paused.has(id) ? " nav-paused" : ""}`} aria-current={active === id ? "page" : undefined} onClick={() => onOpen(id)} title={title}>
      <span className="nav-glyph">
        <NavIcon name={id} />
      </span>
      <span className="nav-label">
        <span className="nav-name">{name}</span>
        {sub && <span className="nav-sub">{sub}</span>}
      </span>
      {status === "working" && <span className="nav-state spin" aria-label="Working" />}
      {status === "waiting" && <span className="nav-state nav-wait" aria-label="Waiting" />}
    </button>
  );
  const row = (id: AgentId) => {
    const s = statusOf(id, live, team);
    const text = id === "athena" && athena && s.state !== "working" ? athena : statusText(id, s);
    // The status line shows only while Athena or a subagent is at work or waiting; otherwise the name stands alone.
    const sub = s.state === "working" || s.state === "waiting" ? text : undefined;
    return item(id, nameOf(id), s.state, sub, `${nameOf(id)}: ${text}`);
  };
  return (
    <aside className={`team nav${rail ? " team-rail" : ""}`} aria-label="Athena and her subagents">
      <div className="nav-head">
        <span className="nav-title">Workspace</span>
        <RailToggle rail={rail} onFlip={flip} />
      </div>
      <label className="team-menu">
        <span className="small muted">Workspace</span>
        <select value={active} onChange={(e) => onOpen(e.target.value as View)}>
          <option value="dashboard">Dashboard</option>
          {ids.map((id) => (
            <option key={id} value={id}>
              {nameOf(id)} · {statusText(id, statusOf(id, live, team))}
            </option>
          ))}
          <option value={EXECUTIVE.id}>{EXECUTIVE.name} · {EXECUTIVE.role}</option>
        </select>
      </label>
      <div className="team-list">
        {item("dashboard", "Dashboard", undefined, undefined, "The whole team, and what Athena needs from you")}
        {row("athena")}
        <span className="nav-section">Subagents</span>
        <ul>
          {ids.filter((id) => id !== "athena").map((id) => <li key={id}>{row(id)}</li>)}
          <li>{item(EXECUTIVE.id, EXECUTIVE.name, undefined, undefined, `${EXECUTIVE.name}: ${EXECUTIVE.tile}`)}</li>
        </ul>
        <McpConnect />
      </div>
    </aside>
  );
}

/** The goals on top (§23.2 step 8a), each with the team behind it and anything outside what Athena does named plainly. */
export function GoalsBar({ goals: all }: { goals: Goal[] }) {
  // Knowing the crowd is the Analyst's standing first step, not a goal the founder chose. Goals are picked in the chat
  // (§23.2 step 8.3d), never from a button here: the bar only lists them.
  const goals = all.filter((g) => g.id !== "know_crowd");
  if (!goals.length) return null;
  return (
    <ol className="goals" aria-label="Your goals">
      {goals.map((g) => (
        <li key={g.id} title={[g.why, teamLine(g.team), g.outside].filter(Boolean).join(" ")}>
          <strong>{g.label}</strong>
          <small className="muted">{g.team.map(nameOf).join(" · ")}</small>
        </li>
      ))}
    </ol>
  );
}

const and = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0] ?? "");

/**
 * Shown whenever a run is paused on the founder: who is asking and who waits on it. Every question waits in the one
 * chat's tray (§23.2 step 8.5g); away from the chat, `onGo` opens it.
 */
export function PausedForYou({ live, onGo }: { live: TeamLive; onGo?: () => void }) {
  const open = Object.entries(live.blocking).filter(([id]) => !(id in live.answers));
  if (!open.length) return null;
  const by = new Map<AgentId, number>();
  for (const [, b] of open) by.set(b.agent, (by.get(b.agent) ?? 0) + 1);
  const held = Object.keys(live.held).map((id) => `the ${nameOf(id as AgentId)}`);
  const asking = [...by.entries()];
  return (
    <div className="paused" role="status">
      <strong>Paused for you</strong>
      <p>
        {and(asking.map(([id, k]) => `the ${nameOf(id)} has ${k === 1 ? "a question" : `${k} questions`}`)).replace(/^t/, "T")} for you.
        {held.length > 0 && ` ${and(held).replace(/^t/, "T")} ${held.length > 1 ? "wait" : "waits"} on ${asking.length > 1 ? "them" : "it"}.`} Nothing more is found until you answer{asking.length > 1 || open.length > 1 ? " them all" : ""}.
      </p>
      <div className="paused-go">
        {onGo ? (
          <button type="button" className="primary" onClick={onGo}>
            Answer in the chat
          </button>
        ) : (
          <small className="muted">{open.length > 1 ? "They wait" : "It waits"} above the reply box.</small>
        )}
      </div>
    </div>
  );
}

/**
 * The head of a subagent's page (§23.2 step 8b–d): what it's for, its live progress and its steps. Its questions and
 * answers are in the one chat with Athena (§23.2 step 8.5j), so they aren't repeated here.
 */
export function SpecialistWorkspace({ id, live, team }: { id: SpecialistId; live: TeamLive; team: TeamState }) {
  const s = specialist(id);
  const st = statusOf(id, live, team);
  const work = team.works[id];
  const lines = live.lines[id] ?? [];
  const goals = team.goals.filter((g) => g.team.includes(id));
  return (
    <div className="spec">
      <header className="spec-head">
        <h3>The {s.name}</h3>
        <p className="small muted">{s.mission}</p>
        {goals.length > 0 && <p className="small">For {goals.map((g) => `“${g.label}”`).join(", ")}</p>}
        {st.state === "waiting" && <p className="small muted spec-wait">Waiting: {st.reason}.</p>}
      </header>
      {st.state === "working" && <AgentProgress lines={lines} who={`The ${s.name}`} />}
      {lines.length > 0 && <Transcript lines={lines} />}
      {work && st.state !== "working" && <p className="spec-reply">{work.headline}</p>}
      {!work && st.state === "idle" && !lines.length && <p className="small muted">Done when: {s.doneWhen}</p>}
    </div>
  );
}

/**
 * A subagent's step trail under Athena's line in the chat (§23.2 step 8.5k): its live step, then what it found, with
 * its steps one click away and its page a click further. Only Athena speaks; the subagents show as their work.
 */
export function RunTrail({ id, live, team, onOpen }: { id: SpecialistId; live: TeamLive; team: TeamState; onOpen: (id: SpecialistId) => void }) {
  const [open, setOpen] = useState(false);
  const s = statusOf(id, live, team);
  const lines = live.lines[id] ?? [];
  const run = lines.reduce((n, l) => Math.max(n, l.run), 0);
  const mine = lines.filter((l) => l.run === run);
  const working = s.state === "working";
  const head = working ? s.step : s.state === "waiting" ? `Paused for you: ${s.reason}` : team.works[id]?.headline;
  if (!head && !mine.length) return null;
  return (
    <li className={`run-trail${working ? " run-trail-live" : ""}`}>
      <div className="run-trail-head">
        <span className="team-badge" aria-hidden>{nameOf(id).slice(0, 1)}</span>
        <span className={`run-trail-step${working ? " shimmer-text" : ""}`}>{head ?? "Working"}</span>
        {working && <StepTimer />}
      </div>
      <div className="run-trail-acts">
        {mine.length > 0 && (
          <button type="button" className="linkish small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Hide the steps" : `${mine.length} step${mine.length === 1 ? "" : "s"}`}
          </button>
        )}
        <button type="button" className="linkish small" onClick={() => onOpen(id)}>
          Open the {nameOf(id)}
        </button>
      </div>
      {open && <Transcript lines={mine} />}
    </li>
  );
}

/** A working agent's run at a glance (its latest run's steps, its calls so far, its clock), above its transcript. */
function AgentProgress({ lines, who }: { lines: Line[]; who: string }) {
  const run = lines.reduce((n, l) => Math.max(n, l.run), 0);
  const mine = lines.filter((l) => l.run === run);
  const now = [...mine].reverse().find((l) => l.ev.status === "running");
  const calls = mine.reduce((n, l) => n + l.ev.callIds.length, 0);
  return (
    <RunProgress
      key={run}
      who={who}
      current={now ? lineText(now.ev) : mine.length ? "Working out the next step" : "Getting started"}
      steps={mine.map((l): ProgressStep => ({ label: lineText(l.ev), state: l.ev.status === "running" ? "now" : "done" }))}
      counts={[calls ? `${calls} Qloo call${calls === 1 ? "" : "s"}` : ""]}
    />
  );
}

/** An agent's own steps, as plain lines; a finished one opens to what it found. */
function Transcript({ lines }: { lines: Line[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  return (
    <ol className="ob-transcript spec-steps">
      {lines.map((l) => {
        const ev = l.ev;
        const live = ev.status === "running";
        const detail = lineDetail(ev);
        const opened = open.has(l.key);
        return (
          <li key={l.key} className={`ob-line ${live ? "ob-live" : ev.status === "ok" ? "ob-done" : "ob-quiet"}`}>
            <button type="button" className="ob-line-head" disabled={!detail || live} aria-expanded={detail && !live ? opened : undefined} onClick={() => setOpen((o) => new Set(o.has(l.key) ? [...o].filter((k) => k !== l.key) : [...o, l.key]))}>
              <span className="ob-dot" aria-hidden />
              <span className="ob-line-text">
                {lineText(ev)}
                {!!ev.callIds.length && !live && <small className="muted"> · {ev.callIds.length} Qloo call{ev.callIds.length === 1 ? "" : "s"}</small>}
                {live && <StepTimer />}
              </span>
              {detail && !live && <span className="ob-caret" aria-hidden>{opened ? "▾" : "▸"}</span>}
            </button>
            {opened && detail && (
              <div className="ob-line-body">
                <p>{detail}</p>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const secs = (ms: number) => (ms < 1000 ? "under a second" : `${Math.round(ms / 1000)} s`);

/** A finished run (§23.2 step 8c): its headline, time, Qloo calls and nodes added; then each result with its marks. */
export function WorkView({ work, team, updating, alone, onMark, onHandoff, crowdId, onHooks, headed = true }: { work: Work; team: TeamState; updating: boolean; alone: AloneRequest; onMark: (item: WorkItem, m: Mark) => void; onHandoff?: (h: Handoff) => void; crowdId?: (name: string) => string | undefined; onHooks?: (crowdId: string, lines: PageLine[]) => void; headed?: boolean }) {
  const next = onHandoff && work.agent !== "navigator" ? fromWork(work, crowdId ?? (() => undefined)) : [];
  const nodes = nodesAdded(work);
  const marks = new Map(latest(team.outcomes).filter((o) => o.agent === work.agent).map((o) => [o.item, o.mark]));
  const sources = new Map(work.sources.map((s) => [s.id, s]));
  return (
    <section className={`card spec-work ${updating ? "spec-updating" : ""}`} aria-busy={updating}>
      {updating && <p className="small muted spec-updating-line">Updating; these stay up until the new results land.</p>}
      {headed && <h4>{work.headline}</h4>}
      <p className="small muted">
        {secs(work.ms)} · {work.qlooCalls} Qloo call{work.qlooCalls === 1 ? "" : "s"}
        {nodes > 0 && ` · added ${nodes} node${nodes === 1 ? "" : "s"} to your Brand Graph`}
        {work.by === "rules" && " · decided by Athena's evidence rules"}
      </p>
      {work.changed && <p className="small spec-changed">What changed: {work.changed}</p>}
      {work.outcomes && <p className="small">Read your outcomes first: {work.outcomes}.</p>}
      {work.claims.map((c, i) => (
        <p key={i} className="small">
          {c.text}{" "}
          {c.sources.filter((x) => sources.has(x)).map((x) => (
            <span key={x} className="cite" title={sources.get(x)!.summary}>{x}</span>
          ))}
        </p>
      ))}
      {work.page ? (
        <CrowdTabs page={work.page} agent={work.agent} outcomes={team.outcomes} onMark={onMark} onHandoff={onHandoff} onHooks={onHooks} />
      ) : work.results.length > 0 && (
        <ol className="spec-results">
          {work.results.map((r) => (
            <Result key={r.id} work={work} item={r} mark={marks.get(r.id)} team={team} alone={alone} onMark={(m) => onMark(r, m)} onHandoff={onHandoff} />
          ))}
        </ol>
      )}
      {work.handoff && <p className="small muted">Handed back to Athena: {work.handoff.need}.</p>}
      {next.length > 0 && <Handoffs list={next} onHandoff={onHandoff!} />}
    </section>
  );
}

/** Kinds a founder reaches out to, and so can mark. */
const MARKABLE = new Set(["venue", "retailer", "partner", "podcast", "event", "creator", "audience", "draft", "city", "neighbourhood", "message", "show", "rival"]);

/** Handoff buttons (§23.2 step 8.3b): each starts the next specialist on what this came from. */
export function Handoffs({ list, onHandoff }: { list: Handoff[]; onHandoff: (h: Handoff) => void }) {
  return (
    <div className="handoffs">
      {list.map((h) => (
        <button key={h.label} type="button" className="handoff" onClick={() => onHandoff(h)}>
          {h.label} <small>→ {nameOf(h.to)}</small>
        </button>
      ))}
    </div>
  );
}

/** A drafted email as it would be sent: the subject, then its paragraphs, with a copy button. Nothing is sent. */
function DraftText({ detail }: { detail: string }) {
  const [copied, setCopied] = useState(false);
  const [subject, ...body] = detail.split(/\n{2,}/);
  return (
    <div className="draft spec-draft">
      <p className="draft-label">Draft · nothing is sent</p>
      <p>
        <strong>Subject:</strong> {subject}
      </p>
      {body.map((b, i) => (
        <p key={i}>{b}</p>
      ))}
      <button type="button" className="linkish small" onClick={() => navigator.clipboard?.writeText(`Subject: ${subject}\n\n${body.join("\n\n")}`).then(() => setCopied(true)).catch(() => undefined)}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function Result({ work, item, mark, team, alone, onMark, onHandoff }: { work: Work; item: WorkItem; mark?: Mark; team: TeamState; alone: AloneRequest; onMark: (m: Mark) => void; onHandoff?: (h: Handoff) => void }) {
  const [know, setKnow] = useState(false);
  const cited = item.sources.map((id) => work.sources.find((s) => s.id === id)).filter((s): s is Work["sources"][number] => !!s);
  const calls = new Set([...item.callIds, ...cited.flatMap((s) => s.callIds)]).size;
  return (
    <li className="spec-result">
      <div className="spec-result-head">
        <strong>{item.name}</strong>
        {item.group && item.group !== item.kind && <small className="muted"> · {item.group}</small>}
      </div>
      <p className="small">{item.why}</p>
      {item.detail && (item.kind === "draft" ? <DraftText detail={item.detail} /> : <p className="small muted spec-detail">{item.detail}</p>)}
      <div className="spec-result-foot">
        {MARKABLE.has(item.kind) && (
          <span className="spec-marks" role="group" aria-label={`What happened with ${item.name}`}>
            {marksFor(work.agent).map((m) => (
              <button key={m} type="button" className={mark === m ? "on" : ""} aria-pressed={mark === m} onClick={() => onMark(m)}>
                {markLabel(m, work.agent)}
              </button>
            ))}
          </span>
        )}
        <button type="button" className="linkish small spec-know" aria-expanded={know} onClick={() => setKnow((k) => !k)}>
          how we know
        </button>
      </div>
      {onHandoff && item.kind === "city" && item.ref && <Handoffs list={fromCity({ id: item.ref, name: item.name })} onHandoff={onHandoff} />}
      {know && <HowWeKnow work={work} item={item} cited={cited} calls={calls} team={team} alone={alone} />}
    </li>
  );
}

/** With / Without per result kind: the question Gemini alone answers, and the Bench task where one measured it. */
const ALONE: Record<string, { stop: AloneStop; question: string; bench?: BenchTask }> = {
  crowd: { stop: "crowd", question: "Who are this product's customers, and what do they love?" },
  city: { stop: "where", question: "In which of the 25 largest US metros will this product find the most independent shops to sell it, per resident?", bench: "t1" },
  retailer: { stop: "retailers", question: "Which of these retailers are most likely to carry this product?", bench: "t2" },
  partner: { stop: "partners", question: "Which brands and podcasts should this brand partner with?" },
  podcast: { stop: "partners", question: "Which brands and podcasts should this brand partner with?" },
  message: { stop: "message", question: "How should this brand talk to its customers: which themes, and which shows, films, artists or books to reference?" },
  mood: { stop: "message", question: "How should this brand talk to its customers: which themes, and which shows, films, artists or books to reference?" },
  event: { stop: "moments", question: "Which dated events in this city in the next six months should this brand show up at?" },
  creator: { stop: "online", question: "Online, which creators and podcasts do this product's customers follow, and what should it target in ads?" },
  audience: { stop: "online", question: "Online, which creators and podcasts do this product's customers follow, and what should it target in ads?" },
};

/** "How we know" (§23.2 step 8d): the tool calls behind the result, then the same question to Gemini alone, with the Bench line. */
function HowWeKnow({ work, item, cited, calls, team, alone }: { work: Work; item: WorkItem; cited: Work["sources"]; calls: number; team: TeamState; alone: AloneRequest }) {
  const a = ALONE[item.kind];
  const peers = work.results.filter((r) => ALONE[r.kind]?.stop === a?.stop);
  const metroId = team.works.navigator?.shared?.city?.id;
  const ok = a && (a.stop !== "moments" || metroId) && peers.length > 1;
  return (
    <div className="spec-know-body small">
      {cited.length ? (
        <ul>
          {cited.map((s) => (
            <li key={s.id}>
              <span className="cite">{s.id}</span> {s.tool.replace(/_/g, " ")}: {s.summary}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">From the {nameOf(work.agent)}&apos;s run as a whole, read from Qloo.</p>
      )}
      {calls > 0 && <p className="muted">{calls} Qloo call{calls === 1 ? "" : "s"} behind it.</p>}
      {ok && (
        <WithWithout
          stop={a.stop}
          question={a.question}
          athena={peers.map((r) => ({ name: r.name, why: r.why, ...(r.ref ? { id: r.ref } : {}) }))}
          request={{ ...alone, ...(a.stop === "retailers" ? { candidates: peers.map((r) => ({ id: r.ref ?? r.id, label: r.name })) } : {}), ...(a.stop === "moments" ? { metroId } : {}) }}
          bench={a.bench}
          ranked={!!a.bench}
        />
      )}
    </div>
  );
}

/** What already sells (§23.6 i): the founder's orders by city and by crowd, from each order's date, total and ZIP. */
export function SalesView({ sales, crowds }: { sales: Sales; crowds: CrowdCard[] }) {
  const places = salesByPlace(sales);
  const byCrowd = salesByCrowd(sales, crowds).filter((c) => c.orders > 0);
  const total = sales.orders.reduce((n, o) => n + o[1], 0);
  const { from, to } = spanOf(sales);
  const shared = byCrowd.length > 1 && byCrowd.reduce((n, c) => n + c.revenue, 0) > total + 0.5;
  return (
    <div className="sales">
      <p className="small">
        {sales.sample && <span className="sample-tag">Sample data</span>}
        {sales.orders.length.toLocaleString("en-US")} orders worth {usd(total)}
        {from && from !== to ? `, ${from} to ${to}` : ""}, from {sales.file}.
      </p>
      <ul className="sales-rows">
        {places.slice(0, 6).map((p) => (
          <li key={p.key} className="small">
            <span>{p.name}</span>
            <span className="muted">
              {usd(p.revenue)} · {p.orders} {p.orders === 1 ? "order" : "orders"}
            </span>
          </li>
        ))}
      </ul>
      {byCrowd.length > 0 && (
        <>
          <p className="small muted">By crowd, from the cities where each one clusters:</p>
          <ul className="sales-rows">
            {byCrowd.map((c) => (
              <li key={c.crowd} className="small">
                <span>{c.name}</span>
                <span className="muted">
                  {usd(c.revenue)} · {c.orders} {c.orders === 1 ? "order" : "orders"}
                </span>
              </li>
            ))}
          </ul>
          {shared && <p className="small muted">A city two crowds share counts for both, so these add up to more than the total.</p>}
        </>
      )}
    </div>
  );
}

/** Athena's one "What's working" overview (§23.2 step 8g): the marks so far, what said yes, the patterns, and what's stale. */
export function WhatsWorking({ team, graphRev, busy, onRefresh, crowds = [] }: { team: TeamState; graphRev: number; busy: boolean; onRefresh: () => void; crowds?: CrowdCard[] }) {
  const o = whatsWorking(team);
  const stale = staleRuns(team, graphRev);
  const marked = MARKS.reduce((n, m) => n + o.counts[m], 0);
  const sales = team.sales?.orders.length ? team.sales : undefined;
  // Before anything is marked or any sales file is in, the tab says what will fill it, never a blank page (§23.7 e).
  if (!marked && !stale.length && !sales)
    return (
      <section className="card working">
        <h3>What&apos;s working</h3>
        <p className="small muted">
          Nothing here yet. As you mark items on Execute Plan as pitched, yes or no, or drop an orders export into the Brand Knowledge Base, I&apos;ll show
          what&apos;s landing here: by city, by crowd and by subagent.
        </p>
      </section>
    );
  return (
    <section className="card working">
      <h3>What&apos;s working</h3>
      {sales && <SalesView sales={sales} crowds={crowds} />}
      {marked > 0 && (
        <p className="small muted">
          {MARKS.filter((m) => o.counts[m]).map((m) => `${o.counts[m]} ${MARK_LABEL[m].toLowerCase()}`).join(" · ")}
        </p>
      )}
      {o.lines.map((l) => (
        <p key={l} className="small">{l}</p>
      ))}
      {o.best.length > 0 && <p className="small">Said yes: {o.best.map((b) => `${b.name} (the ${b.agent})`).join(", ")}.</p>}
      {stale.length > 0 && (
        <div className="working-stale">
          <p className="small muted">{stale.map((s) => `The ${nameOf(s.agent)}: ${s.why}.`).join(" ")}</p>
          <button type="button" className="linkish small" disabled={busy} onClick={onRefresh}>
            {busy ? "The team is on it" : "Bring them up to date"}
          </button>
        </div>
      )}
    </section>
  );
}
