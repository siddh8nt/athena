"use client";

import { useState, type ReactNode } from "react";
import { GoalsBar, statusOf, type TeamLive, type View } from "./Team";
import { inputById } from "@/lib/team/inputs";
import { KIND_LABEL, planStale } from "@/lib/agent/synthesis";
import { SPECIALIST_IDS, nameOf, specialist, type AgentId, type SpecialistId } from "@/lib/agent/specialists";
import type { Answer, GrowthPlan, StepState, TeamState, Work, Workflow, WorkflowStep } from "@/lib/team/types";

// The founder's dashboard after onboarding (PRD §23.2 step 8.5 b–d): the growth plan's workflow as a live diagram
// under the goals, Athena's lead tile and the six subagents' tiles, the founder's answers (editable), what's working,
// and the Brand Knowledge Base. Only a view: the journey holds the state and hands in the pieces.

const goalsOf = (team: TeamState) => team.goals.filter((g) => g.id !== "know_crowd");

/** "the Analyst's, the Rep's and the Promoter's": whose work a plan reads. */
function whose(ids: SpecialistId[]): string {
  const xs = ids.map((id) => `the ${nameOf(id)}'s`);
  return xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : (xs[0] ?? "the team's");
}

/** A step's state, read live: the workflow's own, with this visit's statuses over it while a run streams. */
function nodeState(step: WorkflowStep, live: TeamLive): StepState {
  const s = live.status[step.id];
  if (s?.state === "working") return "running";
  if (s?.state === "waiting" || Object.values(live.blocking).some((b) => b.agent === step.id)) return step.state === "done" ? "done" : "paused";
  return step.state;
}

const STATE_LABEL: Record<StepState, string> = { todo: "To do", running: "Working", paused: "Paused for you", done: "Done" };

/** Each step's column: the Analyst first, every other step one after the deepest step it needs, Athena last. */
function columns(w: Workflow): WorkflowStep[][] {
  const depth = new Map<string, number>();
  const of = (s: WorkflowStep): number => {
    if (depth.has(s.id)) return depth.get(s.id)!;
    const needs = s.needs.map((id) => w.steps.find((x) => x.id === id)).filter((x): x is WorkflowStep => !!x);
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

/** The workflow as a diagram (§23.2 step 8.5c): opening questions, the Analyst, the lanes, Athena's synthesis. */
export function WorkflowDiagram({ team, live, onOpen, onChat }: { team: TeamState; live: TeamLive; onOpen: (id: View) => void; onChat: () => void }) {
  const w = team.workflow;
  if (!w) return null;
  const opening: StepState = live.asks.some((a) => a.id === "goals" && !(a.id in live.answers)) ? "paused" : "done";
  const cols = columns(w);
  const node = (id: AgentId, state: StepState, title: string, sub: string, onClick: () => void) => (
    <button key={id} type="button" className={`wf-node wf-${state}`} onClick={onClick} aria-label={`${title}: ${STATE_LABEL[state]}`}>
      <span className="wf-state">
        {state === "running" ? <span className="spin" aria-hidden /> : <span className="wf-dot" aria-hidden />}
        {STATE_LABEL[state]}
      </span>
      <strong>{title}</strong>
      <small>{sub}</small>
    </button>
  );
  const sub = (s: WorkflowStep) => {
    const st = live.status[s.id];
    if (st?.state === "working") return st.step;
    return s.task;
  };
  return (
    <div className="wf" role="group" aria-label="Athena's workflow">
      <div className="wf-col">{node("athena", opening, "Opening questions", "Your goals for the plan", onChat)}</div>
      {cols.map((col, i) => (
        <div key={i} className="wf-col">
          {col.map((s) =>
            s.id === "athena"
              ? node("athena", nodeState(s, live), "Athena's plan", team.plan && s.state === "done" ? team.plan.headline : "Reads every subagent's work and writes the plan", () => onOpen("athena"))
              : node(s.id, nodeState(s, live), `The ${nameOf(s.id)}`, sub(s), () => onOpen(s.id)),
          )}
        </div>
      ))}
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
  if (s.state === "working") return { text: s.step, tone: "live" };
  if (step && nodeState(step, live) === "paused") return { text: "Paused for you: its question is in the chat", tone: "wait" };
  const w: Work | undefined = team.works[id];
  if (w) return { text: w.headline };
  if (step) return { text: step.task, tone: "muted" };
  return { text: specialist(id).mission, tone: "muted" };
}

export function Dashboard(p: {
  live: TeamLive;
  team: TeamState;
  graphRev: number;
  /** The Brand Knowledge Base: the Brand Graph, the onboarding record and the file drop (§23.2 step 8.5b). */
  kb: ReactNode;
  working: ReactNode;
  onOpen: (id: View) => void;
  onChat: () => void;
  onStart: () => void;
  onAdd: (id: SpecialistId) => void;
  onEditAnswer: (a: Answer, v: string) => void;
}) {
  const { team, live } = p;
  const w = team.workflow;
  const goals = goalsOf(team);
  const busy = live.running > 0;
  const plan = team.plan;
  const athenaStep = w?.steps.find((s) => s.id === "athena");
  const athenaLine = live.status.athena?.state === "working"
    ? live.status.athena.step
    : plan
      ? plan.headline
      : w
        ? "Writes your growth plan once the team's steps are done."
        : "Leads the team: your goals, the workflow, the final plan.";
  return (
    <div className="dash">
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
          {w ? <WorkflowDiagram team={team} live={live} onOpen={p.onOpen} onChat={p.onChat} /> : <p className="small muted shimmer-text">Athena is planning the work for these goals</p>}
        </section>
      )}

      <section className="dash-sec">
        <h3>Your team</h3>
        <button type="button" className={`dash-lead${live.status.athena?.state === "working" ? " dash-working" : ""}`} onClick={() => p.onOpen("athena")}>
          <span className="team-badge" aria-hidden>A</span>
          <span className="dash-lead-body">
            <strong>Athena</strong>
            <span className={live.status.athena?.state === "working" ? "small shimmer-text" : "small"}>{athenaLine}</span>
            {athenaStep && <span className="dash-lead-go">{plan ? "Open Athena's plan" : "Open Athena"} →</span>}
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
                    <p className={`small${line.tone === "live" ? " shimmer-text" : line.tone === "muted" ? " muted" : line.tone === "wait" ? " dash-wait" : ""}`}>{line.text}</p>
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
        </ul>
      </section>

      {!!team.answered?.length && (
        <section className="dash-sec">
          <div className="dash-sec-head">
            <h3>Your answers</h3>
            <small className="muted">Change one and only the steps that read it run again.</small>
          </div>
          <ul className="ans-list">
            {team.answered.map((a) => (
              <AnswerRow key={`${a.id}:${a.answer}`} a={a} busy={busy} onEdit={(v) => p.onEditAnswer(a, v)} />
            ))}
          </ul>
        </section>
      )}

      {p.working && <section className="dash-sec">{p.working}</section>}

      <section className="dash-sec dash-kb">
        <div className="dash-sec-head">
          <h3>Brand Knowledge Base</h3>
          <small className="muted">What Athena knows about your brand. Every subagent reads it.</small>
        </div>
        {p.kb}
      </section>
    </div>
  );
}

/**
 * Athena's growth plan (§23.2 step 8.5m): per target crowd, who, where, through what, the words and when, each line
 * cited to the subagent whose work it comes from; then what the sources disagree on and what's still open.
 */
export function GrowthPlanView({ plan, team, running, onOpen, onUpdate }: { plan?: GrowthPlan; team: TeamState; running: boolean; onOpen: (id: View) => void; onUpdate: () => void }) {
  if (!plan) {
    // Before the plan is started, say what will be here and where it starts.
    if (!team.workflow)
      return (
        <section className="gplan gplan-pending">
          <span className="eyebrow">Athena&apos;s plan</span>
          <p className="small muted">
            Your goals and the plan she writes from the team&apos;s work come here once you{" "}
            <button type="button" className="linkish" onClick={() => onOpen("dashboard")}>
              build your growth plan
            </button>{" "}
            on the dashboard.
          </p>
        </section>
      );
    const left = team.workflow.steps.filter((s) => s.id !== "athena" && s.state !== "done").map((s) => `the ${nameOf(s.id)}`);
    return (
      <section className="gplan gplan-pending">
        <span className="eyebrow">Athena&apos;s plan</span>
        <p className="small muted">
          {left.length ? `Written once ${left.length > 1 ? `${left.slice(0, -1).join(", ")} and ${left.at(-1)} finish` : `${left[0]} finishes`}, from their work alone.` : running ? "Writing it now." : "Written as the workflow's last step."}
        </p>
      </section>
    );
  }
  const stale = planStale(plan, team.works);
  return (
    <section className="gplan" aria-label="Athena's plan">
      <header className="gplan-head">
        <span className="eyebrow">Athena&apos;s plan</span>
        <h2>{plan.headline}</h2>
        <p className="small muted">From {whose(Object.keys(plan.from) as SpecialistId[])} work. No new research: every line points to whose work it is.</p>
      </header>
      {stale && (
        <div className="stale-flag gplan-stale">
          <span className="small">A subagent has newer work than this plan.</span>
          <button type="button" className="linkish small" disabled={running} onClick={onUpdate}>
            {running ? "Updating" : "Update the plan"}
          </button>
        </div>
      )}
      {plan.crowds.map((c) => (
        <article key={c.crowd} className="gplan-crowd">
          <h4>
            <span className="bg-tier">{c.tier}</span> {c.crowd}
          </h4>
          <dl className="gplan-lines">
            {c.lines.map((l, i) => (
              <div key={`${l.kind}${i}`}>
                <dt>{KIND_LABEL[l.kind]}</dt>
                <dd>
                  {l.text}{" "}
                  <button type="button" className="cite gplan-cite" onClick={() => onOpen(l.agent)} title={`Open the ${nameOf(l.agent)}'s work`}>
                    the {nameOf(l.agent)}
                  </button>
                </dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
      {plan.disagreements.length > 0 && (
        <div className="gplan-more">
          <h5>Where the sources disagree</h5>
          <ul>{plan.disagreements.map((d) => <li key={d} className="small">{d}</li>)}</ul>
        </div>
      )}
      {plan.open.length > 0 && (
        <div className="gplan-more">
          <h5>Still open</h5>
          <ul>{plan.open.map((d) => <li key={d} className="small">{d}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
