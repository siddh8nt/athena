"use client";

import type { SpecialistId } from "@/lib/agent/specialists";

import { useEffect, useRef, useState } from "react";
import { OPENING, type Turn } from "@/lib/brief/conversation";
import type { BriefEvent } from "@/app/api/brief/route";
import { emptyBrief, type BrandBrief } from "@/lib/brief/types";
import { sourceLabel } from "@/lib/brief/source";
import { pacer } from "@/lib/stream/pace";
import { duration, recordLine, type WorkRecord } from "@/lib/agent/record";

// Chapter 1's conversation (§6.2.1): the founder describes the product; the server turns everything into one brief.
// Shared by the journey; the server streams status lines, Athena's reply as it's written, and the result.

/** What Athena did for one message: steps as they happen, then the pages it read. Shown under that message. */
export type Trail = { steps: { text: string; done: boolean }[]; sources: { title?: string; uri?: string }[]; start: number; end?: number };
/** A chat line. `card` lines are interactive cards the journey places in the conversation. */
/** `record`: what onboarding did, shown above the message it led to. */
export type Msg = { who: "athena" | "you"; text: string; files?: string[]; trail?: Trail; card?: string; record?: WorkRecord; /** The subagent whose step trail goes under the line (§23.2 step 8.5k). */ run?: SpecialistId; /** Athena handing a workflow step to that subagent: one line per subagent, updated in place (§23.5 p). */ handoff?: boolean; /** Athena's reply still streaming in (§23.2 step 8.5n). */ live?: boolean; /** Where a question was asked: its answer shows here once given. */ asked?: string };
export type FileChip = { name: string; status: string; busy: boolean };

/** The files Athena reads (decided 28 Oct): documents, sheets, decks and pictures. Every way in checks it: the Files
 *  button, a drop, a paste and the Brand Graph's box. */
const READS = [".pdf", ".docx", ".txt", ".md", ".xlsx", ".csv", ".tsv", ".pptx", ".png", ".jpg", ".jpeg", ".webp"];
export const ACCEPT = READS.join(",");

const ext = (name: string) => name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";

/** Whether Athena reads this file, by its name. */
export const readable = (f: File) => READS.includes(ext(f.name));

/** The line for a file Athena doesn't read: what to send instead. */
export function refusal(name: string): string {
  const e = ext(name);
  if ([".mp4", ".mov", ".m4v", ".avi", ".webm", ".mkv", ".mp3", ".wav", ".m4a", ".aac"].includes(e)) return "I read documents, sheets, decks and pictures, not video or audio. A PDF or Word export works";
  if ([".pages", ".numbers", ".key"].includes(e)) return "Export it as a PDF, Word, Excel or PowerPoint file and I'll read it";
  if ([".doc", ".xls", ".ppt"].includes(e)) return "Save it as .docx, .xlsx or .pptx and I'll read it";
  if ([".heic", ".heif"].includes(e)) return "Save it as a JPEG and I'll read it";
  return "I read PDF, Word, Excel, PowerPoint, CSV, text and pictures (PNG, JPEG, WebP)";
}

export { sourceLabel };

export function useBriefChat(initial?: { brief: BrandBrief; msgs: Msg[]; turn: Turn }) {
  const [brief, setBrief] = useState<BrandBrief>(initial?.brief ?? emptyBrief());
  const [msgs, setMsgs] = useState<Msg[]>(initial?.msgs ?? [{ who: "athena", text: OPENING }]);
  const [turn, setTurn] = useState<Turn>(initial?.turn ?? { text: OPENING, replies: [], ready: false });
  const [files, setFiles] = useState<File[]>([]);
  const [chips, setChips] = useState<FileChip[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  // Athena's reply as it streams in; replaced by the final text when the turn ends.
  const [live, setLive] = useState("");
  // Research keeps running after Athena's first answer; the founder can reply meanwhile and it's sent when research ends.
  const [researching, setResearching] = useState(false);
  const [queued, setQueued] = useState<string | null>(null);
  const queuedRef = useRef<string | null>(null);
  queuedRef.current = queued;
  // The founder's first message is the one that says what the brand is; once onboarding has written a brief, there's
  // nothing left to introduce, even if they haven't typed in the chat yet.
  const first = !msgs.some((m) => m.who === "you") && !brief.name?.value;

  // Files Athena doesn't read, by name, with the line saying what to send instead. They never go up.
  const [refused, setRefused] = useState<Record<string, string>>({});
  const addFiles = (list: FileList | File[]) => {
    const all = Array.from(list);
    const no = all.filter((f) => !readable(f));
    if (no.length) setRefused((r) => ({ ...r, ...Object.fromEntries(no.map((f) => [f.name, refusal(f.name)])) }));
    const yes = all.filter(readable);
    if (yes.length) setFiles((f) => [...f, ...yes].slice(0, 10));
  };
  const dismiss = (name: string) => setRefused(({ [name]: _, ...rest }) => rest);

  // Once research ends, send what the founder wrote meanwhile (already shown in the chat).
  useEffect(() => {
    if (!busy && queued) {
      setQueued(null);
      void send(queued, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, queued]);

  async function send(message: string, shown = false) {
    message = message.trim();
    if (researching && message && !queued) {
      setMsgs((m) => [...m, { who: "you", text: message }]);
      setQueued(message);
      return;
    }
    if (busy || (!message && !files.length) || (first && !message)) return;
    setBusy(true);
    const opening = first ? "Reading what you sent" : "Thinking it through";
    setStatus(opening);
    const sending = files;
    const trail: Trail = { steps: [{ text: opening, done: false }], sources: [], start: Date.now() };
    const at = shown ? msgs.map((m) => m.who).lastIndexOf("you") : msgs.length;
    if (!shown) setMsgs((m) => [...m, { who: "you", text: message, files: sending.map((f) => f.name), trail }]);
    else setMsgs((m) => m.map((x, i) => (i === at ? { ...x, trail } : x)));
    const track = (fn: (t: Trail) => Trail) => setMsgs((m) => m.map((x, i) => (i === at && x.trail ? { ...x, trail: fn(x.trail) } : x)));
    const step = (text: string) =>
      track((t) => (t.steps.at(-1)?.text === text ? t : { ...t, steps: [...t.steps.map((s) => ({ ...s, done: true })), { text, done: false }] }));
    setChips((c) => [...c, ...sending.map((f) => ({ name: f.name, status: "Reading…", busy: true }))]);
    setFiles([]);
    const form = new FormData();
    form.set("brief", JSON.stringify(brief));
    form.set("history", JSON.stringify(msgs.filter((m) => m.text && !m.card).slice(shown ? -13 : -12, shown ? -1 : undefined).map(({ who, text }) => ({ who, text }))));
    form.set("message", message);
    for (const f of sending) form.append("files", f, f.name);
    try {
      const res = await fetch("/api/brief", { method: "POST", body: form });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let got = false;
      const pace = pacer();
      for (;;) {
        const { done, value } = await reader.read();
        buf += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const p of parts) {
          if (!p.startsWith("data:")) continue;
          const e = JSON.parse(p.slice(5)) as BriefEvent;
          await pace(e);
          if (e.type === "status") {
            setStatus(e.text);
            step(e.text);
          } else if (e.type === "sources") track((t) => ({ ...t, sources: e.sources }));
          else if (e.type === "delta") {
            setLive((t) => t + e.text);
            step("Writing back");
          } else if (e.type === "brief") setBrief(e.brief);
          else if (e.type === "result") {
            got = true;
            setLive("");
            setBrief(e.brief);
            setTurn(e.turn);
            // If the founder already replied during research, their reply gets the answer, not this follow-up.
            if (e.turn.text && !(e.followUp && queuedRef.current)) setMsgs((m) => [...m, { who: "athena", text: e.turn.text }]);
            setResearching(!!e.more);
            if (e.more) setStatus("Researching on the web");
            setChips((c) => c.map((x) => ({ ...x, busy: false, status: e.files.find((f) => f.name === x.name)?.status ?? (x.busy ? "Read" : x.status) })));
          }
        }
        if (done) break;
      }
      if (!got) throw new Error("no result");
    } catch {
      setMsgs((m) => [...m, { who: "athena", text: "That took longer than it should. Send it again and I'll pick up from here." }]);
      setChips((c) => c.map((x) => (x.busy ? { ...x, busy: false, status: "Send again to read this" } : x)));
    } finally {
      track((t) => ({ ...t, steps: t.steps.map((s) => ({ ...s, done: true })), end: Date.now() }));
      setResearching(false);
      setLive("");
      setBusy(false);
    }
  }

  return { brief, setBrief, msgs, setMsgs, turn, setTurn, files, setFiles, addFiles, refused, dismiss, chips, busy, status, live, researching, queued, first, send };
}

const domain = (u?: string) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : undefined;
  } catch {
    return undefined;
  }
};

/** "fishwife.com/about": a page's site and path, so each page reads as its own source. */
const page = (u?: string) => {
  try {
    if (!u) return undefined;
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, "")}${x.pathname === "/" ? "" : x.pathname.replace(/\/$/, "")}`;
  } catch {
    return undefined;
  }
};

/** The live activity trail: each step ticks off as it finishes; then it folds into one line with the pages read. */
export function TrailView({ trail }: { trail: Trail }) {
  const [open, setOpen] = useState(false);
  const done = !!trail.end;
  const secs = Math.max(1, Math.round(((trail.end ?? Date.now()) - trail.start) / 1000));
  const pages = trail.sources.map((s) => ({ ...s, d: (s.title && !s.title.includes(" ") ? s.title : undefined) ?? domain(s.uri) ?? s.title }));
  return (
    <li className={`trail ${done ? "trail-done" : ""}`}>
      {done && !open ? (
        <button type="button" className="trail-summary" onClick={() => setOpen(true)}>
          <span className="tick">✓</span> {trail.steps.length} steps{pages.length ? ` · read ${pages.length} pages` : ""} · {secs}s
        </button>
      ) : (
        <ol>
          {trail.steps.map((s, i) => (
            <li key={i} className={s.done ? "step-done" : "step-active"}>
              <span className={s.done ? "tick" : "spin"} aria-hidden>{s.done ? "✓" : ""}</span>
              <span className={s.done ? "" : "shimmer-text"}>{s.text}</span>
            </li>
          ))}
        </ol>
      )}
      {!!pages.length && (!done || open) && (
        <div className="trail-sources">
          {pages.map((p, i) => (
            <a key={i} href={p.uri} target="_blank" rel="noreferrer noopener" className="source-chip" style={{ animationDelay: `${i * 70}ms` }}>{p.d}</a>
          ))}
        </div>
      )}
    </li>
  );
}

/** Onboarding's work, carried into the chat after it: one line that opens to every step, what it read, and the sources. */
export function RecordView({ record }: { record: WorkRecord }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const steps = all ? record.steps : record.steps.slice(0, 8);
  const sources = record.sources.map((s) => ({ ...s, d: page(s.url) ?? s.label }));
  return (
    <li className={`record${open ? " record-open" : ""}`}>
      <button type="button" className="record-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="record-mark" aria-hidden>
          <svg width="10" height="10" viewBox="0 0 12 12">
            <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="record-title">Onboarding</span>
        <span className="record-line">{recordLine(record)}</span>
        <span className="record-caret" aria-hidden />
      </button>
      {open && (
        <div className="record-body">
          <ol className="record-steps">
            {steps.map((s, i) => (
              <li key={i} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                <span>{s.text}</span>
                {!!s.subs.length && <small>{s.subs.length <= 3 ? s.subs.join(" · ") : `${s.subs.slice(0, 2).join(" · ")} and ${s.subs.length - 2} more`}</small>}
              </li>
            ))}
          </ol>
          {record.steps.length > steps.length && (
            <button type="button" className="record-more" onClick={() => setAll(true)}>
              Show all {record.steps.length} steps
            </button>
          )}
          {!!sources.length && (
            <div className="record-sources">
              {sources.slice(0, 12).map((p, i) =>
                p.url ? (
                  <a key={i} href={p.url} target="_blank" rel="noreferrer noopener" className="source-chip">{p.d}</a>
                ) : (
                  <span key={i} className="source-chip">{p.d}</span>
                ),
              )}
              {sources.length > 12 && <span className="record-more-n">+{sources.length - 12}</span>}
            </div>
          )}
          <p className="record-foot">Worked {duration(record.secs)} · everything kept is on your Brand Graph</p>
        </div>
      )}
    </li>
  );
}
