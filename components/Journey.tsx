"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ACCEPT, TrailView, useBriefChat, type FileChip, type Msg } from "./chat";
import { BrandGraph, StaleFlag } from "./BrandGraph";
import { Question } from "./Question";
import { Galaxy } from "./Galaxy";
import { CrowdGeography } from "./CrowdGeography";
import { WithWithout, type AloneRequest } from "./WithWithout";
import { Onboard } from "./Onboard";
import { Fits, tiersFor } from "./Fits";
import { GoalsBar, SpecialistWorkspace, TeamAsks, TeamPanel, WhatsWorking, WorkView, useTeam, type TeamLive } from "./Team";
import type { StrategyView } from "./Strategy";
import type { Asked } from "./Question";
import type { AgentStreamEvent } from "@/lib/agent/loop";
import type { AgentEvent } from "@/lib/blocks/types";
import type { LiveFact } from "@/lib/knowledge/types";
import { GUESS, type Turn } from "@/lib/brief/conversation";
import { briefToInput } from "@/lib/brief/to-input";
import { itemKey, missingRequired, type BrandBrief } from "@/lib/brief/types";
import { allNodes } from "@/lib/graph/build";
import { POINTER, PREVIEW_AT, applyEdit, applyFiles, fillOther, graphState, previewLine, previewOf, rerun, undo, type EditQuestion, type GraphState, type Op } from "@/lib/graph/edit";
import { staleLine, type RunId } from "@/lib/graph/stale";
import type { GraphInput } from "@/lib/graph/types";
import { keepFile, workspace } from "@/lib/knowledge/workspace";
import type { Channel } from "@/lib/journey/growth";
import { crowdAfterFits, emptyJourney, loadedJourney, type CrowdCard, type CrowdsResult, type Journey as JourneyState } from "@/lib/journey/types";
import type { Galaxy as GalaxyData } from "@/lib/taste/galaxy";
import { packBySlug } from "@/lib/journey/packs";
import { emptyTeam, type Mark, type TeamEvent, type TeamState, type WorkItem } from "@/lib/team/types";
import { isSpecialist, nameOf, type SpecialistId } from "@/lib/agent/specialists";
import { growthQuestion, seedOf, type GrowthQuestion } from "@/lib/journey/flow";

// The journey (PRD §23.2 step 8.1): one path. Onboarding writes the Brand Graph; one growth question in the
// transcript; the Analyst measures the crowds and ranks them, once, with the Taste Galaxy forming in its results; then
// Athena proposes 3–4 goals and only the specialists those goals need run. State lives in this browser only (a
// convenience; nothing is lost if it's cleared).

const STORE = "athena:journey:v1";
type Saved = { brief: BrandBrief; msgs: Msg[]; turn: Turn; journey: JourneyState };

/** `?pack=<slug>` starts a sample brand and `?new=1` starts fresh; either way, the URL is cleaned so a reload resumes. */
let entered: { fresh: boolean; message: string } | undefined;
function entry(): { fresh: boolean; message: string } {
  // Read once per page load: React may run state initialisers twice, and the URL is cleaned right after.
  return (entered ??= readEntry());
}
function readEntry(): { fresh: boolean; message: string } {
  try {
    const q = new URLSearchParams(window.location.search);
    const pack = packBySlug(q.get("pack"));
    const fresh = !!pack || q.get("new") === "1";
    if (fresh) localStorage.removeItem(STORE);
    return { fresh, message: pack?.message ?? "" };
  } catch {
    return { fresh: false, message: "" };
  }
}

function load(): Saved | undefined {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? "null") as Saved | null;
    return s?.brief && s.msgs?.length && s.journey ? s : undefined;
  } catch {
    return undefined;
  }
}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

type Memory = Extract<TeamEvent, { type: "memory" }>;

export function Journey() {
  const [start] = useState(entry);
  // Clean the URL after render (changing it during render upsets Next's router), so a reload resumes.
  useEffect(() => {
    if (start.fresh) window.history.replaceState(null, "", "/plan");
  }, [start.fresh]);
  const [saved] = useState(() => (start.fresh ? undefined : load()));
  const chat = useBriefChat(saved);
  const { brief, msgs, setMsgs, turn, busy, live, queued, first } = chat;
  const [j, setJ] = useState<JourneyState>(saved?.journey ? loadedJourney(saved.journey) : emptyJourney());
  const [text, setText] = useState(start.message);
  const [drag, setDrag] = useState(false);
  // The Taste Galaxy as it forms, round by round, while the Analyst measures.
  const [forming, setForming] = useState<GalaxyData | undefined>();
  // The Analyst finished measuring this visit (so an empty result reads as "not enough in Qloo", not as waiting).
  const [measured, setMeasured] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);

  // The Brand Graph (§23.2 step 7): the brand's one source of truth, made at onboarding and read by every run below.
  // A run that already ran is held on the inputs it ran on when an edit moves what it reads, until it's re-run.
  const g = graphState(j.graph);
  const team = j.team ?? emptyTeam();
  const gInput: GraphInput = { brief, facts: j.facts ?? [], crowds: j.crowds, fits: j.fits, strategy: j.strategy, team, hidden: g.hidden };
  const ran: RunId[] = [...(j.crowds || turn.ready ? ["crowds" as const] : []), ...(j.fits ? ["fits" as const] : []), ...(j.strategy ? ["strategy" as const] : [])];
  // Async replies (a resolved addition, a file read) apply to the graph as it is when they land.
  const latest = useRef({ input: gInput, state: g, ran });
  latest.current = { input: gInput, state: g, ran };
  const crowdsBrief = g.held.crowds?.brief ?? brief;
  const [editQs, setEditQs] = useState<(EditQuestion & { by: "chat" | "graph" })[]>([]);
  const [preview, setPreview] = useState<{ ops: Op[]; line: string; by: "chat" | "graph" }>();
  const [working, setWorking] = useState<{ text: string; by: "chat" | "graph" }>();
  const [graphChips, setGraphChips] = useState<FileChip[]>([]);

  useEffect(() => {
    try {
      if (msgs.length > 1) localStorage.setItem(STORE, JSON.stringify({ brief, msgs: msgs.slice(-40), turn, journey: j } satisfies Saved));
    } catch {
      // Storage unavailable: the journey still works for this visit.
    }
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [brief, msgs, turn, j]);

  const say = (t: string) => setMsgs((m) => [...m, { who: "athena", text: t }]);
  const move = (to: JourneyState["stop"]) => setJ((x) => ({ ...x, stop: to, done: [...new Set([...x.done, x.stop])] }));

  // The seed the Analyst measures from: held by a Brand Graph edit, the brief the crowds were built from.
  const seedKey = JSON.stringify(seedOf(crowdsBrief));
  // The founder's channel answer is theirs; it stands over what the research guessed.
  const teamBrief: BrandBrief = j.channel ? { ...brief, channel: { value: j.channel, source: { kind: "message" }, confirmed: true } } : brief;

  // What the Analyst measured and ranked comes back here as the journey's crowds and fits (§23.2 step 8.1a): ranked
  // once, by the Analyst, for every goal after. A probe from "Ask the Analyst about this" lands the same way.
  const onMemory = (m: Memory) =>
    setJ((x) => {
      if (!m.crowds?.crowds.length) return x;
      const crowds = { ...m.crowds, probes: m.probes };
      const ids = new Set(crowds.crowds.map((c) => c.id));
      const calendar = m.calendar ?? x.fits?.calendar;
      const key = String(hash(JSON.stringify([seedKey, m.probes, m.fits?.fits.map((f) => `${f.crowd}:${f.tier}`)])));
      const fits = m.fits && calendar ? { key, fits: m.fits, calendar, answer: m.answer ?? x.fits?.answer ?? { headline: "", reasons: [], assumptions: [] }, sources: m.sources ?? [], reach: m.reach ?? x.fits?.reach } : x.fits;
      const main = crowds.crowds.find((c) => c.main)?.id ?? crowds.crowds[0]?.id;
      return {
        ...x,
        crowds,
        crowdsFor: seedKey,
        fits,
        crowdId: fits ? crowdAfterFits(fits.fits, x.crowdId && ids.has(x.crowdId) ? x.crowdId : main) : x.crowdId && ids.has(x.crowdId) ? x.crowdId : main,
      };
    });

  // A strategy for every most valuable fit (§23.2 step 6): once the Analyst has ranked, the agent reads the context
  // into who, where, through what and when. A new ranking plans again; the last strategies stay up meanwhile.
  const [asks, setAsks] = useState<Asked[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const told: LiveFact[] = [
    ...(j.told ? [{ id: "answer-growth", text: `Asked "${j.told.question}", the founder answered: ${j.told.answer}`, where: "your answer", source: "the founder" }] : []),
    ...asks.filter((q) => answers[q.id]).map((q) => ({ id: `answer-${q.id}`, text: `Asked "${q.question}", the founder answered: ${answers[q.id]}`, where: "your answer", source: "the founder" })),
  ];
  const [planSteps, setPlanSteps] = useState<AgentEvent[]>([]);
  const [planRunning, setPlanRunning] = useState(false);
  const planKey = useRef("");
  const strategyFor = j.fits && j.crowds?.crowds.length && j.crowdsFor ? `${j.fits.key}${g.rev.strategy ? `:${g.rev.strategy}` : ""}` : "";
  const stratBrief = g.held.strategy?.brief ?? teamBrief;
  const stratFacts = g.held.strategy?.facts ?? j.facts ?? [];
  useEffect(() => {
    if (!strategyFor || !j.fits || !j.crowdsFor || j.strategy?.key === strategyFor || planKey.current === strategyFor) return;
    const key = strategyFor;
    const run = j.fits;
    planKey.current = key;
    setPlanSteps([]);
    setPlanRunning(true);
    // A city the founder marked wrong on the Brand Graph is never a place to start.
    const wrong = new Set((stratBrief.wrong ?? []).map((w) => w.key));
    const reach = run.reach && Object.fromEntries(Object.entries(run.reach).map(([id, ms]) => [id, ms.filter((m) => !wrong.has(itemKey.city(m.metro)))]));
    const body = JSON.stringify({ seed: JSON.parse(j.crowdsFor) as unknown, probes: j.crowds?.probes ?? [], brief: stratBrief, facts: [...stratFacts, ...told], fits: run.fits, calendar: run.calendar, reach });
    const go = (tries: number): Promise<void> =>
      agentStream("/api/strategy", body, (e) => {
        if (planKey.current !== key) return false;
        if (e.type === "event") {
          const ev = e.event;
          setPlanSteps((s) => {
            const i = ev.status === "running" ? -1 : s.findIndex((x) => x.status === "running" && x.tool === ev.tool && x.why === ev.why);
            return i >= 0 ? s.map((x, k) => (k === i ? ev : x)) : [...s, ev];
          });
        } else if (e.type === "ask") setAsks((a) => (a.some((x) => x.question === e.ask.question) ? a : [...a, e.ask]));
        else if (e.type === "strategy") setJ((x) => ({ ...x, strategy: { key, result: e.result, answer: e.answer, sources: e.sources } }));
        return true;
      }).catch(() => (tries > 0 && planKey.current === key ? go(tries - 1) : undefined));
    void go(1).finally(() => planKey.current === key && setPlanRunning(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategyFor]);

  // With / Without (§13.2): the crowds' question also goes to Gemini alone, from the same product description.
  const alone: AloneRequest = { brand: brief.name?.value || "The brand", product: String(briefToInput(brief).description ?? "").slice(0, 400) };

  // Athena and her six specialists (§23.2 step 8): the Analyst first, then goals from the Brand Graph, worked by the team.
  const onboarding = j.stop === "product" && !start.message && !msgs.some((m) => m.who === "you");
  const tm = useTeam({
    team,
    setTeam: (f) => setJ((x) => ({ ...x, team: f(x.team ?? emptyTeam()) })),
    body: () => ({
      seed: JSON.parse(j.crowdsFor ?? seedKey) as unknown,
      probes: j.crowds?.probes ?? [],
      brief: teamBrief,
      ...(j.fits ? { fits: j.fits.fits } : {}),
      answers: j.told ? [j.told] : [],
    }),
    graphRev: g.log.length,
    onMemory,
    onGalaxy: setForming,
    say,
  });
  // "Ask the Analyst about this" from a Galaxy node: the Analyst's workspace opens with the question in the steering box.
  const [about, setAbout] = useState<{ id: string; name: string }>();
  const askAbout = (id: string, name: string) => {
    tm.setActive("analyst");
    setAbout({ id, name });
    setText(`Where does ${name} fit with us?`);
  };

  // The growth question (§23.2 step 8.1a), asked once in the transcript: how the brand sells today, the option the
  // research points to first. The answer is the founder's; the goals that follow read it.
  const gq: GrowthQuestion = growthQuestion(brief);
  const answerGrowth = (a: string) => {
    const exact = gq.options.find((o) => o.label === a);
    const channel: Channel | undefined = exact?.channel ?? (a ? undefined : gq.assumedChannel);
    setJ((x) => ({ ...x, ...(channel ? { channel } : {}), told: { question: gq.question, answer: a || gq.assumed }, stop: "crowd", done: [...new Set([...x.done, x.stop])] }));
    say("Thanks. The Analyst is measuring your crowds in Qloo's taste graph now and will rank them; then I'll suggest where to aim.");
  };

  // The Analyst measures and ranks once the growth question is answered, and again when a Brand Graph edit is re-run
  // on the crowds or the fits. A returning founder's crowds stay as they were measured.
  const measureFor = `${seedKey}|${g.rev.crowds ?? 0}|${g.rev.fits ?? 0}`;
  const measuredFor = useRef(j.crowds && j.crowdsFor === seedKey ? measureFor : "");
  const proposedOnce = useRef(!!team.proposed);
  useEffect(() => {
    if (j.stop !== "crowd" || !turn.ready || measuredFor.current === measureFor) return;
    const fresh = !j.crowds || j.crowdsFor !== seedKey || measuredFor.current.split("|")[1] !== String(g.rev.crowds ?? 0);
    measuredFor.current = measureFor;
    setMeasured(false);
    if (fresh) {
      setForming(undefined);
      setJ((x) => {
        // The crowds measure again, and the fits and strategies with them: nothing of theirs is held any more.
        const gs = graphState(x.graph);
        const { crowds: _c, fits: _f, strategy: _s, ...held } = gs.held;
        return { ...x, crowds: undefined, crowdId: undefined, fits: undefined, strategy: undefined, graph: { ...gs, held } };
      });
    }
    void tm.measure().finally(() => {
      setMeasured(true);
      // Goals come once the crowds are ranked (or Qloo had too little to split them): 3–4, from the Brand Graph.
      if (!proposedOnce.current) {
        proposedOnce.current = true;
        void tm.propose();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j.stop, turn.ready, measureFor]);
  // A journey saved with crowds but no goals yet picks up at the goals.
  useEffect(() => {
    if (j.stop !== "crowd" || !j.crowds || proposedOnce.current || tm.live.running) return;
    proposedOnce.current = true;
    void tm.propose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j.stop, !!j.crowds]);
  const inWorkspace = isSpecialist(tm.active) ? tm.active : undefined;

  // Onboarding (§23.2 step 3): a new founder starts from the three ways in, not a chat. Sample brands and founders
  // who began in the chat keep the chat. (`onboarding` is read above, before the team's hooks.)
  const onBrief = (b: BrandBrief, assumptions: string[], facts: LiveFact[], early = false) => {
    chat.setBrief(b);
    // A new brief from onboarding: earlier graph edits stay in the log, but can't be undone onto it.
    setJ((x) => {
      const gs = graphState(x.graph);
      return { ...x, facts: facts.length || !early ? facts : x.facts, graph: { ...gs, log: gs.log.map(({ before: _b, ...e }) => e) } };
    });
    // The first brief fills the graph while the full read goes on; only the full one moves the journey on.
    if (early) return;
    const ready = missingRequired(b).length === 0;
    chat.setTurn({ text: "", replies: [], ready });
    setMsgs((m) => [
      ...m,
      {
        who: "athena",
        text: ready
          ? `I've read everything and written your brief: it's on the right, every fact with where it came from.${assumptions.length ? ` I went ahead assuming: ${assumptions.join("; ")}` : ""} Correct anything below, or move on.`
          : "I've read what you gave me. Tell me your brand's name and what it sells below, and I'll take it from there.",
      },
    ]);
  };

  // Edits to the Brand Graph (§23.2 step 7c–d), from a click on it or a message in chat: each applies as one edit
  // through the brief merge, notes what it changed with an Undo, and holds the runs whose inputs moved.
  const commit = (b: BrandBrief, facts: LiveFact[], state: GraphState) => {
    latest.current = { ...latest.current, input: { ...latest.current.input, brief: b, facts, hidden: state.hidden }, state };
    chat.setBrief(b);
    setJ((x) => ({ ...x, facts, graph: state }));
    if (!turn.ready && !missingRequired(b).length) chat.setTurn((t) => ({ ...t, ready: true }));
  };
  const apply = (ops: Op[], by: "chat" | "graph") => {
    const { input, state, ran } = latest.current;
    const a = applyEdit(input, state, ops, { by, ran });
    if (a) commit(a.brief, a.facts, a.state);
    return a;
  };
  type Reply = { ops: Op[]; questions: EditQuestion[]; reply: string; team?: boolean };
  /** One call to the graph's edit route, with a hard time limit; past it, the reply points at the graph. */
  const post = async (body: Record<string, unknown>): Promise<Reply> => {
    const { input } = latest.current;
    const nodes = allNodes(input).nodes.map(({ id, type, label }) => ({ id, type, label }));
    try {
      const res = await fetch("/api/graph", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, brief: input.brief, nodes }), signal: AbortSignal.timeout(60_000) });
      const r = (await res.json()) as Partial<Reply>;
      return { ops: Array.isArray(r.ops) ? r.ops : [], questions: Array.isArray(r.questions) ? r.questions : [], reply: typeof r.reply === "string" ? r.reply : "", ...(r.team === true ? { team: true } : {}) };
    } catch {
      return { ops: [], questions: [], reply: POINTER };
    }
  };
  /** Additions and a typed home city are resolved on the server first; everything else applies here. */
  const needsServer = (o: Op) => (o.op === "add" ? !o.id && o.type !== "note" : o.op === "set" && o.field === "activeCity");
  const take = (r: Reply, by: "chat" | "graph") => {
    if (r.questions.length) setEditQs((qs) => [...qs, ...r.questions.map((q) => ({ ...q, by }))]);
    if (r.ops.length) {
      const { input, state } = latest.current;
      const p = previewOf(input, state, r.ops);
      // A big edit is shown first, and applies as one step with one Undo.
      if (p.count > PREVIEW_AT) {
        setPreview({ ops: r.ops, line: previewLine(p), by });
        if (by === "chat" && r.reply) say(r.reply);
        return;
      }
    }
    const a = r.ops.length ? apply(r.ops, by) : undefined;
    if (by !== "chat") return;
    const line = r.reply || a?.edit.note || (r.questions.length ? "" : r.ops.length ? "That's already on your graph." : POINTER);
    if (line) say(line);
  };
  const graphSend = async (message: string, shown = false) => {
    if (!shown) setMsgs((m) => [...m, { who: "you", text: message }]);
    setWorking({ text: "Reading that…", by: "chat" });
    const history = msgs.filter((m) => m.text && !m.card).slice(-8).map(({ who, text }) => ({ who, text }));
    const r = await post({ message, history });
    setWorking(undefined);
    // A request for the team (who to pitch, where to launch, what's working) goes to Athena, who answers or hands it on.
    if (r.team) {
      if (r.ops.length || r.questions.length || r.reply) take(r, "chat");
      return void tm.askAthena(message);
    }
    take(r, "chat");
  };
  const resolveThen = (ops: Op[], by: "chat" | "graph") => {
    setWorking({ text: "Finding it…", by });
    void post({ ops }).then((r) => {
      setWorking(undefined);
      take(r, by);
    });
  };
  const onGraphEdit = (ops: Op[]) => {
    const here = ops.filter((o) => !needsServer(o));
    const there = ops.filter(needsServer);
    if (here.length) apply(here, "graph");
    if (there.length) resolveThen(there, "graph");
  };
  const answer = (q: EditQuestion & { by: "chat" | "graph" }, a: string) => {
    setEditQs((qs) => qs.filter((x) => x.id !== q.id));
    if (!a) return;
    const one = q.options.findIndex((o) => o.label === a);
    const picked = one >= 0 ? [one] : q.multi ? a.split(", ").map((l) => q.options.findIndex((o) => o.label === l)) : [-1];
    if (picked.every((i) => i >= 0)) {
      const ops = picked.flatMap((i) => q.choices[i] ?? []);
      if (ops.some(needsServer)) return resolveThen(ops, q.by);
      const done = apply(ops, q.by);
      if (q.by === "chat") say(done?.edit.note ?? "That's already on your graph.");
      return;
    }
    if (q.other) return resolveThen([fillOther(q.other, a)], q.by);
    if (q.by === "chat") void graphSend(a);
  };
  const onUndo = () => {
    const { input, state, ran } = latest.current;
    const u = undo(input, state, ran);
    if (u) commit(u.brief, u.facts, u.state);
  };
  const onRerun = (run: RunId) => setJ((x) => ({ ...x, graph: rerun(graphState(x.graph), run) }));
  /** A file added after onboarding (§23.2 step 7d): read through the knowledge reader into the graph, as one edit. */
  const readFiles = async (fs: File[]) => {
    const names = fs.map((f) => f.name);
    setGraphChips((c) => [...c.filter((x) => !names.includes(x.name)), ...fs.map((f) => ({ name: f.name, status: "Reading…", busy: true }))]);
    const ws = workspace();
    const kept = await Promise.all(fs.map((f) => keepFile(ws, f)));
    const hashes = kept.flatMap((k) => (k.hash ? [k.hash] : []));
    type Read = { facts?: LiveFact[]; stockists?: { ref: string; list: BrandBrief["stockists"][number]["value"][] }[]; read?: string[] };
    let read: Read = {};
    if (hashes.length)
      try {
        const res = await fetch("/api/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ws, hashes }), signal: AbortSignal.timeout(150_000) });
        read = (await res.json()) as Read;
      } catch {
        // Past the time limit: whatever the reader returns later is dropped, and the graph stays as it was.
      }
    const { input, state, ran } = latest.current;
    const a = hashes.length ? applyFiles(input, state, { facts: read.facts ?? [], stockists: read.stockists ?? [], read: read.read?.length ? read.read : names }, { ran }) : undefined;
    if (a) commit(a.brief, a.facts, a.state);
    setGraphChips((c) => c.map((x) => (x.busy && names.includes(x.name) ? { ...x, busy: false, status: kept[names.indexOf(x.name)]?.hash ? "Read" : kept[names.indexOf(x.name)]?.status ?? "Read" } : x)));
    const label = names.length > 1 ? `${names[0]} and ${names.length - 1} more` : names[0];
    say(a ? a.edit.note : hashes.length ? `Read ${label}: nothing in it the graph doesn't already have.` : `${label} is still on its way; add it again in a moment.`);
  };

  const send = () => {
    if (!text.trim() && !chat.files.length) return;
    // Once the brief is written, the chat edits the Brand Graph: messages through the edit route, files through the reader.
    if (turn.ready) {
      const message = text.trim();
      const fs = chat.files;
      setText("");
      chat.setFiles([]);
      if (fs.length) setMsgs((m) => [...m, { who: "you", text: message, files: fs.map((f) => f.name) }]);
      if (fs.length) void readFiles(fs);
      // In a specialist's workspace, the steering box asks that specialist.
      if (message && inWorkspace) tm.askSpecialist(inWorkspace, message, inWorkspace === "analyst" ? about : undefined);
      else if (message) void graphSend(message, fs.length > 0);
      setAbout(undefined);
      return;
    }
    void chat.send(text);
    setText("");
  };

  // The Brand Graph, shared by onboarding's workspace and the journey.
  const graphEl = (
    <BrandGraph
      input={gInput}
      state={g}
      chips={[...chat.chips, ...graphChips]}
      busy={busy}
      working={working?.by === "graph" ? working.text : undefined}
      questions={editQs.filter((q) => q.by === "graph")}
      onEdit={onGraphEdit}
      onAnswer={(q, a) => answer({ ...q, by: "graph" }, a)}
      onUndo={onUndo}
      onRerun={onRerun}
    />
  );
  const dockEl = <Dock j={j} turn={turn} busy={busy} researching={chat.researching} onReply={(r) => void chat.send(r)} onNext={() => move("growth")} />;
  const analyst = tm.live.status.analyst;
  const analystStep = analyst?.state === "working" ? analyst.step : undefined;

  return (
    <div
      className={`journey ${drag ? "dragging" : ""} ${onboarding ? "ob-on" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files.length) chat.addFiles(e.dataTransfer.files);
      }}
    >
      <header className="topbar journey-top">
        <Link href="/" className="wordmark-link"><strong>Athena</strong></Link>
        {/* Hidden through onboarding (§23.2 step 7.2a); the goals take the progress rail's place (step 8a). */}
        {!onboarding && <GoalsBar goals={team.goals} onChange={turn.ready && j.crowds && !tm.live.running ? () => (tm.setActive("athena"), void tm.propose()) : undefined} />}
        <div className="top-actions">
          <button
            type="button"
            className="linkish"
            onClick={() => {
              try {
                localStorage.removeItem(STORE);
              } catch {
                // Ignore.
              }
              window.location.reload();
            }}
          >
            Start over
          </button>
        </div>
      </header>

      {onboarding ? (
        <main className="journey-main ob-main">
          <Onboard brief={brief} files={chat.files} addFiles={chat.addFiles} setFiles={chat.setFiles} onBrief={onBrief} onFacts={(facts) => setJ((x) => ({ ...x, facts }))} graph={graphEl} dock={dockEl} />
        </main>
      ) : (
        <main className="journey-main journey-team">
          <TeamPanel live={tm.live} team={team} active={tm.active} onOpen={(id) => (tm.setActive(id), setAbout(undefined))} />
          <section className="chat" aria-live="polite">
            {inWorkspace ? (
              <div className="msgs spec-wrap">
                <button type="button" className="linkish small" onClick={() => tm.setActive("athena")}>
                  ← Back to Athena
                </button>
                <SpecialistWorkspace id={inWorkspace} live={tm.live} team={team} alone={alone} onMark={(item, m) => tm.mark(inWorkspace, item, m)} onAnswer={tm.answer} />
                <div ref={end} />
              </div>
            ) : (
            <ol className="msgs">
              {msgs.map((m, i) => [
                <li key={i} className={`msg msg-${m.who}`}>
                  {m.text}
                  {!!m.files?.length && <span className="msg-files">{m.files.map((f) => <span key={f} className="chip">{f}</span>)}</span>}
                </li>,
                m.trail && <TrailView key={`t${i}`} trail={m.trail} />,
              ])}
              {busy && live && <li className="msg msg-athena streaming">{live}</li>}
              {queued && <li className="msg msg-athena typing">Finishing my research, then I&apos;ll read that…</li>}
              {working?.by === "chat" && <li className="msg msg-athena typing">{working.text}</li>}
              {(j.stop === "growth" || j.told) && (
                <li className="msg-question">
                  <Question q={gq} answer={j.told?.answer} onAnswer={answerGrowth} />
                </li>
              )}
              {editQs.filter((q) => q.by === "chat").map((q) => (
                <li key={q.id} className="msg-question">
                  <Question q={q} onAnswer={(a) => answer(q, a)} />
                </li>
              ))}
              {tm.live.asks.some((q) => q.agent === "athena") && (
                <li className="msg-question">
                  <TeamAsks live={tm.live} agent="athena" onAnswer={tm.answer} />
                </li>
              )}
              {preview && (
                <li className="msg msg-athena graph-preview">
                  <p>{preview.line}</p>
                  <div className="replies">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => {
                        const a = apply(preview.ops, preview.by);
                        setPreview(undefined);
                        if (preview.by === "chat") say(a?.edit.note ?? "That's already on your graph.");
                      }}
                    >
                      Apply
                    </button>
                    <button type="button" onClick={() => setPreview(undefined)}>Not now</button>
                  </div>
                </li>
              )}
              <div ref={end} />
            </ol>
            )}

            {dockEl}

            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              {!!chat.files.length && (
                <ul className="chips">
                  {chat.files.map((f, i) => (
                    <li key={`${f.name}${i}`} className="chip">
                      {f.name} <button type="button" className="linkish" aria-label={`Remove ${f.name}`} onClick={() => chat.setFiles(chat.files.filter((_, k) => k !== i))}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
              <textarea
                autoFocus
                rows={first ? 3 : 2}
                value={text}
                maxLength={8000}
                placeholder={first ? "e.g. We're Fishwife: premium tinned fish with playful packaging, about $9 a tin. Sold online and in 1,500 shops. eatfishwife.com" : inWorkspace ? `Ask the ${nameOf(inWorkspace)}` : j.stop === "product" ? "Reply, or drop in a file" : "Ask or change anything: \"drop gyms\", \"what about Austin?\""}
                onChange={(e) => setText(e.target.value)}
                onPaste={(e) => {
                  if (e.clipboardData.files.length) {
                    e.preventDefault();
                    chat.addFiles(e.clipboardData.files);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <div className="row-actions">
                <button type="button" onClick={() => pick.current?.click()}>Add files</button>
                <input ref={pick} type="file" multiple accept={ACCEPT} hidden onChange={(e) => e.target.files && chat.addFiles(e.target.files)} />
                <span className="muted small">Decks, stockist sheets, photos, PDFs.</span>
                <button type="submit" className="primary" disabled={(busy && !chat.researching) || !!queued || (first ? !text.trim() : !text.trim() && !chat.files.length)}>Send</button>
              </div>
            </form>
          </section>

          <section className="journey-canvas" aria-label="Your plan so far">
            <WhatsWorking team={team} graphRev={g.log.length} busy={tm.live.running > 0} onRefresh={tm.refresh} />
            <div id="stop-product">{graphEl}</div>
            {j.stop === "crowd" && (
              <div id="stop-analyst">
                {(["crowds", "fits", "strategy"] as const).map((r) => g.held[r] && <StaleFlag key={r} run={r} line={staleLine(r, g.held[r]!)} onRerun={() => onRerun(r)} />)}
                <AnalystResults
                  j={j}
                  step={analystStep}
                  measured={measured}
                  forming={forming}
                  fits={{ steps: [], running: !!analystStep && !j.fits, asks, answers, onAnswer: (q, a) => setAnswers((x) => ({ ...x, [q.id]: a })), strategy: j.fits && (j.strategy || planRunning) ? { run: j.strategy, steps: planSteps, running: planRunning } : undefined }}
                  onAsk={askAbout}
                  probing={j.crowds ? analystStep : undefined}
                  alone={alone}
                />
              </div>
            )}
            {j.stop === "crowd" && <GoalWork team={team} live={tm.live} alone={alone} onOpen={(id) => tm.setActive(id)} onMark={tm.mark} />}
          </section>
        </main>
      )}
    </div>
  );
}

/** Reads an agent's stream (its steps, any question, then its result). The handler returns false to stop listening. */
async function agentStream(path: string, body: string, on: (e: AgentStreamEvent) => boolean): Promise<void> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  if (!res.body) throw new Error("no stream");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    buf += done ? dec.decode() : dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) if (p.startsWith("data:") && !on(JSON.parse(p.slice(5)) as AgentStreamEvent)) return;
    if (done) return;
  }
}

/** The choices above the composer while the brief is written: the chat's quick replies, then on to the growth question. */
function Dock(props: { j: JourneyState; turn: Turn; busy: boolean; researching: boolean; onReply: (r: string) => void; onNext: () => void }) {
  const { j, turn, busy } = props;
  if (j.stop !== "product" || (busy && !props.researching)) return null;
  return (
    <div className="replies">
      {turn.replies.filter((r) => r !== GUESS || !turn.ready).map((r) => (
        <button key={r} type="button" onClick={() => props.onReply(r)}>{r}</button>
      ))}
      {turn.ready && <button type="button" className="primary" onClick={props.onNext}>Next: how you sell →</button>}
    </div>
  );
}

/**
 * Below the Analyst, the work the chosen goals need (§23.2 step 8.1a): one card per specialist on a goal, its results
 * once in, a line saying what it's doing meanwhile. Specialists no goal needs don't run and don't show.
 */
function GoalWork({ team, live, alone, onOpen, onMark }: { team: TeamState; live: TeamLive; alone: AloneRequest; onOpen: (id: SpecialistId) => void; onMark: (agent: SpecialistId, item: WorkItem, m: Mark) => void }) {
  const ids = [...new Set(team.goals.filter((goal) => goal.id !== "know_crowd").flatMap((goal) => goal.team))].filter((id) => id !== "analyst");
  if (!ids.length) return null;
  return (
    <>
      {ids.map((id) => {
        const s = live.status[id];
        const w = team.works[id];
        const step = s?.state === "working" ? s.step : undefined;
        if (!w && !step && !live.running) return null;
        return (
          <section key={id} id={`work-${id}`} className="goal-work">
            <header className="card-head">
              <h3>{nameOf(id)}</h3>
              <button type="button" className="linkish small" onClick={() => onOpen(id)}>Open the {nameOf(id)}&apos;s workspace</button>
            </header>
            {w ? (
              <WorkView work={w} team={team} updating={!!step} alone={alone} onMark={(item, m) => onMark(id, item, m)} />
            ) : (
              <section className="card">
                <ol className="steps live-steps">
                  <li className="step-active"><span className="spin" aria-hidden /><span className="shimmer-text">{step ?? "Starting on your goals"}</span></li>
                </ol>
              </section>
            )}
          </section>
        );
      })}
    </>
  );
}

const SKEW_LABEL = "Aggregate taste-panel signal from Qloo, relative to average. It describes people who share this taste, not your customers. Treat it as something to test, not a fact.";

function skewLine(s: CrowdCard["skew"]): string | undefined {
  if (!s?.clear) return undefined;
  const ages: Record<string, string> = { "24_and_younger": "under 25", "25_to_29": "25–29", "30_to_34": "30–34", "35_to_44": "35–44", "45_to_54": "45–54", "55_and_older": "55+" };
  const topAge = Object.entries(s.age).sort((a, b) => b[1] - a[1])[0];
  const g = s.gender.female >= 0.1 ? "female" : s.gender.male >= 0.1 ? "male" : undefined;
  return [topAge && topAge[1] >= 0.1 ? `leans ${ages[topAge[0]] ?? topAge[0]}` : "", g ? `leans ${g}` : ""].filter(Boolean).join(", ");
}

type FitsView = { steps: AgentEvent[]; running: boolean; asks: Asked[]; answers: Record<string, string>; onAnswer: (q: Asked, a: string) => void; strategy?: StrategyView };

/**
 * The Analyst's results (§23.2 step 8.1b): the Taste Galaxy forming live while it measures, then the crowds it ranked
 * as the brand's most valuable fits (Win first, Win next, Watch, as the Analyst set them), each top fit with its
 * strategy, the linked map and the crowd cards. "Ask the Analyst about this" stays on every Galaxy node.
 */
function AnalystResults({ j, step, measured, forming, fits, onAsk, probing, alone }: { j: JourneyState; step?: string; measured: boolean; forming?: GalaxyData; fits: FitsView; onAsk: (id: string, name: string) => void; probing?: string; alone: AloneRequest }) {
  const r = j.crowds;
  // Linked views (§9.26): the crowd under the pointer in the Galaxy, the map or the cards lights up in all three.
  const [lit, setLit] = useState<number | null>(null);
  // While the crowds are measured, the Galaxy forms in place of the step list (from the first ring, about 5 s in).
  if (!r && forming) return <Galaxy galaxy={forming} step={step} />;
  if (!r && !measured)
    return (
      <section className="card">
        <h3>The Analyst</h3>
        <ol className="steps live-steps">
          <li className="step-active">
            <span className="spin" aria-hidden />
            <span className="shimmer-text">{step ?? "Reading your product into Qloo"}</span>
          </li>
        </ol>
        <p className="small muted">The first measurement takes 20–40 seconds; the Galaxy draws itself as it goes.</p>
      </section>
    );
  if (!r || !r.crowds.length)
    return (
      <section className="card">
        <h3>Your crowds</h3>
        <p>Qloo doesn&apos;t have enough on this product yet to split its crowd, so the plan reads your brand and brands like it directly.</p>
      </section>
    );
  const from = [r.seed.brand?.name, ...r.seed.lookalikes.map((l) => l.name)].filter(Boolean);
  const decisions = tiersFor(j.fits, r.crowds);
  const slot = (id: string) => Math.max(0, r.crowds.findIndex((c) => c.id === id)) % 4;
  return (
    <section className="crowds">
      {r.galaxy && <Galaxy galaxy={r.galaxy} names={r.crowds.map((c) => c.name)} decisions={decisions} probes={r.probes ?? []} onAsk={onAsk} probing={probing} lit={lit} onLight={setLit} />}
      <Fits run={j.fits} {...fits} slot={slot} />
      {!probing && <CrowdGeography crowds={r.crowds} lit={lit} onLight={setLit} />}
      <header className="card-head">
        <h3>Your crowds</h3>
        <p className="small muted">
          Read from {from.join(", ")}{r.seed.tags.length ? ` and the traits ${r.seed.tags.map((t) => t.name.toLowerCase()).join(", ")}` : ""}. Built from {r.calls} Qloo calls.
        </p>
      </header>
      <div className="crowd-grid">
        {r.crowds.map((c, ci) => {
          const chosen = j.crowdId === c.id;
          const skew = skewLine(c.skew);
          const d = decisions[ci];
          return (
            <article key={c.id} className={`crowd ${chosen ? "chosen" : ""} ${d?.watch ? "dimmed" : ""}${lit === ci ? " lit" : ""}`} onMouseEnter={() => setLit(ci)} onMouseLeave={() => setLit(null)}>
              <p className="crowd-tag">{d ? `${d.tier} · ` : ""}{c.main ? "Closest to your product" : "Next door"}</p>
              <h4>
                <span className="swatch" style={{ background: `var(--crowd-${ci % 4})` }} aria-hidden />
                {c.name}
              </h4>
              <div className="taste-loves">
                {c.loves.map((l, i) => (
                  <span key={l.name} className="love" style={{ animationDelay: `${i * 50}ms` }}>
                    {l.name} <small>{l.kind}</small>
                  </span>
                ))}
              </div>
              {!!c.cities.length && <p className="small"><strong>Concentrates in</strong> {c.cities.slice(0, 4).map((x) => x.name).join(", ")}</p>}
              <Meeting r={r} crowd={c} />
              {skew && <p className="small" title={SKEW_LABEL}><strong>Audience</strong> {skew} <span className="muted">· Qloo taste panel, to test</span></p>}
            </article>
          );
        })}
      </div>
      <WithWithout stop="crowd" question="Who are this product's customers, and what do they love?" athena={r.crowds.map((c) => ({ name: c.name, why: c.loves.slice(0, 6).map((l) => l.name).join(", ") }))} request={alone} />
      <p className="small muted">{SKEW_LABEL}</p>
    </section>
  );
}

/** Where a next-door crowd meets the main one (§9.28): what both love, each side's percentile on hover. */
function Meeting({ r, crowd }: { r: NonNullable<JourneyState["crowds"]>; crowd: CrowdCard }) {
  const m = r.meetings?.find((x) => x.b === crowd.id);
  const main = r.crowds.find((c) => c.id === m?.a);
  if (!m || !main) return null;
  return (
    <p className="small meeting">
      <strong>Meets {main.name} at</strong>{" "}
      {m.items.slice(0, 4).map((x, i) => (
        <span key={x.id} title={`${main.name}: ${Math.round(x.a * 100)}th percentile · ${crowd.name}: ${Math.round(x.b * 100)}th`}>
          {i ? ", " : ""}
          {x.name}
        </span>
      ))}
    </p>
  );
}
