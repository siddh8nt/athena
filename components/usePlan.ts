"use client";

import { useEffect, useReducer } from "react";
import type { PlanEvent, ReadCard } from "@/lib/agent/plan";
import type { AgentEvent, BlockMeta } from "@/lib/blocks/types";
import type { Block } from "@/lib/playbook/config";

export type PlanState = {
  key: string;
  status: "loading" | "streaming" | "done";
  card?: ReadCard;
  cardMeta?: BlockMeta;
  blocks: Partial<Record<Block, { meta: BlockMeta; data: unknown }>>;
  rail: AgentEvent[];
  qlooCalls?: number;
  ms?: number;
};

/** A demo brand by slug, or any brand from the intake card (M10). */
export type PlanSource =
  | { kind: "demo"; slug: string }
  | { kind: "custom"; input: Record<string, unknown>; id: number };

type Action = { type: "reset"; key: string } | { type: "event"; e: PlanEvent };

function reducer(s: PlanState, a: Action): PlanState {
  if (a.type === "reset") return { key: a.key, status: "loading", blocks: {}, rail: [] };
  const e = a.e;
  if (e.type === "event") return { ...s, status: "streaming", rail: [...s.rail, e.event] };
  if (e.type === "card") return { ...s, status: "streaming", card: e.card, cardMeta: e.meta };
  if (e.type === "block") return { ...s, blocks: { ...s.blocks, [e.block]: { meta: e.meta, data: e.data } } };
  if (e.type === "done") return { ...s, status: "done", qlooCalls: e.qlooCalls, ms: e.ms };
  return s; // Errors never reach the screen (the server doesn't send them).
}

const keyOf = (src: PlanSource) => (src.kind === "demo" ? `demo:${src.slug}` : `custom:${src.id}`);

/** Streams /api/plan as server-sent events and folds them into state. Drops reconnect quietly (up to 5 times). */
export function usePlan(source: PlanSource): PlanState {
  const key = keyOf(source);
  const [state, dispatch] = useReducer(reducer, { key, status: "loading", blocks: {}, rail: [] });
  useEffect(() => {
    dispatch({ type: "reset", key });
    const abort = new AbortController();
    let finished = false;
    const run = async (tries: number): Promise<void> => {
      try {
        const res = await fetch(source.kind === "demo" ? `/api/plan/${source.slug}` : "/api/plan", {
          method: source.kind === "demo" ? "GET" : "POST",
          headers: source.kind === "custom" ? { "Content-Type": "application/json" } : undefined,
          body: source.kind === "custom" ? JSON.stringify(source.input) : undefined,
          signal: abort.signal,
        });
        if (!res.body) throw new Error("no stream");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, i).trim();
            buf = buf.slice(i + 2);
            if (!chunk.startsWith("data:")) continue;
            const e = JSON.parse(chunk.slice(5)) as PlanEvent;
            dispatch({ type: "event", e });
            if (e.type === "done") finished = true;
          }
        }
      } catch {
        // Network blip or aborted: fall through to a quiet retry.
      }
      if (!finished && !abort.signal.aborted && tries < 5) {
        await new Promise((r) => setTimeout(r, 1000 * (tries + 1)));
        if (!abort.signal.aborted) return run(tries + 1);
      }
    };
    run(0);
    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
