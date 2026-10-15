"use client";

import { useEffect, useRef, useState } from "react";
import { benchLine, type BenchTask } from "@/lib/bench/lines";
import type { AloneAnswer, AloneInput, AloneItem } from "@/lib/proof/alone";

// With / Without on every stop (§13.2): the stop's answer beside Gemini alone answering the same question with no Qloo.
// Stops with a Bench task carry its line, Gemini's number included (§10.6); the rest are labelled demonstrated (§10.4).

export type AloneRequest = Omit<AloneInput, "stop">;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, " ").trim();

/** The Bench's quiet line for a stop with a measured task. */
export function BenchNote({ task }: { task: BenchTask }) {
  const line = benchLine(task);
  if (!line) return null;
  return (
    <p className="small muted bench-line">
      <strong>Taste Bench</strong> {line.text}
    </p>
  );
}

export function WithWithout({ stop, question, athena, request, bench, ranked }: { stop: AloneInput["stop"]; question: string; athena: AloneItem[]; request: AloneRequest; bench?: BenchTask; ranked?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ww">
      <div className="flip ww-flip" role="group" aria-label="Compare with Gemini alone">
        <button className={!open ? "active" : ""} aria-pressed={!open} onClick={() => setOpen(false)}>Athena</button>
        <button className={open ? "active" : ""} aria-pressed={open} onClick={() => setOpen(true)}>Beside Gemini alone</button>
      </div>
      {open && <Split stop={stop} question={question} athena={athena} request={request} ranked={ranked} measured={!!bench} />}
      {bench && <BenchNote task={bench} />}
    </div>
  );
}

function Split({ stop, question, athena, request, ranked, measured }: { stop: AloneInput["stop"]; question: string; athena: AloneItem[]; request: AloneRequest; ranked?: boolean; measured: boolean }) {
  const body = JSON.stringify({ stop, ...request });
  const [state, setState] = useState<{ answer?: AloneAnswer | null; note?: string; at: number }>({ at: 0 });
  const asked = useRef<string | null>(null);
  const ask = () => {
    asked.current = body;
    setState({ at: Date.now() });
    fetch("/api/alone", { method: "POST", headers: { "Content-Type": "application/json" }, body })
      .then((r) => r.json() as Promise<{ answer: AloneAnswer | null; note?: string }>)
      .then((d) => asked.current === body && setState({ answer: d.answer, note: d.note, at: 0 }))
      .catch(() => asked.current === body && setState({ answer: null, note: "Gemini is busy right now. Ask again in a minute.", at: 0 }));
  };
  useEffect(() => {
    if (asked.current !== body) ask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);

  const a = state.answer;
  const keyOf = (x: AloneItem) => x.id ?? norm(x.name);
  // Ranked stops order the same candidates, so "on both" means in both top 8s; open answers compare whole lists.
  const top = ranked ? 8 : 12;
  const theirs = new Set((a?.items ?? []).slice(0, top).map(keyOf));
  const ours = new Set(athena.slice(0, top).map(keyOf));
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const both = ranked && a ? athena.slice(0, 5).filter((x) => a.items.slice(0, 5).some((y) => keyOf(y) === keyOf(x))).length : 0;

  return (
    <div className="ww-split" aria-live="polite">
      <p className="small ww-q"><strong>The question</strong> {question}</p>
      <div className="ww-cols">
        <section>
          <h4>Athena <small className="muted">from Qloo&apos;s taste graph</small></h4>
          <List items={athena.slice(0, top)} ranked={ranked} mark={(x) => theirs.has(keyOf(x))} />
        </section>
        <section>
          <h4>Gemini alone <small className="muted">no Qloo{a?.search ? ", with Google Search" : ""}</small></h4>
          {state.at ? (
            <p className="small galaxy-step">
              <span className="spin" aria-hidden />
              <span className="shimmer-text">Asking Gemini 3.1 Pro the same question, with no Qloo: about 30 seconds</span>
            </p>
          ) : a ? (
            <>
              {a.headline && <p className="small"><em>{a.headline}</em></p>}
              <List items={a.items.slice(0, top)} ranked={ranked} mark={(x) => ours.has(keyOf(x))} />
            </>
          ) : (
            <p className="small muted">
              {state.note} <button type="button" className="linkish" onClick={ask}>Ask again</button>
            </p>
          )}
        </section>
      </div>
      {a && (
        <p className="small muted">
          {ranked && <>Both rank the same {stop === "where" ? "25 metros" : `${request.candidates?.length ?? 0} retailers`}; {both} of the top 5 match. </>}
          {measured
            ? `One answer from ${a.model}, asked on ${day(a.ranAt)} with the Bench's prompt. The measured comparison is the Bench line below.`
            : `Demonstrated, not measured: one answer from ${a.model} on ${day(a.ranAt)}${a.search ? "; its dates weren't checked" : ""}. Nothing here is scored against outcomes.`}
          {" "}● {ranked ? `in both top ${top}s` : "on both lists"}.
        </p>
      )}
    </div>
  );
}

function List({ items, ranked, mark }: { items: AloneItem[]; ranked?: boolean; mark: (x: AloneItem) => boolean }) {
  return (
    <ol className="rank-list ww-list">
      {items.map((x, i) => (
        <li key={`${x.id ?? x.name}-${i}`}>
          {ranked && <span className="rank">{i + 1}</span>}
          <span className="grow">
            <strong>{x.name}</strong>
            {mark(x) && <span className="ww-both" title="On both lists"> ●</span>}
            {x.why && <small className="muted"> · {x.why}</small>}
          </span>
        </li>
      ))}
    </ol>
  );
}
