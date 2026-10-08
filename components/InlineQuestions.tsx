"use client";

import { useState } from "react";
import type { InlineQuestion, ReadCard } from "@/lib/agent/plan";
import { REQUIRED, type BrandBrief } from "@/lib/brief/types";

// Phase 2's inline questions (§6.2.2): chips in the rail, each with what Athena assumed. Never awaited:
// the plan keeps going, and an answer re-runs only the blocks it changes.

export type Answers = { brandId?: string | null; comparables?: string[]; whereSold?: string; pinnedComparables?: string[] };

export function InlineQuestions({ questions, onAnswer }: { questions: InlineQuestion[]; onAnswer: (q: InlineQuestion, a: Answers) => void }) {
  return (
    <ul className="inline-qs" aria-label="Questions from Athena">
      {questions.map((q) => (
        <li key={q.id} id={`q-${q.id}`} className="inline-q">
          <strong>{q.text}</strong>
          <span className="muted small"> {q.why}. For now I assumed: {q.assumed}.</span>
          {q.id === "where_sold" && <WhereSold onSend={(t) => onAnswer(q, { whereSold: t })} />}
          {q.id === "is_this_you" && (
            <div className="replies">
              {q.options?.map((o) => (
                <button key={o.id} type="button" title={o.hint} onClick={() => onAnswer(q, { brandId: o.id === "none" ? null : o.id })}>
                  {o.label}
                  {o.hint && <small className="muted"> · {o.hint}</small>}
                </button>
              ))}
            </div>
          )}
          {q.id === "swap_comparables" && <Swap q={q} onUse={(names) => onAnswer(q, { comparables: names })} />}
        </li>
      ))}
    </ul>
  );
}

function WhereSold({ onSend }: { onSend: (t: string) => void }) {
  const [t, setT] = useState("");
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (t.trim()) onSend(t.trim());
      }}
    >
      <textarea rows={3} value={t} maxLength={20_000} onChange={(e) => setT(e.target.value)} placeholder={"Shop names, one per line, with a city if you can\nErewhon, Los Angeles"} />
      <button type="submit" className="primary" disabled={!t.trim()}>Use these</button>
    </form>
  );
}

function Swap({ q, onUse }: { q: InlineQuestion; onUse: (names: string[]) => void }) {
  const [on, setOn] = useState<Set<string>>(new Set(q.options?.filter((o) => o.hint === "chosen").map((o) => o.id)));
  const toggle = (id: string) => setOn((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else if (n.size < 3) n.add(id);
    return n;
  });
  return (
    <div className="replies">
      {q.options?.map((o) => (
        <button key={o.id} type="button" aria-pressed={on.has(o.id)} className={on.has(o.id) ? "chip-on" : ""} onClick={() => toggle(o.id)}>{o.label}</button>
      ))}
      <button type="button" className="primary" disabled={!on.size} onClick={() => onUse([...on])}>Use these</button>
    </div>
  );
}

const FACT_LABEL = { name: "brand name", sells: "what you sell", howBought: "how people buy it", activeCity: "your city" } as const;

/** "Built from" (§6.2.2): one line on what the plan rests on; every guessed or assumed item can be reopened. */
export function BuiltFrom({ card, brief, questions, onReopenBrief, onOpenQuestions }: { card: ReadCard; brief: BrandBrief; questions: InlineQuestion[]; onReopenBrief: () => void; onOpenQuestions: () => void }) {
  const signal = card.lines.find((l) => l.label === "Taste signal");
  const guessed = REQUIRED.filter((f) => brief[f]?.source.kind === "agent_guess");
  return (
    <section className="built-from small">
      <p>
        <strong>Built from</strong> {[brief.qloo?.match ? "brand in Qloo" : "brands like you", signal?.evidence, signal?.value].filter(Boolean).join(" · ")}
      </p>
      {(!!guessed.length || !!questions.length) && (
        <p className="muted">
          {guessed.map((f) => (
            <button key={f} type="button" className="linkish" onClick={onReopenBrief}>Guessed {FACT_LABEL[f]}: {String(brief[f]?.value)}</button>
          ))}
          {questions.map((q) => (
            <button key={q.id} type="button" className="linkish" onClick={onOpenQuestions}>Assumed {q.assumed}</button>
          ))}
        </p>
      )}
    </section>
  );
}
