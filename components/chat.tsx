"use client";

import { useEffect, useRef, useState } from "react";
import { OPENING, type Turn } from "@/lib/brief/conversation";
import type { BriefEvent } from "@/app/api/brief/route";
import { emptyBrief, type BrandBrief } from "@/lib/brief/types";
import { sourceLabel } from "@/lib/brief/source";
import { pacer } from "@/lib/stream/pace";

// Chapter 1's conversation (§6.2.1): the founder describes the product; the server turns everything into one brief.
// Shared by the journey; the server streams status lines, Athena's reply as it's written, and the result.

/** What Athena did for one message: steps as they happen, then the pages it read. Shown under that message. */
export type Trail = { steps: { text: string; done: boolean }[]; sources: { title?: string; uri?: string }[]; start: number; end?: number };
/** A chat line. `card` lines are interactive cards the journey places in the conversation. */
export type Msg = { who: "athena" | "you"; text: string; files?: string[]; trail?: Trail; card?: string };
export type FileChip = { name: string; status: string; busy: boolean };

export const ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.tsv,.xlsx,.pptx,.docx,image/*";

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

  const addFiles = (list: FileList | File[]) => setFiles((f) => [...f, ...Array.from(list)].slice(0, 10));

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

  return { brief, setBrief, msgs, setMsgs, turn, setTurn, files, setFiles, addFiles, chips, busy, status, live, researching, queued, first, send };
}

const domain = (u?: string) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : undefined;
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
