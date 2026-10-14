"use client";

import { useState } from "react";
import { whereLabel, type Conflict, type Fact, type Knowledge } from "@/lib/knowledge/types";

// What Athena kept from everything the founder gave (PRD §23.2 step 4d): each source's facts with where each one is,
// struck in one tap; and where the sources disagree, a one-click choice with Athena's pick marked. Choices and strikes
// go into the next run.

/** The source a fact is shown under: the file, the summary, or the site (whichever page it's on). */
function sourceOf(f: Fact): string {
  const w = f.where[0];
  if (w.kind !== "website") return w.ref;
  try {
    return new URL(w.ref).hostname.replace(/^www\./, "");
  } catch {
    return w.ref;
  }
}

const host = (s: string) => {
  try {
    return new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).hostname.replace(/^www\./, "");
  } catch {
    return s;
  }
};

export function Settle({ c, facts, pick, onPick }: { c: Conflict; facts: Fact[]; pick: number; onPick: (i: number) => void }) {
  const at = (ids: string[]) => ids.map((id) => facts.find((f) => f.id === id)?.where.map(whereLabel).join("; ")).filter(Boolean).join("; ");
  return (
    <div className="question" role="group" aria-label={c.about}>
      <p className="question-text">Your sources disagree: {c.about}</p>
      <ol className="question-options">
        {c.options.map((o, i) =>
          o.facts.length ? (
            <li key={`${o.value}${i}`}>
              <button type="button" className={pick === i ? "on" : ""} aria-pressed={pick === i} onClick={() => onPick(i)}>
                <span className="question-n">{i + 1}</span>
                <span>
                  {o.value}
                  {i === c.recommended && <small className="muted"> · my pick</small>}
                  <small className="question-hint">{at(o.facts)}</small>
                </span>
              </button>
            </li>
          ) : null,
        )}
      </ol>
      {c.why && <p className="muted small kb-why">{c.why}</p>}
    </div>
  );
}

export function KnowledgePanel({ kb, struck, onStrike }: { kb: Knowledge; struck: Set<string>; onStrike: (id: string) => void }) {
  const [open, setOpen] = useState<string>();
  const groups = new Map<string, Fact[]>();
  for (const f of kb.facts) groups.set(sourceOf(f), [...(groups.get(sourceOf(f)) ?? []), f]);
  const kept = kb.facts.filter((f) => !struck.has(f.id)).length;
  return (
    <section className="kb" aria-label="What I kept">
      <p className="kb-head">
        What I kept: {kept} facts from {groups.size} source{groups.size === 1 ? "" : "s"}, each with where it is. Strike anything that&apos;s wrong.
      </p>
      <ul className="kb-sources">
        {[...groups].map(([src, facts]) => {
          const cov = kb.coverage.find((c) => c.source === src || host(c.source) === src);
          return (
            <li key={src}>
              <button type="button" className="linkish kb-source" aria-expanded={open === src} onClick={() => setOpen((o) => (o === src ? undefined : src))}>
                {open === src ? "▾" : "▸"} {src} <span className="muted small">· {facts.filter((f) => !struck.has(f.id)).length} facts{cov && !cov.clean ? " · a last look still turned up detail; all of it is here" : ""}</span>
              </button>
              {open === src && (
                <ul className="kb-facts">
                  {facts.map((f) => (
                    <li key={f.id} className={struck.has(f.id) ? "kb-struck" : ""}>
                      <span className="kb-text">{f.text}</span> <small className="muted">{f.where.map(whereLabel).join("; ")}</small>{" "}
                      <button type="button" className="linkish small" onClick={() => onStrike(f.id)}>
                        {struck.has(f.id) ? "Keep" : "Strike"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
