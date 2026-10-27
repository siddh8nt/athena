"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ACCEPT, RecordView, TrailView, useBriefChat, type FileChip, type Msg } from "./chat";
import type { WorkRecord } from "@/lib/agent/record";
import { BrandGraph, StaleFlag } from "./BrandGraph";
import { ordinal } from "./Blocks";
import { Question, QuestionTray, type TrayItem } from "./Question";
import { Galaxy } from "./Galaxy";
import { CrowdGeography } from "./CrowdGeography";
import { WithWithout, type AloneRequest } from "./WithWithout";
import { Onboard } from "./Onboard";
import { Fits, When, tiersFor } from "./Fits";
import { fromCity, fromCrowd, type Handoff } from "@/lib/agent/handoffs";
import { GoalsBar, Handoffs, PausedForYou, RunTrail, SpecialistWorkspace, TeamPanel, WhatsWorking, WorkView, useTeam, type TeamLive } from "./Team";
import { Dashboard, WorkflowDiagram, type KbPart } from "./Dashboard";
import { INPUTS } from "@/lib/team/inputs";
import type { Line as PageLine } from "@/lib/team/page";
import type { StrategyView } from "./Strategy";
import type { Asked } from "./Question";
import type { AgentEvent } from "@/lib/blocks/types";
import type { LiveFact } from "@/lib/knowledge/types";
import { GUESS, OPENING, type Turn } from "@/lib/brief/conversation";
import { briefToInput } from "@/lib/brief/to-input";
import { missingRequired, type BrandBrief } from "@/lib/brief/types";
import { allNodes } from "@/lib/graph/build";
import { POINTER, PREVIEW_AT, applyEdit, applyFiles, fillOther, graphState, previewLine, previewOf, rerun, undo, type EditQuestion, type GraphState, type Op } from "@/lib/graph/edit";
import { staleLine, type RunId } from "@/lib/graph/stale";
import type { GraphInput } from "@/lib/graph/types";
import { keepFile, workspace } from "@/lib/knowledge/workspace";
import { bySource, mergeNotes, themesOf, type Synth } from "@/lib/knowledge/notes";
import { RunProgress, StepTimer } from "./Progress";
import { ExecutivePlan } from "./Executive";
import type { ExecItem } from "@/lib/exec/plan";
import { AthenaRoom, DashboardPage, PausedBanner, SubagentPage, focusTray, usePausedTab, type Page } from "./Views";
import type { Channel } from "@/lib/journey/growth";
import { NEAR_MISS_LABEL, crowdAfterFits, emptyJourney, loadedJourney, type CrowdCard, type CrowdMeeting, type Journey as JourneyState } from "@/lib/journey/types";
import type { Galaxy as GalaxyData } from "@/lib/taste/galaxy";
import { packBySlug } from "@/lib/journey/packs";
import { parseCsv, readOrders, salesByPlace, usd, type OrderCols, type Sales } from "@/lib/sales/orders";
import { metroIdFor } from "@/lib/playbook/metros";
import { emptyTeam, type Mark, type TeamEvent, type TeamState, type WorkItem } from "@/lib/team/types";
import { isSpecialist, isSubagent, nameOf, panelIds, specialist, type AgentId, type SpecialistId } from "@/lib/agent/specialists";
import { growthQuestion, seedOf, type GrowthQuestion } from "@/lib/journey/flow";
import { applyExternal, type External } from "@/lib/workspace/merge";

// The journey (PRD §23.2 step 8.1): one path. Onboarding writes the Brand Graph; one growth question in the
// transcript; the Analyst measures the crowds and ranks them, once, with the Taste Galaxy forming in its results; then
// Athena proposes 3–4 goals and only the specialists those goals need run. State lives in this browser only (a
// convenience; nothing is lost if it's cleared).

/** What the chat shows while Athena decides what to do with a message. */
const THINKING = "Thinking it through…";
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

/** The view in the URL (§23.2 step 8.5): `?agent=athena` or a subagent's id; anything else is the dashboard. */
function pageFromUrl(): Page {
  try {
    const a = new URLSearchParams(window.location.search).get("agent");
    return a === "athena" || isSubagent(a) ? a : "dashboard";
  } catch {
    return "dashboard";
  }
}
const urlOf = (p: Page) => (p === "dashboard" ? "/plan" : `/plan?agent=${p}`);

function load(): Saved | undefined {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? "null") as Saved | null;
    return s?.brief && s.msgs?.length && s.journey ? { ...s, msgs: onceEach(s.msgs) } : undefined;
  } catch {
    return undefined;
  }
}

/** A thread saved before handoffs updated in place (§23.5 p) can hold the same handoff line again for each resume: the repeats go. */
function onceEach(msgs: Msg[]): Msg[] {
  const seen = new Set<string>();
  return msgs.filter((m) => {
    if (!m.run) return true;
    const k = `${m.run}
${m.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
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
  // A sample brand starts in the chat, so it opens on the Athena tab; a fresh start has onboarding first.
  useEffect(() => {
    if (start.fresh) window.history.replaceState(null, "", start.message ? urlOf("athena") : "/plan");
  }, [start.fresh, start.message]);
  // The open view lives in the URL, so a reload, Back and Forward keep their place.
  const [page, setPage] = useState<Page>(() => (start.fresh && start.message ? "athena" : pageFromUrl()));
  const go = (p: Page, replace = false) => {
    setPage(p);
    if (replace) window.history.replaceState(null, "", urlOf(p));
    else if (urlOf(p) !== window.location.pathname + window.location.search) window.history.pushState(null, "", urlOf(p));
  };
  useEffect(() => {
    const back = () => setPage(pageFromUrl());
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
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

  // Mirror the working copy to the server a moment after each change (§23.6 a), so the founder's AI tool and the
  // judges' demo link can read the plan. Best-effort and debounced; the browser copy stays the source of truth.
  const mirror = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (msgs.length <= 1) return;
    const saved: Saved = { brief, msgs: msgs.slice(-40), turn, journey: j };
    clearTimeout(mirror.current);
    mirror.current = setTimeout(() => {
      try {
        void fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ws: workspace(), saved }), keepalive: true }).catch(() => {});
      } catch {
        // Offline or blocked: the next change retries.
      }
    }, 1500);
    return () => clearTimeout(mirror.current);
  }, [brief, msgs, turn, j]);

  // Fold in changes made from outside Athena (§23.6 b): on load and whenever the tab comes back into focus. Item by
  // item, the newer change winning (§23.6 a), so nothing a founder's AI tool did is lost and nothing overwrites the
  // whole journey. Marks and answers apply here; facts added from outside are folded in with add_fact (§23.6 b).
  const cursor = useRef(0);
  useEffect(() => {
    let live = true;
    const CKEY = "athena:ws-cursor";
    try {
      cursor.current = Number(localStorage.getItem(CKEY)) || 0;
    } catch {
      // No storage: start the cursor fresh for this visit.
    }
    const pull = async () => {
      let external: External | undefined;
      try {
        external = ((await (await fetch(`/api/workspace?ws=${encodeURIComponent(workspace())}`)).json()) as { external?: External }).external;
      } catch {
        return; // Offline or blocked: nothing to fold in this time.
      }
      if (!live) return;
      setJ((x) => {
        const res = applyExternal(x, external, cursor.current);
        cursor.current = res.cursor;
        try {
          localStorage.setItem(CKEY, String(res.cursor));
        } catch {
          // No storage: the cursor stays in memory for this visit.
        }
        return res.changed ? res.journey : x;
      });
    };
    void pull();
    const onFocus = () => {
      if (document.visibilityState === "visible") void pull();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      live = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [setJ]);

  // A reply that streamed in (§23.2 step 8.5n) is replaced by the whole of it; anything else is a new line. A handoff
  // to a subagent that already has one (a resumed or re-run step) updates that line where it is (§23.5 p).
  const say = (t: string, run?: SpecialistId, handoff?: boolean) => {
    setWorking((w) => (w?.text === THINKING ? undefined : w));
    setMsgs((m) => {
      const at = handoff && run ? m.findLastIndex((x) => x.handoff && x.run === run) : -1;
      if (at >= 0) return m.map((x, i) => (i === at ? { ...x, text: t } : x));
      return [...(m.at(-1)?.live ? m.slice(0, -1) : m), { who: "athena", text: t, ...(run ? { run } : {}), ...(handoff ? { handoff } : {}) }];
    });
  };
  const stream = (d: string) => {
    setWorking((w) => (w?.text === THINKING ? undefined : w));
    setMsgs((m) => {
      const last = m.at(-1);
      return last?.live ? [...m.slice(0, -1), { ...last, text: last.text + d }] : [...m, { who: "athena", text: d, live: true }];
    });
  };
  const move = (to: JourneyState["stop"]) => setJ((x) => ({ ...x, stop: to, done: [...new Set([...x.done, x.stop])] }));

  // The seed the Analyst measures from: held by a Brand Graph edit, the brief the crowds were built from.
  const seedKey = JSON.stringify(seedOf(crowdsBrief));
  // The founder's channel answer is theirs; it stands over what the research guessed.
  const teamBrief = (channel: Channel | undefined): BrandBrief => (channel ? { ...brief, channel: { value: channel, source: { kind: "message" }, confirmed: true } } : brief);

  // The journey as the team's next call reads it. A workflow resumed the moment a stream ends is sent from that stream's
  // closure, before React draws what the stream brought: it reads the Analyst's crowds and fits from here, not from then.
  const jNow = useRef(j);
  jNow.current = j;

  // What the Analyst measured and ranked comes back here as the journey's crowds and fits (§23.2 step 8.1a): ranked
  // once, by the Analyst, for every goal after. A probe from "Ask Athena about this" lands the same way.
  const onMemory = (m: Memory) => {
    const next = (x: JourneyState): JourneyState => {
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
        crowdsSeed: m.seed ?? x.crowdsSeed,
        fits,
        crowdId: fits ? crowdAfterFits(fits.fits, x.crowdId && ids.has(x.crowdId) ? x.crowdId : main) : x.crowdId && ids.has(x.crowdId) ? x.crowdId : main,
      };
    };
    jNow.current = next(jNow.current);
    setJ(next);
  };

  // The Analyst's own questions while it ranks the fits, answered in its results.
  const [asks] = useState<Asked[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // With / Without (§13.2): the crowds' question also goes to Gemini alone, from the same product description.
  const alone: AloneRequest = { brand: brief.name?.value || "The brand", product: String(briefToInput(brief).description ?? "").slice(0, 400) };

  // Athena and her six specialists (§23.2 step 8): the Analyst first, then goals from the Brand Graph, worked by the team.
  const onboarding = j.stop === "product" && !start.message && !msgs.some((m) => m.who === "you");
  // Onboarding's transcript lives in its workspace; leaving it, the team chat opens with what the founder gave and the
  // record of the work, in place of the greeting, so the history carries on rather than resetting.
  const record = useRef<WorkRecord | undefined>(undefined);
  const wasOnboarding = useRef(onboarding);
  useLayoutEffect(() => {
    const r = record.current;
    // Leaving onboarding opens the dashboard (§23.2 step 8.5b): the knowledge base it built, and the plan to start.
    if (wasOnboarding.current && !onboarding) go("dashboard", true);
    if (wasOnboarding.current && !onboarding && r)
      setMsgs((m) => {
        if (m.some((x) => x.record)) return m;
        const rest = m[0]?.who === "athena" && m[0].text === OPENING ? m.slice(1) : m;
        const text = r.intake.text.length > 1200 ? `${r.intake.text.slice(0, 1200).trimEnd()}…` : r.intake.text;
        const intake: Msg[] = text || r.intake.files.length ? [{ who: "you", text, files: r.intake.files }] : [];
        const i = rest.findIndex((x) => x.who === "athena" && !x.card);
        if (i < 0) return [...intake, { who: "athena", text: "", record: r }, ...rest];
        return [...rest.slice(0, i), ...intake, { ...rest[i], record: r }, ...rest.slice(i + 1)];
      });
    wasOnboarding.current = onboarding;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboarding]);
  // Read through a ref, so a call sent from an older render's closure still sends what stands now.
  const bodyNow = useRef<() => Record<string, unknown>>(() => ({}));
  bodyNow.current = () => {
    const x = jNow.current;
    return {
      seed: x.crowdsSeed ?? (JSON.parse(x.crowdsFor ?? seedKey) as unknown),
      probes: x.crowds?.probes ?? [],
      brief: teamBrief(x.channel),
      ...(x.fits ? { fits: x.fits.fits } : {}),
      // The growth answer and the dashboard's inputs (§23.2 step 8.4h), read by every run as the founder's facts.
      answers: [...(x.told ? [x.told] : []), ...INPUTS.filter((q) => x.inputs?.[q.id] !== undefined).map((q) => ({ question: q.question, answer: x.inputs![q.id] || q.assumed }))],
      facts: x.facts ?? [],
      // What the Brand Graph still asks the founder to settle, for Athena's plan to name.
      disagreements: editQs.map((q) => q.question),
    };
  };
  const tm = useTeam({
    team,
    setTeam: (f) => setJ((x) => ({ ...x, team: f(x.team ?? emptyTeam()) })),
    body: () => bodyNow.current(),
    graphRev: g.log.length,
    onMemory,
    onGalaxy: setForming,
    say,
    stream,
    // The router read it as an edit to the Brand Graph: the graph's reader takes it from here.
    onGraph: (message) => {
      setWorking((w) => (w?.text === THINKING ? undefined : w));
      void graphSend(message, true);
    },
  });
  // "Ask Athena about this" from a Galaxy node: the question goes in the chat, and the Analyst probes it behind her.
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
  // Goals chosen or a workflow under way: the workflow's own Analyst measures, and the goals question isn't asked again.
  const planned = (x: typeof team) => !!x.workflow || x.goals.some((g) => g.id !== "know_crowd");
  const teamNow = useRef(team);
  teamNow.current = team;
  const proposedOnce = useRef(!!team.proposed || planned(team));
  useEffect(() => {
    if (j.stop !== "crowd" || !turn.ready || measuredFor.current === measureFor) return;
    if (planned(teamNow.current) && !g.rev.crowds && !g.rev.fits) {
      measuredFor.current = measureFor;
      setMeasured(true);
      return;
    }
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
      if (!proposedOnce.current && !planned(teamNow.current)) {
        proposedOnce.current = true;
        void tm.propose();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j.stop, turn.ready, measureFor]);
  // A journey saved with crowds but no growth goal yet picks up at the goals. The question itself isn't saved, so a
  // reload asks it again even when goals were proposed before.
  const resumed = useRef(false);
  useEffect(() => {
    const growing = team.goals.some((g) => g.id !== "know_crowd");
    if (j.stop !== "crowd" || !j.crowds || growing || resumed.current || tm.live.running || !measuredFor.current || tm.live.asks.some((a) => a.id === "goals")) return;
    resumed.current = proposedOnce.current = true;
    void tm.propose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j.stop, !!j.crowds, tm.live.running]);
  // A workflow saved with a step paused for the founder picks up the same way (founder, 21 Oct): its questions aren't
  // saved, so on a reload the workflow resumes and asks again only what is still unknown, finished steps kept. A step
  // saved mid-run resumes too: its stream ended with the page, so it would otherwise sit on Working.
  const reasked = useRef(false);
  useEffect(() => {
    const open = Object.keys(tm.live.blocking).some((id) => !(id in tm.live.answers));
    if (reasked.current || !team.workflow?.steps.some((s) => s.state === "paused" || s.state === "running") || tm.live.running || open) return;
    reasked.current = true;
    tm.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!team.workflow, tm.live.running]);
  // The Executive's Start / Later (§23.5 r) isn't saved either: a journey reloaded with Athena's order in, the
  // Executive neither started nor put off, asks it again. Once started, what's left runs by itself, and drafts opened
  // before the reload, and pitches past their wait, ask.
  const offered = useRef(false);
  useEffect(() => {
    if (offered.current || !team.plan || (!team.exec?.started && team.exec?.later) || tm.live.running || tm.live.asks.some((a) => a.id === "exec")) return;
    offered.current = true;
    tm.offerExec();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!team.plan, tm.live.running]);
  // The team's focus is a tab in the Athena tab's panel (§23.2 step 8.5): when the flow hands the work on, Athena
  // brings that subagent's tab forward; it never moves the founder off the page they're on. "See your dashboard" does.
  const tab: AgentId = tm.active === "dashboard" || tm.active === "executive" ? "athena" : tm.active;
  // The dashboard's chat drawer (§23.2 step 8.5j).
  const [drawer, setDrawer] = useState(false);
  const subPage = isSpecialist(page) ? page : undefined;
  // The floating panel (§23.2 step 8.4b): open beside the chat on a desktop; a full-screen sheet on a phone.
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheet, setSheet] = useState(false);
  // On a phone a subagent page's chat is a sheet over it.
  const [subSheet, setSubSheet] = useState(false);
  const panelBody = useRef<HTMLDivElement>(null);
  // A tab brought forward opens the panel on it if it was hidden.
  const shownTab = useRef(tab);
  useEffect(() => {
    if (shownTab.current === tab) return;
    shownTab.current = tab;
    setPanelOpen(true);
  }, [tab]);
  // Sequential panels (§23.2 step 8.4e): each new section lands below the last, and the panel scrolls to it.
  useEffect(() => {
    const el = panelBody.current;
    if (!el) return;
    let n = el.childElementCount;
    const mo = new MutationObserver(() => {
      if (el.childElementCount > n) el.lastElementChild?.scrollIntoView({ block: "start", behavior: "smooth" });
      n = el.childElementCount;
    });
    mo.observe(el, { childList: true });
    return () => mo.disconnect();
  }, [tab, page]);
  const crowdIdOf = (name: string) => j.crowds?.crowds.find((c) => c.name === name)?.id;

  // Onboarding (§23.2 step 3): a new founder starts from the three ways in, not a chat. Sample brands and founders
  // who began in the chat keep the chat. (`onboarding` is read above, before the team's hooks.)
  // Knowledge, not raw facts (§23.2 step 8.2a): what was read is grouped by its source at once, then into themes by
  // the model. The founder's edited notes and deletions hold through every re-synthesis.
  const own = (fs: LiveFact[]) => fs.filter((f) => f.source === "the founder" && !f.theme);
  const entities = () =>
    allNodes(latest.current.input).nodes.filter((n) => ["stockist", "city", "competitor", "comparable", "crowd"].includes(n.type)).map((n) => n.label).slice(0, 120);
  const synthesize = async (raw: LiveFact[], themes: string[]): Promise<Synth> => {
    try {
      const res = await fetch("/api/synthesize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ws: workspace(), raw, themes, entities: entities() }), signal: AbortSignal.timeout(90_000) });
      const r = (await res.json()) as Partial<Synth>;
      return { notes: Array.isArray(r.notes) ? r.notes : bySource(raw), asks: Array.isArray(r.asks) ? r.asks : [] };
    } catch {
      return { notes: bySource(raw), asks: [] };
    }
  };
  const asked = (s: Synth) =>
    setEditQs((qs) => [
      ...qs,
      ...s.asks.map((a) => ({
        id: `synth-${a.note}`,
        question: `Your sources differ on ${a.about.replace(/\.$/, "")}: which is right?`,
        why: "I kept your own files' value until you say.",
        options: a.options.map((o) => ({ label: o.value, hint: o.text })),
        multi: false,
        assumed: a.options[0].value,
        choices: a.options.map((o): Op[] => [{ op: "note", id: a.note, text: o.text }]),
        by: "graph" as const,
      })),
    ]);
  const synthRun = useRef(0);
  const regroup = (raw: LiveFact[]) => {
    const run = ++synthRun.current;
    setWorking({ text: "Grouping what I read into themes…", by: "graph" });
    // A cached grouping answers at once; the themes still come in after a beat, as grouping live would.
    void Promise.all([synthesize(raw, []), new Promise((r) => setTimeout(r, 1400))]).then(([s]) => {
      setWorking((w) => (w?.text.startsWith("Grouping") ? undefined : w));
      if (run !== synthRun.current) return;
      setJ((x) => {
        const gone = graphState(x.graph).gone ?? [];
        return { ...x, facts: [...mergeNotes(x.facts ?? [], s.notes, gone).filter((n) => n.theme), ...own(x.facts ?? [])] };
      });
      const themes = themesOf(s.notes);
      if (themes.length) say(`I grouped what I read into ${themes.length} theme${themes.length === 1 ? "" : "s"}: ${themes.join(", ")}. Open one on the graph, or edit any note below.`);
      asked(s);
    });
  };
  // Fresh raw facts wait for the themes: grouped by source page first, a crawled site drew dozens of themes that then
  // shrank to a handful. The notes already on the graph stay until the grouping lands, so the graph only ever grows.
  const onRaw = (facts: LiveFact[]) => setJ((x) => ({ ...x, raw: facts, facts: [...(x.facts ?? []).filter((n) => n.theme), ...own(facts)] }));

  const onBrief = (b: BrandBrief, assumptions: string[], facts: LiveFact[], early = false) => {
    chat.setBrief(b);
    // A new brief from onboarding: earlier graph edits stay in the log, but can't be undone onto it.
    setJ((x) => {
      const gs = graphState(x.graph);
      return { ...x, graph: { ...gs, log: gs.log.map(({ before: _b, ...e }) => e) } };
    });
    if (facts.length || !early) onRaw(facts);
    // The first brief fills the graph while the full read goes on; only the full one moves the journey on.
    if (early) return;
    if (facts.length) regroup(facts);
    const ready = missingRequired(b).length === 0;
    chat.setTurn({ text: "", replies: [], ready });
    setMsgs((m) => [
      ...m,
      {
        who: "athena",
        text: ready
          ? `I've read everything and written your brief, every fact with where it came from.${assumptions.length ? ` I went ahead assuming: ${assumptions.join("; ")}` : ""} Correct anything below, or move on.`
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
      // Her answer can take a while: the chat says she's on it until it lands.
      setWorking({ text: THINKING, by: "chat" });
      return void tm.askAthena(message).finally(() => setWorking((w) => (w?.text === THINKING ? undefined : w)));
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
      // A picked option is already a resolved place or entity: sending a home city back to be resolved again asked the
      // same question again, so the pick seemed to do nothing. Only a shop still to be placed by its city goes back.
      if (ops.some((o) => o.op === "add" && needsServer(o))) return resolveThen(ops, q.by);
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
  /**
   * An orders export (§23.6 i), told apart from other files by one model call on its header row alone. It's read here in
   * the browser and never uploads: each order keeps only its date, total and ZIP, and only the ZIPs go to the server
   * for their cities. The newest export replaces the one before.
   */
  const readSales = async (f: File): Promise<boolean> => {
    const rows = parseCsv(await f.text().catch(() => ""));
    if (rows.length < 2) return false;
    const seen = (await fetch("/api/orders/columns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ header: rows[0], file: f.name }), signal: AbortSignal.timeout(25_000) })
      .then((r) => r.json())
      .catch(() => ({ orders: false }))) as { orders: boolean; cols?: OrderCols };
    if (!seen.orders || !seen.cols) return false;
    setGraphChips((c) => [...c.filter((x) => x.name !== f.name), { name: f.name, status: "Reading your orders…", busy: true }]);
    setWorking({ text: `${f.name} is an orders export. I keep each order's date, total and ZIP; names, emails, phones and addresses stay out.`, by: "chat" });
    const { orders } = readOrders(rows, seen.cols);
    const metros = [...new Set((j.crowds?.crowds ?? []).flatMap((c) => c.cities.map((x) => metroIdFor(x.metro))))];
    const places = orders.length
      ? ((await fetch("/api/orders/places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zips: [...new Set(orders.map((o) => o[2]))], metros }), signal: AbortSignal.timeout(30_000) })
          .then((r) => r.json())
          .then((r: { places?: Sales["places"] }) => r.places ?? {})
          .catch(() => ({}))) as Sales["places"])
      : {};
    if (orders.length) setJ((x) => ({ ...x, team: { ...(x.team ?? emptyTeam()), sales: { file: f.name, at: Date.now(), orders, places } } }));
    setGraphChips((c) => c.map((x) => (x.name === f.name ? { ...x, busy: false, status: orders.length ? "Orders read" : "Read" } : x)));
    const top = salesByPlace({ file: f.name, at: 0, orders, places }).slice(0, 3).map((p) => p.name);
    const total = orders.reduce((n, o) => n + o[1], 0);
    say(
      orders.length
        ? `Read ${orders.length.toLocaleString("en-US")} orders from ${f.name}, worth ${usd(total)}${top.length ? `, most in ${top.length > 1 ? `${top.slice(0, -1).join(", ")} and ${top[top.length - 1]}` : top[0]}` : ""}. They're on What's working, and the Navigator and the Rep weigh them next time they run.`
        : `${f.name} is an orders export, but none of its rows has a date, a total and a ZIP together, so there's nothing to add from it yet.`,
    );
    return true;
  };
  /** A file added after onboarding (§23.2 step 7d): read through the knowledge reader into the graph, as one edit. */
  const readFiles = async (all: File[]) => {
    const isOrders = await Promise.all(all.map((f) => (/\.csv$/i.test(f.name) || f.type === "text/csv" ? readSales(f) : Promise.resolve(false))));
    const fs = all.filter((_, i) => !isOrders[i]);
    if (!fs.length) return;
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
    // A later file merges into the themes already there (§23.2 step 8.2a).
    const known = new Set((j.raw ?? []).map((f) => f.text.toLowerCase()));
    const fresh = (read.facts ?? []).filter((f) => !known.has(f.text.toLowerCase()));
    let notes: LiveFact[] = [];
    if (fresh.length) {
      setGraphChips((c) => c.map((x) => (x.busy && names.includes(x.name) ? { ...x, status: "Fitting it into your themes…" } : x)));
      const s = await synthesize(fresh, themesOf(latest.current.input.facts));
      notes = s.notes;
      asked(s);
      setJ((x) => ({ ...x, raw: [...(x.raw ?? []), ...fresh] }));
    }
    const { input, state, ran } = latest.current;
    const a = hashes.length ? applyFiles(input, state, { facts: notes, stockists: read.stockists ?? [], read: read.read?.length ? read.read : names }, { ran }) : undefined;
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
      if (message && !fs.length) setMsgs((m) => [...m, { who: "you", text: message }]);
      // "Ask Athena about this" on a Galaxy node: the Analyst probes that node behind her.
      if (message && about) tm.askSpecialist("analyst", message, about);
      else if (message) {
        // Every other message goes to Athena's router (§23.2 step 8.5n), with the page it was typed on and the chat
        // so far: she replies, looks it up, edits the graph, asks a subagent, changes the plan, or asks what they mean.
        setWorking({ text: THINKING, by: "chat" });
        void tm
          .chat(message, { page: page === "executive" ? "dashboard" : page, history: msgs.filter((m) => m.text && !m.card && !m.live).slice(-30).map(({ who, text }) => ({ who, text })) })
          .finally(() => setWorking((w) => (w?.text === THINKING ? undefined : w)));
      }
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
  // Every question for the founder, as one list for the tray of the one chat: the growth question, the edit questions,
  // and Athena's and every subagent's asks, whichever page the founder is on.
  const questions: TrayItem[] = [
    ...(j.stop === "growth" || j.told ? [{ q: gq, answer: j.told?.answer, onAnswer: answerGrowth }] : []),
    ...editQs.filter((q) => q.by === "chat").map((q) => ({ q, onAnswer: (a: string) => answer(q, a) })),
    // A subagent's question reads "For the Navigator: …", and one that pauses its step says so (§23.2 step 8.5 g, k).
    ...tm.live.asks.map((q) => ({ q: { ...q, for: q.agent !== "athena" ? nameOf(q.agent) : undefined, pauses: q.id in tm.live.blocking }, answer: tm.live.answers[q.id], onAnswer: (a: string) => void tm.answer(q, a) })),
  ];
  // Each question keeps its place in the thread: a marker goes in where it was asked, and the answered record shows
  // there, before what Athena said after it, not under the latest message.
  const questionIds = questions.map((it) => it.q.id).join("|");
  useEffect(() => {
    setMsgs((m) => {
      const placed = new Set(m.flatMap((x) => (x.asked ? [x.asked] : [])));
      const fresh = [...new Set(questions.map((it) => it.q.id))].filter((id) => !placed.has(id));
      return fresh.length ? [...m, ...fresh.map((id) => ({ who: "athena" as const, text: "", asked: id }))] : m;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionIds]);
  const answeredAt = (id: string) => {
    const it = questions.find((x) => x.q.id === id && x.answer !== undefined);
    return it ? (
      <li key={`q${id}`} className="msg-question">
        <Question q={it.q} answer={it.answer} onAnswer={it.onAnswer} />
      </li>
    ) : null;
  };
  const stateOf = (id: AgentId) => {
    const s = tm.live.status[id]?.state;
    return s === "working" || s === "waiting" ? s : undefined;
  };

  /** "Ask Athena about this" on an Execute Plan item: the chat opens with the item named, for the founder to finish. */
  const askItem = (it: ExecItem) => {
    tm.setActive("athena");
    setText(`About “${it.action}”: `);
    if (page === "dashboard") setDrawer(true);
    else setSubSheet(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const box = [...document.querySelectorAll<HTMLTextAreaElement>(".agent-chat textarea")].find((t) => t.offsetParent !== null);
        box?.focus();
        box?.setSelectionRange(box.value.length, box.value.length);
      }),
    );
  };

  // The sidebar: Dashboard, Athena, then the subagents.
  // Execute Plan (§23.5 q), the founder's end output: on its own page and in the dashboard's tab.
  const execEl = (
    <ExecutivePlan
      team={team}
      live={tm.live}
      brand={alone.brand}
      budget={j.inputs?.input_budget || undefined}
      running={tm.live.running > 0}
      onStart={() => void tm.startExec()}
      onOpened={tm.openedMail}
      onStartAnyway={tm.startAnyway}
      onAsk={askItem}
      onOpen={(id) => (id === "athena" ? (tm.pickTab("athena"), go("athena")) : go(id))}
      onUpdatePlan={tm.refresh}
      onRewritePlan={tm.rewritePlan}
      onBringBack={tm.bringBack}
      onMark={tm.markItem}
    />
  );
  const navEl = <TeamPanel live={tm.live} team={team} active={page} onOpen={(id) => (go(id), setAbout(undefined))} />;

  // The one chat with Athena (§23.2 step 8.5j): the same thread, draft and questions on the Athena tab and every subagent page.
  const chatEl = (
    <section className="chat agent-chat" aria-live="polite">
      <div className="agent-chat-head">
        <strong>Athena</strong>
        {page === "athena" && (
          <button type="button" className="linkish small agent-panel-open" onClick={() => (setPanelOpen(true), setSheet(true))}>
            {tab === "athena" ? "See Athena's work" : `See the ${nameOf(tab)}'s work`}
          </button>
        )}
      </div>
      <PausedForYou live={tm.live} />
      <ol className="msgs">
        {msgs.map((m, i) => [
          m.record && <RecordView key={`r${i}`} record={m.record} />,
          (m.text || !!m.files?.length) && (
            <li key={i} className={`msg msg-${m.who}`}>
              {m.text}
              {!!m.files?.length && <span className="msg-files">{m.files.map((f) => <span key={f} className="chip">{f}</span>)}</span>}
            </li>
          ),
          m.trail && <TrailView key={`t${i}`} trail={m.trail} />,
          m.run && <RunTrail key={`w${i}`} id={m.run} live={tm.live} team={team} onOpen={(id) => (setDrawer(false), go(id))} />,
          m.asked && msgs.findIndex((x) => x.asked === m.asked) === i && answeredAt(m.asked),
        ])}
        {busy && live && <li className="msg msg-athena streaming">{live}</li>}
        {queued && <li className="msg msg-athena typing">Finishing my research, then I&apos;ll read that…</li>}
        {working?.by === "chat" && <li className="msg msg-athena typing">{working.text}</li>}
        {/* Once the chat has nothing running, the graph's grouping is the work still going: said where the founder is looking. */}
        {working?.by === "graph" && !busy && !queued && (
          <li className="msg msg-athena graph-wait" role="status">
            <span className="spin" aria-hidden /> <span className="shimmer-text">The Brand Graph is still grouping what I read into themes</span>
            <StepTimer />
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
      <QuestionTray items={questions} />
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
          placeholder={first ? "e.g. We're Fishwife: premium tinned fish with playful packaging, about $9 a tin. Sold online and in 1,500 shops. eatfishwife.com" : subPage ? specialist(subPage).prompt.replace(/^Ask the \w+/, "Ask Athena") : j.stop === "product" ? "Reply, or drop in a file" : "Ask or change anything: \"drop gyms\", \"what about Austin?\""}
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
  );

  // Each one's own output (§23.2 step 8.4f), shown in its tab on the Athena tab and on its own page.
  const outputOf = (id: AgentId, onPage = false) =>
    id === "athena" ? (
      <>
        {/* The goals open Athena's tab (§23.2 step 8.5p); the Brand Graph lives on the dashboard alone (8.5b). */}
        <GoalsBar goals={team.goals} />
        {/* The workflow as on the dashboard (§23.5 a4), compact: a node opens its subagent's tab here. */}
        <WorkflowDiagram compact team={team} live={tm.live} onOpen={(id) => (id === "dashboard" || id === "executive" ? go(id) : (tm.pickTab(id as AgentId), setPanelOpen(true)))} onChat={() => (setSheet(false), focusTray())} />
        <p className="small muted">
          What the team knows about the brand is in the{" "}
          <button type="button" className="linkish" onClick={() => go("dashboard")}>
            Brand Knowledge Base
          </button>
          .
        </p>
        {/* Athena's order is Execute Plan's Now (§23.5 q): her panel links to it. */}
        {team.plan && (
          <div className="xp-link">
            <span className="eyebrow">Execute Plan</span>
            <p className="small">{team.plan.headline}</p>
            <button type="button" onClick={() => go("executive")}>
              Open Execute Plan
            </button>
          </div>
        )}
      </>
    ) : id === "analyst" ? (
      <div id="stop-analyst">
        {(["crowds", "fits", "strategy"] as const).map((r) => g.held[r] && <StaleFlag key={r} run={r} line={staleLine(r, g.held[r]!)} onRerun={() => onRerun(r)} />)}
        <AnalystResults
          j={j}
          step={analystStep}
          measured={measured}
          forming={forming}
          fits={{ steps: [], running: !!analystStep && !j.fits, asks, answers, onAnswer: (q, a) => setAnswers((x) => ({ ...x, [q.id]: a })), headed: onPage }}
          onHandoff={tm.handoff}
          onAsk={askAbout}
          probing={j.crowds ? analystStep : undefined}
          alone={alone}
        />
      </div>
    ) : (
      <SpecialistPanel id={id} j={j} team={team} live={tm.live} alone={alone} onMark={tm.mark} onHandoff={tm.handoff} onHooks={tm.hooks} crowdId={crowdIdOf} onPage={onPage} />
    );

  // The Brand Knowledge Base on the dashboard (§23.2 step 8.5b): the Brand Graph with its stale flags, sources and
  // files, the record of onboarding with what the sources disagreed on and what was kept, and a drop zone for more.
  const onboardRecord = msgs.find((m) => m.record)?.record;
  const kbParts: KbPart[] = [
    { id: "graph", title: "Brand Graph", sub: "Themes and notes from your site and files, editable", body: graphEl },
    {
      id: "files",
      title: "Add to what Athena knows",
      sub: "Decks, stockist sheets, orders exports, photos, PDFs",
      body: (
        <label className="kb-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), e.stopPropagation(), e.dataTransfer.files.length && void readFiles([...e.dataTransfer.files]))}>
          <strong>Drop files here</strong>
          <span className="small muted">Drop a deck, a stockist sheet, photos or a PDF, or click to pick. It goes on the Brand Graph, and the subagents it changes are flagged to bring up to date. A store's orders export (CSV) fills What's working instead: only each order's date, total and ZIP are kept.</span>
          <input type="file" multiple accept={ACCEPT} hidden onChange={(e) => e.target.files?.length && void readFiles([...e.target.files])} />
        </label>
      ),
    },
    ...(onboardRecord ? [{ id: "record", title: "How onboarding went", sub: "What the sources disagreed on and what was kept", body: <RecordView record={onboardRecord} /> }] : []),
  ];
  // Who the run waits on, for the dashboard's chat button.
  const pausedAgent = Object.entries(tm.live.blocking).find(([id]) => !(id in tm.live.answers))?.[1].agent;
  const pausedFor = pausedAgent ? (pausedAgent === "athena" ? "Athena" : `the ${nameOf(pausedAgent)}`) : tm.live.asks.some((a) => a.id === "goals" && !(a.id in tm.live.answers)) ? "your goals" : undefined;
  // The question the run waits on, for the Paused banner on every page and the tab's title and icon (§23.5 a3).
  const openAsks = tm.live.asks.filter((a) => !(a.id in tm.live.answers) && (a.id in tm.live.blocking || a.id === "goals"));
  const pausedAsk = openAsks.find((a) => a.id in tm.live.blocking) ?? openAsks[0];
  const pausedWho = pausedAsk ? (pausedAsk.agent === "athena" ? "Athena" : `The ${nameOf(pausedAsk.agent)}`) : undefined;
  usePausedTab(!onboarding && !!pausedAsk);
  /** Answer: open the chat wherever this page keeps it, at the question. */
  const answerPaused = () => {
    if (page === "dashboard") setDrawer(true);
    else if (subPage) setSubSheet(true);
    else setSheet(false);
    focusTray();
  };
  /** "Build your growth plan with Athena" (§23.2 step 8.5c): the chat opens on her opening question. */
  const startPlan = () => {
    setDrawer(true);
    if (!tm.live.asks.some((a) => a.id === "goals") && !tm.live.running) void tm.propose();
  };

  const dropZone = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(true);
    },
    onDragLeave: () => setDrag(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      if (e.dataTransfer.files.length) chat.addFiles(e.dataTransfer.files);
    },
  };

  return (
    <div className={`journey ${drag ? "dragging" : ""} ${onboarding ? "ob-on" : ""}`} {...dropZone}>
      {/* Above the top bar, so every sheet and drawer opens just beneath it (§23.5 a3). */}
      {!onboarding && pausedAsk && pausedWho && <PausedBanner who={pausedWho} question={pausedAsk.question} more={openAsks.length - 1} onAnswer={answerPaused} />}
      <header className="topbar journey-top">
        <Link href="/" className="wordmark-link"><strong>Athena</strong></Link>
        {/* Hidden through onboarding (§23.2 step 7.2a); the goals take the progress rail's place (step 8a). */}
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
              window.location.replace("/plan");
            }}
          >
            Start over
          </button>
        </div>
      </header>
      {onboarding ? (
        <main className="journey-main ob-main">
          <Onboard brief={brief} files={chat.files} addFiles={chat.addFiles} setFiles={chat.setFiles} onBrief={onBrief} onFacts={onRaw} graph={graphEl} dock={dockEl} grouping={working?.by === "graph" ? working.text : undefined} onRecord={(r) => (record.current = r)} />
        </main>
      ) : page === "dashboard" ? (
        <DashboardPage nav={navEl} chat={chatEl} paused={pausedFor} open={drawer} setOpen={setDrawer}>
          <Dashboard
            live={tm.live}
            team={team}
            graphRev={g.log.length}
            kb={kbParts}
            paused={pausedFor}
            working={<WhatsWorking team={team} graphRev={g.log.length} busy={tm.live.running > 0} onRefresh={tm.refresh} crowds={j.crowds?.crowds} />}
            onOpen={(id) => go(id)}
            onChat={() => setDrawer(true)}
            onStart={startPlan}
            onAdd={(id) => (tm.addToPlan(id), setDrawer(true))}
            onEditAnswer={tm.editAnswer}
            onExec={() => void tm.startExec()}
            executive={execEl}
          />
        </DashboardPage>
      ) : page === "executive" ? (
        <SubagentPage id={page} nav={navEl} chat={chatEl} bodyRef={panelBody} sheet={subSheet} setSheet={setSubSheet}>
          {execEl}
        </SubagentPage>
      ) : subPage ? (
        <SubagentPage id={subPage} nav={navEl} chat={chatEl} bodyRef={panelBody} sheet={subSheet} setSheet={setSubSheet}>
          <SpecialistWorkspace id={subPage} live={tm.live} team={team} />
          {outputOf(subPage, true)}
        </SubagentPage>
      ) : (
        <AthenaRoom
          nav={navEl}
          chat={chatEl}
          tabs={panelIds(team)}
          tab={tab}
          onTab={(id) => (tm.pickTab(id), setPanelOpen(true))}
          state={stateOf}
          follow={tm.follow}
          onFollow={tm.followRun}
          open={panelOpen}
          sheet={sheet}
          onHide={() => (setPanelOpen(false), setSheet(false))}
          onShow={() => setPanelOpen(true)}
          onBack={() => setSheet(false)}
          panelRef={panelBody}
        >
          {outputOf(tab)}
        </AthenaRoom>
      )}
    </div>
  );
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
/**
 * One specialist's panel (§23.2 step 8.4f): only what it owns (the Navigator the crowds' cities, the Promoter the
 * calendar), its results with their handoffs, or the one-click start when it hasn't run.
 */
function SpecialistPanel({ id, j, team, live, alone, onMark, onHandoff, onHooks, crowdId, onPage }: { id: SpecialistId; j: JourneyState; team: TeamState; live: TeamLive; alone: AloneRequest; onMark: (agent: SpecialistId, item: WorkItem, m: Mark) => void; onHandoff: (h: Handoff) => void; onHooks: (crowdId: string, lines: PageLine[]) => void; crowdId: (name: string) => string | undefined; onPage: boolean }) {
  const [lit, setLit] = useState<number | null>(null);
  const crowds = j.crowds?.crowds ?? [];
  const calendar = j.fits?.calendar;
  const s = live.status[id];
  const w = team.works[id];
  const step = s?.state === "working" ? s.step : undefined;
  const start = startFor(id, j, team);
  return (
    <>
      {/* On its own page the head above already names it and gives its headline (PRD §23.7 h: nothing twice). */}
      {!onPage && (
        <header className="card-head">
          <h3>The {nameOf(id)}</h3>
          <p className="small muted">{specialist(id).role}</p>
        </header>
      )}
      {id === "navigator" && crowds.some((c) => c.cities.length) && <CrowdGeography crowds={crowds} lit={lit} onLight={setLit} />}
      {id === "promoter" && calendar && !w?.page && <When calendar={calendar} name={(cid) => crowds.find((c) => c.id === cid)?.name} />}
      {step && (
        <RunProgress who={`The ${nameOf(id)}`} current={step} steps={[]} />
      )}
      {w && <WorkView work={w} team={team} updating={!!step} alone={alone} onMark={(item, m) => onMark(id, item, m)} onHandoff={onHandoff} crowdId={crowdId} onHooks={onHooks} headed={!onPage} />}
      {!w && !step && start && <Handoffs list={[start]} onHandoff={onHandoff} />}
    </>
  );
}

/** What a specialist would do now for this brand, from what the team already has: its one-click start. */
function startFor(id: SpecialistId, j: JourneyState, team: TeamState): Handoff | undefined {
  const first = j.fits?.fits.fits.find((f) => f.tier === "win_first") ?? j.fits?.fits.fits[0];
  const crowd = first ? { id: first.crowd, name: first.name } : undefined;
  const city = team.works.navigator?.shared?.city;
  if (id === "navigator") return crowd ? fromCrowd(crowd, true)[0] : undefined;
  if (id === "scout") return crowd ? fromCrowd(crowd, true)[1] : undefined;
  if (id === "rep") return city ? fromCity(city)[0] : { to: "rep", label: "Find shops for your top crowd", focus: {} };
  if (id === "matchmaker") return crowd ? { to: "matchmaker", label: `Find partners who reach ${crowd.name}`, focus: { crowd: crowd.id } } : undefined;
  if (id === "promoter") return city ? fromCity(city)[1] : { to: "promoter", label: "Find events and online audiences", focus: {} };
  return undefined;
}

const SKEW_LABEL = "Aggregate taste-panel signal from Qloo, relative to average. It describes people who share this taste, not your customers. Treat it as something to test, not a fact.";

function skewLine(s: CrowdCard["skew"]): string | undefined {
  if (!s?.clear) return undefined;
  const ages: Record<string, string> = { "24_and_younger": "under 25", "25_to_29": "25–29", "30_to_34": "30–34", "35_to_44": "35–44", "45_to_54": "45–54", "55_and_older": "55+" };
  const topAge = Object.entries(s.age).sort((a, b) => b[1] - a[1])[0];
  const g = s.gender.female >= 0.1 ? "female" : s.gender.male >= 0.1 ? "male" : undefined;
  return [topAge && topAge[1] >= 0.1 ? `leans ${ages[topAge[0]] ?? topAge[0]}` : "", g ? `leans ${g}` : ""].filter(Boolean).join(", ");
}

type FitsView = { steps: AgentEvent[]; running: boolean; asks: Asked[]; answers: Record<string, string>; onAnswer: (q: Asked, a: string) => void; strategy?: StrategyView; headed?: boolean };

/**
 * The Analyst's results (§23.2 step 8.1b): the Taste Galaxy forming live while it measures, then the crowds it ranked
 * as the brand's most valuable fits (Win first, Win next, Watch, as the Analyst set them), each top fit with its
 * strategy, the linked map and the crowd cards. "Ask Athena about this" stays on every Galaxy node.
 */
function AnalystResults({ j, step, measured, forming, fits, onAsk, probing, alone, onHandoff }: { j: JourneyState; step?: string; measured: boolean; forming?: GalaxyData; fits: FitsView; onAsk: (id: string, name: string) => void; probing?: string; alone: AloneRequest; onHandoff: (h: Handoff) => void }) {
  const r = j.crowds;
  // Linked views (§9.26): the crowd under the pointer in the Galaxy, the map or the cards lights up in all three.
  const [lit, setLit] = useState<number | null>(null);
  // While the crowds are measured, the Galaxy forms in place of the step list (from the first ring, about 5 s in).
  if (!r && forming) return <Galaxy galaxy={forming} step={step} />;
  if (!r && !measured)
    return (
      <section className="card">
        <h3>The Analyst</h3>
        <RunProgress current={step ?? "Reading your product into Qloo"} steps={[]} />
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
  const index = (id: string | null) => (id === null ? null : r.crowds.findIndex((c) => c.id === id));
  return (
    <section className="crowds">
      {r.galaxy && <Galaxy galaxy={r.galaxy} names={r.crowds.map((c) => c.name)} decisions={decisions} probes={r.probes ?? []} onAsk={onAsk} probing={probing} lit={lit} onLight={setLit} />}
      <Fits
        run={j.fits}
        {...fits}
        slot={slot}
        about={(f) => {
          const c = r.crowds.find((x) => x.id === f.crowd);
          return c ? <CrowdAbout r={r} c={c} /> : null;
        }}
        lit={lit === null ? null : (r.crowds[lit]?.id ?? null)}
        onLight={(id) => setLit(index(id))}
        foot={(f) => (f.tier === "watch" ? null : <Handoffs list={fromCrowd({ id: f.crowd, name: f.name }, f.tier === "win_first")} onHandoff={onHandoff} />)}
      />
      <header className="card-head">
        <h3>{j.fits ? "How the crowds were read" : "Your crowds"}</h3>
        <p className="small muted">
          Read from {from.join(", ")}{r.seed.tags.length ? ` and the traits ${r.seed.tags.map((t) => t.name.toLowerCase()).join(", ")}` : ""}. Built from {r.calls} Qloo calls.
        </p>
      </header>
      {/* Each crowd is described once (§23.5 p): on its fit card once the fits are ranked, here only until then. */}
      {!j.fits && (
        <div className="crowd-grid">
          {r.crowds.map((c, ci) => (
            <article key={c.id} className={`crowd ${j.crowdId === c.id ? "chosen" : ""}${lit === ci ? " lit" : ""}`} onMouseEnter={() => setLit(ci)} onMouseLeave={() => setLit(null)}>
              <p className="crowd-tag">{c.nearMiss ? NEAR_MISS_LABEL : c.main ? "Closest to your product" : "Next door"}</p>
              <h4>
                <span className="swatch" style={{ background: `var(--crowd-${ci % 4})` }} aria-hidden />
                {c.name}
              </h4>
              <CrowdAbout r={r} c={c} />
            </article>
          ))}
        </div>
      )}
      <WithWithout stop="crowd" question="Who are this product's customers, and what do they love?" athena={r.crowds.map((c) => ({ name: c.name, why: c.loves.slice(0, 6).map((l) => l.name).join(", ") }))} request={alone} />
      <p className="small muted">{SKEW_LABEL}</p>
    </section>
  );
}

/** What a crowd loves, where it concentrates, where it meets the main crowd, and its taste-panel lean. */
function CrowdAbout({ r, c }: { r: NonNullable<JourneyState["crowds"]>; c: CrowdCard }) {
  const skew = skewLine(c.skew);
  return (
    <>
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
    </>
  );
}

/** Where a next-door crowd meets the main one (§9.28), or the near-miss group each measured crowd (§23.5 c): what both love, each side's percentile on hover. */
function Meeting({ r, crowd }: { r: NonNullable<JourneyState["crowds"]>; crowd: CrowdCard }) {
  return (
    <>
      {(r.meetings ?? [])
        .filter((x) => x.b === crowd.id)
        .map((m) => {
          const main = r.crowds.find((c) => c.id === m.a);
          return main ? <MeetingLine key={m.a} m={m} main={main} crowd={crowd} /> : null;
        })}
    </>
  );
}

function MeetingLine({ m, main, crowd }: { m: CrowdMeeting; main: CrowdCard; crowd: CrowdCard }) {
  return (
    <p className="small meeting">
      <strong>Meets {main.name} at</strong>{" "}
      {m.items.slice(0, 4).map((x, i) => (
        <span key={x.id} title={`${main.name}: ${ordinal(Math.round(x.a * 100))} percentile · ${crowd.name}: ${ordinal(Math.round(x.b * 100))}`}>
          {i ? ", " : ""}
          {x.name}
        </span>
      ))}
    </p>
  );
}
