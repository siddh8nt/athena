"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ACCEPT, TrailView, useBriefChat, type FileChip, type Msg } from "./chat";
import { BrandGraph, StaleFlag } from "./BrandGraph";
import { Question } from "./Question";
import { usePlan, type PlanSource } from "./usePlan";
import { MarketsView, MessageView, MomentsView, PartnersView, PlacesView } from "./Blocks";
import { Workspace } from "./Workspace";
import { Galaxy } from "./Galaxy";
import { CrowdGeography } from "./CrowdGeography";
import { BenchNote, WithWithout, type AloneRequest } from "./WithWithout";
import { TasteAxes, useLean, type Taste } from "./TasteAxes";
import { ShowWhy } from "./WhyPath";
import { Onboard } from "./Onboard";
import { Fits, tiersFor } from "./Fits";
import { GoalsBar, SpecialistWorkspace, TeamAsks, TeamPanel, WhatsWorking, useTeam } from "./Team";
import type { StrategyView } from "./Strategy";
import type { Asked } from "./Question";
import type { AgentStreamEvent } from "@/lib/agent/loop";
import type { AgentEvent } from "@/lib/blocks/types";
import type { LiveFact } from "@/lib/knowledge/types";
import type { Contribution } from "@/lib/qloo/types";
import { GUESS, type Turn } from "@/lib/brief/conversation";
import { briefToInput } from "@/lib/brief/to-input";
import { itemKey, missingRequired, type BrandBrief } from "@/lib/brief/types";
import { allNodes } from "@/lib/graph/build";
import { POINTER, PREVIEW_AT, applyEdit, applyFiles, fillOther, graphState, previewLine, previewOf, rerun, undo, type EditQuestion, type GraphState, type Op } from "@/lib/graph/edit";
import { staleLine, type RunId } from "@/lib/graph/stale";
import type { GraphInput } from "@/lib/graph/types";
import { keepFile, workspace } from "@/lib/knowledge/workspace";
import { GROWTH, MAX_PICKS, STOP_LABELS, blockedReason, decisionsFor, labelFor, motionsFor, orderFor, spreadNote, stopsFor, suggest, type Channel, type GrowthType, type StopId } from "@/lib/journey/growth";
import { crowdIdForStop, crowdSignal } from "@/lib/journey/weights";
import type { PlaceOption, Resolution } from "@/lib/places/resolve";
import { crowdAfterFits, emptyJourney, loadedJourney, reachOf, type CrowdCard, type CrowdsEvent, type CrowdsResult, type Journey as JourneyState } from "@/lib/journey/types";
import type { Galaxy as GalaxyData } from "@/lib/taste/galaxy";
import { packBySlug } from "@/lib/journey/packs";
import { takeFor } from "@/lib/journey/takes";
import type { Block } from "@/lib/playbook/config";
import type { MarketsData } from "@/lib/blocks/markets";
import type { PlacesData } from "@/lib/blocks/places";
import type { PartnersData } from "@/lib/blocks/partners";
import type { MessageData } from "@/lib/blocks/message";
import type { MomentsData } from "@/lib/blocks/moments";
import { emptyTeam } from "@/lib/team/types";
import { isSpecialist, nameOf } from "@/lib/agent/specialists";

const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), { ssr: false, loading: () => <div className="map map-loading" /> });

// The journey (PRD §6.2, §13.1–13.2): the conversation leads on the left, each stop lands as a card on the canvas on
// the right, and the progress rail on top shows the stops this founder's growth types chose. Step by step: every stop
// waits for the founder's choice. State lives in this browser only (a convenience; nothing is lost if it's cleared).

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

/** Stops whose results depend on the chosen city; the others ignore it, so a city change doesn't re-run them. */
const CITY_STOPS = new Set<StopId>(["where", "places", "moments"]);
/** Stops that can't start before a city is chosen (Where is where it gets chosen). */
const NEEDS_CITY = new Set<StopId>(["places", "moments"]);

/** The blocks a stop runs on the plan engine. */
const BLOCK_OF: Partial<Record<StopId, Block>> = { where: "markets", places: "places", partners: "partners", message: "message", moments: "moments" };

/** The journey's stops that are runs the Brand Graph can hold (§23.2 step 7e). */
const STOP_RUNS = ["where", "places", "partners", "message", "moments", "retailers", "online"] as const satisfies readonly (StopId & RunId)[];

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

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
  const [view, setView] = useState<"journey" | "dashboard">("journey");
  const [crowdSteps, setCrowdSteps] = useState<string[]>([]);
  // The Taste Galaxy as it forms, round by round, before the crowds are named.
  const [forming, setForming] = useState<GalaxyData | undefined>();
  const crowdKey = useRef<string>("");
  const [stopData, setStopData] = useState<Partial<Record<StopId, unknown>>>({});
  const pick = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);

  // The Brand Graph (§23.2 step 7): the brand's one source of truth, made at onboarding and read by every run below.
  // A run that already ran is held on the inputs it ran on when an edit moves what it reads, until it's re-run.
  const g = graphState(j.graph);
  const team = j.team ?? emptyTeam();
  const gInput: GraphInput = { brief, facts: j.facts ?? [], crowds: j.crowds, fits: j.fits, strategy: j.strategy, team, hidden: g.hidden };
  const ran: RunId[] = [
    ...(j.crowds || turn.ready ? ["crowds" as const] : []),
    ...(j.fits ? ["fits" as const] : []),
    ...(j.strategy ? ["strategy" as const] : []),
    ...STOP_RUNS.filter((s) => stopData[s] !== undefined),
  ];
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
  const reached = (s: StopId) => j.stop === s || j.done.includes(s);
  const stops = j.growth.length ? stopsFor(j.growth) : (["product", "growth", "crowd"] as StopId[]);
  const move = (to: StopId) => setJ((x) => ({ ...x, stop: to, done: [...new Set([...x.done, x.stop])] }));
  const next = () => {
    const i = stops.indexOf(j.stop);
    if (i >= 0 && i < stops.length - 1) move(stops[i + 1]);
  };

  // The taste graph starts as soon as the product is clear (§14.9), while the founder answers the next questions.
  const startCrowds = () => {
    // Held by a Brand Graph edit, the crowds stay on the brief they were built from until the founder re-runs them.
    const b = crowdsBrief;
    const body = {
      brand: b.qloo?.match,
      comparables: b.comparables.map((c) => c.value),
      lookalikes: b.proxies ?? [],
      traits: b.traits ?? [],
    };
    const key = JSON.stringify(body);
    if (crowdKey.current === key) return;
    crowdKey.current = key;
    if (j.crowds && j.crowdsFor === key) {
      // Already built for this product (a returning founder). Crowds saved before taste axes (§9.27) pick them up
      // from the server's copy, which factorises the stored graph once; nothing else about the crowds changes.
      // Probed crowds ask with their probes, so they read their own graph.
      const probes = j.crowds.probes ?? [];
      const same = (p?: string[]) => (p ?? []).join(",") === probes.join(",");
      if ((!j.crowds.axes || !j.crowds.meetings) && j.crowds.crowds.length)
        void fetch("/api/crowds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, probes, axesOnly: true }) })
          .then((r) => r.json() as Promise<Pick<CrowdsResult, "axes" | "meetings">>)
          .then(({ axes, meetings }) => (axes?.length || meetings) && setJ((x) => (x.crowds && x.crowdsFor === key && same(x.crowds.probes) ? { ...x, crowds: { ...x.crowds, ...(axes ? { axes } : {}), ...(meetings ? { meetings } : {}) } } : x)))
          .catch(() => undefined);
      return;
    }
    setCrowdSteps([]);
    setForming(undefined);
    setJ((x) => {
      // The crowds build again, and the fits and the strategies with them: nothing of theirs is held any more.
      const gs = graphState(x.graph);
      const { crowds: _c, fits: _f, strategy: _s, ...held } = gs.held;
      return { ...x, crowds: undefined, crowdId: undefined, reactions: {}, pins: {}, lean: {}, fits: undefined, strategy: undefined, graph: { ...gs, held } };
    });
    void crowdStream(key, (e) => {
      if (crowdKey.current !== key) return false;
      if (e.type === "status") setCrowdSteps((s) => [...s, e.text]);
      else if (e.type === "graph") setForming(e.galaxy);
      else setJ((x) => ({ ...x, crowds: e.result, crowdsFor: key, crowdId: defaultCrowd(e.result.crowds, x.growth) }));
      return true;
    }).catch(() => {
      if (crowdKey.current === key) setJ((x) => ({ ...x, crowds: { seed: { lookalikes: [], tags: [], missing: [] }, crowds: [], calls: 0, callIds: [], empty: true } }));
    });
  };

  // Probing belongs to the Analyst (§23.2 step 8i): "Ask the Analyst about this" on a Galaxy node puts a question in the
  // steering box; the Analyst probes on evidence, and what it measured comes back here as the journey's crowds. The
  // fits rank again from the new probes below, with the last ranking up meanwhile.
  const onMemory = (m: { crowds?: CrowdsResult; probes: string[] }) =>
    setJ((x) => {
      if (!m.crowds?.crowds.length) return x;
      const crowds = { ...m.crowds, probes: m.probes };
      const ids = new Set(crowds.crowds.map((c) => c.id));
      const changed = (x.crowds?.probes ?? []).join(",") !== m.probes.join(",");
      return { ...x, crowds, crowdsFor: x.crowdsFor ?? crowdKey.current, ...(changed ? { lean: {} } : {}), crowdId: x.crowdId && ids.has(x.crowdId) ? x.crowdId : defaultCrowd(crowds.crowds, x.growth) };
    });
  // Most valuable fits (§23.2 step 5): once the crowds are in and the product is settled, the agent ranks them from the
  // founder's context. A probe, new facts or an answer to its question ranks again; the last ranking stays up meanwhile.
  const [fitsSteps, setFitsSteps] = useState<AgentEvent[]>([]);
  const [fitsRunning, setFitsRunning] = useState(false);
  const [asks, setAsks] = useState<Asked[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const fitsKey = useRef("");
  const told: LiveFact[] = asks.filter((q) => answers[q.id]).map((q) => ({ id: `answer-${q.id}`, text: `Asked "${q.question}", the founder answered: ${answers[q.id]}`, where: "your answer", source: "the founder" }));
  // Held by a Brand Graph edit, the fits stay on the brief and facts they were ranked from; a re-run ranks again.
  const fitsBrief = g.held.fits?.brief ?? brief;
  const fitsFacts = g.held.fits?.facts ?? j.facts ?? [];
  const fitsInput = j.stop !== "product" && j.crowds?.crowds.length && j.crowdsFor ? { seed: JSON.parse(j.crowdsFor) as unknown, probes: j.crowds.probes ?? [], brief: fitsBrief, facts: [...fitsFacts, ...told] } : undefined;
  const fitsFor = fitsInput ? String(hash(JSON.stringify([j.crowdsFor, fitsInput.probes, fitsInput.facts.map((f) => f.id + f.text), fitsBrief.name?.value, fitsBrief.stockists.length, ...(g.rev.fits ? [g.rev.fits] : [])]))) : "";
  useEffect(() => {
    if (!fitsInput || j.fits?.key === fitsFor || fitsKey.current === fitsFor) return;
    const key = fitsFor;
    fitsKey.current = key;
    setFitsSteps([]);
    setFitsRunning(true);
    const go = (tries: number): Promise<void> =>
      fitsStream(JSON.stringify(fitsInput), (e) => {
        if (fitsKey.current !== key) return false;
        if (e.type === "event") {
          const ev = e.event;
          // A finished step replaces its running line.
          setFitsSteps((s) => {
            const i = ev.status === "running" ? -1 : s.findIndex((x) => x.status === "running" && x.tool === ev.tool && x.why === ev.why);
            return i >= 0 ? s.map((x, k) => (k === i ? ev : x)) : [...s, ev];
          });
        } else if (e.type === "ask") setAsks((a) => (a.some((x) => x.question === e.ask.question) ? a : [...a, e.ask]));
        else if (e.type === "fits")
          setJ((x) => ({ ...x, fits: { key, fits: e.fits, calendar: e.calendar, answer: e.answer, sources: e.sources, reach: reachOf(e.geography) }, crowdId: crowdAfterFits(e.fits, x.crowdId) }));
        return true;
      }).catch(() => (tries > 0 && fitsKey.current === key ? go(tries - 1) : undefined));
    void go(1).finally(() => fitsKey.current === key && setFitsRunning(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitsFor]);

  // A strategy for every most valuable fit (§23.2 step 6): once the fits are ranked from the current context, the
  // agent reads that context into who, where, through what and when. A new ranking plans again; the last strategies
  // stay up meanwhile.
  const [planSteps, setPlanSteps] = useState<AgentEvent[]>([]);
  const [planRunning, setPlanRunning] = useState(false);
  const planKey = useRef("");
  const strategyFor = fitsInput && j.fits && j.fits.key === fitsFor ? `${j.fits.key}${g.rev.strategy ? `:${g.rev.strategy}` : ""}` : "";
  const stratBrief = g.held.strategy?.brief ?? brief;
  const stratFacts = g.held.strategy?.facts ?? j.facts ?? [];
  useEffect(() => {
    if (!strategyFor || !fitsInput || !j.fits || j.strategy?.key === strategyFor || planKey.current === strategyFor) return;
    const key = strategyFor;
    const run = j.fits;
    planKey.current = key;
    setPlanSteps([]);
    setPlanRunning(true);
    // A city the founder marked wrong on the Brand Graph is never a place to start.
    const wrong = new Set((stratBrief.wrong ?? []).map((w) => w.key));
    const reach = run.reach && Object.fromEntries(Object.entries(run.reach).map(([id, ms]) => [id, ms.filter((m) => !wrong.has(itemKey.city(m.metro)))]));
    const body = JSON.stringify({ ...fitsInput, brief: stratBrief, facts: [...stratFacts, ...told], fits: run.fits, calendar: run.calendar, reach });
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

  useEffect(() => {
    if (turn.ready) startCrowds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn.ready, crowdsBrief.qloo?.match?.id, (crowdsBrief.traits ?? []).join(), (crowdsBrief.proxies ?? []).join(), g.rev.crowds]);

  // Each stop's card comes into view as the stop opens.
  useEffect(() => {
    if (j.stop === "product") return;
    const t = setTimeout(() => document.getElementById(`stop-${j.stop}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    return () => clearTimeout(t);
  }, [j.stop]);

  // Athena's line when a stop opens.
  const opened = useRef(new Set<StopId>(saved ? [...saved.journey.done, saved.journey.stop] : []));
  useEffect(() => {
    if (opened.current.has(j.stop)) return;
    opened.current.add(j.stop);
    if (j.stop === "growth") {
      const guess = brief.channel?.value;
      say(guess ? `Looks like ${brief.name?.value ?? "it"} sells ${guess === "both" ? "both online and in stores" : `mostly ${guess}`}. Right? Then pick how you want to grow: up to ${MAX_PICKS}.` : "Do you sell mostly online, mostly in stores and venues, or both? Then pick how you want to grow: up to 3.");
    }
    if (j.stop === "crowd") say("Here's who your product speaks to, read from Qloo's taste graph: real crowds, each a cluster of brands, music and TV the same people love. I'm ranking them as your most valuable fits: who to win first, who next, and who to watch.");
    if (j.stop === "go") say("That's the plan. Open the full plan to see it all on one screen, work your shortlists and draft outreach.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j.stop]);

  // Athena's take on each stop, once its data is in (§6.2.2 step 3). Stops finished before a reload aren't retaken.
  const took = useRef(new Set<StopId>(saved ? saved.journey.done : []));
  useEffect(() => {
    const s = j.stop;
    if (took.current.has(s)) return;
    const t = takeFor(s, stopData[s], j.crowds?.crowds);
    if (!t) return;
    took.current.add(s);
    void fetch("/api/take", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stop: STOP_LABELS[s], brand: brief.name?.value, data: t.data, fallback: t.fallback }) })
      .then((r) => r.json() as Promise<{ text?: string }>)
      .then((r) => say(r.text || t.fallback))
      .catch(() => say(t.fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j.stop, stopData, j.crowds]);

  const crowd = j.crowds?.crowds.find((c) => c.id === j.crowdId);
  const baseFor = (b: BrandBrief) => ({
    ...briefToInput(b),
    comparables: (b.comparables.length ? b.comparables.map((c) => c.value) : (b.proxies ?? [])).slice(0, 5),
    motions: motionsFor(j.growth),
    city: j.city,
  });
  const base = useMemo(
    () => baseFor(brief),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brief.name?.value, brief.sells?.value, brief.stockists.length, j.growth.join(), j.city],
  );
  // Held by a Brand Graph edit, a stop reads the brief it ran on; re-run, it reads the brief as it is now.
  const baseOf = (s: StopId) => {
    const h = g.held[s as RunId];
    return h ? baseFor(h.brief) : g.rev[s as RunId] ? baseFor(brief) : base;
  };
  const extraBrief = (s: StopId) => g.held[s as RunId]?.brief ?? brief;
  // Each stop's crowd; with New crowd plus other picks, the which-crowd answer decides which crowd each stop follows (§7.8).
  const signalFor = (s: StopId) => {
    const id = j.crowds ? crowdIdForStop(s, { growth: j.growth, crowds: j.crowds.crowds, crowdId: j.crowdId, target: j.crowdTarget, reactions: {} }) : undefined;
    return id && j.crowds ? crowdSignal(j.crowds.crowds, id, {}) : undefined;
  };
  const inputFor = (s: StopId) => ({ ...baseOf(s), crowd: signalFor(s) });
  const input = inputFor("go");
  // With / Without (§13.2): every stop's question also goes to Gemini alone, from the same product description.
  const alone: AloneRequest = { brand: brief.name?.value || "The brand", product: String(base.description ?? "").slice(0, 400) };
  // Taste axes (§9.27): the sliders live in the journey, so a lean set at the Crowd stop carries to every list.
  const taste: Taste | undefined = j.crowds?.axes?.length ? { axes: j.crowds.axes, lean: j.lean ?? {}, onLean: (id, pos) => setJ((x) => ({ ...x, lean: { ...x.lean, [id]: pos } })) } : undefined;

  // Prefetch (§14.9): the stop after this one starts in the background once its inputs are settled (a crowd, and a
  // city for the stops that use one), so it's ready when the founder arrives. Stays hidden until then.
  const nextStop = stops[stops.indexOf(j.stop) + 1];
  const prefetch = (s: StopId) => s === nextStop && j.done.includes("growth") && !!crowd && (!NEEDS_CITY.has(s) || !!j.city);

  // Athena and her six specialists (§23.2 step 8): goals from the Brand Graph, worked by the team. The old stops below
  // stay; every one of them is also a specialist's work, reachable as a goal.
  const onboarding = j.stop === "product" && !start.message && !msgs.some((m) => m.who === "you");
  const tm = useTeam({
    team,
    setTeam: (f) => setJ((x) => ({ ...x, team: f(x.team ?? emptyTeam()) })),
    body: () => ({
      seed: j.crowdsFor ? (JSON.parse(j.crowdsFor) as unknown) : JSON.parse(crowdKey.current || "{}"),
      probes: j.crowds?.probes ?? [],
      brief,
      ...(j.fits ? { fits: j.fits.fits } : {}),
    }),
    graphRev: g.log.length,
    onMemory,
    say,
  });
  // "Ask the Analyst about this" from a Galaxy node: the Analyst's workspace opens with the question in the steering box.
  const [about, setAbout] = useState<{ id: string; name: string }>();
  const askAbout = (id: string, name: string) => {
    tm.setActive("analyst");
    setAbout({ id, name });
    setText(`Where does ${name} fit with us?`);
  };
  const proposedOnce = useRef(false);
  useEffect(() => {
    if (!turn.ready || onboarding || !j.crowds || team.proposed || proposedOnce.current) return;
    proposedOnce.current = true;
    void tm.propose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn.ready, onboarding, !!j.crowds]);
  const inWorkspace = isSpecialist(tm.active) ? tm.active : undefined;

  if (view === "dashboard")
    return <Workspace slug="" brands={[]} custom={{ brief, input: { ...input, city: j.city } }} onBack={() => setView("journey")} />;

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

  // The Brand Graph and the stop's choices, shared by onboarding's workspace and the journey.
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
  const dockEl = (
    <Dock
      j={j}
      setJ={setJ}
      brief={brief}
      turn={turn}
      busy={busy}
      researching={chat.researching}
      onReply={(r) => void chat.send(r)}
      onNext={next}
      onMove={move}
      say={say}
      stopData={stopData}
      crowdReady={!!j.crowds}
      onDashboard={() => setView("dashboard")}
    />
  );

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
        {!onboarding && <GoalsBar goals={team.goals} onChange={turn.ready && !tm.live.running ? () => (tm.setActive("athena"), void tm.propose()) : undefined} />}
        <div className="top-actions">
          {j.done.includes("crowd") && <button type="button" onClick={() => setView("dashboard")}>View full plan</button>}
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
            <div id="stop-product">
              {graphEl}
            </div>
            {reached("growth") && j.growth.length > 0 && j.done.includes("growth") && (
              <section id="stop-growth" className="card">
                <h3>How you&apos;ll grow</h3>
                <p>{j.channel === "online" ? "Mostly online" : j.channel === "offline" ? "Mostly in stores and venues" : "Online and in stores"} · {j.growth.map((g) => labelFor(g, j.channel)).join(", ")}</p>
              </section>
            )}
            {reached("crowd") && (
              <div id="stop-crowd">
                {(["crowds", "fits", "strategy"] as const).map((r) => g.held[r] && <StaleFlag key={r} run={r} line={staleLine(r, g.held[r]!)} onRerun={() => onRerun(r)} />)}
                <CrowdStop
                  j={j}
                  steps={crowdSteps}
                  forming={forming}
                  fits={{ steps: fitsSteps, running: fitsRunning, asks, answers, onAnswer: (q, a) => setAnswers((x) => ({ ...x, [q.id]: a })), strategy: j.fits && (j.strategy || planRunning) ? { run: j.strategy, steps: planSteps, running: planRunning } : undefined }}
                  onAsk={askAbout}
                  probing={tm.live.status.analyst?.state === "working" ? tm.live.status.analyst.step : undefined}
                  alone={alone}
                  taste={taste}
                />
              </div>
            )}
            {stops
              .filter((s) => BLOCK_OF[s] && (reached(s) || prefetch(s)))
              .map((s) => (
                <div key={s} id={`stop-${s}`} hidden={!reached(s)}>
                  {g.held[s as RunId] && <StaleFlag run={s as RunId} line={staleLine(s as RunId, g.held[s as RunId]!)} onRerun={() => onRerun(s as RunId)} />}
                  <StopRunner alone={alone} taste={taste} stop={s} block={BLOCK_OF[s]!} input={CITY_STOPS.has(s) ? inputFor(s) : { ...inputFor(s), city: undefined }} rev={g.rev[s as RunId]} brandName={brief.name?.value ?? "Your brand"} onData={(d) => setStopData((x) => (x[s] === d ? x : { ...x, [s]: d }))} />
                </div>
              ))}
            {stops
              .filter((s) => (s === "retailers" || s === "online") && (reached(s) || prefetch(s)))
              .map((s) => (
                <div key={s} id={`stop-${s}`} hidden={!reached(s)}>
                  {g.held[s as RunId] && <StaleFlag run={s as RunId} line={staleLine(s as RunId, g.held[s as RunId]!)} onRerun={() => onRerun(s as RunId)} />}
                  {crowd ? (
                    <ExtraStop
                      kind={s as "retailers" | "online"}
                      signal={(signalFor(s)?.signal ?? crowd.signal.map((x) => ({ ...x, weight: 1 }))).map((x) => ({ id: x.id, weight: x.weight }))}
                      crowdName={signalFor(s)?.name ?? crowd.name}
                      names={Object.fromEntries((signalFor(s)?.signal ?? crowd.signal).map((x) => [x.id, x.name]))}
                      product={[extraBrief(s).sells?.value, ...(extraBrief(s).traits ?? [])].filter(Boolean).join(", ")}
                      category={extraBrief(s).retail}
                      evidence={[extraBrief(s).channels?.value ?? "", ...extraBrief(s).stockists.map((x) => x.value.name), ...extraBrief(s).notes.map((n) => n.value)].filter(Boolean)}
                      rev={g.rev[s as RunId]}
                      skew={crowd.skew}
                      brandName={brief.name?.value ?? "your brand"}
                      alone={alone}
                      taste={taste}
                      onData={(d) => setStopData((x) => (x[s] === d ? x : { ...x, [s]: d }))}
                    />
                  ) : (
                    <section className="card">
                      <h3>{STOP_LABELS[s]}</h3>
                      <p>This stop reads your Win first crowd, and fills in here once your crowds are ranked.</p>
                    </section>
                  )}
                </div>
              ))}
            {reached("go") && (
              <section id="stop-go" className="card go-card">
                <h3>Your plan is ready</h3>
                <p>Everything you chose, on one screen: the crowd, the map, your shortlists, the message and the calendar. Work the pipeline there.</p>
                <button type="button" className="primary" onClick={() => setView("dashboard")}>Open the full plan</button>
              </section>
            )}
          </section>
        </main>
      )}
    </div>
  );
}

/** Reads the crowds stream (status lines, Galaxy snapshots, one result). The handler returns false to stop listening. */
async function crowdStream(body: string, on: (e: CrowdsEvent) => boolean): Promise<void> {
  const res = await fetch("/api/crowds", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  if (!res.body) throw new Error("no stream");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    buf += done ? dec.decode() : dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) if (p.startsWith("data:") && !on(JSON.parse(p.slice(5)) as CrowdsEvent)) return;
    if (done) return;
  }
}

/** Reads the fits stream (the agent's steps, any question, then the ranking). The handler returns false to stop listening. */
const fitsStream = (body: string, on: (e: AgentStreamEvent) => boolean) => agentStream("/api/fits", body, on);

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

/** The crowd the plan follows by default: the main one, or for New crowd the closest adjacent one. */
function defaultCrowd(crowds: CrowdCard[], growth: GrowthType[]): string | undefined {
  if (growth.includes("new_crowd")) return (crowds.find((c) => !c.main) ?? crowds[0])?.id;
  return crowds.find((c) => c.main)?.id ?? crowds[0]?.id;
}

/** What the growth rules need to know about the brand (§7.8 prerequisites). */
function factsFor(brief: BrandBrief, channel: Channel | undefined) {
  return {
    channel,
    hasPresence: brief.stockists.length > 0 || !!brief.activeCity || /stock|shops?|stores?|cafés?|cafes?|grocers?|retail/i.test(brief.channels?.value ?? ""),
    physical: !/\b(app|software|platform|saas)\b/i.test(brief.sells?.value ?? ""),
  };
}

/** The choices for the current stop, above the composer. */
function Dock(props: {
  j: JourneyState;
  setJ: React.Dispatch<React.SetStateAction<JourneyState>>;
  brief: BrandBrief;
  turn: Turn;
  busy: boolean;
  researching: boolean;
  onReply: (r: string) => void;
  onNext: () => void;
  onMove: (s: StopId) => void;
  say: (t: string) => void;
  stopData: Partial<Record<StopId, unknown>>;
  crowdReady: boolean;
  onDashboard: () => void;
}) {
  const { j, setJ, brief, turn, busy } = props;
  const [city, setCity] = useState("");
  // A typed place that fits several real ones ("Portland") waits here for the founder's pick (§9.3).
  const [placeOptions, setPlaceOptions] = useState<PlaceOption[] | null>(null);
  const [placing, setPlacing] = useState(false);
  // Athena pre-selects from its guess; once the founder changes a pick, the picks are theirs.
  const touched = useRef(false);
  const guess = j.channel ?? brief.channel?.value;
  useEffect(() => {
    if (j.stop === "growth" && guess && !touched.current) setJ((x) => (x.growth.length ? x : { ...x, growth: suggest(factsFor(brief, guess)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j.stop, guess]);
  if (j.stop === "product") {
    if (busy && !props.researching) return null;
    return (
      <div className="replies">
        {turn.replies.filter((r) => r !== GUESS || !turn.ready).map((r) => (
          <button key={r} type="button" onClick={() => props.onReply(r)}>{r}</button>
        ))}
        {turn.ready && <button type="button" className="primary" onClick={() => props.onMove("growth")}>Next: how you sell and grow →</button>}
      </div>
    );
  }
  if (j.stop === "growth") {
    const facts = factsFor(brief, guess);
    const channel = facts.channel;
    const choose = (c: Channel) => setJ((x) => ({ ...x, channel: c, growth: touched.current && x.growth.length ? x.growth : suggest({ ...facts, channel: c }) }));
    const toggle = (g: GrowthType) => {
      touched.current = true;
      setJ((x) => ({ ...x, growth: x.growth.includes(g) ? x.growth.filter((y) => y !== g) : [...x.growth, g] }));
    };
    const note = spreadNote(j.growth);
    const decisions = decisionsFor(j.growth);
    return (
      <div className="dock">
        <div className="seg" role="radiogroup" aria-label="How it mostly sells">
          {(["online", "offline", "both"] as Channel[]).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={channel === c} className={channel === c ? "on" : ""} onClick={() => choose(c)}>
              {c === "online" ? "Mostly online" : c === "offline" ? "Mostly offline" : "Both"}
              {brief.channel?.value === c && !j.channel && <small> · {brief.channel.source.kind === "message" ? "you said" : "from the web"}</small>}
            </button>
          ))}
        </div>
        {channel && (
          <div className="growth-cards">
            {orderFor(channel).map((g) => {
              const why = blockedReason(g, facts);
              const on = j.growth.includes(g);
              const star = GROWTH[g].suggestedFor.includes(channel) || (channel === "both" && GROWTH[g].suggestedFor.length > 0);
              return (
                <button key={g} type="button" className={`growth ${on ? "on" : ""}`} disabled={!!why} aria-pressed={on} onClick={() => toggle(g)} title={why}>
                  <strong>{star && "⭐ "}{labelFor(g, channel)}{GROWTH[g].beta && <small className="muted"> Beta</small>}</strong>
                  <span>{GROWTH[g].question}</span>
                  {why && <small className="muted">{why}</small>}
                </button>
              );
            })}
          </div>
        )}
        {note && <p className="small thin-note">{note}</p>}
        {decisions.map((d) => <p key={d.id} className="small muted">{d.text} I&apos;ll ask when we get there.</p>)}
        <div className="replies">
          <button type="button" className="primary" disabled={!channel || !j.growth.length} onClick={() => props.onNext()}>
            {props.crowdReady ? "See your crowds →" : "Next: your crowds →"}
          </button>
        </div>
      </div>
    );
  }
  if (j.stop === "crowd") {
    const chosen = j.crowds?.crowds.find((c) => c.id === j.crowdId);
    // §7.8: New crowd plus other picks needs one answer: who do the other picks target?
    const which = j.crowds?.crowds.length && chosen ? decisionsFor(j.growth).find((d) => d.id === "which_crowd") : undefined;
    const current = j.crowds?.crowds.find((c) => c.main && c.id !== j.crowdId);
    return (
      <div className="dock">
        {which && current && (
          <div className="which-crowd">
            <p className="small">
              {which.for!.map((g) => labelFor(g, j.channel)).join(" and ")}: should {which.for!.length > 1 ? "these" : "this"} target your current crowd or the new one?
            </p>
            <div className="seg" role="radiogroup" aria-label="Which crowd the other picks target">
              {(["current", "new"] as const).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={j.crowdTarget === t} className={j.crowdTarget === t ? "on" : ""} onClick={() => setJ((x) => ({ ...x, crowdTarget: t }))}>
                  {t === "current" ? `Current: ${current.name}` : `New: ${chosen!.name}`}
                </button>
              ))}
            </div>
          </div>
        )}
      <div className="replies">
        <button
          type="button"
          className="primary"
          disabled={!j.crowds || (!!which && !!current && !j.crowdTarget)}
          onClick={() => {
            props.say(chosen ? `Planning for ${chosen.name}: ${chosen.loves.slice(0, 3).map((l) => l.name).join(", ")}.` : "Planning from your brand and brands like it.");
            props.onNext();
          }}
        >
          {chosen ? `Plan for ${chosen.name} →` : j.crowds ? "Continue →" : "Reading your crowds…"}
        </button>
      </div>
      </div>
    );
  }
  if (j.stop === "where") {
    const m = props.stopData.where as MarketsData | undefined;
    // A pick from the list passes its metro id. A typed place (any state, county, city, neighbourhood, zip or region)
    // is resolved first; Athena asks when it fits several places or can't be placed, and never guesses (§9.3).
    const set = (id: string, name: string, note = "") => {
      setPlaceOptions(null);
      setJ((x) => ({ ...x, city: id }));
      props.say(`${note}${name} it is. Everything next is ranked for that area.`);
      props.onNext();
    };
    const place = async (text: string) => {
      setPlacing(true);
      try {
        const r = (await fetch("/api/place", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).then((x) => x.json())) as Resolution;
        if (r.status === "ok") {
          setCity("");
          set(r.id, r.label, r.read && r.read.length > 1 ? `I read “${text}” as ${r.read.join(", ")}. ` : "");
        } else if (r.status === "ask") {
          setPlaceOptions(r.options);
          props.say(r.question);
        } else {
          setPlaceOptions(null);
          props.say(r.question);
        }
      } catch {
        props.say(`Which city, county, state or zip code is “${text}”?`);
      } finally {
        setPlacing(false);
      }
    };
    return (
      <div className="dock">
        {m ? (
          <>
            <p className="small muted">Where should the plan start? {m.method === "brands" ? <>Each city scored on how strongly your crowd&apos;s brands rank there.</> : <>Ranked by how much of your crowd&apos;s taste each city holds.</>}</p>
            <div className="replies">
              {m.metros.slice(0, 5).map((r) => (
                <button key={r.metroId} type="button" className={r.metroId === m.target.metroId ? "primary" : ""} onClick={() => set(r.metroId, r.name)}>
                  {r.rank}. {r.name}
                </button>
              ))}
            </div>
            <form
              className="inline-city"
              onSubmit={(e) => {
                e.preventDefault();
                if (city.trim()) void place(city.trim());
              }}
            >
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Or type any US place: a city, state, zip, neighbourhood…" maxLength={80} />
              <button type="submit" disabled={!city.trim() || placing}>{placing ? "Finding it…" : "Use it"}</button>
            </form>
            {placeOptions && (
              <div className="replies" role="group" aria-label="Which place">
                {placeOptions.map((o) => (
                  <button key={o.id} type="button" onClick={() => set(o.id, o.label)} title={o.detail}>
                    {o.label} <small className="muted">{o.detail}</small>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="small muted">Ranking cities for your crowd…</p>
        )}
      </div>
    );
  }
  if (j.stop === "go") {
    return (
      <div className="replies">
        <button type="button" className="primary" onClick={props.onDashboard}>Open the full plan</button>
      </div>
    );
  }
  return (
    <div className="replies">
      <button type="button" className="primary" onClick={props.onNext}>Continue →</button>
    </div>
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

/** The Crowd stop (§9.23, §23.2 steps 5–6): the crowds from Qloo's taste graph, ranked as the brand's most valuable fits, each top fit with its strategy. */
function CrowdStop({ j, steps, forming, fits, onAsk, probing, alone, taste }: { j: JourneyState; steps: string[]; forming?: GalaxyData; fits: FitsView; onAsk: (id: string, name: string) => void; probing?: string; alone: AloneRequest; taste?: Taste }) {
  const r = j.crowds;
  // Linked views (§9.26): the crowd under the pointer in the Galaxy, the map or the cards lights up in all three.
  const [lit, setLit] = useState<number | null>(null);
  // While the crowds are measured, the Galaxy forms in place of the step list (from the first ring, about 5 s in).
  if (!r && forming) return <Galaxy galaxy={forming} step={steps[steps.length - 1]} />;
  if (!r)
    return (
      <section className="card">
        <h3>Your crowds</h3>
        <ol className="steps live-steps">
          {(steps.length ? steps : ["Reading your product into Qloo"]).map((s, i, all) => (
            <li key={i} className={i === all.length - 1 ? "step-active" : "step-done"}>
              <span className={i === all.length - 1 ? "spin" : "tick"} aria-hidden>{i === all.length - 1 ? "" : "✓"}</span>
              <span className={i === all.length - 1 ? "shimmer-text" : ""}>{s}</span>
            </li>
          ))}
        </ol>
      </section>
    );
  if (!r.crowds.length)
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
      {taste && !probing && <TasteAxes taste={taste} />}
      <WithWithout stop="crowd" question="Who are this product's customers, and what do they love?" athena={r.crowds.map((c) => ({ name: c.name, why: c.loves.slice(0, 6).map((l) => l.name).join(", ") }))} request={alone} />
      <p className="small muted">{SKEW_LABEL}</p>
    </section>
  );
}

/** Next retailers (§9.25), re-ranked under the taste sliders (§9.27) when they lean. */
function Retailers({ r, signal, crowdName, names, alone, taste }: { r: RetailersResult; signal: { id: string; weight: number }[]; crowdName: string; names: Record<string, string>; alone: AloneRequest; taste?: Taste }) {
  const lean = useLean("brand", r.picks.slice(0, 50).map((p) => p.id), signal, taste);
  const byId = new Map(r.picks.map((p) => [p.id, p]));
  const leaned = lean.order.map((id) => byId.get(id)!).filter(Boolean);
  // As in the stop itself, own-label retailers go last; the rest take the leaned order.
  const picks = [...leaned.filter((p) => !p.ownLabel), ...leaned.filter((p) => p.ownLabel)];
  const top = picks.slice(0, 8);
  return (
      <section className="card">
        <h3>Next retailers</h3>
        <p className="small muted">Bigger retailers ranked by how much your crowd loves each one (Qloo). Built from {r.calls} Qloo calls.</p>
        {taste && <TasteAxes taste={taste} compact busy={lean.busy} note={lean.note} />}
        {r.already.length > 0 && <p className="small"><strong>You&apos;re already in</strong> {r.already.join(", ")}, so they&apos;re left out.</p>}
        {top.length ? (
          <ol className="rank-list">
            {top.map((p, i) => (
              <li key={p.id}>
                <span className="rank">{i + 1}</span>
                <span className="grow"><strong>{p.name}</strong>{p.ownLabel && <small className="muted"> · mostly sells its own label</small>}</span>
                <small className="muted">affinity {(lean.affinity?.[p.id] ?? p.affinity).toFixed(2)}</small>
              </li>
            ))}
          </ol>
        ) : (
          <p>Every retailer on my list is already one of yours. Add a few you&apos;re eyeing in the chat and I&apos;ll rank them.</p>
        )}
        <ShowWhy crowd={crowdName} names={names} picks={top.map((p) => ({ ...p, why: lean.why?.[p.id] ?? p.why }))} />
        <p className="small muted">Fit means your crowd loves the retailer, not that a buyer will say yes.</p>
        {r.picks.length > 1 && <WithWithout stop="retailers" question={`Which of these ${r.picks.length} retailers are most likely to carry this product?`} athena={picks.map((p) => ({ id: p.id, name: p.name }))} request={{ ...alone, candidates: r.picks.map((p) => ({ id: p.id, label: p.name })) }} bench="t2" ranked />}
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

type RetailersResult = { picks: { id: string; name: string; affinity: number; rank: number; ownLabel: boolean; why?: Contribution[] }[]; already: string[]; calls: number; category?: string };
type OnlineResult = { creators: { id: string; name: string; role: string; affinity: number }[]; podcasts: { id: string; name: string; affinity: number }[]; interests: { id: string; name: string }[]; calls: number };

/** Next retailers (§9.25) and Online (§9.24): small stops outside the six blocks, read for the chosen crowd. */
function ExtraStop({ kind, signal, crowdName, names, product, category, evidence, rev, skew, brandName, alone, taste, onData }: { kind: "retailers" | "online"; signal: { id: string; weight: number }[]; crowdName: string; names: Record<string, string>; product: string; category?: string; evidence: string[]; rev?: number; skew: CrowdCard["skew"]; brandName: string; alone: AloneRequest; taste?: Taste; onData: (d: unknown) => void }) {
  const [data, setData] = useState<RetailersResult | OnlineResult | null>(null);
  // Held by a Brand Graph edit, the product and evidence stay as they ran; a re-run (its rev) reads them again.
  const key = JSON.stringify([kind, signal, product, evidence, rev ?? 0]);
  useEffect(() => {
    let live = true;
    setData(null);
    fetch("/api/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, signal, product, category, evidence }) })
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        setData(d);
        onData(d);
      })
      .catch(() => live && setData(kind === "retailers" ? { picks: [], already: [], calls: 0 } : { creators: [], podcasts: [], interests: [], calls: 0 }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!data)
    return (
      <section className="card">
        <h3>{STOP_LABELS[kind]}</h3>
        <ol className="steps live-steps">
          <li className="step-active"><span className="spin" aria-hidden /><span className="shimmer-text">{kind === "retailers" ? "Ranking bigger retailers by how much your crowd loves them" : "Finding the creators, podcasts and interests your crowd follows"}</span></li>
        </ol>
      </section>
    );
  if (kind === "retailers") return <Retailers r={data as RetailersResult} signal={signal} crowdName={crowdName} names={names} alone={alone} taste={taste} />;
  const o = data as OnlineResult;
  const skewNote = skewLine(skew);
  return (
    <section className="card">
      <h3>Online</h3>
      <p className="small muted">Who your crowd follows, and what to test in ads (Qloo). Built from {o.calls} Qloo calls.</p>
      {o.creators.length > 0 && (
        <>
          <h4>Creators to partner with</h4>
          <ol className="rank-list">
            {o.creators.map((c, i) => (
              <li key={c.id}>
                <span className="rank">{i + 1}</span>
                <span className="grow"><strong>{c.name}</strong> <small className="muted">· {c.role}</small></span>
                <a className="small" href={`https://www.google.com/search?q=${encodeURIComponent(c.name)}`} target="_blank" rel="noreferrer noopener">Find them ↗</a>
              </li>
            ))}
          </ol>
          <p className="small muted">People in their professional role, approached as partners through drafts you send.</p>
        </>
      )}
      {o.podcasts.length > 0 && (
        <>
          <h4>Podcasts</h4>
          <div className="taste-loves">{o.podcasts.map((p) => <span key={p.id} className="love">{p.name}</span>)}</div>
        </>
      )}
      {o.interests.length > 0 && (
        <>
          <h4>Ad interests to test</h4>
          <p className="small">Your crowd over-indexes on {o.interests.slice(0, 5).map((x) => x.name.toLowerCase()).join(", ")}. Try these as ad interests for {brandName}.</p>
        </>
      )}
      {skewNote && <p className="small"><strong>Audience to test</strong> Qloo&apos;s taste panel {skewNote.replace(/leans/g, "leans")} for this crowd. Worth testing as an ad audience alongside your current one.</p>}
      <WithWithout stop="online" question="Online, which creators and podcasts do this product's customers follow, and what should it target in ads?" athena={[...o.creators.map((c) => ({ name: c.name, why: c.role })), ...o.podcasts.map((p) => ({ name: p.name, why: "podcast" })), ...o.interests.slice(0, 5).map((x) => ({ name: x.name, why: "ad interest" }))]} request={alone} />
      <p className="small muted">{SKEW_LABEL}</p>
    </section>
  );
}

/** One stop on the plan engine: a scoped run of one block for the chosen crowd and city. */
function StopRunner({ stop, block, input, rev, brandName, alone, taste, onData }: { stop: StopId; block: Block; input: Record<string, unknown>; rev?: number; brandName: string; alone: AloneRequest; taste?: Taste; onData: (d: unknown) => void }) {
  // A re-run from the Brand Graph (its rev) runs again even when the input reads the same.
  const key = JSON.stringify([input, rev ?? 0]);
  const source: PlanSource = useMemo(() => ({ kind: "custom", input, id: hash(`${block}|${key}`), scope: [block] }), [block, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = usePlan(source);
  const b = plan.blocks[block];
  const [selected, setSelected] = useState<string>();
  useEffect(() => {
    if (b) onData(b.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b]);
  if (!b) {
    const steps = plan.rail.slice(-4);
    return (
      <section className="card">
        <h3>{STOP_LABELS[stop]}</h3>
        <ol className="steps live-steps">
          {(steps.length ? steps.map((e) => e.why) : ["Starting"]).map((s, i, all) => (
            <li key={i} className={i === all.length - 1 ? "step-active" : "step-done"}>
              <span className={i === all.length - 1 ? "spin" : "tick"} aria-hidden>{i === all.length - 1 ? "" : "✓"}</span>
              <span className={i === all.length - 1 ? "shimmer-text" : ""}>{s}</span>
            </li>
          ))}
        </ol>
      </section>
    );
  }
  const none = () => undefined;
  switch (block) {
    case "markets": {
      const m = b.data as MarketsData;
      return (
        <section className="card stop-block">
          <div className="stop-map">
            <MapView center={m.target.center} bbox={m.target.bbox} cells={m.heatmap.cells} pins={[]} onSelect={none} />
          </div>
          <MarketsView data={m} meta={b.meta} onTrace={none} />
          <WithWithout stop="where" question="In which of the 25 largest US metros will this product find the most independent shops to sell it, per resident?" athena={m.metros.map((x) => ({ id: x.metroId, name: x.name }))} request={alone} bench="t1" ranked />
        </section>
      );
    }
    case "places": {
      const p = b.data as PlacesData;
      return (
        <section className="card stop-block">
          <LeanPlaces p={p} crowd={input.crowd as { name: string; signal: { id: string; name: string; weight: number }[] } | undefined} taste={taste}>
            {(data, lean) => (
              <>
                {lean}
          <PlacesView
            data={data}
            meta={b.meta}
            selectedId={selected}
            onSelect={(id) => setSelected(id === selected ? undefined : id)}
            onTrace={none}
            draft={{ brand: brandName, product: String(input.description ?? "").split(".")[0], partners: [] }}
            // Without Qloo (§9.9): the same question to a chatbot with search, side by side; capped (§14.5).
            compare={{ key: `journey-${hash(`${brandName}|${p.metroId}|${p.signal.join()}`)}`, brandName, whatYouSell: String(input.description ?? "").split(".")[0], tier: String(input.tierHint ?? "") }}
          />
              </>
            )}
          </LeanPlaces>
          <BenchNote task="t3" />
        </section>
      );
    }
    case "partners": {
      const d = b.data as PartnersData;
      return (
        <section className="card stop-block">
          <PartnersView data={d} meta={b.meta} onTrace={none} />
          <WithWithout stop="partners" question="Which brands and podcasts should this brand partner with?" athena={[...d.brands, ...d.podcasts].map((x) => ({ name: x.name, why: x.kind }))} request={alone} />
        </section>
      );
    }
    case "message": {
      const d = b.data as MessageData;
      return (
        <section className="card stop-block">
          <MessageView data={d} meta={b.meta} onTrace={none} />
          <WithWithout stop="message" question="How should this brand talk to its customers: which themes, and which shows, films, artists or books to reference?" athena={[...d.themes.slice(0, 6).map((t) => ({ name: t.name, why: "theme" })), ...d.references.slice(0, 4).map((r) => ({ name: r.name, why: "reference" }))]} request={alone} />
        </section>
      );
    }
    case "moments": {
      const d = b.data as MomentsData;
      return (
        <section className="card stop-block">
          <MomentsView data={d} meta={b.meta} onTrace={none} />
          {d.moments.length > 0 && <WithWithout stop="moments" question="Which dated events in this city in the next six months should this brand show up at?" athena={d.moments.map((x) => ({ name: x.name, why: [x.date, x.venue].filter(Boolean).join(" · ") }))} request={{ ...alone, metroId: d.metroId }} />}
        </section>
      );
    }
    default:
      return null;
  }
}

/** Places ranked against the crowd (§9.23) re-rank under the taste sliders (§9.27); ranked against accounts, they don't. */
function LeanPlaces({ p, crowd, taste, children }: { p: PlacesData; crowd?: { name: string; signal: { id: string; name: string; weight: number }[] }; taste?: Taste; children: (data: PlacesData, lean: ReactNode) => ReactNode }) {
  const fromCrowd = !!(p.fromCrowd && crowd?.signal?.length);
  const on = !!(taste && fromCrowd);
  const lean = useLean("place", p.picks.slice(0, 50).map((x) => x.id), on ? crowd!.signal : [], on ? taste : undefined);
  const byId = new Map(p.picks.map((x) => [x.id, x]));
  const picks = on ? lean.order.flatMap((id, i) => (byId.has(id) ? [{ ...byId.get(id)!, rank: i + 1, why: lean.why?.[id] ?? byId.get(id)!.why }] : [])) : p.picks;
  // Why-paths (§9.28) need the signal's names; the crowd's are known here, the founder's accounts' aren't.
  const why = fromCrowd ? <ShowWhy crowd={crowd!.name} names={Object.fromEntries(crowd!.signal.map((x) => [x.id, x.name]))} picks={picks} /> : null;
  return (
    <>
      {children(on ? { ...p, picks } : p, on ? <TasteAxes taste={taste!} compact busy={lean.busy} note={lean.note} /> : null)}
      {why}
    </>
  );
}
