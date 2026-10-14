"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/blocks/types";
import type { AgentStreamEvent } from "@/lib/agent/loop";
import type { BrandBrief } from "@/lib/brief/types";
import type { Knowledge } from "@/lib/knowledge/types";
import type { Upload } from "@/lib/knowledge/uploads";
import { CONTEXT_PROMPT, PASTED } from "@/lib/agent/context-prompt";
import { ACCEPT } from "./chat";
import { Question, type Asked } from "./Question";
import { KnowledgePanel, Settle } from "./Knowledge";

// Onboarding (PRD §23.2 steps 3–4, problem 3): three ways in (a website, files, a summary from the founder's own AI
// assistant), then Athena does the work while the founder watches each real step. Files are kept for the founder
// as soon as they're added (in their workspace, until they remove them) and read straight away; a meter shows how
// much fits. After the read, "What I kept" lists every fact with where it is, to strike; where sources disagree,
// a one-click choice. Questions arrive as cards that never block; a steering box re-runs with a nudge.

type Step = AgentEvent & { key: string; seen: number };
type Answer = { question: string; answer: string };
type Kept = Upload & { kept?: boolean };
type Meter = { tokens: number; max: number; pages: number; maxPages: number; over: boolean };

const TOOL_LABEL: Record<string, string> = {
  read_file: "Read",
  read_website: "Website",
  web_search: "Web",
  qloo_search: "Qloo",
  ask_founder: "Question",
  compare: "Compare",
  check: "Check",
  plan: "Read",
};

const WS_KEY = "athena-workspace";

/** This browser's workspace: a random id it keeps, so the founder's files stay theirs. */
function workspace(): string {
  const fresh = () => (crypto.randomUUID?.() ?? "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)));
  try {
    const had = localStorage.getItem(WS_KEY);
    if (had) return had;
    const ws = fresh();
    localStorage.setItem(WS_KEY, ws);
    return ws;
  } catch {
    return fresh();
  }
}

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

export function Onboard({
  brief,
  files,
  addFiles,
  setFiles,
  onBrief,
}: {
  brief: BrandBrief;
  files: File[];
  addFiles: (f: FileList | File[]) => void;
  setFiles: (f: File[]) => void;
  onBrief: (brief: BrandBrief, assumptions: string[]) => void;
}) {
  const [site, setSite] = useState("");
  const [pasted, setPasted] = useState("");
  const [bring, setBring] = useState(false);
  const [copied, setCopied] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(0);
  const [now, setNow] = useState(0);
  const [asks, setAsks] = useState<Asked[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Answer[]>([]);
  const [again, setAgain] = useState(false);
  const [steer, setSteer] = useState("");
  const [open, setOpen] = useState<string>();
  const [note, setNote] = useState("");
  const [wrote, setWrote] = useState<string[]>();
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
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [inUse, setInUse] = useState<Record<string, number>>({});
  const pick = useRef<HTMLInputElement>(null);
  const had = !!brief.name;

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

  // Files dropped or chosen anywhere go up one by one: kept, counted and read while the founder carries on.
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
          if (j.file?.kept) setRefiled(true);
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

  // A clock on the running step: slow reads are narrated, never silent.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Over the limit, the founder chooses: files are in until they leave one out.
  const chosen = kept.filter((u) => !left.has(u.hash));
  const chosenTokens = chosen.reduce((n, u) => n + u.tokens, 0);
  const over = !!meter && chosenTokens > meter.max;
  const any = !!site.trim() || !!chosen.length || !!pasted.trim();

  async function run(extra: { steer?: string; answers?: Answer[] } = {}) {
    if (running) return;
    const form = new FormData();
    form.set("websites", site);
    if (pasted.trim()) form.set("pasted", pasted);
    form.set("ws", ws);
    form.set("hashes", JSON.stringify(chosen.map((u) => u.hash)));
    form.set("struck", JSON.stringify([...struck]));
    form.set("settled", JSON.stringify(picked));
    if (extra.steer) form.set("steer", extra.steer);
    if (extra.answers?.length) form.set("answers", JSON.stringify(extra.answers));
    if (brief.name) {
      form.set("brief", JSON.stringify(brief));
      form.set("name", brief.name.value);
    }
    setRunning(true);
    setStarted(Date.now());
    setNow(Date.now());
    setSteps([]);
    setNote("");
    setOpen(undefined);
    setWrote(undefined);
    setSentStruck([...struck].sort().join());
    setRefiled(false);
    let got = false;
    try {
      await stream(form, (e) => {
        if (e.type === "event") {
          const ev = e.event;
          setSteps((s) => {
            // A finished step replaces its running line; "think" lines are only ever the latest.
            const rest = s.filter((x) => x.tool !== "think");
            const i = ev.status === "running" ? -1 : rest.findIndex((x) => x.status === "running" && x.tool === ev.tool && x.why === ev.why);
            const step = { ...ev, key: `${ev.tool}:${ev.why}:${ev.t}`, seen: Date.now() };
            if (i >= 0) return rest.map((x, k) => (k === i ? { ...step, key: x.key, seen: x.seen } : x));
            return [...rest, step];
          });
        } else if (e.type === "knowledge") {
          setKb(e.knowledge);
          setInUse(e.settled);
        } else if (e.type === "ask") setAsks((a) => [...a.filter((x) => x.question !== e.ask.question), e.ask]);
        else if (e.type === "brief") {
          got = true;
          setWrote(e.assumptions);
          onBrief(e.brief, e.assumptions);
        }
      });
    } catch {
      // Never a failure state: the inputs stay as they are, and one tap tries again.
    }
    setRunning(false);
    setSteps((s) => s.filter((x) => x.tool !== "think" && x.status !== "running"));
    if (!got) setNote("Send it again and I'll pick up from here.");
  }

  // Answers and choices given while a run is going wait for it, then go in together.
  useEffect(() => {
    if (!running && (pending.length || again)) {
      const a = pending;
      setPending([]);
      setAgain(false);
      void run({ answers: a });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, pending, again]);

  const answer = (q: Asked, a: string) => {
    setAnswers((x) => ({ ...x, [q.id]: a }));
    if (a) setPending((p) => [...p, { question: q.question, answer: a }]);
  };

  const settle = (id: string, i: number) => {
    if ((picked[id] ?? inUse[id]) === i) return;
    setPicked((p) => ({ ...p, [id]: i }));
    setAgain(true);
  };

  const strike = (id: string) =>
    setStruck((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });

  const secs = (ms: number) => `${Math.max(0, Math.round(ms / 1000))} s`;
  const last = steps.at(-1);
  const restruck = [...struck].sort().join() !== sentStruck;

  // The kept files, each with ✕ to remove it and everything read from it; shown before and after the brief.
  const fileList = (
    <>
      {(!!kept.length || !!adding.length) && (
        <ul className="kb-files">
          {kept.map((u) => (
            <li key={u.hash} className={left.has(u.hash) ? "kb-left" : ""}>
              {over || left.has(u.hash) ? (
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
              ) : null}
              <span className="kb-file-name">{u.name}</span>
              <small className="muted">
                {u.status} · about {fmt(u.pages)} page{u.pages === 1 ? "" : "s"}
              </small>
              <button type="button" className="linkish" aria-label={`Remove ${u.name}`} title="Remove the file and everything read from it" onClick={() => void remove(u)}>
                ✕
              </button>
              {notes[u.name] && <small className="muted kb-file-note">{notes[u.name]}</small>}
            </li>
          ))}
          {adding.map((n, i) => (
            <li key={`${n}${i}`}>
              <span className="spin" aria-hidden />
              <span className="kb-file-name">{n}</span>
              <small className="muted">Keeping and counting it</small>
            </li>
          ))}
        </ul>
      )}
      {Object.entries(notes)
        .filter(([n]) => !kept.some((u) => u.name === n))
        .map(([n, t]) => (
          <small key={n} className="muted">
            {n}: {t}
          </small>
        ))}
      {meter && kept.length > 0 && (
        <p className={`muted small kb-meter ${over ? "kb-over" : ""}`}>
          About {fmt(meter.maxPages)} pages max; you&apos;ve added about {fmt(chosen.reduce((n, u) => n + u.pages, 0))}.
          {over && " That's more than I can read at once: untick what to leave out this time."}
        </p>
      )}
    </>
  );

  return (
    <div className="onboard">
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
      {!had && !running && (
        <div className="onboard-ways">
          <p className="onboard-lead">Give me whatever you have. I&apos;ll read it all, look you up, and only ask what I can&apos;t find.</p>
          <label className="onboard-way">
            <span>Your website</span>
            <input type="text" inputMode="url" value={site} placeholder="yourbrand.com (skip if you don't have one)" onChange={(e) => setSite(e.target.value)} />
          </label>
          <div className="onboard-way">
            <span>Files</span>
            <div className="onboard-drop" onClick={() => pick.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && pick.current?.click()}>
              Drop or choose decks, line sheets, stockist lists, sales exports, photos
              <small className="muted">PDF, slides, sheets, docs, images. Kept for you and read in full; remove any of them any time.</small>
            </div>
            {fileList}
          </div>
          <div className="onboard-way">
            <button type="button" className="linkish onboard-bring" aria-expanded={bring} onClick={() => setBring((b) => !b)}>
              {bring ? "▾" : "▸"} Bring your context from ChatGPT, Claude or Gemini
            </button>
            {bring && (
              <div className="onboard-bring-body">
                <p className="muted small">Paste this into the assistant you&apos;ve talked to about your business, then paste its answer below.</p>
                <pre className="onboard-prompt">{CONTEXT_PROMPT}</pre>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(CONTEXT_PROMPT).then(() => setCopied(true));
                  }}
                >
                  {copied ? "Copied" : "Copy the prompt"}
                </button>
                <textarea rows={5} value={pasted} maxLength={30_000} placeholder="Paste its answer here" onChange={(e) => setPasted(e.target.value)} />
              </div>
            )}
          </div>
          <button type="button" className="primary onboard-start" disabled={!any || over || adding.length > 0} onClick={() => void run()}>
            {adding.length ? "Keeping your files…" : "Start"}
          </button>
        </div>
      )}

      {(running || steps.length > 0) && (
        <ol className="onboard-steps" aria-live="polite">
          {steps.map((s) => {
            const live = s.status === "running";
            const label = s.tool === "read_file" && (s.summary.startsWith("Read the summary") || s.why === "Reading your AI summary") ? PASTED : TOOL_LABEL[s.tool];
            return (
              <li key={s.key} className={`onboard-step ${live ? "live" : ""}`}>
                <button type="button" className="onboard-step-head" disabled={!s.summary} onClick={() => setOpen((o) => (o === s.key ? undefined : s.key))}>
                  <span className={live ? "spin" : "onboard-tick"} aria-hidden>{live ? "" : "✓"}</span>
                  {label && <span className="onboard-tool">{label}</span>}
                  <span className="onboard-why">{s.why}</span>
                  {live && s === last && <span className="muted small">{secs(now - s.seen)}</span>}
                </button>
                {open === s.key && s.summary && <p className="onboard-summary">{s.summary}</p>}
              </li>
            );
          })}
        </ol>
      )}
      {running && <p className="muted small onboard-clock">Working · {secs(now - started)}</p>}

      {kb && kb.conflicts.length > 0 && (
        <div className="onboard-asks">
          {kb.conflicts.map((c) => (
            <Settle key={c.id} c={c} facts={kb.facts} pick={picked[c.id] ?? inUse[c.id] ?? c.recommended} onPick={(i) => settle(c.id, i)} />
          ))}
        </div>
      )}

      {asks.length > 0 && (
        <div className="onboard-asks">
          {asks.map((q) => (
            <Question key={q.id} q={q} answer={answers[q.id]} onAnswer={(a) => answer(q, a)} />
          ))}
        </div>
      )}

      {wrote && !running && (
        <div className="onboard-wrote">
          <p>Your brief is on the right, every fact with where it came from.</p>
          {wrote.length > 0 && (
            <ul className="muted small">
              {wrote.map((a) => (
                <li key={a}>Assumed: {a}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {kb && kb.facts.length > 0 && (
        <>
          <KnowledgePanel kb={kb} struck={struck} onStrike={strike} />
        </>
      )}

      {had && !running && (
        <div className="onboard-way kb-kept">
          <span>Your files</span>
          {fileList}
          <button type="button" className="linkish" onClick={() => pick.current?.click()}>
            + Add files
          </button>
        </div>
      )}
      {(restruck || refiled) && had && !running && (
        <button type="button" className="kb-apply" disabled={over || adding.length > 0} onClick={() => void run()}>
          {refiled ? "Update the brief with your files" : "Update the brief without what you struck"}
        </button>
      )}

      {note && !running && (
        <p className="muted small">
          {note}{" "}
          <button type="button" className="linkish" onClick={() => void run()}>Send again</button>
        </p>
      )}

      {had && !running && (
        <form
          className="onboard-steer"
          onSubmit={(e) => {
            e.preventDefault();
            if (!steer.trim()) return;
            const s = steer.trim();
            setSteer("");
            void run({ steer: s });
          }}
        >
          <input value={steer} maxLength={1000} placeholder="Anything to correct or focus on? e.g. “we're mostly wholesale”" onChange={(e) => setSteer(e.target.value)} />
          <button type="submit" disabled={!steer.trim()}>Update</button>
        </form>
      )}
    </div>
  );
}
