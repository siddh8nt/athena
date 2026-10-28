"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GoalsBar, statusOf, type TeamLive, type View } from "./Team";
import { inputById } from "@/lib/team/inputs";
import { EXECUTIVE, SPECIALIST_IDS, nameOf, specialist, type AgentId, type SpecialistId } from "@/lib/agent/specialists";
import { execPlan, statesOf, stripOf } from "@/lib/exec/plan";
import type { Answer, StepState, TeamState, Work, Workflow, WorkflowStep } from "@/lib/team/types";
import type { Journey } from "@/lib/journey/types";
import { thisWeek, weekEmpty, type WeekLine } from "@/lib/workspace/week";
import { workspace } from "@/lib/knowledge/workspace";
import { SaveButton, ShareLink, saveBrandFile, savePlanSheet } from "./McpConnect";
import { Linked } from "./Refs";
import { BRAND_FILE } from "@/lib/workspace/brand-file";
import { PLAN_FILE } from "@/lib/workspace/plan-sheets";

// The founder's dashboard after onboarding (PRD §23.2 step 8.5 b–d): the growth plan's workflow as a live diagram
// under the goals, ending on Execute Plan, Athena's lead tile and the subagents' tiles, the founder's answers
// (editable), what's working, and the Brand Knowledge Base. Only a view: the journey holds the state and hands in the pieces.

const goalsOf = (team: TeamState) => team.goals.filter((g) => g.id !== "know_crowd");

/** A step's state, read live: the workflow's own, with this visit's statuses over it while a run streams. */
function nodeState(step: WorkflowStep, live: TeamLive): StepState {
  const s = live.status[step.id];
  if (s?.state === "working") return "running";
  if (s?.state === "waiting" || Object.values(live.blocking).some((b) => b.agent === step.id)) return step.state === "done" ? "done" : "paused";
  return step.state;
}

const STATE_LABEL: Record<StepState, string> = { todo: "To do", running: "Working", paused: "Paused for you", done: "Done" };

/** Each step's column: the Analyst first, every other step one after the deepest step it needs or follows, Athena last. */
function columns(w: Workflow): WorkflowStep[][] {
  const depth = new Map<string, number>();
  const of = (s: WorkflowStep): number => {
    if (depth.has(s.id)) return depth.get(s.id)!;
    const needs = [...s.needs, ...(s.after ?? [])].map((id) => w.steps.find((x) => x.id === id)).filter((x): x is WorkflowStep => !!x);
    const d = needs.length ? 1 + Math.max(...needs.map(of)) : 0;
    depth.set(s.id, d);
    return d;
  };
  const work = w.steps.filter((s) => s.id !== "athena");
  for (const s of work) of(s);
  const max = Math.max(0, ...work.map((s) => depth.get(s.id) ?? 0));
  const cols: WorkflowStep[][] = Array.from({ length: max + 1 }, () => []);
  for (const s of work) cols[depth.get(s.id) ?? 0].push(s);
  const athena = w.steps.find((s) => s.id === "athena");
  return athena ? [...cols, [athena]] : cols;
}

/**
 * The workflow as a diagram (§23.2 step 8.5c): opening questions, the Analyst, the lanes, Athena's synthesis.
 * `compact` is the copy in the Athena tab's panel (§23.5 a4): the same live states, stacked to fit the narrow column.
 */
export function WorkflowDiagram({ team, live, onOpen, onChat, compact }: { team: TeamState; live: TeamLive; onOpen: (id: View) => void; onChat: () => void; compact?: boolean }) {
  const w = team.workflow;
  if (!w) return null;
  const opening: StepState = live.asks.some((a) => a.id === "goals" && !(a.id in live.answers)) ? "paused" : "done";
  const cols = columns(w);
  const node = (id: AgentId, state: StepState, title: string, sub: string, onClick: () => void, label = STATE_LABEL[state]) => (
    <button key={id} type="button" className={`wf-node wf-${state}${label === "Ready" ? " wf-ready" : ""}`} onClick={onClick} aria-label={`${title}: ${label}`}>
      <span className="wf-state">
        {state === "running" ? <span className="spin" aria-hidden /> : <span className="wf-dot" aria-hidden />}
        {label}
      </span>
      <strong>{title}</strong>
      <small>{sub}</small>
    </button>
  );
  const sub = (s: WorkflowStep) => {
    const st = live.status[s.id];
    if (st?.state === "working") return st.step;
    // What the step gives the brand (§23.7 b); the brief stays on the subagent's page.
    return s.means || (s.id === "athena" ? s.task : specialist(s.id).gives);
  };
  // The last node is Execute Plan (§23.5 q): Athena orders the team's work, the Executive turns it into the
  // founder's plan. Her plan written and the Executive not yet started, it waits Ready for the founder's Start.
  const last = (s: WorkflowStep) => {
    const state = nodeState(s, live);
    const ready = state === "done" && !!team.plan && !team.exec?.started;
    return node(
      "athena",
      live.exec ? "running" : ready ? "todo" : state,
      "Execute Plan",
      live.exec?.line ?? (state === "running" && live.status.athena?.state === "working" ? live.status.athena.step : team.plan && state === "done" ? team.plan.headline : "Athena orders the team's work; the Executive turns it into your plan"),
      () => onOpen(team.plan ? "executive" : "athena"),
      live.exec ? STATE_LABEL.running : ready ? "Ready" : STATE_LABEL[state],
    );
  };
  return (
    <div className={`wf${compact ? " wf-compact" : ""}`} role="group" aria-label="Athena's workflow">
      <div className="wf-col">{node("athena", opening, "Opening questions", "Your goals for the plan", onChat)}</div>
      {cols.map((col, i) => (
        <div key={i} className="wf-col">
          {col.map((s) =>
            s.id === "athena"
              ? last(s)
              : node(s.id, nodeState(s, live), `The ${nameOf(s.id)}`, sub(s), () => onOpen(s.id)),
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Under the workflow (§23.5 q): Execute Plan's one line and its one button. Start the Executive once Athena's
 * plan is in, and Open Execute Plan otherwise: once started, new items are looked up by themselves (§23.5 r).
 * One count to a sentence, the one that matters to the founder (§23.7 b); the rest is in Execute Plan.
 */
function ExecLine({ team, live, onExec, onOpen }: { team: TeamState; live: TeamLive; onExec: () => void; onOpen: () => void }) {
  if (!team.plan) return null;
  const plan = execPlan(team);
  const x = team.exec;
  const now = plan.items.filter((i) => i.now && !i.left);
  const strip = stripOf(plan, statesOf(team), x, Date.now());
  let line: string;
  let act: { label: string; primary?: boolean; on: () => void };
  // While it works, the node above says the step it's on ("Searching the web for…"); this line says where the run is.
  if (live.exec) {
    line = x?.started
      ? `${strip.nowDone} of ${strip.nowOf} things to do now are done. The Executive is working through the rest.`
      : "The Executive is finding how to reach everyone in your plan, starting with what to do now.";
    act = { label: "Open Execute Plan", on: onOpen };
  } else if (!x?.started) {
    line = `Athena has put the team's work in order, with ${now.length} ${now.length === 1 ? "thing" : "things"} to do now. The Executive finds how to reach everyone in it, those first, and writes an email, a DM and a call script for each.`;
    act = { label: "Start the Executive", primary: true, on: onExec };
  } else {
    line = `${strip.nowDone} of ${strip.nowOf} things to do now are done.`;
    act = { label: "Open Execute Plan", on: onOpen };
  }
  return (
    <div className="wf-exec">
      <p className={`small${live.exec ? " shimmer-text" : ""}`}>{line}</p>
      <span className="wf-exec-acts">
        <button type="button" className={act.primary ? "primary" : ""} onClick={act.on}>
          {act.label}
        </button>
      </span>
    </div>
  );
}

/** One answer the team keeps, editable in place (§23.2 step 8.5g): a change re-runs only the steps that read it. */
function AnswerRow({ a, onEdit, busy }: { a: Answer; onEdit: (v: string) => void; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(a.answer);
  const options = inputById(a.id)?.options.map((o) => o.label) ?? [];
  const save = (v: string) => {
    setEditing(false);
    if (v.trim() && v.trim() !== a.answer) onEdit(v.trim());
  };
  return (
    <li className="ans">
      <div className="ans-head">
        <span className="ans-for">
          {a.agent === "athena" ? "Athena" : `For the ${nameOf(a.agent)}`}
          {a.from === "graph" && <span className="muted"> · from your Brand Graph</span>}
        </span>
        {!editing && (
          <button type="button" className="linkish small" disabled={busy} onClick={() => (setText(a.answer), setEditing(true))}>
            Change
          </button>
        )}
      </div>
      <p className="ans-q">{a.question}</p>
      {editing ? (
        <form
          className="ans-edit"
          onSubmit={(e) => {
            e.preventDefault();
            save(text);
          }}
        >
          {options.length > 0 && (
            <div className="ans-options">
              {options.map((o) => (
                <button key={o} type="button" className={`ob-chip${o === a.answer ? " on" : ""}`} onClick={() => save(o)}>
                  {o}
                </button>
              ))}
            </div>
          )}
          <div className="question-other">
            <input autoFocus value={text} maxLength={300} onChange={(e) => setText(e.target.value)} aria-label="Your answer" />
            <button type="submit" className="primary">Save</button>
            <button type="button" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <p className="ans-a">{a.answer}</p>
      )}
    </li>
  );
}

/** A tile's line: what the subagent is doing, waiting on, or found. */
function tileLine(id: SpecialistId, team: TeamState, live: TeamLive, step?: WorkflowStep): { text: string; tone?: "live" | "wait" | "muted" } {
  const s = statusOf(id, live, team);
  const w0 = team.workflow;
  if (s.state === "working") return { text: s.step, tone: "live" };
  if (step && nodeState(step, live) === "paused") return { text: "Paused for you: its question is in the chat", tone: "wait" };
  const w: Work | undefined = team.works[id];
  if (w) return { text: w.headline };
  if (step && w0) {
    // Where the step stands; the step's card above says what it gives (§23.7 c: one place for each thing).
    const done = new Set(w0.steps.filter((x) => x.state === "done").map((x) => x.id));
    const inPlan = new Set(w0.steps.map((x) => x.id));
    const wait = [...step.needs, ...(step.after ?? [])].filter((n) => n !== "athena" && inPlan.has(n) && !done.has(n));
    return { text: wait.length ? `After ${[...new Set(wait)].map((n) => `the ${nameOf(n)}`).join(" and ")}` : "Up next", tone: "muted" };
  }
  return { text: specialist(id).gives, tone: "muted" };
}

/** This week (§23.6 j), at the top of Overview: the pitches with no reply after their wait, what falls due in the next
 *  seven days, and the next events. Each line opens its row in Execute Plan, or its source when it has none. */
function ThisWeek({ team, onRow }: { team: TeamState; onRow: (id: string) => void }) {
  const [now] = useState(() => Date.now());
  const w = thisWeek({ journey: { team } as Journey }, now);
  const part = (head: string, ls: WeekLine[]) =>
    !!ls.length && (
      <div className="week-part">
        <span className="eyebrow">{head}</span>
        <ul className="week-list">
          {ls.map((l) => (
            <li key={l.key}>
              {l.row ? (
                <button type="button" className="week-line" onClick={() => onRow(l.row!)}>
                  <strong>{l.title}</strong>
                  <span className="small muted">{l.sub}</span>
                </button>
              ) : (
                <a className="week-line" href={l.url} target="_blank" rel="noreferrer">
                  <strong>{l.title}</strong>
                  <span className="small muted">{l.sub}</span>
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <section className="dash-sec dash-week">
      <div className="dash-sec-head">
        <h3>This week</h3>
        <small className="muted">From your plan and what you&apos;ve marked</small>
      </div>
      {weekEmpty(w) ? (
        <p className="small muted">Nothing falls due this week, and no pitch is waiting on a reply.</p>
      ) : (
        <>
          {part("No reply yet", w.quiet)}
          {part("Due this week", w.due)}
          {part("Next events", w.events)}
        </>
      )}
      <MondayEmail />
    </section>
  );
}

/** "Take your plan with you", once the plan is written: the brand file for the founder's AI assistant, the plan
 *  spreadsheet for the team, and the view-only share link, the same ones the Athena MCP panel gives. */
function TakeAway() {
  const [saved, setSaved] = useState<string>();
  const file = (name: string, what: string, save: () => Promise<void>) => (
    <li className="take-row">
      <div>
        <strong>{name}</strong>
        <p className="small muted">{what}</p>
      </div>
      <div className="mcp-link-foot">
        <SaveButton file={name} save={save} onSaved={() => setSaved(name)} />
        {saved === name && <span className="small muted">Saved to your downloads.</span>}
      </div>
    </li>
  );
  return (
    <section className="dash-sec dash-take">
      <div className="dash-sec-head">
        <h3>Take your plan with you</h3>
        <small className="muted">Your plan as it stands now, to keep or pass on</small>
      </div>
      <ul className="take-list">
        {file(BRAND_FILE, "For your AI assistant: the brand, its crowds, the plan in order and the open tasks. Drop it into Claude, ChatGPT or Cursor as context.", () => saveBrandFile())}
        {file(PLAN_FILE, "For you and your team: a tab each for the outreach and every contact found, the drafts, the plan, the crowds and each subagent's tables.", () => savePlanSheet())}
        <li className="take-row">
          <div>
            <strong>Share with your team</strong>
            <p className="small muted">A view-only Execute Plan for co-founders or advisors. It follows the plan as it changes.</p>
          </div>
          <ShareLink />
        </li>
      </ul>
    </section>
  );
}

/** "Email me this every Monday" (§23.6 j): the founder's address and one toggle, saved for the Monday run. Hidden
 *  until Athena's sending account is set up, so it never offers a send that can't happen. */
function MondayEmail() {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [on, setOn] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => {
    let live = true;
    fetch(`/api/digest?ws=${encodeURIComponent(workspace())}`)
      .then((r) => r.json())
      .then((j: { ready?: boolean; email?: string; on?: boolean }) => {
        if (!live) return;
        setReady(!!j.ready);
        if (j.email) setEmail(j.email);
        setOn(!!j.on);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!ready) return null;
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const save = async (next: boolean) => {
    if (!valid) return setNote("Add your email address first.");
    setOn(next);
    const r = await fetch("/api/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ws: workspace(), email: email.trim(), on: next }) })
      .then((x) => x.json() as Promise<{ ok?: boolean }>)
      .catch(() => ({ ok: false }));
    if (!r.ok) setOn(!next);
    setNote(r.ok ? (next ? `Every Monday morning, to ${email.trim()}.` : "Off. Turn it on again any time.") : "Saving takes a moment; try the toggle again.");
  };
  return (
    <div className="week-mail">
      <label className="week-mail-toggle">
        <input type="checkbox" checked={on} onChange={(e) => save(e.target.checked)} />
        <span>Email me this every Monday</span>
      </label>
      <input type="email" className="week-mail-to" placeholder="you@yourbrand.com" value={email} onChange={(e) => (setEmail(e.target.value), setNote(""))} onBlur={() => on && valid && save(true)} aria-label="Your email address" />
      {note && <small className="muted">{note}</small>}
    </div>
  );
}

/** The dashboard's tabs (§23.5 a1), kept in the URL as `/plan?tab=…` so Back and Forward move between them. */
const DASH_TABS = [
  { id: "overview", label: "Overview" },
  { id: "knowledge", label: "Brand Knowledge Base" },
  { id: "answers", label: "Your answers" },
  { id: "working", label: "What's working" },
  { id: "executive", label: "Execute Plan" },
] as const;
export type DashTab = (typeof DASH_TABS)[number]["id"];

function tabFromUrl(): DashTab {
  try {
    const t = new URLSearchParams(window.location.search).get("tab");
    // Athena's plan is Execute Plan now (§23.5 q): an old link to it opens there.
    return DASH_TABS.find((x) => x.id === (t === "plan" ? "executive" : t))?.id ?? "overview";
  } catch {
    return "overview";
  }
}

/** One part of the Brand Knowledge Base: folds to its title and a one-line summary. */
export type KbPart = { id: string; title: string; sub?: string; body: ReactNode };

const FOLD_STORE = "athena.kb-folded";
function readFolded(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(FOLD_STORE) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** The Brand Knowledge Base tab (§23.5 a1): each part collapses and expands, one at a time or all together; remembered. */
function KnowledgeBase({ parts }: { parts: KbPart[] }) {
  const [folded, setFolded] = useState<string[]>(readFolded);
  const set = (f: string[]) => {
    setFolded(f);
    try {
      localStorage.setItem(FOLD_STORE, JSON.stringify(f));
    } catch {
      // Only a convenience.
    }
  };
  const all = parts.every((x) => folded.includes(x.id));
  return (
    <section className="dash-sec dash-kb">
      <div className="dash-sec-head">
        <h3>Brand Knowledge Base</h3>
        <small className="muted">What Athena knows about your brand. Every subagent reads it.</small>
        <button type="button" className="linkish small kb-all" onClick={() => set(all ? [] : parts.map((x) => x.id))}>
          {all ? "Expand all" : "Collapse all"}
        </button>
      </div>
      {parts.map((x) => {
        const shut = folded.includes(x.id);
        return (
          <div key={x.id} className={`kb-fold${shut ? " kb-shut" : ""}`}>
            <button type="button" className="kb-fold-head" aria-expanded={!shut} onClick={() => set(shut ? folded.filter((f) => f !== x.id) : [...folded, x.id])}>
              <span className="kb-chev" aria-hidden />
              <strong>{x.title}</strong>
              {x.sub && <small className="muted">{x.sub}</small>}
            </button>
            {!shut && <div className="kb-fold-body">{x.body}</div>}
          </div>
        );
      })}
    </section>
  );
}

export function Dashboard(p: {
  live: TeamLive;
  team: TeamState;
  graphRev: number;
  /** The Brand Knowledge Base: the Brand Graph, the file drop and the onboarding record (§23.2 step 8.5b), each foldable. */
  kb: KbPart[];
  working: ReactNode;
  /** Set while a step waits on the founder: the Overview tab carries the paused dot. */
  paused?: string;
  onOpen: (id: View) => void;
  onChat: () => void;
  onStart: () => void;
  onAdd: (id: SpecialistId) => void;
  onEditAnswer: (a: Answer, v: string) => void;
  /** Start the Executive (§23.5 r). */
  onExec: () => void;
  /** Execute Plan (§23.5 q), for its tab. */
  executive: ReactNode;
}) {
  const { team, live } = p;
  const [tab, setTab] = useState<DashTab>(tabFromUrl);
  useEffect(() => {
    const back = () => setTab(tabFromUrl());
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const pick = (t: DashTab) => {
    setTab(t);
    const url = t === "overview" ? "/plan" : `/plan?tab=${t}`;
    if (url !== window.location.pathname + window.location.search) window.history.pushState(null, "", url);
  };
  const w = team.workflow;
  const goals = goalsOf(team);
  const busy = live.running > 0;
  const plan = team.plan;
  const athenaStep = w?.steps.find((s) => s.id === "athena");
  const athenaLine = live.status.athena?.state === "working"
    ? live.status.athena.step
    : plan
      ? "Put the team's results in order: your plan is in Execute Plan, above."
      : w
        ? "Asks you only what only you know, and hands each step to the subagent it needs."
        : "Leads the team: your goals, the workflow, the order of the work.";
  const count: Partial<Record<DashTab, number>> = { answers: team.answered?.length || undefined };
  // A This week line opens its row: Execute Plan reads `?item` when it mounts (§23.6 g).
  const openRow = (id: string) => {
    window.history.pushState(null, "", `/plan?tab=executive&item=${encodeURIComponent(id)}`);
    setTab("executive");
  };
  const overview = (
    <>
      {plan && <ThisWeek team={team} onRow={openRow} />}
      {!w && !goals.length ? (
        <section className="dash-start">
          <span className="eyebrow">Next</span>
          <h2>Build your growth plan with Athena</h2>
          <p className="muted">
            Tell Athena what you want to grow. She plans the work, hands each part to the subagent it needs, asks you only what only you
            know, and writes the plan: who to win, where, through what, the words and when.
          </p>
          <button type="button" className="primary" onClick={p.onStart}>
            Start
          </button>
        </section>
      ) : (
        <section className="dash-sec dash-plan">
          <div className="dash-sec-head">
            <h3>Your growth plan</h3>
            {w && <small className="muted">{w.by === "agent" ? "Planned by Athena" : "Athena's standard order"} · {w.steps.filter((s) => s.state === "done").length} of {w.steps.length} steps done</small>}
          </div>
          <GoalsBar goals={team.goals} />
          {w ? <WorkflowDiagram team={team} live={live} onOpen={(id) => (id === "executive" ? pick("executive") : p.onOpen(id))} onChat={p.onChat} /> : <p className="small muted shimmer-text">Athena is planning the work for these goals</p>}
          {w && <ExecLine team={team} live={live} onExec={p.onExec} onOpen={() => pick("executive")} />}
        </section>
      )}

      {plan && <TakeAway />}

      <section className="dash-sec">
        <h3>Your team</h3>
        <button type="button" className={`dash-lead${live.status.athena?.state === "working" ? " dash-working" : ""}`} onClick={() => p.onOpen("athena")}>
          <span className="team-badge" aria-hidden>A</span>
          <span className="dash-lead-body">
            <strong>Athena</strong>
            <span className={live.status.athena?.state === "working" ? "small shimmer-text" : "small"}>{athenaLine}</span>
            {athenaStep && <span className="dash-lead-go">Open Athena →</span>}
          </span>
        </button>
        <ul className="dash-team">
          {SPECIALIST_IDS.map((id) => {
            const step = w?.steps.find((s) => s.id === id);
            const out = !!w && !step;
            const st = step ? nodeState(step, live) : undefined;
            const line = tileLine(id, team, live, step);
            return (
              <li key={id} className={`dash-agent${st ? ` dash-${st}` : ""}${out ? " dash-out" : ""}`}>
                <span className="team-badge" aria-hidden>{nameOf(id).slice(0, 1)}</span>
                <div>
                  <strong>The {nameOf(id)}</strong>
                  {out ? (
                    <p className="small muted">Not needed for these goals</p>
                  ) : (
                    <p className={`small${line.tone === "live" ? " shimmer-text" : line.tone === "muted" ? " muted" : line.tone === "wait" ? " dash-wait" : ""}`}><Linked text={line.text} /></p>
                  )}
                  <div className="dash-acts">
                    {out ? (
                      <button type="button" className="handoff" disabled={busy && live.asks.some((a) => a.id in live.blocking)} onClick={() => p.onAdd(id)}>
                        Add to the plan
                      </button>
                    ) : (
                      (team.works[id] || st === "running" || st === "paused") && (
                        <button type="button" className="linkish small" onClick={() => p.onOpen(id)}>
                          Open the {nameOf(id)}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {/* The Executive (§23.5 q): no research of its own; it turns Athena's order into Execute Plan. */}
          <li className="dash-agent">
            <span className="team-badge" aria-hidden>{EXECUTIVE.name.slice(0, 1)}</span>
            <div>
              <strong>The {EXECUTIVE.name}</strong>
              <p className="small">{EXECUTIVE.tile}</p>
              <div className="dash-acts">
                <small className="muted">
                  {!plan ? "Ready once Athena has put the team's work in order" : team.exec?.started ? "At work in Execute Plan, above" : "Waits for your Start, above"}
                </small>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </>
  );
  return (
    <div className="dash">
      <div className="dash-tabs" role="tablist" aria-label="Your dashboard">
        {DASH_TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`dash-tab${tab === t.id ? " on" : ""}`} onClick={() => pick(t.id)}>
            {t.id === "overview" && p.paused && <span className="dash-tab-paused" aria-label="Paused for you" />}
            {t.label}
            {count[t.id] !== undefined && <span className="dash-tab-n">{count[t.id]}</span>}
          </button>
        ))}
      </div>
      <div className="dash-tab-body" key={tab} role="tabpanel">
        {tab === "overview" && overview}
        {tab === "knowledge" && <KnowledgeBase parts={p.kb} />}
        {tab === "answers" && (
          <section className="dash-sec">
            <div className="dash-sec-head">
              <h3>Your answers</h3>
              <small className="muted">Change an answer and only the work that depends on it is done again.</small>
            </div>
            {team.answered?.length ? (
              <ul className="ans-list">
                {team.answered.map((a) => (
                  <AnswerRow key={`${a.id}:${a.answer}`} a={a} busy={busy} onEdit={(v) => p.onEditAnswer(a, v)} />
                ))}
              </ul>
            ) : (
              <p className="small muted">Athena keeps what you tell her here, and what she took from your Brand Graph, as the plan runs.</p>
            )}
          </section>
        )}
        {tab === "working" && <section className="dash-sec">{p.working}</section>}
        {tab === "executive" && p.executive}
      </div>
    </div>
  );
}
