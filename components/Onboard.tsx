"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/blocks/types";
import type { AgentStreamEvent } from "@/lib/agent/loop";
import type { BrandBrief } from "@/lib/brief/types";
import { CONTEXT_PROMPT, PASTED } from "@/lib/agent/context-prompt";
import { ACCEPT } from "./chat";
import { Question, type Asked } from "./Question";

// Onboarding (PRD §23.2 step 3, problem 3): three ways in (a website, files, a summary from the founder's own AI
// assistant), then Athena does the work while the founder watches each real step. Questions arrive as cards that
// never block; a steering box re-runs with a nudge. Files stay in this browser until sent, and the server reads them
// in memory and keeps nothing.

type Step = AgentEvent & { key: string };
type Answer = { question: string; answer: string };

const TOOL_LABEL: Record<string, string> = {
  read_file: "Read",
  read_website: "Website",
  web_search: "Web",
  qloo_search: "Qloo",
  ask_founder: "Question",
  check: "Check",
  plan: "Read",
};

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
  const [steer, setSteer] = useState("");
  const [open, setOpen] = useState<string>();
  const [note, setNote] = useState("");
  const [wrote, setWrote] = useState<string[]>();
  const pick = useRef<HTMLInputElement>(null);
  const had = !!brief.name;

  // A clock on the running step: slow reads are narrated, never silent.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const any = !!site.trim() || !!files.length || !!pasted.trim();

  async function run(extra: { steer?: string; answers?: Answer[] } = {}) {
    if (running) return;
    const form = new FormData();
    form.set("websites", site);
    if (pasted.trim()) form.set("pasted", pasted);
    for (const f of files) form.append("files", f);
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
    let got = false;
    try {
      await stream(form, (e) => {
        if (e.type === "event") {
          const ev = e.event;
          setSteps((s) => {
            // A finished step replaces its running line; "think" lines are only ever the latest.
            const rest = s.filter((x) => x.tool !== "think");
            const i = ev.status === "running" ? -1 : rest.findIndex((x) => x.status === "running" && x.tool === ev.tool && x.why === ev.why);
            const step = { ...ev, key: `${ev.tool}:${ev.why}:${ev.t}` };
            if (i >= 0) return rest.map((x, k) => (k === i ? { ...step, key: x.key } : x));
            return [...rest, step];
          });
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
    // Files went with this run; the chips stay so the founder sees what was read.
  }

  // Answers given while a run is going wait for it, then go in together.
  useEffect(() => {
    if (!running && pending.length) {
      const a = pending;
      setPending([]);
      void run({ answers: a });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, pending]);

  const answer = (q: Asked, a: string) => {
    setAnswers((x) => ({ ...x, [q.id]: a }));
    if (a) setPending((p) => [...p, { question: q.question, answer: a }]);
  };

  const secs = (ms: number) => `${Math.max(0, Math.round(ms / 1000))} s`;
  const last = steps.at(-1);

  return (
    <div className="onboard">
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
              <small className="muted">PDF, slides, sheets, docs, images. Read, never stored.</small>
            </div>
            <input ref={pick} type="file" multiple accept={ACCEPT} hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
            {!!files.length && (
              <ul className="chips">
                {files.map((f, i) => (
                  <li key={`${f.name}${i}`} className="chip">
                    {f.name}{" "}
                    <button type="button" className="linkish" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, k) => k !== i))}>✕</button>
                  </li>
                ))}
              </ul>
            )}
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
          <button type="button" className="primary onboard-start" disabled={!any} onClick={() => void run()}>
            Start
          </button>
        </div>
      )}

      {(running || steps.length > 0) && (
        <ol className="onboard-steps" aria-live="polite">
          {steps.map((s) => {
            const live = s.status === "running";
            const label = s.tool === "read_file" && s.summary.startsWith("Read the summary") ? PASTED : TOOL_LABEL[s.tool];
            return (
              <li key={s.key} className={`onboard-step ${live ? "live" : ""}`}>
                <button type="button" className="onboard-step-head" disabled={!s.summary} onClick={() => setOpen((o) => (o === s.key ? undefined : s.key))}>
                  <span className={live ? "spin" : "onboard-tick"} aria-hidden>{live ? "" : "✓"}</span>
                  {label && <span className="onboard-tool">{label}</span>}
                  <span className="onboard-why">{s.why}</span>
                  {live && s === last && <span className="muted small">{secs(now - started - s.t)}</span>}
                </button>
                {open === s.key && s.summary && <p className="onboard-summary">{s.summary}</p>}
              </li>
            );
          })}
        </ol>
      )}
      {running && <p className="muted small onboard-clock">Working · {secs(now - started)}</p>}

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
