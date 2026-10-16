"use client";

import { useEffect, useRef, useState } from "react";

// Progress the founder can see at a glance while an agent works (reading a site, calling Qloo, writing): the step it
// is on, how far through its plan it is, how long it has been at it, and what it has gathered so far. Real calls and
// crawls take a while; this keeps every second of that visibly moving. Client-only.

/** Seconds since this mounted, ticking once a second. */
function useSince(start?: number) {
  const t0 = useRef(start ?? Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  return Math.max(0, (now - t0.current) / 1000);
}

const clock = (s: number) => (s < 60 ? `${Math.floor(s)} s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);

/** A running step's own timer, from when it started showing. */
export function StepTimer() {
  const s = useSince();
  if (s < 2) return null;
  return <small className="prog-step-time"> {clock(s)}</small>;
}

export type ProgressStep = { label: string; state: "todo" | "now" | "done" | "skipped" };

/**
 * The run as one card: the current step, a bar that fills as steps finish (and creeps on through the step in hand,
 * so it never stands still), a pip for each step of the plan, the elapsed time and running counts.
 * With no written plan, the steps so far stand in for it, with one more always to come.
 */
export function RunProgress({ current, steps, counts = [], who }: { current: string; steps: ProgressStep[]; counts?: string[]; who?: string }) {
  const total = useSince();
  // The step in hand: its own clock restarts whenever it changes.
  const [stepAt, setStepAt] = useState(() => Date.now());
  const last = useRef(current);
  useEffect(() => {
    if (last.current !== current) {
      last.current = current;
      setStepAt(Date.now());
    }
  }, [current]);
  const inStep = Math.max(0, (Date.now() - stepAt) / 1000);
  const counted = steps.filter((s) => s.state !== "skipped");
  const done = counted.filter((s) => s.state === "done").length;
  const planned = Math.max(counted.length, done + 1);
  // The step in hand fills toward, never to, its share: most of it in the first 15 s, then slowly.
  const creep = 0.92 * (1 - Math.exp(-inStep / 15));
  // With no steps to count, the bar follows the clock instead. Either way it only moves forward: a plan that grows
  // (one more step to come) slows it, never sends it back.
  const raw = counted.length ? ((done + creep) / planned) * 100 : 100 * (1 - Math.exp(-total / 40));
  const high = useRef(0);
  high.current = Math.max(high.current, Math.min(97, raw));
  const pct = high.current;
  return (
    <div className="prog" role="status" aria-live="polite">
      <div className="prog-head">
        <span className="prog-ring" aria-hidden />
        <span className="prog-now">
          {who && <small className="prog-who">{who}</small>}
          <span className="prog-text">{current}</span>
        </span>
        <span className="prog-clock" aria-label={`Working for ${clock(total)}`}>{clock(total)}</span>
      </div>
      <div className="prog-bar" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="prog-foot">
        {steps.length > 0 && (
          <ol className="prog-pips" aria-label={`${done} of ${planned} steps done`}>
            {steps.map((s, i) => (
              <li key={i} className={`prog-pip prog-${s.state}`} title={s.label} />
            ))}
          </ol>
        )}
        <small className="prog-meta">
          {steps.length > 0 && <>{done} of {planned} steps done</>}
          {counts.filter(Boolean).map((c) => (
            <span key={c}> · {c}</span>
          ))}
        </small>
      </div>
    </div>
  );
}
