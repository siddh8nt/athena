"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { AgentEvent } from "@/lib/blocks/types";
import type { AgentStreamEvent } from "@/lib/agent/loop";
import type { BrandBrief } from "@/lib/brief/types";
import { isResolution, liveFacts, whereLabel, type Conflict, type Knowledge, type LiveFact, type Settled, type Settlement } from "@/lib/knowledge/types";
import type { Upload } from "@/lib/knowledge/uploads";
import { CONTEXT_PROMPT } from "@/lib/agent/context-prompt";
import { checklistLine, type CheckItem } from "@/lib/agent/checklist";
import { addEvent, lineDetail, lineText, settleRun, type Line } from "@/lib/agent/transcript";
import { ACCEPT } from "./chat";
import { Question, type Asked } from "./Question";
import { KnowledgePanel, Settle } from "./Knowledge";
import { workspace } from "@/lib/knowledge/workspace";

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
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 2);
      if (line.startsWith("data: ")) on(JSON.parse(line.slice(6)) as AgentStreamEvent);
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

/** Athena's small mark. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg className="ob-mark" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7.5 16.5L12 7l4.5 9.5M9.3 13h5.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Runs the switch to the workspace as one glide of the box, where the browser can. */
function glide(go: () => void) {
  const doc = document as Document & { startViewTransition?: (f: () => void) => unknown };
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (doc.startViewTransition && !still) doc.startViewTransition(() => flushSync(go));
  else go();
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
  const [briefNote, setBriefNote] = useState("");
  const [view, setView] = useState<View>("transcript");
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
  const pick = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const runs = useRef(0);
  const sent = useRef<Set<string>>(new Set());
  const busy = useRef(false);
  const end = useRef<HTMLDivElement>(null);

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
    const n = ++runs.current;
    const fresh = chosen.filter((u) => !sent.current.has(u.hash));
    const form = new FormData();
    form.set("websites", websites.join(" "));
    if (pasted) form.set("pasted", pasted);
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
        } else if (e.type === "checklist") setItems(e.items);
        else if (e.type === "knowledge") {
          setKb(e.knowledge);
          setInUse(e.settled);
          read = { kb: e.knowledge, settled: e.settled };
          onFacts(liveFacts(e.knowledge, e.settled));
          if (e.knowledge.conflicts.length)
            setLines((l) => addEvent(l, said("settle", `Your sources disagree on ${e.knowledge.conflicts.length === 1 ? "one thing" : `${e.knowledge.conflicts.length} things`}: my pick is in use until you choose`), n));
        } else if (e.type === "ask") setAsks((a) => [...a.filter((x) => x.question !== e.ask.question), e.ask]);
        else if (e.type === "brief" && e.early) {
          early = true;
          onBrief(e.brief, [], read ? liveFacts(read.kb, read.settled) : [], true);
          setBriefNote("A first brief from your home and About pages; the full read keeps adding to it.");
        } else if (e.type === "brief") {
          got = true;
          onBrief(e.brief, e.assumptions, read ? liveFacts(read.kb, read.settled) : []);
          setBriefNote(early ? "Updated in place with everything I read." : "");
          setLines((l) =>
            addEvent(l, said("brief", early || had ? "Updated your brief: every fact with where it came from" : "Wrote your brief: every fact with where it came from", e.assumptions.map((a) => `Assumed: ${a}`)), n),
          );
        }
      });
    } catch {
      // Never a failure state: the inputs stay as they are, and one tap tries again.
    }
    busy.current = false;
    setRunning(false);
    setThinking(undefined);
    setLines((l) => settleRun(l, n));
    if (!got) setNote("Send it again and I'll pick up from here.");
  }

  // Messages, answers, choices and files given while a run is going wait for it, then go in together.
  useEffect(() => {
    if (!running && (pending.length || queued.length || again)) {
      const a = pending;
      const q = queued;
      setPending([]);
      setQueued([]);
      setAgain(false);
      void run({ answers: a, said: q.join("\n") || undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, pending, queued, again]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [lines.length, asks.length]);

  const answer = (q: Asked, a: string) => {
    setAnswers((x) => ({ ...x, [q.id]: a }));
    if (a) setPending((p) => [...p, { question: q.question, answer: a }]);
  };

  const settle = (id: string, s: Settlement) => {
    if ((picked[id] ?? inUse[id]) === s) return;
    setPicked((p) => ({ ...p, [id]: s }));
    setAgain(true);
  };

  // A conflict answered in the transcript: one option exactly is that option; anything else (several, Other, a
  // mix with caveats) is read by the model into which values still hold and one fact in the founder's terms.
  const answerConflict = async (c: Conflict, a: string) => {
    setTypedFor((x) => ({ ...x, [c.id]: a }));
    if (!a) return;
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
          <Mark size={28} />
          <h1>Tell me about your brand</h1>
          <p className="muted">Type, paste or drop anything. I&apos;ll read it all, look you up, and only ask what I can&apos;t find.</p>
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
        </div>
      </div>
    );

  // The workspace.
  const panel = had || !!kb;
  const now = items?.find((i) => i.state === "now");
  const lastLive = [...lines].reverse().find((l) => l.ev.status === "running");
  const status = running ? (now?.step ?? (lastLive ? lineText(lastLive.ev) : thinking ?? "Reading what you gave me")) : had ? "Your brief is written" : "Ready when you are";
  const conflicts = kb?.conflicts.length ?? 0;
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
    const pages = live ? l.pages.slice(-4) : opened ? l.pages : [];
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
            {!live && l.pages.length > 0 && !opened && <small className="muted"> · {l.pages.length} page{l.pages.length === 1 ? "" : "s"}</small>}
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
        {live && l.pages.length > 4 && <small className="muted ob-more">and {l.pages.length - 4} more pages read</small>}
      </li>
    );
  };

  const plan = items && items.length > 0 && (
    <div className="ob-plan" aria-label="Athena's plan">
      <button type="button" className="ob-plan-line" aria-expanded={planOpen} onClick={() => setPlanOpen((o) => !o)}>
        {checklistLine(items)} <span aria-hidden>{planOpen ? "▴" : "▾"}</span>
      </button>
      <ol className={`ob-plan-list ${planOpen ? "open" : ""}`}>
        {items.map((i) => (
          <li key={i.id} className={`ob-plan-${i.state}`}>
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
      <aside className="ob-team" aria-label="Who's working">
        <div className={`ob-agent ${running ? "ob-agent-live" : ""}`}>
          <Mark size={20} />
          <div>
            <strong>Athena</strong>
            <small className="muted">{status}</small>
          </div>
        </div>
      </aside>

      <section className="ob-centre" aria-label="Transcript">
        {plan}
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
        </ol>
        {asks.length > 0 && (
          <div className="onboard-asks">
            {asks.map((q) => (
              <Question key={q.id} q={q} answer={answers[q.id]} onAnswer={(a) => answer(q, a)} />
            ))}
          </div>
        )}
        {kb && kb.conflicts.length > 0 && (
          <div className="onboard-asks" aria-label="Conflicts">
            {kb.conflicts.map((c) => {
              const s = picked[c.id] ?? inUse[c.id];
              return (
                <Question
                  key={c.id}
                  q={conflictQuestion(c, kb)}
                  answer={isResolution(s) ? s.fact : typedFor[c.id]}
                  onAnswer={(a) => void answerConflict(c, a)}
                />
              );
            })}
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

      <div className="ob-dock">
        <div className="ob-dock-actions">{dock}</div>
        {composer}
      </div>

      {panel && (
        <aside className="ob-panel" aria-label={side === "kept" ? "What I kept" : "Your Brand Graph"}>
          <div className="ob-panel-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={side === "brand"} className={side === "brand" ? "on" : ""} onClick={() => setView("brand")}>
              Brand
            </button>
            <button type="button" role="tab" aria-selected={side === "kept"} className={side === "kept" ? "on" : ""} onClick={() => setView("kept")}>
              Conflicts{conflicts > 0 && <span className="ob-badge">{conflicts}</span>}
            </button>
          </div>
          <div className="ob-panel-body" hidden={side !== "brand"}>
            {briefNote && <p className="ob-brief-note">{briefNote}</p>}
            {graph}
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

// A conflict's options as the question component shows them: my pick first, each value once, where it was said.
function conflictLabels(c: Conflict): string[] {
  return c.options.map((o, i) => (c.options.findIndex((x) => x.value === o.value) === i ? o.value : `${o.value} (${i + 1})`));
}

function conflictQuestion(c: Conflict, kb: Knowledge): Asked {
  const labels = conflictLabels(c);
  const at = (ids: string[]) => ids.map((id) => kb.facts.find((f) => f.id === id)?.where.map(whereLabel).join("; ")).filter(Boolean).join("; ");
  const order = c.options.map((_, i) => i).filter((i) => c.options[i].facts.length);
  order.sort((a, b) => (a === c.recommended ? -1 : b === c.recommended ? 1 : 0));
  return {
    id: `conflict_${c.id}`,
    question: `Your sources disagree: ${c.about}`,
    why: c.why,
    options: order.slice(0, 4).map((i) => ({ label: labels[i], hint: at(c.options[i].facts) })),
    multi: true,
    assumed: labels[c.recommended],
  };
}
