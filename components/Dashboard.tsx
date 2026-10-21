"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GoalsBar, statusOf, type TeamLive, type View } from "./Team";
import { inputById } from "@/lib/team/inputs";
import { TIER_LABEL } from "@/lib/team/page";
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
    <div className={`wf${compact ? " wf-compact" : ""}`} role="group" aria-label="Athena's workflow">
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

/** The dashboard's tabs (§23.5 a1), kept in the URL as `/plan?tab=…` so Back and Forward move between them. */
const DASH_TABS = [
  { id: "overview", label: "Overview" },
  { id: "knowledge", label: "Brand Knowledge Base" },
  { id: "plan", label: "Athena's plan" },
  { id: "answers", label: "Your answers" },
  { id: "working", label: "What's working" },
] as const;
export type DashTab = (typeof DASH_TABS)[number]["id"];

function tabFromUrl(): DashTab {
  try {
    const t = new URLSearchParams(window.location.search).get("tab");
    return DASH_TABS.find((x) => x.id === t)?.id ?? "overview";
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
  onUpdatePlan: () => void;
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
      ? plan.headline
      : w
        ? "Writes your growth plan once the team's steps are done."
        : "Leads the team: your goals, the workflow, the final plan.";
  const count: Partial<Record<DashTab, number>> = { answers: team.answered?.length || undefined };
  const overview = (
    <>
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
        <button type="button" className={`dash-lead${live.status.athena?.state === "working" ? " dash-working" : ""}`} onClick={() => (plan ? pick("plan") : p.onOpen("athena"))}>
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
        {tab === "plan" && <GrowthPlanView plan={plan} team={team} running={busy} onOpen={(id) => (id === "dashboard" ? pick("overview") : p.onOpen(id))} onUpdate={p.onUpdatePlan} />}
        {tab === "answers" && (
          <section className="dash-sec">
            <div className="dash-sec-head">
              <h3>Your answers</h3>
              <small className="muted">Change one and only the steps that read it run again.</small>
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
      </div>
    </div>
  );
}

/**
 * Athena's plan (§23.5 m): numbered steps, shared moves first, then each crowd in its order. Each step says what to do,
 * for which crowds, where, through what, the words, when and the cost, every line cited to the subagent it came from,
 * and which earlier steps it waits on; then what the sources disagree on and what's still open.
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
  // A plan saved before the numbered steps is written again from the same work.
  const stale = !plan.steps || planStale(plan, team.works);
  return (
    <section className="gplan" aria-label="Athena's plan">
      <header className="gplan-head">
        <span className="eyebrow">Athena&apos;s plan</span>
        <h2>{plan.headline}</h2>
        <p className="small muted">From {whose(Object.keys(plan.from) as SpecialistId[])} work. No new research: every line points to whose work it is.</p>
      </header>
      {stale && (
        <div className="stale-flag gplan-stale">
          <span className="small">{plan.steps ? "A subagent has newer work than this plan." : "This plan was written before the numbered steps."}</span>
          <button type="button" className="linkish small" disabled={running} onClick={onUpdate}>
            {running ? "Updating" : "Update the plan"}
          </button>
        </div>
      )}
      {plan.steps && plan.steps.length > 0 && (
        <ol className="gplan-steps">
          {plan.steps.map((st, i) => (
            <li key={st.n} className="gplan-step">
              {(i === 0 || plan.steps![i - 1].phase !== st.phase) && <span className="eyebrow gplan-phase">{st.phase === "shared" ? "Shared moves" : TIER_LABEL[st.phase]}</span>}
              <div className="gplan-step-head">
                <span className="gplan-n" aria-hidden="true">{st.n}</span>
                <div>
                  <h4>{st.what}</h4>
                  <p className="small muted">
                    For {st.crowds.join(", ")}
                    {st.depends.length > 0 && ` · after step${st.depends.length > 1 ? "s" : ""} ${st.depends.join(", ")}`}
                  </p>
                </div>
              </div>
              <dl className="gplan-lines">
                {st.lines.map((l, j) => (
                  <div key={`${l.kind}${j}`}>
                    <dt>{KIND_LABEL[l.kind]}</dt>
                    <dd>
                      {l.url ? (
                        <a href={l.url} target="_blank" rel="noreferrer">
                          {l.text}
                        </a>
                      ) : (
                        l.text
                      )}{" "}
                      {l.agent && (
                        <button type="button" className="cite gplan-cite" onClick={() => onOpen(l.agent!)} title={`Open the ${nameOf(l.agent)}'s work`}>
                          the {nameOf(l.agent)}
                        </button>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      )}
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
