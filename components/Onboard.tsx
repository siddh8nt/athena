"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { AgentEvent } from "@/lib/blocks/types";
import type { AgentStreamEvent } from "@/lib/agent/loop";
import type { BrandBrief } from "@/lib/brief/types";
import { isResolution, keptOptions, liveFacts, namedWhy, placesOf, type Conflict, type Knowledge, type LiveFact, type Settled, type Settlement } from "@/lib/knowledge/types";
import type { Upload } from "@/lib/knowledge/uploads";
import { CONTEXT_PROMPT } from "@/lib/agent/context-prompt";
import { checklistLine, type CheckItem } from "@/lib/agent/checklist";
import { addEvent, lineDetail, lineText, settleRun, type Line } from "@/lib/agent/transcript";
import { buildRecord, type WorkRecord } from "@/lib/agent/record";
import { ACCEPT } from "./chat";
import { Question, QuestionTray, type Asked, type TrayItem } from "./Question";
import { KnowledgePanel, Settle } from "./Knowledge";
import { workspace } from "@/lib/knowledge/workspace";
import { PACKS } from "@/lib/journey/packs";
import { pacer } from "@/lib/stream/pace";
import { RunProgress, StepTimer, type ProgressStep } from "./Progress";
import { PanelGrip } from "./Resize";
import { NavIcon, RailToggle, useRail } from "./SideNav";

// Onboarding as a workspace (PRD §23.2 step 7.2). First, one box: the founder types, pastes or drops anything, and
// the model sorts it (a website, files, notes or an AI summary). On send the box docks at the bottom as the steering
// box, the live transcript fills the middle with the agent's checklist pinned on top, and the Brand Graph slides in
// from the right; what Athena kept and the conflicts to settle sit beside it. On a phone the three are tabs. Files
// are kept for the founder as soon as they're added and read on the next run; questions arrive as cards that never
// block, and anything typed mid-run goes in as soon as the run in progress is done.

type Answer = { question: string; answer: string };
type Kept = Upload & { kept?: boolean };
type Meter = { tokens: number; max: number; pages: number; maxPages: number; over: boolean };
type View = "transcript" | "brand" | "kept";
type Hint = "website" | "context" | "words";

/** One SSE stream, event by event. */
async function stream(body: FormData, on: (e: AgentStreamEvent) => void) {
  const res = await fetch("/api/onboard", { method: "POST", body });
  const reader = res.body?.getReader();
  if (!reader) return;
  const dec = new TextDecoder();
  const pace = pacer();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 2);
      if (!line.startsWith("data: ")) continue;
      const e = JSON.parse(line.slice(6)) as AgentStreamEvent;
      await pace(e);
      on(e);
    }
  }
}

const fmt = (n: number) => n.toLocaleString("en-US");
const said = (tool: string, why: string, found?: string[]): AgentEvent => ({ t: 0, tool, why, status: "ok", callIds: [], summary: "", found });

/** Small line icons, drawn in the text colour. */
const ICONS = {
  file: "M7 3h7l5 5v13H7zM14 3v5h5",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z",
  pen: "M4 20l4-1 11-11-3-3L5 16zM14 6l3 3",
  up: "M12 19V5M6 11l6-6 6 6",
};
function Icon({ d, size = 16 }: { d: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[d]} />
    </svg>
  );
}

/** Athena's small mark: the oxblood and ochre dots, as on the landing page. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg className="ob-mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="6.5" cy="12" r="5" fill="#7e2b34" />
      <circle cx="17.5" cy="12" r="5" fill="#a9791c" />
    </svg>
  );
}

/** Runs the switch to the workspace as one glide of the box, where the browser can. */
function glide(go: () => void) {
  type Glide = { ready: Promise<void>; finished: Promise<void> };
  const doc = document as Document & { startViewTransition?: (f: () => void) => Glide };
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (doc.startViewTransition && !still) {
    // A glide the browser skips (a hidden tab, a second click) still switches; only the animation is lost.
    const t = doc.startViewTransition(() => flushSync(go));
    t.ready.catch(() => {});
    t.finished.catch(() => {});
  } else go();
}

export function Onboard({
  brief,
  files,
  addFiles,
  setFiles,
  onBrief,
  onFacts,
  graph,
  dock,
  grouping,
  onRecord,
}: {
  brief: BrandBrief;
  files: File[];
  addFiles: (f: FileList | File[]) => void;
  setFiles: (f: File[]) => void;
  /** early: the first brief from the home and About pages, replaced in place by the full one. */
  onBrief: (brief: BrandBrief, assumptions: string[], facts: LiveFact[], early?: boolean) => void;
  /** Everything read, into the graph as soon as it's read, before the brief is written. */
  onFacts: (facts: LiveFact[]) => void;
  graph: ReactNode;
  dock: ReactNode;
  /** The graph is still grouping what was read into themes: said here too, since the chat has gone quiet by then. */
  grouping?: string;
  /** What onboarding did, kept for the team chat after it, so moving on never hides the work. */
  onRecord?: (r: WorkRecord) => void;
}) {
  const had = !!brief.name;
  const [phase, setPhase] = useState<"first" | "work">(had ? "work" : "first");
  const [text, setText] = useState("");
  const [hint, setHint] = useState<Hint>();
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [thinking, setThinking] = useState<string>();
  const [items, setItems] = useState<CheckItem[]>();
  const [planOpen, setPlanOpen] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [asks, setAsks] = useState<Asked[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Answer[]>([]);
  const [queued, setQueued] = useState<string[]>([]);
  const [again, setAgain] = useState(false);
  const [note, setNote] = useState("");
  // The Brand Graph shows once it's built: the full brief written and grouped into themes. Until then the panel shows
  // the build itself. It stays shown after, through every later run.
  const [full, setFull] = useState(false);
  const [shown, setShown] = useState(had);
  const [view, setView] = useState<View>("transcript");
  const [rail, flipRail] = useRail();
  const [ws, setWs] = useState("");
  const [kept, setKept] = useState<Kept[]>([]);
  const [meter, setMeter] = useState<Meter>();
  const [adding, setAdding] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [left, setLeft] = useState<Set<string>>(new Set());
  const [kb, setKb] = useState<Knowledge>();
  const [struck, setStruck] = useState<Set<string>>(new Set());
  const [sentStruck, setSentStruck] = useState("");
  // Files added or removed since the brief was last written.
  const [refiled, setRefiled] = useState(false);
  const [picked, setPicked] = useState<Settled>({});
  const [inUse, setInUse] = useState<Settled>({});
  const [typedFor, setTypedFor] = useState<Record<string, string>>({});
  // What the model sorted out of the box, kept for the runs after (§23.2 step 7.2b).
  const [websites, setWebsites] = useState<string[]>([]);
  const [pasted, setPasted] = useState("");
  // The founder's own words as the model read them: sent again with every later run, so an answer never starts over.
  const [steer, setSteer] = useState("");
  const pick = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const runs = useRef(0);
  const sent = useRef<Set<string>>(new Set());
  const busy = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  // Time spent working, run by run (not the time spent waiting on the founder's answers).
  const worked = useRef(0);

  // The workspace and the files already kept in it.
  useEffect(() => {
    const id = workspace();
    setWs(id);
    fetch(`/api/uploads?ws=${id}`)
      .then((r) => r.json())
      .then((j: { files: Kept[]; meter: Meter }) => {
        setKept(j.files ?? []);
        setMeter(j.meter);
      })
      .catch(() => undefined);
  }, []);

  // Files dropped, pasted or chosen anywhere go up one by one: kept, counted and read on the next run. Mid-run, the
  // next run starts as soon as this one is done.
  useEffect(() => {
    if (!ws || !files.length) return;
    const batch = files;
    setFiles([]);
    setAdding((a) => [...a, ...batch.map((f) => f.name)]);
    void (async () => {
      for (const f of batch) {
        const form = new FormData();
        form.set("ws", ws);
        form.set("file", f);
        try {
          const j = (await (await fetch("/api/uploads", { method: "POST", body: form })).json()) as { file: Kept & { kept: boolean; status: string }; files: Kept[]; meter: Meter };
          if (j.files) setKept(j.files);
          if (j.file?.kept) {
            setRefiled(true);
            if (busy.current) setAgain(true);
          }
          if (j.meter) setMeter(j.meter);
          if (!j.file?.kept) setNotes((n) => ({ ...n, [f.name]: j.file?.status ?? "Send it again in a moment" }));
        } catch {
          setNotes((n) => ({ ...n, [f.name]: "Still on its way; add it again in a moment" }));
        }
        setAdding((a) => {
          const i = a.indexOf(f.name);
          return i < 0 ? a : [...a.slice(0, i), ...a.slice(i + 1)];
        });
      }
    })();
  }, [files, ws, setFiles]);

  async function remove(u: Kept) {
    setKept((k) => k.filter((x) => x.hash !== u.hash));
    try {
      const res = await fetch(`/api/uploads?ws=${ws}&hash=${u.hash}`, { method: "DELETE" });
      const j = (await res.json()) as { files: Kept[]; meter: Meter; retry?: boolean };
      setKept(j.files);
      setMeter(j.meter);
      setRefiled(true);
      if (j.retry) setNotes((n) => ({ ...n, [u.name]: "Still removing; tap ✕ once more" }));
    } catch {
      setKept((k) => (k.some((x) => x.hash === u.hash) ? k : [...k, u]));
      setNotes((n) => ({ ...n, [u.name]: "Still removing; tap ✕ once more" }));
    }
  }

  // Over the limit, the founder chooses: files are in until they leave one out.
  const chosen = kept.filter((u) => !left.has(u.hash));
  const chosenTokens = chosen.reduce((n, u) => n + u.tokens, 0);
  const over = !!meter && chosenTokens > meter.max;

  async function run(extra: { said?: string; answers?: Answer[] } = {}) {
    if (busy.current) return;
    busy.current = true;
    const began = Date.now();
    const n = ++runs.current;
    const fresh = chosen.filter((u) => !sent.current.has(u.hash));
    const form = new FormData();
    form.set("websites", websites.join(" "));
    if (pasted) form.set("pasted", pasted);
    if (steer) form.set("steer", steer);
    if (extra.said) form.set("said", extra.said);
    form.set("ws", ws);
    form.set("hashes", JSON.stringify(chosen.map((u) => u.hash)));
    form.set("struck", JSON.stringify([...struck]));
    form.set("settled", JSON.stringify(picked));
    if (extra.answers?.length) form.set("answers", JSON.stringify(extra.answers));
    if (brief.name) {
      form.set("brief", JSON.stringify(brief));
      form.set("name", brief.name.value);
    }
    for (const u of chosen) sent.current.add(u.hash);
    setRunning(true);
    setNote("");
    setSentStruck([...struck].sort().join());
    setRefiled(false);
    if (extra.said || fresh.length)
      setLines((l) => [...l, { key: `${n}:you`, run: n, ev: said("you", extra.said ?? "", fresh.map((u) => u.name)), pages: [] }]);
    if (extra.said) setItems(undefined);
    let got = false;
    let early = false;
    // The run stopped for the founder's answers (a question, or sources that disagree): not a run to send again.
    let waiting = false;
    let read: { kb: Knowledge; settled: Settled } | undefined;
    try {
      await stream(form, (e) => {
        if (e.type === "event") {
          const ev = e.event;
          if (ev.tool === "think") return setThinking(ev.status === "running" ? ev.why : undefined);
          setThinking(undefined);
          setLines((l) => addEvent(l, ev, n));
        } else if (e.type === "sorted") {
          setWebsites(e.websites);
          setPasted(e.pasted ?? "");
          setSteer(e.steer ?? "");
        } else if (e.type === "checklist")
          // A run started by an answer sends the checklist again from the top: a step already done stays done.
          setItems((was) => e.items.map((i) => (i.state !== "done" && was?.some((w) => w.step === i.step && w.state === "done") ? { ...i, state: "done" } : i)));
        else if (e.type === "knowledge") {
          setKb(e.knowledge);
          setInUse(e.settled);
          read = { kb: e.knowledge, settled: e.settled };
          onFacts(liveFacts(e.knowledge, e.settled));
          if (e.knowledge.conflicts.length)
            setLines((l) => addEvent(l, said("settle", `Your sources disagree on ${e.knowledge.conflicts.length === 1 ? "one thing" : `${e.knowledge.conflicts.length} things`}: choose below and I'll write the brief from your answers`), n));
          if (e.knowledge.conflicts.some((c) => picked[c.id] === undefined)) waiting = true;
        } else if (e.type === "ask") {
          // Each run numbers its questions from one: the run's number keeps a new question from showing an old answer.
          waiting = true;
          setAsks((a) => [...a.filter((x) => x.question !== e.ask.question), { ...e.ask, id: `${e.ask.id}-r${n}` }]);
        }
        else if (e.type === "brief" && e.early) {
          early = true;
          onBrief(e.brief, [], read ? liveFacts(read.kb, read.settled) : [], true);
        } else if (e.type === "brief") {
          got = true;
          onBrief(e.brief, e.assumptions, read ? liveFacts(read.kb, read.settled) : []);
          setFull(true);
          setLines((l) =>
            addEvent(l, said("brief", early || had ? "Updated your brief: every fact with where it came from" : "Wrote your brief: every fact with where it came from", e.assumptions.map((a) => `Assumed: ${a}`)), n),
          );
        }
      });
    } catch {
      // Never a failure state: the inputs stay as they are, and one tap tries again.
    }
    busy.current = false;
    worked.current += Date.now() - began;
    setRunning(false);
    setThinking(undefined);
    setLines((l) => settleRun(l, n));
    if (!got && !waiting) setNote("Send it again and I'll pick up from here.");
  }

  // Messages, answers, choices and files given while a run is going wait for it, then go in together.
  useEffect(() => {
    // Answers wait until every question and disagreement is answered, then go in together and the brief is written.
    const open = asks.some((q) => !(q.id in answers)) || !!kb?.conflicts.some((c) => picked[c.id] === undefined);
    if (!running && (queued.length || ((pending.length || again) && !open))) {
      const a = pending;
      const q = queued;
      setPending([]);
      setQueued([]);
      setAgain(false);
      void run({ answers: a, said: q.join("\n") || undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, pending, queued, again, asks, answers, kb, picked]);

  useEffect(() => {
    if (!shown && full && !running && !grouping) setShown(true);
  }, [shown, full, running, grouping]);

  // The record for the chat after onboarding, kept current as the transcript grows.
  useEffect(() => {
    if (running || !onRecord) return;
    const settled = (kb?.conflicts ?? []).map((c) => {
      const s = picked[c.id] ?? inUse[c.id];
      const kept = isResolution(s) ? s.fact : keptOptions(c, s).map((i) => c.options[i]?.value).filter(Boolean).join(", ");
      return { about: c.about, kept, by: s === undefined ? ("athena" as const) : ("you" as const) };
    });
    const r = buildRecord(lines, { facts: kb?.facts.length ?? 0, conflicts: kb?.conflicts.length ?? 0 }, worked.current / 1000, settled);
    if (r) onRecord(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, running, kb, picked, inUse]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [lines.length, asks.length]);

  const answer = (q: Asked, a: string) => {
    setAnswers((x) => ({ ...x, [q.id]: a }));
    // Skip goes with the option Athena recommended.
    const given = a || q.assumed;
    if (given) setPending((p) => [...p, { question: q.question, answer: given }]);
  };

  const settle = (id: string, s: Settlement) => {
    // Choosing the pick already in use still counts as the founder's answer.
    if (picked[id] === s) return;
    setPicked((p) => ({ ...p, [id]: s }));
    setAgain(true);
  };

  // A conflict answered in the transcript: one option exactly is that option; anything else (several, Other, a
  // mix with caveats) is read by the model into which values still hold and one fact in the founder's terms.
  const answerConflict = async (c: Conflict, a: string) => {
    setTypedFor((x) => ({ ...x, [c.id]: a }));
    // Skip keeps Athena's pick, as the founder's choice.
    if (!a) {
      setPicked((p) => ({ ...p, [c.id]: inUse[c.id] ?? c.recommended }));
      return setAgain(true);
    }
    const labels = conflictLabels(c);
    const exact = labels.findIndex((l) => l === a);
    if (exact >= 0) return settle(c.id, exact);
    const parts = a.split(", ");
    const named = labels.flatMap((l, i) => (parts.includes(l) ? [i] : []));
    const res = await fetch("/api/settle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ about: c.about, options: c.options.map((o) => o.value), answer: a, picked: named }) })
      .then((r) => r.json())
      .catch(() => undefined);
    settle(c.id, isResolution(res) ? res : { keep: named, fact: `${c.about}: ${a}`, said: a });
  };

  const strike = (id: string) =>
    setStruck((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });

  const restruck = [...struck].sort().join() !== sentStruck;
  const any = !!text.trim() || chosen.some((u) => !sent.current.has(u.hash));

  function send() {
    const t = text.trim();
    if (adding.length || over || (!t && !any)) return;
    setText("");
    setHint(undefined);
    if (phase === "first") glide(() => setPhase("work"));
    if (running) {
      // Steering mid-run: shown now, read as soon as this run is done.
      if (t) {
        setLines((l) => [...l, { key: `${runs.current}:later:${l.length}`, run: runs.current, ev: { ...said("you", t), summary: "I'll take this in as soon as this pass is done" }, pages: [] }]);
        setQueued((q) => [...q, t]);
      }
      return;
    }
    void run({ said: t || undefined });
  }

  const copyPrompt = () => {
    setHint("context");
    box.current?.focus();
    void navigator.clipboard?.writeText(CONTEXT_PROMPT).then(
      () => setCopied(true),
      () => setShowPrompt(true),
    );
    if (!navigator.clipboard) setShowPrompt(true);
  };
  // A sample brand: its first message, in our own words with its public links, runs live through this same flow.
  const sample = (message: string) => {
    if (running) return;
    glide(() => setPhase("work"));
    void run({ said: message });
  };
  const askSite = () => {
    setHint("website");
    box.current?.focus();
  };
  const askWords = () => {
    setHint("words");
    box.current?.focus();
  };

  const docked = phase === "work";
  const placeholder =
    hint === "website"
      ? "Paste your website, like yourbrand.com, and anything else I should know"
      : hint === "context"
        ? "Paste your assistant's answer here"
        : hint === "words"
          ? "e.g. We make tinned fish with playful packaging, about $9 a tin, sold online and in 1,500 shops"
          : docked
            ? running
              ? "Steer me, or add files, while I work"
              : "Anything to correct or focus on? Or drop more files"
            : "Type or paste anything about your brand";

  const chips = (
    <>
      {(!!kept.length || !!adding.length) && (
        <ul className="ob-files" aria-label="Your files">
          {kept.map((u) => (
            <li key={u.hash} className={`ob-file ${left.has(u.hash) ? "ob-file-left" : ""}`}>
              {(over || left.has(u.hash)) && (
                <input
                  type="checkbox"
                  checked={!left.has(u.hash)}
                  aria-label={`Use ${u.name}`}
                  onChange={() =>
                    setLeft((l) => {
                      const n = new Set(l);
                      if (!n.delete(u.hash)) n.add(u.hash);
                      return n;
                    })
                  }
                />
              )}
              <Icon d="file" size={13} />
              <span className="ob-file-name" title={`${u.status} · about ${fmt(u.pages)} page${u.pages === 1 ? "" : "s"}`}>{u.name}</span>
              <button type="button" className="linkish" aria-label={`Remove ${u.name}`} title="Remove the file and everything read from it" onClick={() => void remove(u)}>
                ✕
              </button>
            </li>
          ))}
          {adding.map((n, i) => (
            <li key={`${n}${i}`} className="ob-file ob-file-adding">
              <Icon d="file" size={13} />
              <span className="ob-file-name">{n}</span>
              <small className="muted">keeping it</small>
            </li>
          ))}
        </ul>
      )}
      {Object.entries(notes).map(([n, t]) => (
        <small key={n} className="muted ob-file-note">
          {n}: {t}
        </small>
      ))}
      {over && meter && (
        <small className="muted ob-file-note">
          That&apos;s more than I can read at once (about {fmt(meter.maxPages)} pages): untick what to leave out this time.
        </small>
      )}
    </>
  );

  const composer = (
    <form
      className={`ob-box ${docked ? "ob-box-docked" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {chips}
      <textarea
        ref={box}
        autoFocus={!docked}
        rows={docked ? 1 : 4}
        value={text}
        maxLength={30_000}
        aria-label="Tell Athena about your brand"
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          if (e.clipboardData.files.length) {
            e.preventDefault();
            addFiles(e.clipboardData.files);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="ob-box-row">
        <button type="button" className="ob-chip" onClick={() => pick.current?.click()}>
          <Icon d="file" size={14} /> Files
        </button>
        {!docked && (
          <>
            <button type="button" className={`ob-chip ${hint === "website" ? "on" : ""}`} onClick={askSite}>
              <Icon d="globe" size={14} /> Website
            </button>
            <button type="button" className={`ob-chip ${hint === "context" ? "on" : ""}`} onClick={copyPrompt} title="Copies a prompt for your AI assistant">
              <Icon d="spark" size={14} /> {copied ? "Prompt copied" : "Bring your context from ChatGPT, Claude or Gemini"}
            </button>
          </>
        )}
        <span className="ob-box-gap" />
        <button type="submit" className="ob-send" aria-label="Send" disabled={!!adding.length || over || (!text.trim() && !any)} title={adding.length ? "Keeping your files…" : "Send"}>
          <Icon d="up" size={16} />
        </button>
      </div>
      {hint === "context" && (
        <p className="ob-hint">
          {copied ? "Copied. " : ""}Paste the prompt into ChatGPT, Claude or Gemini, then paste its answer here.{" "}
          <button type="button" className="linkish" aria-expanded={showPrompt} onClick={() => setShowPrompt((s) => !s)}>
            {showPrompt ? "Hide the prompt" : "See the prompt"}
          </button>
        </p>
      )}
      {hint === "context" && showPrompt && <pre className="onboard-prompt">{CONTEXT_PROMPT}</pre>}
      {hint === "website" && <p className="ob-hint">I&apos;ll read it page by page, the home and About pages first.</p>}
    </form>
  );

  const picker = (
    <input
      ref={pick}
      type="file"
      multiple
      accept={ACCEPT}
      hidden
      onChange={(e) => {
        if (e.target.files) addFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );

  if (phase === "first")
    return (
      <div className="ob ob-first">
        {picker}
        <div className="ob-hero">
          <h1>Tell me about your brand</h1>
          <p className="muted">Type, paste or drop anything. I&apos;ll read it all, look you up, and only ask what I can&apos;t find.</p>
          {/* Temporary way into developer mode; /dev itself 404s in production. */}
          {process.env.NODE_ENV !== "production" && (
            <a href="/dev" className="muted" style={{ display: "inline-block", marginBottom: 12, fontSize: 13, textDecoration: "underline" }}>
              Open dev mode
            </a>
          )}
          {composer}
          <ul className="ob-cards">
            <li>
              <button type="button" onClick={askSite}>
                <Icon d="globe" />
                <strong>Your website</strong>
                <span>I read it page by page</span>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => pick.current?.click()}>
                <Icon d="file" />
                <strong>Decks and sheets</strong>
                <span>Line sheets, stockist lists, sales exports, photos</span>
              </button>
            </li>
            <li>
              <button type="button" onClick={copyPrompt}>
                <Icon d="spark" />
                <strong>From your AI assistant</strong>
                <span>Copy a prompt, paste back its summary</span>
              </button>
            </li>
            <li>
              <button type="button" onClick={askWords}>
                <Icon d="pen" />
                <strong>In your words</strong>
                <span>What you sell, where, and what matters now</span>
              </button>
            </li>
          </ul>
          <div className="ob-samples" aria-label="Or try a sample brand">
            <span className="muted small">Or try a sample brand:</span>
            <ul>
              {PACKS.map((p) => (
                <li key={p.slug}>
                  <button type="button" onClick={() => sample(p.message)} title={`Built from public info; not affiliated with ${p.name}.`}>
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );

  // The workspace.
  const panel = had || !!kb;
  const waitingOnYou = !running && (asks.some((q) => !(q.id in answers)) || !!kb?.conflicts.some((c) => picked[c.id] === undefined));
  // After an answer the agent reads on before it marks a step: the plan's next open step is what it's on, never a step it already ticked.
  const now = items?.find((i) => i.state === "now") ?? (running ? items?.find((i) => i.state === "todo") : undefined);
  const lastLive = [...lines].reverse().find((l) => l.ev.status === "running");
  // Between steps the next one on the plan is what it's on; once the plan is through, it's writing it all up.
  const between = items?.find((i) => i.state === "todo")?.step ?? (lines.some((l) => l.run === runs.current && l.ev.tool !== "you") ? "Putting it all together" : "Reading what you gave me");
  // Putting it all together runs one comparison per topic, side by side: how many are through says it's moving.
  const comparing = [...lines].reverse().find((l) => l.run === runs.current && l.ev.tool === "compare" && l.ev.status === "running");
  const compared = comparing?.pages.length ? `${comparing.pages.filter((p) => p.ev.status !== "running").length} of ${comparing.pages.length} topics compared` : "";
  const status = running ? (now?.step ?? (lastLive ? lineText(lastLive.ev) : thinking ?? between)) : waitingOnYou ? "Paused until you answer" : grouping ? "Grouping your Brand Graph into themes" : had ? "Your brief is written" : "Ready when you are";
  const conflicts = kb?.conflicts.length ?? 0;
  // What the brief waits on: questions not yet answered and disagreements not yet chosen.
  const openAsks = asks.filter((q) => !(q.id in answers)).length;
  const openConflicts = kb?.conflicts.filter((c) => picked[c.id] === undefined).length ?? 0;
  const paused = !running && (openAsks > 0 || openConflicts > 0);
  // The run's progress: the agent's own plan when it has written one, else the steps shown so far.
  const runLines = lines.filter((l) => l.run === runs.current && l.ev.tool !== "you");
  const progressSteps: ProgressStep[] = items?.length
    ? items.map((i) => ({ label: i.step, state: i === now ? "now" : i.state }))
    : runLines.map((l) => ({ label: lineText(l.ev), state: l.ev.status === "running" ? "now" : "done" }));
  const pagesAll = lines.reduce((n, l) => n + l.pages.filter((p) => p.ev.tool === "read_page").length, 0);
  const qlooCalls = runLines.reduce((n, l) => n + l.ev.callIds.length + l.pages.reduce((m, p) => m + p.ev.callIds.length, 0), 0);
  const progressCounts = [
    compared,
    // Counted over the whole onboarding, so reading on after an answer never sets it back.
    pagesAll ? `${fmt(pagesAll)} page${pagesAll === 1 ? "" : "s"} read` : "",
    kb?.facts.length ? `${fmt(kb.facts.length)} facts` : "",
    qlooCalls ? `${qlooCalls} Qloo call${qlooCalls === 1 ? "" : "s"}` : "",
  ];
  const toggle = (k: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (!n.delete(k)) n.add(k);
      return n;
    });
  const side: View = view === "kept" ? "kept" : "brand";

  const row = (l: Line, page = false): ReactNode => {
    const ev = l.ev;
    const live = ev.status === "running";
    const done = ev.status === "ok";
    const detail = lineDetail(ev);
    const more = !!(detail || ev.found?.length || ev.source || l.pages.length);
    // A finished step folds to one line; while it runs, its latest pages show under it.
    const opened = open.has(l.key);
    // A site's pages are many, so only the latest show; the comparisons under putting it all together are few, so all do.
    const cap = ev.tool === "compare" ? 12 : 4;
    const pages = live ? l.pages.slice(-cap) : opened ? l.pages : [];
    const sub = ev.tool === "compare" ? "topic" : "page";
    if (ev.tool === "you")
      return (
        <li key={l.key} className="ob-line ob-you">
          {ev.why && <p>{ev.why}</p>}
          {!!ev.found?.length && (
            <span className="ob-you-files">
              {ev.found.map((f) => (
                <span key={f} className="ob-file">
                  <Icon d="file" size={12} /> {f}
                </span>
              ))}
            </span>
          )}
          {ev.summary && <small className="muted">{ev.summary}</small>}
        </li>
      );
    return (
      <li key={l.key} className={`ob-line ${live ? "ob-live" : done ? "ob-done" : "ob-quiet"} ${page ? "ob-page" : ""}`}>
        <button type="button" className="ob-line-head" aria-expanded={more ? opened : undefined} disabled={!more} onClick={() => toggle(l.key)}>
          <span className="ob-dot" aria-hidden />
          <span className="ob-line-text">
            {lineText(ev)}
            {live && ev.summary && <small className="muted"> · {ev.summary}</small>}
            {live && <StepTimer />}
            {/* A finished site already says how many pages it read, so only the comparisons count theirs. */}
            {!live && l.pages.length > 0 && !opened && ev.tool !== "read_website" && <small className="muted"> · {l.pages.length} {sub}{l.pages.length === 1 ? "" : "s"}</small>}
          </span>
          {more && !live && <span className="ob-caret" aria-hidden>{opened ? "▾" : "▸"}</span>}
        </button>
        {opened && !live && (detail || ev.found?.length || ev.source) && (
          <div className="ob-line-body">
            {detail && <p>{detail}</p>}
            {!!ev.found?.length && (
              <ul>
                {ev.found.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
            {ev.source &&
              (ev.source.url ? (
                <a href={ev.source.url} target="_blank" rel="noreferrer" className="ob-source">
                  {ev.source.label} ↗
                </a>
              ) : (
                <span className="ob-source">{ev.source.label}</span>
              ))}
          </div>
        )}
        {ev.tool === "settle" && (
          <button type="button" className="linkish small ob-line-act" onClick={() => setView("kept")}>
            See them in Conflicts
          </button>
        )}
        {pages.length > 0 && <ol className="ob-pages">{pages.map((p) => row(p, true))}</ol>}
        {live && l.pages.length > cap && <small className="muted ob-more">and {l.pages.length - cap} more pages read</small>}
      </li>
    );
  };

  const plan = items && items.length > 0 && (
    <div className="ob-plan" aria-label="Athena's plan">
      <button type="button" className="ob-plan-line" aria-expanded={planOpen} onClick={() => setPlanOpen((o) => !o)}>
        {running ? (planOpen ? "Hide the plan" : "See the plan") : checklistLine(items)} <span aria-hidden>{planOpen ? "▴" : "▾"}</span>
      </button>
      <ol className={`ob-plan-list ${planOpen ? "open" : ""}`}>
        {items.map((i) => (
          <li key={i.id} className={`ob-plan-${i === now ? "now" : i.state}`}>
            <span className="ob-check" aria-hidden>{i.state === "done" ? "✓" : ""}</span>
            <span className="ob-plan-step">{i.step}</span>
            {i.result && i.state === "done" && <small className="muted">{i.result}</small>}
            {i.state === "skipped" && <small className="muted">not needed</small>}
          </li>
        ))}
      </ol>
    </div>
  );

  const keptTab = (
    <div className="ob-kept">
      {kb && kb.conflicts.length > 0 && (
        <div className="onboard-asks">
          {kb.conflicts.map((c) => (
            <Settle key={c.id} c={c} facts={kb.facts} pick={picked[c.id] ?? inUse[c.id] ?? c.recommended} onPick={(i) => settle(c.id, i)} />
          ))}
        </div>
      )}
      {kb && kb.facts.length > 0 ? <KnowledgePanel kb={kb} struck={struck} onStrike={strike} /> : <p className="muted small">What I keep from your sources lands here as I read, each fact with where it is.</p>}
      <div className="ob-kept-files">
        <span className="small">Your files</span>
        {kept.length ? chips : <small className="muted">None yet.</small>}
        <button type="button" className="linkish small" onClick={() => pick.current?.click()}>
          + Add files
        </button>
      </div>
      {(restruck || refiled) && !running && (
        <button type="button" className="kb-apply" disabled={over || adding.length > 0} onClick={() => void run()}>
          {refiled ? "Update the brief with your files" : "Update the brief without what you struck"}
        </button>
      )}
    </div>
  );

  // Every question for the founder, Athena's asks and then the conflicts, as one list for the tray.
  const questions: TrayItem[] = [
    ...asks.map((q) => ({ q, answer: answers[q.id], onAnswer: (a: string) => answer(q, a) })),
    ...(kb?.conflicts ?? []).map((c) => {
      const s = picked[c.id] ?? inUse[c.id];
      return { q: conflictQuestion(c, kb!), answer: isResolution(s) ? s.fact : typedFor[c.id], onAnswer: (a: string) => void answerConflict(c, a) };
    }),
  ];

  return (
    <div className={`ob ob-work ${panel ? "ob-has-panel" : ""}`} data-view={view}>
      {picker}
      <nav className="ob-tabs" aria-label="Onboarding">
        {(["transcript", "brand", "kept"] as const).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
            {v === "transcript" ? "Transcript" : v === "brand" ? "Brand" : "Conflicts"}
            {v === "kept" && conflicts > 0 && <span className="ob-badge">{conflicts}</span>}
          </button>
        ))}
      </nav>

      {/* Reserved for Athena and the six specialists (§23.2 step 8f); for now, Athena alone. */}
      <aside className={`ob-team nav${rail ? " team-rail" : ""}`} aria-label="Who's working">
        <div className="nav-head">
          <span className="nav-title">Workspace</span>
          <RailToggle rail={rail} onFlip={flipRail} />
        </div>
        <div className="team-list">
          <span className="nav-section">Agents</span>
          <div className={`nav-item on${running ? " team-working" : ""}`} aria-current="page" title={`Athena: ${status}`}>
            <span className="nav-glyph">
              <NavIcon name="athena" />
            </span>
            <span className="nav-label">
              <span className="nav-name">Athena</span>
              <span className="nav-sub">{status}</span>
            </span>
            {running && <span className="nav-state spin" aria-label="Working" />}
          </div>
          <p className="nav-note">Your specialists join once your brief is written.</p>
        </div>
      </aside>

      <section className="ob-centre" aria-label="Transcript">
        <div className="ob-top">
          {paused && (
            <div className="paused" role="status">
              <strong>Paused until you answer</strong>
              <p>
                I&apos;ll write your brief from your answers.{" "}
                {[openAsks ? `Answer ${openAsks === 1 ? "the question" : `the ${openAsks} questions`}` : "", openConflicts ? `choose where your sources disagree (${openConflicts})` : ""].filter(Boolean).join(" and ").replace(/^c/, "C")} below, and I&apos;ll carry on.
              </p>
            </div>
          )}
          {running && <RunProgress key={runs.current} current={status} steps={progressSteps} counts={progressCounts} />}
          {/* The run is over but the graph is still being grouped: the same card, so it's plain the work isn't done. */}
          {!running && grouping && <RunProgress key="grouping" who="Brand Graph" current={grouping} steps={[]} counts={["the themes land on the graph when they're ready"]} />}
          {plan}
        </div>
        <ol className="ob-transcript" aria-live="polite">
          {lines.map((l) => row(l))}
          {running && thinking && (
            <li className="ob-line ob-think">
              <span className="ob-dot" aria-hidden />
              <span className="ob-line-text">{thinking}</span>
            </li>
          )}
          {running && !lines.some((l) => l.run === runs.current && l.ev.tool !== "you") && !thinking && (
            <li className="ob-line ob-live">
              <span className="ob-dot" aria-hidden />
              <span className="ob-line-text">Reading what you gave me</span>
            </li>
          )}
          {!running && grouping && (
            <li className="ob-line ob-live">
              <span className="ob-dot" aria-hidden />
              <span className="ob-line-text">
                {grouping}
                <StepTimer />
              </span>
            </li>
          )}
        </ol>
        {/* Answered questions stay in the conversation as one-line records; the open ones wait in the tray by the box. */}
        {questions.some((it) => it.answer !== undefined) && (
          <div className="onboard-asks">
            {questions.filter((it) => it.answer !== undefined).map((it) => (
              <Question key={it.q.id} q={it.q} answer={it.answer} onAnswer={it.onAnswer} />
            ))}
          </div>
        )}
        {note && !running && (
          <p className="muted small">
            {note}{" "}
            <button type="button" className="linkish" onClick={() => void run()}>
              Send again
            </button>
          </p>
        )}
        <div ref={end} />
      </section>

      <div className="ob-dock" ref={dockRef}>
        <QuestionTray items={questions} />
        <div className="ob-dock-actions">{dock}</div>
        {composer}
      </div>

      {panel && <PanelGrip prop="--panel-col" chat=".ob-centre" panel=".ob-panel" extra={12} store="athena.ob-panel-w" />}
      {panel && (
        <aside className="ob-panel" aria-label={side === "kept" ? "What I kept" : "Your Brand Graph"}>
          <div className="ob-panel-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={side === "brand"} className={side === "brand" ? "on" : ""} onClick={() => setView("brand")}>
              Brand{grouping && <span className="ob-tab-busy spin" aria-label="still grouping" />}
            </button>
            <button type="button" role="tab" aria-selected={side === "kept"} className={side === "kept" ? "on" : ""} onClick={() => setView("kept")}>
              Conflicts{conflicts > 0 && <span className="ob-badge">{conflicts}</span>}
            </button>
          </div>
          <div className="ob-panel-body" hidden={side !== "brand"}>
            {shown ? (
              <div className="ob-graph-reveal">{graph}</div>
            ) : (
              <GraphBuild
                stages={buildStages({ kb, full, running, grouping, waiting: waitingOnYou, open: kb?.conflicts.filter((c) => picked[c.id] === undefined).length ?? 0, comparing: lines.some((l) => l.ev.tool === "compare") })}
                counts={[
                  pagesAll ? `${fmt(pagesAll)} page${pagesAll === 1 ? "" : "s"} read` : "",
                  kept.length ? `${kept.length} file${kept.length === 1 ? "" : "s"}` : "",
                  kb?.facts.length ? `${fmt(kb.facts.length)} facts` : "",
                ]}
                waiting={waitingOnYou}
                onAnswer={() => {
                  // An open question waits in the tray by the box; a disagreement waits under Conflicts.
                  const tray = asks.some((q) => !(q.id in answers)) ? dockRef.current?.querySelector<HTMLElement>(".q-tray") : null;
                  if (!tray) return setView("kept");
                  // On a phone the panel is its own tab: back to the transcript, where the tray is, then to the question.
                  setView("transcript");
                  requestAnimationFrame(() => {
                    tray.scrollIntoView({ block: "nearest", behavior: "smooth" });
                    tray.querySelector<HTMLElement>(".question-options button:not(:disabled)")?.focus({ preventScroll: true });
                    tray.classList.remove("q-tray-call");
                    void tray.offsetWidth;
                    tray.classList.add("q-tray-call");
                  });
                }}
              />
            )}
          </div>
          <div className="ob-panel-body" hidden={side !== "kept"}>
            {keptTab}
          </div>
        </aside>
      )}
      {!panel && (view === "brand" || view === "kept") && (
        <aside className="ob-panel ob-panel-empty">
          <p className="muted small">Your Brand Graph fills in here as I read.</p>
        </aside>
      )}
    </div>
  );
}

type Stage = { label: string; state: "done" | "now" | "todo" | "wait"; sub?: string };

/** Where the Brand Graph's build is, from what the run has reached: read, cross-checked, written, grouped. */
/**
 * `comparing`: any run has compared the sources. An answer starts a new run that reads from the cache again, and the
 * stages never step back for it: once the sources were compared, the brief is what's being written.
 */
function buildStages(s: { kb?: Knowledge; full: boolean; running: boolean; grouping?: string; waiting: boolean; open: number; comparing: boolean }): Stage[] {
  const at = !s.kb ? 0 : !(s.full || s.comparing) ? 1 : !s.full ? 2 : s.running || s.grouping ? 3 : 4;
  const state = (i: number): Stage["state"] => (i < at ? "done" : i > at ? "todo" : s.waiting ? "wait" : s.running || (i === 3 && !!s.grouping) ? "now" : "todo");
  const conflicts = s.kb?.conflicts.length ?? 0;
  const check = state(1);
  return [
    { label: "Reading your sources", state: state(0) },
    {
      label: "Checking where they agree",
      state: check,
      sub: check === "wait" && s.open ? `${s.open === 1 ? "One thing needs" : `${s.open} things need`} your call` : conflicts && check === "done" ? `${conflicts} disagreement${conflicts === 1 ? "" : "s"} settled` : undefined,
    },
    { label: "Writing your brief", state: state(2) },
    { label: "Grouping it into themes", state: state(3) },
  ];
}

/** The Brand Graph while it's being built: the stages it goes through, what's read so far, and its outline. */
function GraphBuild({ stages, counts, waiting, onAnswer }: { stages: Stage[]; counts: string[]; waiting: boolean; onAnswer: () => void }) {
  const line = counts.filter(Boolean).join(" · ");
  return (
    <div className="gb" role="status" aria-live="polite">
      <div className="gb-head">
        <span className="gb-kicker">Brand Graph</span>
        <strong>{waiting ? "Waiting on your answers" : "Building your Brand Graph"}</strong>
        <p>It appears here once every fact is checked and grouped, each with where it came from.</p>
      </div>
      <ol className="gb-stages">
        {stages.map((s) => (
          <li key={s.label} className={`gb-stage gb-${s.state}`}>
            <span className="gb-mark" aria-hidden>
              {s.state === "done" && (
                <svg width="10" height="10" viewBox="0 0 12 12">
                  <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="gb-label">
              <span className={s.state === "now" ? "shimmer-text" : ""}>{s.label}</span>
              {s.sub && <small>{s.sub}</small>}
            </span>
            {s.state === "wait" && (
              <button type="button" className="gb-act" onClick={onAnswer}>
                Answer
              </button>
            )}
          </li>
        ))}
      </ol>
      {line && <p className="gb-counts">{line}</p>}
      <div className="gb-outline" aria-hidden>
        {[72, 54, 86, 46, 64].map((w, i) => (
          <div key={i} className="gb-row" style={{ animationDelay: `${i * 140}ms` }}>
            <span className="gb-node" />
            <span className="gb-bar" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// A conflict's options as the question component shows them: my pick first, each value once, where it was said.
function conflictLabels(c: Conflict): string[] {
  return c.options.map((o, i) => (c.options.findIndex((x) => x.value === o.value) === i ? o.value : `${o.value} (${i + 1})`));
}

function conflictQuestion(c: Conflict, kb: Knowledge): Asked {
  const labels = conflictLabels(c);
  const at = (ids: string[]) => placesOf(ids, kb.facts);
  const order = c.options.map((_, i) => i).filter((i) => c.options[i].facts.length);
  order.sort((a, b) => (a === c.recommended ? -1 : b === c.recommended ? 1 : 0));
  return {
    id: `conflict_${c.id}`,
    question: `Your sources disagree: ${c.about}`,
    why: namedWhy(c.why, kb.facts),
    options: order.slice(0, 4).map((i) => ({ label: labels[i], hint: at(c.options[i].facts) })),
    multi: true,
    assumed: labels[c.recommended],
  };
}
