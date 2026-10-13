"use client";

import { useEffect, useState } from "react";
import { LEAN_LABEL, LEAN_STEPS, leanSignal, neutralLean } from "@/lib/journey/weights";
import type { Lean, TasteAxisCard } from "@/lib/journey/types";

// Taste axes and sliders (§9.27): the directions the crowd's taste runs along, from a factorisation of the measured
// graph. Each slider leans the signal toward or away from one axis, and the current stop's list re-ranks in one Qloo
// call (a fixed pool, so the same items in a new order). Positions already seen come from memory.

export type Taste = { axes: TasteAxisCard[]; lean: Lean; onLean: (axisId: string, pos: number) => void };

/** The axes as labels with five-position sliders. `compact` drops the explanation, for the stops that re-rank. */
export function TasteAxes({ taste, compact, busy, note }: { taste: Taste; compact?: boolean; busy?: boolean; note?: string }) {
  const { axes, lean, onLean } = taste;
  if (!axes.length) return null;
  return (
    <section className={`taste-axes${compact ? " compact" : ""}`} aria-label="Taste axes">
      {!compact && (
        <header>
          <h4>Taste axes</h4>
          <p className="small muted">
            The {axes.length} directions this graph&apos;s taste runs along, factorised from the measured Qloo percentiles. Lean toward or away from one and the shortlists at the next stops re-rank, one Qloo call per move.
          </p>
        </header>
      )}
      <ul>
        {axes.map((a) => {
          const pos = lean[a.id] ?? 0;
          return (
            <li key={a.id}>
              <div className="axis-name">
                <strong>{a.name}</strong>
                <small className="muted">{a.top.slice(0, compact ? 3 : 5).map((t) => t.name).join(", ")}</small>
              </div>
              <div className="axis-steps" role="radiogroup" aria-label={`Lean on ${a.name}`}>
                {LEAN_STEPS.map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={pos === p} title={LEAN_LABEL[p]} aria-label={LEAN_LABEL[p]} className={`${pos === p ? "on" : ""}${p === 0 ? " mid" : ""}`} onClick={() => onLean(a.id, p)}>
                    {p === -2 ? "−−" : p === -1 ? "−" : p === 1 ? "+" : p === 2 ? "++" : "·"}
                  </button>
                ))}
              </div>
              <small className="axis-pos muted">{LEAN_LABEL[pos]}</small>
            </li>
          );
        })}
      </ul>
      {busy && (
        <p className="small galaxy-step">
          <span className="spin" aria-hidden />
          <span className="shimmer-text">Re-ranking this list under your lean: one Qloo call</span>
        </p>
      )}
      {note && !busy && <p className="small muted">{note}</p>}
    </section>
  );
}

type Order = { order: string[]; affinity: Record<string, number>; note?: string };
const memo = new Map<string, Order>();

/**
 * A stop's list re-ranked under the sliders. Neutral sliders keep the stop's own order (no call). Otherwise one call to
 * /api/lean scores the same items under the leaned signal; each position is remembered for the session.
 */
export function useLean(type: string, ids: string[], signal: { id: string; weight: number }[], taste?: Taste): { order: string[]; affinity?: Record<string, number>; busy: boolean; note?: string } {
  const leaned = taste && !neutralLean(taste.lean) ? leanSignal(signal, taste.axes, taste.lean) : undefined;
  // A lean that changes no weight (none of this signal runs along the axis) changes no order.
  const moves = !!leaned && leaned.some((s, i) => Math.abs(s.weight / leaned[0].weight - signal[i].weight / signal[0].weight) > 0.01);
  const key = moves ? JSON.stringify([type, ids, leaned!.map((s) => [s.id, s.weight])]) : "";
  const [state, setState] = useState<{ key: string; got?: Order }>({ key: "" });
  useEffect(() => {
    if (!key || memo.has(key)) return;
    let live = true;
    setState({ key });
    fetch("/api/lean", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, ids, signal: leaned }) })
      .then((r) => r.json() as Promise<Order>)
      .then((d) => {
        if (!d.note && d.order?.length) memo.set(key, d);
        if (live) setState({ key, got: d });
      })
      .catch(() => live && setState({ key, got: { order: ids, affinity: {}, note: "Qloo is busy, so the list keeps its order for now." } }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!key) return { order: ids, busy: false, note: leaned ? "None of this list's signal runs along those axes, so its order holds." : undefined };
  const got = memo.get(key) ?? (state.key === key ? state.got : undefined);
  if (!got) return { order: ids, busy: true };
  // Keep only the stop's own items, in the new order, and any the answer missed at the end.
  const known = new Set(ids);
  const order = [...got.order.filter((id) => known.has(id)), ...ids.filter((id) => !got.order.includes(id))];
  return { order, affinity: got.affinity, busy: false, note: got.note };
}
