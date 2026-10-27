"use client";

import { useEffect, useRef, useState } from "react";
import type { FounderQuestion } from "@/lib/agent/tools";

// A question from the agent (PRD §23.2 step 3c), asked the way a good assistant asks: 2–4 options built from what it
// found, its recommendation first, "Other" for anything else, and Skip. The run never waits: until the founder
// answers, the "Assumed" line says what Athena is going ahead with.

/** `for`: the subagent the question is asked for, said as Athena's "For the Navigator"; `pauses`: its step waits on it;
 *  `ticked`: a multi-pick that starts with every option picked ("Did these go out?"). With no `assumed` there's no Skip:
 *  only the Executive's Start waits on the founder (§23.5 r). */
export type Asked = FounderQuestion & { id: string; for?: string; pauses?: boolean; ticked?: boolean };

export type TrayItem = { q: Asked; answer?: string; onAnswer: (answer: string) => void };

/** The open questions, tucked above the reply box one at a time, the way Claude Code asks: "2 of 4", arrows between them,
 *  and answering one moves straight to the next. Answered ones leave the tray (the chat keeps them as one-line records);
 *  an answer that lands later (a conflict being settled) leaves at once, so it can't be answered twice. */
export function QuestionTray({ items }: { items: TrayItem[] }) {
  const [sent, setSent] = useState<string[]>([]);
  const [at, setAt] = useState<string>();
  const open = items.filter((it) => it.answer === undefined && !sent.includes(it.q.id));
  // A question asked after the tray is up comes to the front: it answers what the founder just said.
  const seen = useRef<Set<string> | null>(null);
  const ids = open.map((it) => it.q.id).join("|");
  useEffect(() => {
    const fresh = open.filter((it) => !seen.current?.has(it.q.id));
    if (seen.current && fresh.length) setAt(fresh[fresh.length - 1].q.id);
    seen.current = new Set([...(seen.current ?? []), ...open.map((it) => it.q.id)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  if (!open.length) return null;
  const i = Math.max(0, open.findIndex((it) => it.q.id === at));
  const cur = open[i];
  const go = (k: number) => setAt(open[(k + open.length) % open.length].q.id);
  return (
    <section className="q-tray" aria-label="Questions for you">
      {open.length > 1 && (
        <header className="q-tray-head">
          <span className="small muted">
            Question {i + 1} of {open.length}
          </span>
          <span className="q-tray-nav">
            <button type="button" className="linkish" aria-label="Previous question" onClick={() => go(i - 1)}>‹</button>
            <button type="button" className="linkish" aria-label="Next question" onClick={() => go(i + 1)}>›</button>
          </span>
        </header>
      )}
      <Question
        key={cur.q.id}
        q={cur.q}
        onAnswer={(a) => {
          setSent((s) => [...s, cur.q.id]);
          // Straight on to the next open one, in order.
          const next = open[i + 1] ?? open[0];
          setAt(next && next !== cur ? next.q.id : undefined);
          cur.onAnswer(a);
        }}
      />
    </section>
  );
}

export function Question({ q, answer, onAnswer }: { q: Asked; answer?: string; onAnswer: (answer: string) => void }) {
  const [picked, setPicked] = useState<string[]>(() => (q.multi && q.ticked ? q.options.map((o) => o.label) : []));
  const [other, setOther] = useState("");
  const [typing, setTyping] = useState(false);

  if (answer !== undefined)
    return (
      <div className="question question-done">
        <span className="muted small">{q.for ? `For the ${q.for}: ` : ""}{q.question}</span> <strong className="small">{answer || (q.assumed ? `Skipped; going with ${q.assumed}` : "")}</strong>
      </div>
    );

  const choose = (label: string) => (q.multi ? setPicked((p) => (p.includes(label) ? p.filter((x) => x !== label) : [...p, label])) : onAnswer(label));
  // With several picked, what they type goes with the picks: "both, but mostly the first" is one answer.
  const sendOther = () => other.trim() && onAnswer([...(q.multi ? picked : []), other.trim()].join(", "));

  return (
    <div className={`question${q.pauses ? " question-pauses" : ""}`} role="group" aria-label={q.question}>
      {q.for && (
        <p className="question-for">
          For the {q.for}
          {q.pauses && <small> · it waits for this</small>}
        </p>
      )}
      <p className="question-text">{q.question}</p>
      <ol className="question-options">
        {q.options.map((o, i) => {
          // An option that can't go with one already picked stays visible, with the reason.
          const clash = q.multi && !picked.includes(o.label) ? (o.conflicts ?? []).find((c) => picked.includes(c)) : undefined;
          return (
            <li key={o.label}>
              <button type="button" className={picked.includes(o.label) ? "on" : ""} disabled={!!clash} aria-pressed={q.multi ? picked.includes(o.label) : undefined} onClick={() => choose(o.label)}>
                <span className="question-n">{i + 1}</span>
                <span>
                  {o.label}
                  {i === 0 && !q.unranked && <small className="muted"> · recommended</small>}
                  {clash ? <small className="question-hint">Not with “{clash}”: they pull opposite ways.</small> : o.hint && <small className="question-hint">{o.hint}</small>}
                </span>
              </button>
            </li>
          );
        })}
        <li>
          {typing ? (
            <form
              className="question-other"
              onSubmit={(e) => {
                e.preventDefault();
                sendOther();
              }}
            >
              <input autoFocus value={other} maxLength={300} placeholder="Your answer" onChange={(e) => setOther(e.target.value)} />
              <button type="submit" disabled={!other.trim()}>Send</button>
            </form>
          ) : (
            <button type="button" onClick={() => setTyping(true)}>
              <span className="question-n">{q.options.length + 1}</span> Other…
            </button>
          )}
        </li>
      </ol>
      <div className="question-foot">
        {q.assumed && <span className="muted small">Skip goes with “{q.assumed}”.</span>}
        {q.multi && (
          <button type="button" className="primary" disabled={!picked.length && !q.ticked} onClick={() => onAnswer(picked.join(", ") || "None")}>
            Done
          </button>
        )}
        {q.assumed && (
          <button type="button" className="linkish" onClick={() => onAnswer("")}>
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
