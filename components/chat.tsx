"use client";

import { useEffect, useRef, useState } from "react";
import { OPENING, type Turn } from "@/lib/brief/conversation";
import type { BriefEvent } from "@/app/api/brief/route";
import { emptyBrief, type BrandBrief, type Source, type Sourced } from "@/lib/brief/types";

// Chapter 1's conversation (§6.2.1): the founder describes the product; the server turns everything into one brief.
// Shared by the journey; the server streams status lines, Athena's reply as it's written, and the result.

/** What Athena did for one message: steps as they happen, then the pages it read. Shown under that message. */
export type Trail = { steps: { text: string; done: boolean }[]; sources: { title?: string; uri?: string }[]; start: number; end?: number };
/** A chat line. `card` lines are interactive cards the journey places in the conversation. */
export type Msg = { who: "athena" | "you"; text: string; files?: string[]; trail?: Trail; card?: string };
export type FileChip = { name: string; status: string; busy: boolean };

export const ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.tsv,.xlsx,.pptx,.docx,image/*";

export function sourceLabel(s: Source, confirmed?: boolean): string {
  const base =
    s.kind === "message" ? "from your message"
    : s.kind === "file" ? `from ${s.ref ?? "your file"}`
    : s.kind === "website" ? "from your website"
    : s.kind === "web" ? `from the web${s.ref ? ` · ${s.ref}` : ""}`
    : s.kind === "qloo" ? "from Qloo"
    : s.kind === "inferred" ? "my read"
    : "Agent · guessed";
  return confirmed && s.kind !== "message" ? `${base} · you confirmed` : base;
}

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
  const first = !msgs.some((m) => m.who === "you");

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
      for (;;) {
        const { done, value } = await reader.read();
        buf += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const p of parts) {
          if (!p.startsWith("data:")) continue;
          const e = JSON.parse(p.slice(5)) as BriefEvent;
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

function Field({ label, s, show, busy }: { label: string; s?: Sourced<unknown>; show?: (v: unknown) => string; busy?: boolean }) {
  const shown = s ? (show ? show(s.value) : String(s.value)) : "";
  return (
    <div className={`fact ${s ? "" : "fact-missing"}`}>
      <dt>{label}</dt>
      <dd key={shown} className={s ? "fact-in" : ""}>
        {s ? shown : busy ? <span className="shimmer-bar" aria-label="Working on it" /> : <span className="muted">not yet</span>}
        {s && <small className={`src src-${s.source.kind}`}>{sourceLabel(s.source, s.confirmed)}</small>}
      </dd>
    </div>
  );
}

const CHANNEL_WORDS = { online: "Mostly online", offline: "Mostly offline", both: "Online and offline" } as const;

/** "What I understood" (§6.2.1): every field with where it came from. */
export function Understood({ brief, chips, busy }: { brief: BrandBrief; chips: FileChip[]; busy: boolean }) {
  const stockistFrom = [...new Set(brief.stockists.map((s) => sourceLabel(s.source)))];
  return (
    <section className="understood card" aria-label="What I understood">
      <h3>What I understood</h3>
      <dl>
        <Field label="Brand" s={brief.name} busy={busy} />
        <Field label="Product" s={brief.sells} busy={busy} />
        {brief.channels && <Field label="Sold" s={brief.channels} />}
        {brief.channel && <Field label="Mostly" s={brief.channel} show={(v) => CHANNEL_WORDS[v as keyof typeof CHANNEL_WORDS]} />}
        {brief.tierHint && <Field label="Price tier" s={brief.tierHint} />}
        {brief.stageHint && <Field label="Stage" s={brief.stageHint} />}
      </dl>
      {!!brief.traits?.length && (
        <p className="small"><strong>Traits I&apos;ll read into Qloo</strong> {brief.traits.join(" · ")} <small className="src src-inferred">my read</small></p>
      )}
      {!!brief.research?.sources.length && (
        <details className="small research">
          <summary>Researched {brief.research.sources.length} pages</summary>
          <ul>
            {brief.research.sources.map((s, i) => (
              <li key={i}>{s.uri ? <a href={s.uri} target="_blank" rel="noreferrer noopener">{s.title ?? s.uri}</a> : s.title}</li>
            ))}
          </ul>
        </details>
      )}
      {brief.qloo && <p className="small muted">{brief.qloo.match ? `In Qloo as ${brief.qloo.match.name}` : "Not in Qloo yet, which is normal for a young brand: I'll read brands like it"}</p>}
      {!!brief.stockists.length && (
        <p className="small">
          <strong>{brief.stockists.length} stockists</strong> <span className="muted">{stockistFrom.join(", ")}</span>
        </p>
      )}
      {!!brief.websites.length && <p className="small"><strong>Websites</strong> {brief.websites.map((w) => w.value.replace(/^https:\/\//, "")).join(", ")}</p>}
      {!!brief.comparables.length && <p className="small"><strong>Brands like you</strong> {brief.comparables.map((c) => c.value).join(", ")}</p>}
      {!!brief.competitors.length && <p className="small"><strong>Competitors</strong> {brief.competitors.map((c) => c.value).join(", ")}</p>}
      {!!brief.notes.length && (
        <ul className="notes small">
          {brief.notes.map((n, i) => <li key={i}>{n.value} <small className="src">{sourceLabel(n.source)}</small></li>)}
        </ul>
      )}
      {!!chips.length && (
        <ul className="file-chips">
          {chips.map((c, i) => <li key={i} className={c.busy ? "busy" : ""}><strong>{c.name}</strong> <span className="muted">{c.status}</span></li>)}
        </ul>
      )}
    </section>
  );
}
