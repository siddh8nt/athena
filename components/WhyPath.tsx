"use client";

import { useState } from "react";
import type { Contribution } from "@/lib/qloo/types";

// Why-paths (§9.28): a small Sankey from the crowd's signal entities, through each one's contribution, to the picks.
// The contributions are Qloo's own explainability on the ranking call, so the diagram costs no extra call. When
// Qloo explains nothing, the stop keeps its one-line reasons and no diagram is drawn.

export type WhyPick = { id: string; name: string; why?: Contribution[] };

const W = 640;
const ROW = 30;
const GAP = 8;
const LEFT = 196;
const RIGHT = 444;
const BAR = 8;

/** "Show me why" for a ranked list: the button, and the diagram once opened. */
export function ShowWhy({ crowd, names, picks, top = 5 }: { crowd: string; names: Record<string, string>; picks: WhyPick[]; top?: number }) {
  const [open, setOpen] = useState(false);
  const shown = picks.slice(0, top).filter((p) => p.why?.some((c) => names[c.id]));
  if (!shown.length) return null;
  return (
    <div className="why-path">
      <button type="button" className="linkish small" aria-expanded={open} onClick={() => setOpen((x) => !x)}>
        {open ? "Hide why" : "Show me why"}
      </button>
      {open && <WhyPath crowd={crowd} names={names} picks={shown} />}
    </div>
  );
}

export function WhyPath({ crowd, names, picks }: { crowd: string; names: Record<string, string>; picks: WhyPick[] }) {
  const [hot, setHot] = useState<string | null>(null);
  // Links: each pick's named contributions; sources ordered by their total pull over the picks shown.
  const links = picks.flatMap((p) => (p.why ?? []).filter((c) => names[c.id]).map((c) => ({ from: c.id, to: p.id, score: c.score })));
  const total = new Map<string, number>();
  for (const l of links) total.set(l.from, (total.get(l.from) ?? 0) + l.score);
  const sources = [...total.keys()].sort((a, b) => total.get(b)! - total.get(a)!).slice(0, 8);
  const kept = links.filter((l) => sources.includes(l.from));
  const pickTotal = new Map<string, number>();
  for (const l of kept) pickTotal.set(l.to, (pickTotal.get(l.to) ?? 0) + l.score);

  // One scale for both sides: the busier side fills its rows.
  const rows = Math.max(sources.length, picks.length);
  const height = rows * ROW + (rows - 1) * GAP;
  const sumL = sources.reduce((s, id) => s + total.get(id)!, 0);
  const sumR = picks.reduce((s, p) => s + (pickTotal.get(p.id) ?? 0), 0);
  const scale = Math.min((height - (sources.length - 1) * GAP) / (sumL || 1), (height - (picks.length - 1) * GAP) / (sumR || 1));
  const place = (ids: string[], size: (id: string) => number) => {
    const used = ids.reduce((s, id) => s + size(id) * scale, 0) + (ids.length - 1) * GAP;
    let y = (height - used) / 2;
    return new Map(ids.map((id) => {
      const h = size(id) * scale;
      const at = { y, h };
      y += h + GAP;
      return [id, at];
    }));
  };
  const left = place(sources, (id) => total.get(id)!);
  const right = place(picks.map((p) => p.id), (id) => pickTotal.get(id) ?? 0);
  // Stack each node's links in order, so ribbons leave and arrive without crossing inside a node.
  const outY = new Map([...left].map(([id, n]) => [id, n.y]));
  const inY = new Map([...right].map(([id, n]) => [id, n.y]));
  const ribbons = picks.flatMap((p) =>
    kept
      .filter((l) => l.to === p.id)
      .sort((a, b) => sources.indexOf(a.from) - sources.indexOf(b.from))
      .map((l) => {
        const h = l.score * scale;
        const y0 = outY.get(l.from)!;
        const y1 = inY.get(l.to)!;
        outY.set(l.from, y0 + h);
        inY.set(l.to, y1 + h);
        return { ...l, h, y0: y0 + h / 2, y1: y1 + h / 2 };
      }),
  );
  const x0 = LEFT + BAR;
  const x1 = RIGHT;
  const mid = (x0 + x1) / 2;
  const lit = (l: { from: string; to: string }) => !hot || hot === l.from || hot === l.to;
  const name = (p: WhyPick) => (p.name.length > 26 ? `${p.name.slice(0, 25)}…` : p.name);

  return (
    <figure className="why-figure">
      <svg viewBox={`0 0 ${W} ${height + 24}`} role="img" aria-label={`Why these picks: which of ${crowd}'s favourites pulled each one up`}>
        <text x={LEFT + BAR} y={10} textAnchor="end" className="why-head">{crowd}</text>
        <text x={RIGHT} y={10} className="why-head">Picks</text>
        <g transform="translate(0 20)">
          {ribbons.map((l, i) => (
            <path
              key={i}
              d={`M${x0},${l.y0} C${mid},${l.y0} ${mid},${l.y1} ${x1},${l.y1}`}
              className={`why-link${lit(l) ? "" : " dim"}`}
              strokeWidth={Math.max(1, l.h)}
            >
              <title>{`${names[l.from]} → ${picks.find((p) => p.id === l.to)?.name}: ${Math.round(l.score * 100)}% of its pull`}</title>
            </path>
          ))}
          {sources.map((id) => {
            const n = left.get(id)!;
            return (
              <g key={id} onMouseEnter={() => setHot(id)} onMouseLeave={() => setHot(null)} className="why-node">
                <rect x={LEFT} y={n.y} width={BAR} height={Math.max(2, n.h)} rx={2} />
                <text x={LEFT - 6} y={n.y + n.h / 2} dy="0.35em" textAnchor="end">{names[id]}</text>
              </g>
            );
          })}
          {picks.map((p) => {
            const n = right.get(p.id)!;
            return (
              <g key={p.id} onMouseEnter={() => setHot(p.id)} onMouseLeave={() => setHot(null)} className="why-node pick">
                <rect x={RIGHT} y={n.y} width={BAR} height={Math.max(2, n.h)} rx={2} />
                <text x={RIGHT + BAR + 6} y={n.y + n.h / 2} dy="0.35em">{name(p)}</text>
              </g>
            );
          })}
        </g>
      </svg>
      <figcaption className="small muted">
        How much each of {crowd}&apos;s favourites pulled each pick up, from Qloo&apos;s explainability on the ranking call (no extra calls). Hover to follow one.
      </figcaption>
    </figure>
  );
}
