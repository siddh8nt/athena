"use client";

import { useEffect, useRef, useState } from "react";
import { SPECIALIST_IDS, nameOf, specialist, type SpecialistId } from "@/lib/agent/specialists";
import { moments, pillLine, pops, whoOf, workingNow, type Moment } from "@/lib/team/activity";
import type { TeamState } from "@/lib/team/types";
import type { TeamLive } from "./Team";
import type { Page } from "./Views";

// What the team is doing, at a glance (§23.10): a pill at the top right that always says who is working, a panel under
// it with now and earlier, and a popup only when a subagent starts or finishes somewhere the founder can't see it.

const SHOW_MS = 5000;
type Toast = { key: number; m: Moment; text: string };

function ago(at: number, now: number): string {
  const min = Math.floor((now - at) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)} h ago`;
}

export function Activity(p: {
  live: TeamLive;
  team: TeamState;
  page: Page;
  /** The question waiting on the founder, if any, who asks it, and whether the run pauses for it. */
  asking?: { who: string; question: string; pauses: boolean };
  onAnswer: () => void;
  onOpen: (page: Page) => void;
}) {
  const { live, team } = p;
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [finished, setFinished] = useState<Partial<Record<SpecialistId, number>>>({});
  const prev = useRef(live.status);
  const pageNow = useRef(p.page);
  pageNow.current = p.page;
  const seq = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  // A start or a finish since the last state of the run: an earlier line for a finish, a popup where it earns one.
  const key = SPECIALIST_IDS.map((id) => live.status[id]?.state ?? "").join("|");
  useEffect(() => {
    const ms = moments(prev.current, live.status);
    prev.current = live.status;
    if (!ms.length) return;
    const at = Date.now();
    setFinished((f) => ({ ...f, ...Object.fromEntries(ms.filter((m) => m.kind === "done").map((m) => [m.id, at])) }));
    const fresh = ms.filter((m) => pops(m, pageNow.current)).map((m) => {
      const st = live.status[m.id];
      return { key: ++seq.current, m, text: m.kind === "done" ? (st?.state === "done" && st.last) || team.works[m.id]?.headline || "" : specialist(m.id).gives };
    });
    // A subagent's finish replaces its own start still showing, so a quick one doesn't take both places.
    if (fresh.length) setToasts((t) => [...t.filter((x) => !fresh.some((f) => f.m.id === x.m.id)), ...fresh].slice(-2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // A popup goes once its page opens (the follow-along often opens a starting subagent's page right after).
  useEffect(() => {
    setToasts((ts) => (ts.some((t) => !pops(t.m, p.page)) ? ts.filter((t) => pops(t.m, p.page)) : ts));
  }, [p.page]);

  // Each popup folds into the pill after a few seconds.
  const oldest = toasts[0]?.key;
  useEffect(() => {
    if (oldest === undefined) return;
    const t = setTimeout(() => setToasts((ts) => ts.filter((x) => x.key !== oldest)), SHOW_MS);
    return () => clearTimeout(t);
  }, [oldest]);

  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("mousedown", out), document.removeEventListener("keydown", esc));
  }, [open]);

  const line = pillLine(live.status, { asking: !!p.asking, exec: !!live.exec });
  const working = workingNow(live.status, !!live.exec);
  const stepOf = (id: (typeof working)[number]) => {
    if (id === "executive") return live.exec?.line ?? "";
    const st = live.status[id];
    return st?.state === "working" ? st.step : "";
  };
  // Earlier: each subagent that has finished, the latest first; those finished before this visit have no time.
  const earlier = SPECIALIST_IDS.filter((id) => team.works[id] || live.status[id]?.state === "done")
    .map((id) => {
      const st = live.status[id];
      return { id, at: finished[id], text: team.works[id]?.headline ?? (st?.state === "done" ? st.last : "") };
    })
    .filter((e) => live.status[e.id]?.state !== "working")
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  const go = (page: Page) => {
    setOpen(false);
    p.onOpen(page);
  };

  return (
    <div className="act" ref={box}>
      <button
        type="button"
        className={`act-pill act-${line.tone}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (setNow(Date.now()), setToasts([]), setOpen((o) => !o))}
      >
        {line.tone === "work" ? <span className="spin" aria-hidden /> : <span className="act-dot" aria-hidden />}
        <span className="act-text">{line.text}</span>
      </button>

      {open ? (
        <div className="act-panel" role="dialog" aria-label="What the team is doing">
          {p.asking && (
            <section className="act-sec act-ask">
              <span className="eyebrow">Your turn</span>
              <p className="small">
                <strong>{p.asking.who} asks:</strong> {p.asking.question}
              </p>
              <button type="button" className="primary small" onClick={() => (setOpen(false), p.onAnswer())}>
                Answer
              </button>
            </section>
          )}
          <section className="act-sec">
            <span className="eyebrow">Now</span>
            {working.length ? (
              <ul className="act-list">
                {working.map((id) => (
                  <li key={id}>
                    <span className="spin" aria-hidden />
                    <div>
                      <strong>{whoOf(id)}</strong>
                      <p className="small shimmer-text">{stepOf(id)}</p>
                    </div>
                    <button type="button" className="linkish small" onClick={() => go(id === "athena" ? "dashboard" : id)}>
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">{p.asking?.pauses ? "The team carries on once you answer." : "Nobody is working right now."}</p>
            )}
          </section>
          {earlier.length > 0 && (
            <section className="act-sec">
              <span className="eyebrow">Earlier</span>
              <ul className="act-list">
                {earlier.map((e) => (
                  <li key={e.id}>
                    <span className="act-dot act-done" aria-hidden />
                    <div>
                      <strong>
                        The {nameOf(e.id)} finished{e.at ? <span className="muted"> · {ago(e.at, now)}</span> : null}
                      </strong>
                      {e.text && <p className="small muted">{e.text}</p>}
                    </div>
                    <button type="button" className="linkish small" onClick={() => go(e.id)}>
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <div className="act-toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.key} className="act-toast">
              <div>
                <strong>
                  The {nameOf(t.m.id)} {t.m.kind === "start" ? "is starting" : "finished"}
                </strong>
                {t.text && <p className="small muted">{t.text}</p>}
              </div>
              <div className="act-toast-acts">
                <button type="button" className="linkish small" onClick={() => (setToasts((ts) => ts.filter((x) => x.key !== t.key)), go(t.m.id))}>
                  Open
                </button>
                <button type="button" className="act-x" aria-label="Dismiss" onClick={() => setToasts((ts) => ts.filter((x) => x.key !== t.key))}>
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
