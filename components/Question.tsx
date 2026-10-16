"use client";

import { useState } from "react";
import type { FounderQuestion } from "@/lib/agent/tools";

// A question from the agent (PRD §23.2 step 3c), asked the way a good assistant asks: 2–4 options built from what it
// found, its recommendation first, "Other" for anything else, and Skip. The run never waits: until the founder
// answers, the "Assumed" line says what Athena is going ahead with.

export type Asked = FounderQuestion & { id: string };

export function Question({ q, answer, onAnswer }: { q: Asked; answer?: string; onAnswer: (answer: string) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const [typing, setTyping] = useState(false);

  if (answer !== undefined)
    return (
      <div className="question question-done">
        <span className="muted small">{q.question}</span> <strong className="small">{answer || `Skipped; going with ${q.assumed}`}</strong>
      </div>
    );

  const choose = (label: string) => (q.multi ? setPicked((p) => (p.includes(label) ? p.filter((x) => x !== label) : [...p, label])) : onAnswer(label));
  // With several picked, what they type goes with the picks: "both, but mostly the first" is one answer.
  const sendOther = () => other.trim() && onAnswer([...(q.multi ? picked : []), other.trim()].join(", "));

  return (
    <div className="question" role="group" aria-label={q.question}>
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
        <span className="muted small">Going ahead with “{q.assumed}” until you answer.</span>
        {q.multi && (
          <button type="button" className="primary" disabled={!picked.length} onClick={() => onAnswer(picked.join(", "))}>
            Done
          </button>
        )}
        <button type="button" className="linkish" onClick={() => onAnswer("")}>Skip</button>
      </div>
    </div>
  );
}
