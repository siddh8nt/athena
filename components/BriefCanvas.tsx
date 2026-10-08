"use client";

import { useEffect, useRef, useState } from "react";
import { MOTION_WORDS, OPENING, type Turn } from "@/lib/brief/conversation";
import { emptyBrief, type BrandBrief, type Source, type Sourced } from "@/lib/brief/types";

// The brief canvas (§6.2.1, §13.2): a conversation on the left, the live "What I understood" card on the right.
// Only text is required; files of any common kind are optional. The server turns everything into one brief.

type Msg = { who: "athena" | "you"; text: string; files?: string[] };
type FileChip = { name: string; status: string; busy: boolean };

const ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.tsv,.xlsx,.pptx,.docx,image/*";
const STORE = "athena:brief";

export function sourceLabel(s: Source, confirmed?: boolean): string {
  const base =
    s.kind === "message" ? "from your message"
    : s.kind === "file" ? `from ${s.ref ?? "your file"}`
    : s.kind === "website" ? "from your website"
    : s.kind === "qloo" ? "from Qloo"
    : s.kind === "inferred" ? "my read"
    : "Agent · guessed";
  return confirmed && s.kind !== "message" ? `${base} · you confirmed` : base;
}

export function BriefCanvas({ initial, onStart, onClose }: { initial?: BrandBrief; onStart: (b: BrandBrief) => void; onClose: () => void }) {
  const [brief, setBrief] = useState<BrandBrief>(initial ?? emptyBrief());
  const [msgs, setMsgs] = useState<Msg[]>([{ who: "athena", text: OPENING }]);
  const [turn, setTurn] = useState<Turn>({ text: OPENING, replies: [], ready: false });
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [chips, setChips] = useState<FileChip[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const first = !msgs.some((m) => m.who === "you");

  // A returning founder picks up where they left off (kept in this browser only).
  useEffect(() => {
    if (initial) return;
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "null") as { brief?: BrandBrief; msgs?: Msg[]; turn?: Turn } | null;
      if (saved?.brief && saved.msgs?.length && saved.turn) {
        setBrief(saved.brief);
        setMsgs(saved.msgs);
        setTurn(saved.turn);
      }
    } catch {
      // Storage unavailable: start fresh.
    }
  }, [initial]);
  useEffect(() => {
    try {
      if (msgs.length > 1) localStorage.setItem(STORE, JSON.stringify({ brief, msgs: msgs.slice(-30), turn }));
    } catch {
      // Ignore.
    }
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [brief, msgs, turn]);

  const addFiles = (list: FileList | File[]) => {
    const next = [...files, ...Array.from(list)].slice(0, 10);
    setFiles(next);
  };

  async function send(reply?: { id: string; label: string }) {
    const message = reply ? "" : text.trim();
    if (busy || (!reply && !message && !files.length) || (first && !message)) return;
    setBusy(true);
    const sending = reply ? [] : files;
    setMsgs((m) => [...m, { who: "you", text: reply?.label ?? message, files: sending.map((f) => f.name) }]);
    setChips((c) => [...c, ...sending.map((f) => ({ name: f.name, status: "Reading…", busy: true }))]);
    setText("");
    setFiles([]);
    const form = new FormData();
    form.set("brief", JSON.stringify(brief));
    form.set("message", message);
    if (turn.fact) form.set("asking", turn.fact);
    if (reply) form.set("reply", reply.id);
    for (const f of sending) form.append("files", f, f.name);
    try {
      const res = await fetch("/api/brief", { method: "POST", body: form });
      const data = (await res.json()) as { brief: BrandBrief; turn: Turn; files: { name: string; status: string }[] };
      setBrief(data.brief);
      setTurn(data.turn);
      setMsgs((m) => [...m, { who: "athena", text: data.turn.text }]);
      setChips((c) => c.map((x) => ({ ...x, busy: false, status: data.files.find((f) => f.name === x.name)?.status ?? (x.busy ? "Read" : x.status) })));
    } catch {
      setMsgs((m) => [...m, { who: "athena", text: "That took longer than it should. Send it again and I'll pick up from here." }]);
      setChips((c) => c.map((x) => (x.busy ? { ...x, busy: false, status: "Send again to read this" } : x)));
    } finally {
      setBusy(false);
    }
  }

  const start = () => {
    try {
      localStorage.removeItem(STORE);
    } catch {
      // Ignore.
    }
    onStart(brief);
  };

  return (
    <div className="intake-backdrop" role="dialog" aria-label="Try your own brand" onClick={onClose}>
      <div
        className={`canvas ${drag ? "dragging" : ""}`}
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
      >
        <section className="chat" aria-live="polite">
          <header>
            <h2>Try your own brand</h2>
            <button type="button" onClick={onClose} aria-label="Close">✕</button>
          </header>
          <ol className="msgs">
            {msgs.map((m, i) => (
              <li key={i} className={`msg msg-${m.who}`}>
                {m.text}
                {!!m.files?.length && <span className="msg-files">{m.files.map((f) => <span key={f} className="chip">{f}</span>)}</span>}
              </li>
            ))}
            {busy && <li className="msg msg-athena typing">Reading{files.length || chips.some((c) => c.busy) ? " your files" : ""}…</li>}
            <div ref={end} />
          </ol>
          {!busy && (turn.replies.length > 0 || turn.ready) && (
            <div className="replies">
              {turn.replies.map((r) => (
                <button key={r.id} type="button" className={r.id === "yes" ? "primary" : ""} onClick={() => send(r)}>{r.label}</button>
              ))}
              {turn.ready && <button type="button" className="primary" onClick={start}>Build my plan</button>}
            </div>
          )}
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            {!!files.length && (
              <ul className="chips">
                {files.map((f, i) => (
                  <li key={`${f.name}${i}`} className="chip">
                    {f.name}{" "}
                    <button type="button" className="linkish" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button>
                  </li>
                ))}
              </ul>
            )}
            <textarea
              autoFocus
              rows={first ? 4 : 2}
              value={text}
              maxLength={8000}
              placeholder={first ? "e.g. We're Graza, squeezable olive oil. Sold in about 40 grocers and cafés in LA and online. graza.co" : "Reply, or drop in a file"}
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
            <div className="row-actions">
              <button type="button" onClick={() => pick.current?.click()}>Add files</button>
              <input ref={pick} type="file" multiple accept={ACCEPT} hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
              <span className="muted small">Decks, stockist sheets, screenshots, PDFs. Read, never stored.</span>
              <button type="submit" className="primary" disabled={busy || (first ? !text.trim() : !text.trim() && !files.length)}>Send</button>
            </div>
          </form>
        </section>
        <Understood brief={brief} chips={chips} />
      </div>
    </div>
  );
}

function Field({ label, s, show }: { label: string; s?: Sourced<unknown>; show?: (v: unknown) => string }) {
  return (
    <div className={`fact ${s ? "" : "fact-missing"}`}>
      <dt>{label}</dt>
      <dd>
        {s ? (show ? show(s.value) : String(s.value)) : <span className="muted">not yet</span>}
        {s && <small className={`src src-${s.source.kind}`}>{sourceLabel(s.source, s.confirmed)}</small>}
      </dd>
    </div>
  );
}

/** "What I understood" (§6.2.1): every field with where it came from. */
function Understood({ brief, chips }: { brief: BrandBrief; chips: FileChip[] }) {
  const stockistFrom = [...new Set(brief.stockists.map((s) => sourceLabel(s.source)))];
  return (
    <section className="understood" aria-label="What I understood">
      <h3>What I understood</h3>
      <dl>
        <Field label="Brand" s={brief.name} />
        <Field label="Sells" s={brief.sells} />
        <Field label="How people buy it" s={brief.howBought} show={(v) => (v as (keyof typeof MOTION_WORDS)[]).map((m) => MOTION_WORDS[m]).join(" and ")} />
        <Field label="US city" s={brief.activeCity} />
        {brief.tierHint && <Field label="Price tier" s={brief.tierHint} />}
        {brief.stageHint && <Field label="Stage" s={brief.stageHint} />}
      </dl>
      {brief.qloo && <p className="small muted">{brief.qloo.match ? `In Qloo as ${brief.qloo.match.name}` : "Not in Qloo yet; I'll use brands like you"}</p>}
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
