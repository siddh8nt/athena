"use client";

import { useEffect, useRef, useState } from "react";
import { Question, type Asked } from "./Question";
import { WithWithout, type AloneRequest } from "./WithWithout";
import type { AgentEvent } from "@/lib/blocks/types";
import type { Galaxy } from "@/lib/taste/galaxy";
import type { BenchTask } from "@/lib/bench/lines";
import type { AloneStop } from "@/lib/proof/alone";
import { addEvent, lineDetail, lineText, settleRun, type Line } from "@/lib/agent/transcript";
import { ATHENA, SPECIALIST_IDS, isSpecialist, nameOf, panelIds, specialist, type AgentId, type SpecialistId } from "@/lib/agent/specialists";
import { GOALS, pickGoals, teamFor, teamLine } from "@/lib/agent/goals";
import { fromCity, fromWork, type Handoff } from "@/lib/agent/handoffs";
import { latest, staleRuns, whatsWorking } from "@/lib/agent/outcomes";
import { nodesAdded } from "@/lib/graph/types";
import { MARKS, MARK_LABEL, type AgentStatus, type Goal, type Mark, type TeamEvent, type TeamState, type Work, type WorkItem } from "@/lib/team/types";

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
};

const emptyLive = (): TeamLive => ({ status: {}, lines: {}, replies: {}, asks: [], answers: {}, asked: {}, running: 0 });

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
  say: (text: string) => void;
  /** A crowd's id by its name, for the handoffs a finished run offers. */
  crowdId?: (name: string) => string | undefined;
}) {
  const [live, setLive] = useState<TeamLive>(emptyLive);
  const [active, setActive] = useState<AgentId>("athena");
  const latestTeam = useRef(p.team);
  latestTeam.current = p.team;
  const run = useRef(0);
  const custom = useRef("");
  // The handoffs Athena offers in the chat after a run, by their label (§23.2 step 8.3d).
  const offered = useRef(new Map<string, Handoff>());

  const handle = (e: TeamEvent, n: number) => {
    if (e.type === "goals") p.setTeam((t) => ({ ...t, proposed: e.goals }));
    else if (e.type === "custom") start([e.goal]);
    else if (e.type === "assign") line("athena", { t: 0, tool: "assign", why: `${e.goal.label}: ${e.line || "Athena takes it herself."}`, status: "ok", callIds: [], summary: "" }, n);
    else if (e.type === "status") setLive((l) => ({ ...l, status: { ...l.status, [e.agent]: e.status } }));
    else if (e.type === "step") line(e.agent, e.event, n);
    else if (e.type === "ask" && e.ask.id === "goals") {
      // The goals question is Athena's: bring her panel forward so it is never missed behind a specialist's.
      setActive("athena");
      setLive((l) => ({ ...l, asks: [...l.asks.filter((a) => a.id !== "goals"), { ...e.ask, agent: e.agent }], answers: omit(l.answers, "goals") }));
    } else if (e.type === "ask") setLive((l) => (l.asks.some((a) => a.id === e.ask.id && l.answers[a.id] === undefined) ? l : { ...l, asks: [...l.asks.filter((a) => a.id !== e.ask.id), { ...e.ask, agent: e.agent }], answers: omit(l.answers, e.ask.id) }));
    else if (e.type === "work") {
      if (e.agent !== "analyst") offerNext(e.work);
      p.setTeam((t) => ({
        ...t,
        previous: { ...t.previous, ...(t.works[e.agent] ? { [e.agent]: t.works[e.agent] } : {}) },
        works: { ...t.works, [e.agent]: e.work },
        rev: { ...t.rev, [e.agent]: p.graphRev },
      }));
    }
    else if (e.type === "reply") {
      const who: AgentId = e.agent ?? "athena";
      setLive((l) => ({ ...l, replies: { ...l.replies, [who]: [...(l.replies[who] ?? []), e.text].slice(-6) } }));
      if (who === "athena") p.say(e.text);
    } else if (e.type === "memory") p.onMemory(e);
    else if (e.type === "galaxy") p.onGalaxy?.(e.galaxy);
  };
  const line = (agent: AgentId, ev: AgentEvent, n: number) => setLive((l) => ({ ...l, lines: { ...l.lines, [agent]: addEvent(l.lines[agent] ?? [], ev, n).slice(-60) } }));

  /** One call to the team route. A dropped stream settles quietly: running lines go, the last results stay. */
  const post = async (action: string, extra: Record<string, unknown> = {}) => {
    const n = ++run.current;
    setLive((l) => ({ ...l, running: l.running + 1 }));
    const body = p.body();
    // The founder's answers in the journey (the growth question) and to the team's own questions, read as facts.
    const given = Array.isArray(body.answers) ? (body.answers as { question: string; answer: string }[]) : [];
    const asked = [...given, ...live.asks.filter((a) => live.answers[a.id]).map((a) => ({ question: a.question, answer: live.answers[a.id] }))];
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, action, team: latestTeam.current, graphRev: p.graphRev, answers: asked, ...extra }),
        signal: AbortSignal.timeout(480_000),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        buf += done ? dec.decode() : dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) if (part.startsWith("data:")) handle(JSON.parse(part.slice(5)) as TeamEvent, n);
        if (done) break;
      }
    } catch {
      // Past the time limit or offline: what the team found so far stays up.
    } finally {
      setLive((l) => ({
        ...l,
        running: Math.max(0, l.running - 1),
        lines: Object.fromEntries(Object.entries(l.lines).map(([k, v]) => [k, settleRun(v ?? [], n)])),
        // Anyone still marked working when the stream ends is settled from what they last returned.
        status: Object.fromEntries(Object.entries(l.status).map(([k, s]) => [k, s?.state === "working" ? settled(k as AgentId, latestTeam.current) : s])),
      }));
    }
  };

  /** When a specialist finishes, Athena says so in the chat and offers whoever its results hand on to. */
  const offerNext = (work: Work) => {
    const next = fromWork(work, p.crowdId ?? (() => undefined));
    p.say(`The ${nameOf(work.agent)} is done: ${work.headline.replace(/\.$/, "")}.`);
    if (!next.length) return;
    for (const h of next) offered.current.set(h.label, h);
    const id = `next_${work.agent}`;
    const ask: TeamAsk = { id, agent: "athena", question: "Where next?", why: `What the ${nameOf(work.agent)} found, handed on.`, options: next.map((h) => ({ label: h.label, hint: `With the ${nameOf(h.to)}.` })), multi: false, assumed: next[0].label };
    setLive((l) => ({ ...l, asks: [...l.asks.filter((a) => a.id !== id), ask], answers: omit(l.answers, id) }));
  };
  /** A handoff (§23.2 step 8.3b): the next specialist starts with the crowd or city it came from, and its panel opens. */
  const handoff = (h: Handoff) => {
    setActive(h.to);
    const g: Goal = { id: `handoff_${h.to}`, label: h.label, why: "Handed on from a result", team: [h.to], conflicts: [] };
    p.setTeam((t) => ({ ...t, goals: [...t.goals.filter((x) => x.id !== g.id), g].slice(-5) }));
    void post("run", { goals: [g], focus: h.focus });
  };

  /** The picked goals go to the team; ones already on top stay. */
  const start = (goals: Goal[]) => {
    if (!goals.length) return;
    const fresh = goals.filter((g) => g.team.length);
    for (const g of goals.filter((x) => x.outside)) p.say(g.team.length ? `I've put the ${teamLine(g.team).replace(/^With the /, "").replace(/\.$/, "")} on the part we can do. ${g.outside}` : `${g.outside} Here's what the team can do meanwhile.`);
    if (!fresh.length) return void propose();
    p.setTeam((t) => ({ ...t, goals: [...t.goals.filter((x) => !fresh.some((g) => g.id === x.id)), ...fresh].slice(-5) }));
    void post("run", { goals: fresh });
  };
  const propose = () => post("propose");

  /** The founder answered a question from the team: the goals, a custom goal's closest missions, or a founder-only fact. */
  const answer = (q: TeamAsk, a: string) => {
    setLive((l) => ({ ...l, answers: { ...l.answers, [q.id]: a } }));
    const proposed = latestTeam.current.proposed ?? [];
    if (q.id === "goals") {
      const picked = a ? pickGoals(proposed, a) : proposed.slice(0, 1);
      if (picked.length) return start(picked);
      custom.current = a;
      return void post("custom", { text: a });
    }
    if (q.id.startsWith("next_")) {
      const h = offered.current.get(a);
      // Other: the founder's own next step goes to Athena, who answers or hands it on.
      return h ? handoff(h) : a ? askAthena(a) : undefined;
    }
    if (q.id === "custom") {
      const close = pickGoals(GOALS as Goal[], a);
      const text = custom.current;
      if (!close.length || !text) return;
      return start([{ id: `custom_${close.map((g) => g.id).join("_")}`, label: text.slice(0, 80), why: "In your words", team: teamFor(close), conflicts: [], custom: true }]);
    }
  };

  const askAthena = (text: string) => {
    setActive("athena");
    void post("ask", { text });
  };
  /** A question from a specialist's workspace or "Ask the Analyst about this" (§23.2 step 8i). */
  const askSpecialist = (id: SpecialistId, text: string, about?: { id: string; name: string }) => {
    setActive(id);
    setLive((l) => ({ ...l, replies: { ...l.replies, [id]: [] }, asked: { ...l.asked, [id]: text } }));
    if (id === "analyst") return void post("analyst", { text, ...(about ? { asked: about } : {}) });
    void post("run", { goals: [{ id: "ask", label: text.slice(0, 160), why: `You asked the ${nameOf(id)}`, team: [id], conflicts: [] }] });
  };
  /** Bring stale specialists up to date: the goals on top run again, and Athena adds whoever is stale. */
  const refresh = () => void post("run", { goals: latestTeam.current.goals });

  const mark = (agent: SpecialistId, item: WorkItem, m: Mark) =>
    p.setTeam((t) => ({ ...t, outcomes: [...t.outcomes, { item: item.id, agent, kind: item.kind, name: item.name, ...(item.group ? { group: item.group } : {}), mark: m, at: Date.now() }].slice(-300) }));

  /** The Analyst measures and ranks the crowds, once, for the whole journey (§23.2 step 8.1a). */
  const measure = () => {
    const g = GOALS.find((x) => x.id === "know_crowd")!;
    p.setTeam((t) => ({ ...t, goals: t.goals.some((x) => x.id === g.id) ? t.goals : [...t.goals, g] }));
    return post("run", { goals: [g] });
  };

  return { live, active, setActive, propose, answer, askAthena, askSpecialist, refresh, mark, start, measure, handoff };
}

const omit = (o: Record<string, string>, k: string) => Object.fromEntries(Object.entries(o).filter(([x]) => x !== k));

/** An agent's status from what it last returned: done with its last result, or idle. */
function settled(id: AgentId, team: TeamState): AgentStatus {
  const w = isSpecialist(id) ? team.works[id] : undefined;
  return w ? { state: "done", last: w.headline } : { state: "idle" };
}

function statusOf(id: AgentId, live: TeamLive, team: TeamState): AgentStatus {
  return live.status[id] ?? settled(id, team);
}

function statusText(id: AgentId, s: AgentStatus): string {
  if (s.state === "working") return s.step;
  if (s.state === "waiting") return `Waiting: ${s.reason}`;
  if (s.state === "done") return s.last;
  return id === "athena" ? ATHENA.role : specialist(id).role;
}

/** The left panel (§23.2 step 8f): Athena and the six, each with live status. On a phone the list is a menu. */
const RAIL = "athena:team-rail";

export function TeamPanel({ live, team, active, onOpen, athena }: { live: TeamLive; team: TeamState; active: AgentId; onOpen: (id: AgentId) => void; athena?: string }) {
  const ids = panelIds(team);
  const on = (id: AgentId) => team.goals.some((g) => isSpecialist(id) && g.team.includes(id));
  // Collapsed to a rail of agent badges with live status, or expanded to the list; the choice is remembered.
  const [rail, setRail] = useState(false);
  useEffect(() => {
    try {
      setRail(localStorage.getItem(RAIL) === "1");
    } catch {
      // Storage unavailable: the panel starts expanded.
    }
  }, []);
  const flip = () =>
    setRail((r) => {
      try {
        localStorage.setItem(RAIL, r ? "0" : "1");
      } catch {
        // Storage unavailable: the choice lasts this visit.
      }
      return !r;
    });
  return (
    <aside className={`team${rail ? " team-rail" : ""}`} aria-label="Athena and her team">
      <button type="button" className="linkish small team-fold" aria-expanded={!rail} onClick={flip} aria-label={rail ? "Show the team" : "Fold the team to a rail"} title={rail ? "Show the team" : "Fold the team to a rail"}>
        {rail ? "»" : "«"}
      </button>
      <label className="team-menu">
        <span className="small muted">Workspace</span>
        <select value={active} onChange={(e) => onOpen(e.target.value as AgentId)}>
          {ids.map((id) => (
            <option key={id} value={id}>
              {nameOf(id)} · {statusText(id, statusOf(id, live, team))}
            </option>
          ))}
        </select>
      </label>
      <ol className="team-list">
        {ids.map((id) => {
          const s = statusOf(id, live, team);
          const text = id === "athena" && athena && s.state !== "working" ? athena : statusText(id, s);
          return (
            <li key={id}>
              <button type="button" className={`team-agent team-${s.state} ${active === id ? "on" : ""} ${on(id) ? "team-on-goal" : ""}`} aria-current={active === id ? "true" : undefined} onClick={() => onOpen(id)} title={rail ? `${nameOf(id)}: ${text}` : undefined}>
                <span className="team-badge" aria-hidden>{nameOf(id).slice(0, 1)}</span>
                <span className="team-text">
                  <strong>{nameOf(id)}</strong>
                  <small>{text}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
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

/** The team's questions for one agent, through step 3's question component. */
export function TeamAsks({ live, agent, onAnswer }: { live: TeamLive; agent: AgentId; onAnswer: (q: TeamAsk, a: string) => void }) {
  const mine = live.asks.filter((a) => a.agent === agent);
  if (!mine.length) return null;
  return (
    <div className="onboard-asks">
      {mine.map((q) => (
        <Question key={q.id} q={q} answer={live.answers[q.id]} onAnswer={(a) => onAnswer(q, a)} />
      ))}
    </div>
  );
}

/** One specialist's workspace (§23.2 step 8b–d, g): its transcript, then its work. */
export function SpecialistWorkspace({ id, live, team, alone, onMark, onAnswer, onHandoff, crowdId }: { id: SpecialistId; live: TeamLive; team: TeamState; alone: AloneRequest; onMark: (item: WorkItem, m: Mark) => void; onAnswer: (q: TeamAsk, a: string) => void; onHandoff?: (h: Handoff) => void; crowdId?: (name: string) => string | undefined }) {
  const s = specialist(id);
  const st = statusOf(id, live, team);
  const work = team.works[id];
  const lines = live.lines[id] ?? [];
  const replies = live.replies[id] ?? [];
  const goals = team.goals.filter((g) => g.team.includes(id));
  return (
    <div className="spec">
      <header className="spec-head">
        <h3>The {s.name}</h3>
        <p className="small muted">{s.mission}</p>
        {goals.length > 0 && <p className="small">For {goals.map((g) => `“${g.label}”`).join(", ")}</p>}
        {st.state === "waiting" && <p className="small muted spec-wait">Waiting: {st.reason}.</p>}
      </header>
      {live.asked[id] && <p className="msg msg-you spec-asked">{live.asked[id]}</p>}
      {replies.map((r, i) => (
        <p key={i} className="spec-reply">{r}</p>
      ))}
      <TeamAsks live={live} agent={id} onAnswer={onAnswer} />
      {lines.length > 0 && <Transcript lines={lines} />}
      {work ? <WorkView work={work} team={team} updating={st.state === "working"} alone={alone} onMark={onMark} onHandoff={onHandoff} crowdId={crowdId} /> : st.state === "idle" && <p className="small muted">Done when: {s.doneWhen}</p>}
    </div>
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
export function WorkView({ work, team, updating, alone, onMark, onHandoff, crowdId }: { work: Work; team: TeamState; updating: boolean; alone: AloneRequest; onMark: (item: WorkItem, m: Mark) => void; onHandoff?: (h: Handoff) => void; crowdId?: (name: string) => string | undefined }) {
  const next = onHandoff && work.agent !== "navigator" ? fromWork(work, crowdId ?? (() => undefined)) : [];
  const nodes = nodesAdded(work);
  const marks = new Map(latest(team.outcomes).filter((o) => o.agent === work.agent).map((o) => [o.item, o.mark]));
  const sources = new Map(work.sources.map((s) => [s.id, s]));
  return (
    <section className={`card spec-work ${updating ? "spec-updating" : ""}`} aria-busy={updating}>
      {updating && <p className="small muted spec-updating-line">Updating; these stay up until the new results land.</p>}
      <h4>{work.headline}</h4>
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
      {work.results.length > 0 && (
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
const MARKABLE = new Set(["venue", "retailer", "partner", "podcast", "event", "creator", "audience", "draft", "city", "neighbourhood"]);

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

function Result({ work, item, mark, team, alone, onMark, onHandoff }: { work: Work; item: WorkItem; mark?: Mark; team: TeamState; alone: AloneRequest; onMark: (m: Mark) => void; onHandoff?: (h: Handoff) => void }) {
  const [know, setKnow] = useState(false);
  const cited = item.sources.map((id) => work.sources.find((s) => s.id === id)).filter((s): s is Work["sources"][number] => !!s);
  const calls = new Set([...item.callIds, ...cited.flatMap((s) => s.callIds)]).size;
  return (
    <li className="spec-result">
      <div className="spec-result-head">
        <strong>{item.name}</strong>
        {item.group && <small className="muted"> · {item.group}</small>}
      </div>
      <p className="small">{item.why}</p>
      {item.detail && <p className="small muted spec-detail">{item.detail}</p>}
      <div className="spec-result-foot">
        {MARKABLE.has(item.kind) && (
          <span className="spec-marks" role="group" aria-label={`What happened with ${item.name}`}>
            {MARKS.map((m) => (
              <button key={m} type="button" className={mark === m ? "on" : ""} aria-pressed={mark === m} onClick={() => onMark(m)}>
                {MARK_LABEL[m]}
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

/** Athena's one "What's working" overview (§23.2 step 8g): the marks so far, what said yes, the patterns, and what's stale. */
export function WhatsWorking({ team, graphRev, busy, onRefresh }: { team: TeamState; graphRev: number; busy: boolean; onRefresh: () => void }) {
  const o = whatsWorking(team);
  const stale = staleRuns(team, graphRev);
  const marked = o.counts.pitched + o.counts.yes + o.counts.no + o.counts.no_reply;
  if (!marked && !stale.length) return null;
  return (
    <section className="card working">
      <h3>What&apos;s working</h3>
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
