"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { linkerFor, segments, type Ref } from "@/lib/refs";
import { nameOf } from "@/lib/agent/specialists";
import type { SpecialistId } from "@/lib/agent/specialists";

// Every known name, wherever it's said (PRD §23.8 c): Athena's chat, a subagent's page, Execute Plan, the dashboard and
// the share page link it to a card saying what it is, where it came from and who found it. One card at a time, opened
// on hover or a click (a click keeps it open), closed by Esc or a click elsewhere; under 640px it's a bottom sheet.

/** What a card shows: a known name, or a source a sentence cites (with the pages it read). */
export type CardOf = Pick<Ref, "title" | "kind" | "about" | "from" | "url" | "agent"> & { id: string; pages?: { title?: string; url: string }[] };

type Shown = { card: CardOf; at: DOMRect; pinned: boolean };

type Ctx = {
  link: ReturnType<typeof linkerFor>;
  show: (card: CardOf, el: HTMLElement, pinned: boolean) => void;
  leave: () => void;
  openId?: string;
};

const RefCtx = createContext<Ctx | null>(null);

export function RefsProvider({ refs, onOpen, children }: { refs: Ref[]; onOpen?: (agent: SpecialistId) => void; children: ReactNode }) {
  const link = useMemo(() => linkerFor(refs), [refs]);
  const [shown, setShown] = useState<Shown>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const card = useRef<HTMLDivElement>(null);
  const hold = () => clearTimeout(timer.current);

  const show = useCallback((c: CardOf, el: HTMLElement, pinned: boolean) => {
    clearTimeout(timer.current);
    const at = el.getBoundingClientRect();
    if (pinned) return setShown((s) => (s?.pinned && s.card.id === c.id ? undefined : { card: c, at, pinned }));
    timer.current = setTimeout(() => setShown((s) => (s?.pinned ? s : { card: c, at, pinned: false })), 220);
  }, []);
  const leave = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown((s) => (s?.pinned ? s : undefined)), 180);
  }, []);

  useEffect(() => {
    if (!shown) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setShown(undefined);
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (card.current?.contains(t) || t?.closest(".ref-link, .src-chip")) return;
      setShown(undefined);
    };
    const away = () => setShown((s) => (s?.pinned ? s : undefined));
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", down);
    window.addEventListener("scroll", away, true);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("scroll", away, true);
    };
  }, [shown]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const value = useMemo(() => ({ link, show, leave, openId: shown?.card.id }), [link, show, leave, shown?.card.id]);
  return (
    <RefCtx.Provider value={value}>
      {children}
      {shown && <RefCard ref={card} shown={shown} onEnter={hold} onLeave={leave} onClose={() => setShown(undefined)} onOpen={onOpen} />}
    </RefCtx.Provider>
  );
}

/** Below the name, or above it when there's no room; inside the window either way. */
function placed(at: DOMRect): React.CSSProperties {
  const w = 320;
  const left = Math.max(12, Math.min(at.left, window.innerWidth - w - 12));
  return at.bottom + 240 > window.innerHeight && at.top > 260 ? { left, bottom: window.innerHeight - at.top + 6 } : { left, top: at.bottom + 6 };
}

function RefCard({ ref, shown, onEnter, onLeave, onClose, onOpen }: { ref: React.Ref<HTMLDivElement>; shown: Shown; onEnter: () => void; onLeave: () => void; onClose: () => void; onOpen?: (agent: SpecialistId) => void }) {
  const c = shown.card;
  const pages = c.pages?.length ? c.pages : c.url ? [{ url: c.url }] : [];
  return (
    <div ref={ref} className="ref-card" role="dialog" aria-label={c.title} style={placed(shown.at)} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="ref-card-head">
        <span className="ref-kind">{c.kind}</span>
        <button type="button" className="ref-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <strong className="ref-title">{c.title}</strong>
      {c.about.map((a, i) =>
        a.read ? (
          <p key={i} className="my-read small">
            <span className="my-read-tag">My read</span> {a.text}
          </p>
        ) : (
          <p key={i} className="small">{a.text}</p>
        ),
      )}
      <p className="small ref-from">
        <span className="muted">From </span>
        {c.from}
      </p>
      {pages.length > 0 && (
        <ul className="ref-pages small">
          {pages.map((p) => (
            <li key={p.url}>
              <a href={p.url} target="_blank" rel="noreferrer">
                {p.title ?? p.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
              </a>
            </li>
          ))}
        </ul>
      )}
      {c.agent && (
        <p className="small ref-by">
          <span className="muted">Found by the {nameOf(c.agent)}</span>
          {onOpen && (
            <button type="button" className="linkish small" onClick={() => (onClose(), onOpen(c.agent!))}>
              Open
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/** A name that opens its card. */
function RefLink({ text, card }: { text: string; card: CardOf }) {
  const ctx = useContext(RefCtx)!;
  return (
    <button
      type="button"
      className={`ref-link ${ctx.openId === card.id ? "on" : ""}`}
      data-kind={card.kind}
      aria-haspopup="dialog"
      onMouseEnter={(e) => ctx.show(card, e.currentTarget, false)}
      onMouseLeave={ctx.leave}
      onFocus={(e) => ctx.show(card, e.currentTarget, false)}
      onBlur={ctx.leave}
      onClick={(e) => ctx.show(card, e.currentTarget, true)}
    >
      {text}
    </button>
  );
}

/** Text with every known name in it linked to its card; plain where nothing matches, or outside a provider. */
export function Linked({ text }: { text: string }) {
  const ctx = useContext(RefCtx);
  const parts = useMemo(() => (ctx ? segments(text, ctx.link) : [text]), [text, ctx?.link]);
  if (parts.length === 1 && typeof parts[0] === "string") return <>{text}</>;
  // One inline run, so a flex parent (a step's heading) lays it out as one line of text, not as separate items.
  return <span className="linked">{parts.map((p, i) => (typeof p === "string" ? p : <RefLink key={i} text={p.text} card={p.ref} />))}</span>;
}

/** A source chip that opens its card: what it read and the pages behind it. Outside a provider, named on hover. */
export function SourceChip({ label, card }: { label: string; card: CardOf }) {
  const ctx = useContext(RefCtx);
  if (!ctx) return <span className="src-chip" title={card.about.map((a) => a.text).join(" ")}>{label}</span>;
  return (
    <button
      type="button"
      className={`src-chip ${ctx.openId === card.id ? "on" : ""}`}
      aria-haspopup="dialog"
      onMouseEnter={(e) => ctx.show(card, e.currentTarget, false)}
      onMouseLeave={ctx.leave}
      onClick={(e) => ctx.show(card, e.currentTarget, true)}
    >
      {label}
    </button>
  );
}
