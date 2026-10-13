"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { domainWord, shortName, whyOf, type Domain, type Galaxy as GalaxyData } from "@/lib/taste/galaxy";
import type { Pin } from "@/lib/journey/types";
import { ordinal } from "./Blocks";

// The Taste Galaxy (PRD §13, v4.0): every entity the crowd loves, placed by how the probed landmarks rank it. It forms
// live, round by round, as the agent probes Qloo; the crowds settle into hulls drawn round their
// cores. Hover shows why an entity sits where it does (from the probes already made, 0 calls); click marks it as the
// founder's customers' or not, and that changes every later ranking. Shape is the domain, colour the crowd (never
// colour alone), size how much more this crowd loves it than its popularity predicts. Solid entities are a crowd's
// core (placed more surely than shuffled data allows); faint ones are its fringe.

const W = 720;
const H = 440;
const SLOTS = 4;

type SimNode = SimulationNodeDatum & { id: string; i: number; tx: number; ty: number; r: number };
type SimLink = SimulationLinkDatum<SimNode> & { s: number };

const radius = (specificity: number) => 3.5 + 7 * Math.min(1, Math.max(0, (specificity + 0.15) / 0.45));

/** A path for each domain's shape, centred on 0,0. */
function shape(d: Domain, r: number): string {
  const poly = (n: number, rr: number, start: number) =>
    Array.from({ length: n }, (_, k) => {
      const a = start + (k * 2 * Math.PI) / n;
      return `${k ? "L" : "M"}${(rr * Math.cos(a)).toFixed(2)} ${(rr * Math.sin(a)).toFixed(2)}`;
    }).join("") + "Z";
  switch (d) {
    case "brand":
      return `M${r} 0A${r} ${r} 0 1 0 ${-r} 0A${r} ${r} 0 1 0 ${r} 0Z`;
    case "artist":
      return poly(3, r * 1.3, -Math.PI / 2);
    case "tv_show":
      return poly(4, r * 1.2, Math.PI / 4);
    case "movie":
      return poly(4, r * 1.3, 0);
    case "podcast":
      return poly(6, r * 1.1, 0);
    default:
      return `M${-r * 1.15} ${-r * 0.75}h${r * 2.3}v${r * 1.5}h${-r * 2.3}Z`;
  }
}

/** Convex hull (Andrew's monotone chain) of points. */
function hull(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Click to probe: founder probes per map (the server's MAX_EXTRA). */
const MAX_PROBES = 4;

const corr = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type Props = {
  galaxy: GalaxyData;
  /** Crowd names by index, once the crowds are named. */
  names?: string[];
  pins: Record<string, Pin>;
  onPin: (id: string, name: string, pin: Pin["pin"] | undefined) => void;
  /** What the agent is doing right now, while the galaxy forms. */
  step?: string;
  /** Click to probe (§13.11): entities the founder probed, and the call to probe one more. */
  probes?: string[];
  onProbe?: (id: string, name: string) => void;
  /** The narrated line while a probe runs. */
  probing?: string;
  /** Linked views (§9.26): the crowd lit from the map or the crowd cards, and the crowd under the pointer here. */
  lit?: number | null;
  onLight?: (c: number | null) => void;
};

export function Galaxy({ galaxy, names, pins, onPin, step, probes: yourProbes = [], onProbe, probing, lit = null, onLight }: Props) {
  const sim = useRef<Simulation<SimNode, SimLink> | null>(null);
  const simNodes = useRef(new Map<string, SimNode>());
  const lastTargets = useRef<{ round: number; x: Map<string, number>; y: Map<string, number> } | null>(null);
  const lastSlot = useRef(new Map<string, number>());
  const [, setFrame] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [list, setList] = useState(false);

  // Crowd colours stay put while the galaxy forms: each round's clusters take the colour most of their members had.
  const slotOf = useMemo(() => {
    const labels = [...new Set(galaxy.nodes.map((n) => n.crowd).filter((c) => c >= 0))].sort((a, b) => a - b);
    const map = new Map<number, number>();
    if (galaxy.done) labels.forEach((c) => map.set(c, c % SLOTS));
    else {
      const used = new Set<number>();
      const votes = labels.map((c) => {
        const count = new Map<number, number>();
        galaxy.nodes.forEach((n) => {
          const s = lastSlot.current.get(n.id);
          if (n.crowd === c && s !== undefined) count.set(s, (count.get(s) ?? 0) + 1);
        });
        return { c, count: [...count].sort((a, b) => b[1] - a[1]) };
      });
      for (const v of votes.sort((a, b) => (b.count[0]?.[1] ?? 0) - (a.count[0]?.[1] ?? 0))) {
        const s = v.count.find(([slot]) => !used.has(slot))?.[0] ?? [...Array(SLOTS).keys()].find((k) => !used.has(k)) ?? 0;
        used.add(s);
        map.set(v.c, s);
      }
    }
    const next = new Map<string, number>();
    galaxy.nodes.forEach((n) => n.crowd >= 0 && next.set(n.id, map.get(n.crowd)!));
    lastSlot.current = next;
    return map;
  }, [galaxy]);

  // Each snapshot moves the entities toward their new places; the simulation keeps them from overlapping.
  useEffect(() => {
    let tx = galaxy.nodes.map((n) => n.x);
    let ty = galaxy.nodes.map((n) => n.y);
    const prev = lastTargets.current;
    if (prev && prev.round > 0 && galaxy.round > 0) {
      // Eigenvectors have no fixed sign or order: turn the new layout to match the last one, so nothing jumps.
      const px = galaxy.nodes.map((n) => prev.x.get(n.id) ?? 0);
      const py = galaxy.nodes.map((n) => prev.y.get(n.id) ?? 0);
      if (Math.abs(corr(tx, py)) + Math.abs(corr(ty, px)) > Math.abs(corr(tx, px)) + Math.abs(corr(ty, py))) [tx, ty] = [ty, tx];
      if (corr(tx, px) < 0) tx = tx.map((v) => -v);
      if (corr(ty, py) < 0) ty = ty.map((v) => -v);
    }
    lastTargets.current = { round: galaxy.round, x: new Map(galaxy.nodes.map((n, i) => [n.id, tx[i]])), y: new Map(galaxy.nodes.map((n, i) => [n.id, ty[i]])) };
    const nodes: SimNode[] = galaxy.nodes.map((n, i) => {
      const s = simNodes.current.get(n.id) ?? { id: n.id, i, tx: 0, ty: 0, r: 0, x: W / 2 + (Math.random() - 0.5) * 20, y: H / 2 + (Math.random() - 0.5) * 20 };
      s.i = i;
      s.tx = W / 2 + tx[i] * (W / 2 - 70);
      s.ty = H / 2 + ty[i] * (H / 2 - 50);
      s.r = radius(n.specificity);
      return s;
    });
    simNodes.current = new Map(nodes.map((n) => [n.id, n]));
    const links: SimLink[] = galaxy.edges.map(([i, j, s]) => ({ source: nodes[i], target: nodes[j], s }));
    sim.current?.stop();
    const sm = forceSimulation(nodes)
      .force("x", forceX<SimNode>((d) => d.tx).strength(0.14))
      .force("y", forceY<SimNode>((d) => d.ty).strength(0.14))
      .force("link", forceLink<SimNode, SimLink>(links).strength((l) => l.s * 0.05).distance(24))
      .force("charge", forceManyBody<SimNode>().strength(-5))
      .force("collide", forceCollide<SimNode>((d) => d.r + 1.5))
      .alpha(galaxy.round === 0 ? 1 : 0.7)
      .alphaDecay(0.035);
    sim.current = sm;
    if (reducedMotion()) {
      sm.stop();
      sm.tick(220);
      setFrame((f) => f + 1);
      return;
    }
    let raf = 0;
    sm.on("tick", () => {
      if (!raf) raf = requestAnimationFrame(() => ((raf = 0), setFrame((f) => f + 1)));
    });
    return () => {
      sm.stop();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [galaxy]);

  const pos = galaxy.nodes.map((n) => simNodes.current.get(n.id) ?? { x: W / 2, y: H / 2, r: radius(n.specificity) });
  const neighbours = useMemo(() => {
    const m = galaxy.nodes.map(() => [] as { j: number; s: number }[]);
    for (const [i, j, s] of galaxy.edges) m[i]?.push({ j, s }), m[j]?.push({ j: i, s });
    return m;
  }, [galaxy]);
  const focus = hover ?? sel;
  const near = focus === null ? null : new Set([focus, ...neighbours[focus].map((x) => x.j)]);
  const dim = (i: number) => (near ? !near.has(i) : lit !== null && galaxy.nodes[i].crowd !== lit);
  const colour = (c: number) => (c >= 0 ? `var(--crowd-${slotOf.get(c) ?? 0})` : "var(--muted)");

  // Hulls around each crowd's core (all its members while forming, or when it has under 3 at the core).
  const crowds = [...new Set(galaxy.nodes.map((n) => n.crowd).filter((c) => c >= 0))].sort((a, b) => a - b);
  const hulls = crowds.map((c) => {
    const members = galaxy.nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.crowd === c);
    const core = members.filter(({ n }) => n.core);
    return { c, pts: hull((core.length >= 3 ? core : members).map(({ i }) => [pos[i].x ?? 0, pos[i].y ?? 0] as [number, number])) };
  });

  // The seed sits where the entities its crowd loves most are.
  const top = galaxy.nodes.map((n, i) => ({ a: n.affinity, i })).sort((a, b) => b.a - a.a).slice(0, Math.max(3, Math.round(galaxy.nodes.length / 10)));
  const seedAt = { x: top.reduce((s, t) => s + (pos[t.i].x ?? 0), 0) / top.length, y: top.reduce((s, t) => s + (pos[t.i].y ?? 0), 0) / top.length };

  // A few names stay on: while forming, the newest probes; once settled, each crowd's strongest central members.
  const labelled = new Set<number>();
  if (!galaxy.done) {
    const newest = new Set(galaxy.landmarks.slice(-3).map((l) => l.id));
    galaxy.nodes.forEach((n, i) => newest.has(n.id) && labelled.add(i));
  } else
    for (const c of crowds)
      galaxy.nodes
        .map((n, i) => ({ n, i }))
        .filter(({ n }) => n.crowd === c)
        .sort((a, b) => Number(b.n.core) - Number(a.n.core) || b.n.affinity * b.n.certainty - a.n.affinity * a.n.certainty)
        .slice(0, 2)
        .forEach(({ i }) => labelled.add(i));
  if (focus !== null) labelled.add(focus);
  const q = galaxy.question;
  const qi = q ? galaxy.nodes.findIndex((n) => n.id === q.id) : -1;
  if (qi >= 0 && !pins[q!.id]) labelled.add(qi);

  const probes = galaxy.landmarks.length - 1;
  const crowdName = (c: number) => names?.[c] ?? `Crowd ${c + 1}`;

  const canProbe = !!onProbe && galaxy.done && yourProbes.length < MAX_PROBES && !probing;
  const card =
    focus !== null ? (
      <EntityCard
        g={galaxy}
        i={focus}
        at={pos[focus]}
        crowdName={crowdName}
        pin={pins[galaxy.nodes[focus].id]}
        pinned={sel === focus}
        onPin={onPin}
        onClose={() => setSel(null)}
        yours={yourProbes.includes(galaxy.nodes[focus].id)}
        onProbe={canProbe && !galaxy.nodes[focus].landmark ? () => (onProbe!(galaxy.nodes[focus].id, shortName(galaxy.nodes[focus].name, galaxy.nodes[focus].domain)), setSel(null)) : undefined}
      />
    ) : null;

  return (
    <section className="galaxy card" aria-label="Taste Galaxy">
      <header className="galaxy-head">
        <h3>Taste Galaxy</h3>
        <p className="small muted galaxy-method">
          {galaxy.done
            ? `${galaxy.nodes.length} things this crowd loves, placed by how ${probes} probe entities rank each one. ${galaxy.calls} Qloo calls. Solid: a crowd's core, placed more surely than shuffled data allows.`
            : galaxy.round === 0
              ? `${galaxy.nodes.length} things this crowd loves, nearer the middle the more it loves them. ${galaxy.calls} Qloo calls so far.`
              : `Round ${galaxy.round}: ${probes} probes, ${galaxy.calls} Qloo calls so far.`}
        </p>
        <button type="button" className="linkish small" aria-pressed={list} onClick={() => setList((v) => !v)}>{list ? "Show the map" : "Show as a list"}</button>
      </header>

      {list ? (
        <GalaxyList g={galaxy} crowds={crowds} crowdName={crowdName} colour={colour} pins={pins} onPin={onPin} />
      ) : (
        <div className="galaxy-stage" onMouseLeave={() => (setHover(null), onLight?.(null))}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Taste Galaxy: ${galaxy.nodes.length} entities in ${crowds.length || "no"} crowds. Use "Show as a list" for every name.`} onClick={() => setSel(null)}>
            <g className="hulls">
              {hulls.map(({ c, pts }) =>
                pts.length >= 3 ? <path key={c} d={`M${pts.map((p) => p.join(" ")).join("L")}Z`} style={{ fill: colour(c), stroke: colour(c) }} /> : null,
              )}
            </g>
            {focus !== null &&
              neighbours[focus].map(({ j, s }) => (
                <line key={j} className="galaxy-edge" x1={pos[focus].x} y1={pos[focus].y} x2={pos[j].x} y2={pos[j].y} style={{ opacity: 0.25 + 0.6 * s }} />
              ))}
            <g className="seed" transform={`translate(${seedAt.x},${seedAt.y})`}>
              <path d="M0 -9L2.5 -2.5L9 0L2.5 2.5L0 9L-2.5 2.5L-9 0L-2.5 -2.5Z" />
              <text y={-13} textAnchor="middle">{galaxy.landmarks[0]?.name}</text>
            </g>
            {galaxy.nodes.map((n, i) => {
              const p = pos[i];
              const pin = pins[n.id]?.pin;
              return (
                <g
                  key={n.id}
                  className={`gnode${dim(i) ? " faded" : ""}${pin === "not_us" ? " out" : ""}${sel === i ? " sel" : ""}${n.core ? "" : " fringe"}`}
                  transform={`translate(${(p.x ?? 0).toFixed(1)},${(p.y ?? 0).toFixed(1)})`}
                  onMouseEnter={() => (setHover(i), onLight?.(n.crowd >= 0 ? n.crowd : null))}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSel(i);
                  }}
                >
                  {n.landmark && <circle className="ring" r={p.r + 3.5} />}
                  <path d={shape(n.domain, p.r)} style={{ fill: colour(n.crowd) }} className={pin === "us" ? "us" : ""} />
                </g>
              );
            })}
            <g className="labels" aria-hidden>
              {[...labelled].map((i) => {
                // Labels on the right third read leftwards so they stay inside the frame.
                const left = (pos[i].x ?? 0) > (2 * W) / 3;
                return (
                  <text
                    key={i}
                    x={(pos[i].x ?? 0) + (left ? -1 : 1) * (pos[i].r + 4)}
                    y={(pos[i].y ?? 0) + 3.5}
                    textAnchor={left ? "end" : "start"}
                    className={i === focus ? "strong" : ""}
                  >
                    {shortName(galaxy.nodes[i].name, galaxy.nodes[i].domain).slice(0, 34)}
                  </text>
                );
              })}
            </g>
            {galaxy.done &&
              hulls.map(({ c, pts }) => {
                if (!pts.length) return null;
                const topPt = pts.reduce((a, b) => (b[1] < a[1] ? b : a));
                return (
                  <text key={`h${c}`} className="hull-label" x={Math.min(W - 60, Math.max(60, topPt[0]))} y={Math.max(14, topPt[1] - 18)} textAnchor="middle" style={{ fill: colour(c) }}>
                    {crowdName(c)}
                  </text>
                );
              })}
          </svg>
          {card}
        </div>
      )}

      {probing && (
        <p className="galaxy-step small" role="status">
          <span className="spin" aria-hidden />
          <span className="shimmer-text">{probing}</span>
        </p>
      )}
      {!galaxy.done && step && (
        <p className="galaxy-step small">
          <span className="spin" aria-hidden />
          <span className="shimmer-text">{step}</span>
        </p>
      )}
      {galaxy.done && q && <Question q={q} crowdName={crowdName} pin={pins[q.id]} onPin={onPin} />}
      {!list && <Legend />}
    </section>
  );
}

/** The hover card: what the entity is, why it sits here (the probes that rank it highest), and the founder's pin. */
function EntityCard({ g, i, at, crowdName, pin, pinned, onPin, onClose, yours, onProbe }: { g: GalaxyData; i: number; at: { x?: number; y?: number }; crowdName: (c: number) => string; pin?: Pin; pinned: boolean; onPin: Props["onPin"]; onClose: () => void; yours: boolean; onProbe?: () => void }) {
  const n = g.nodes[i];
  const why = g.round > 0 ? whyOf(g, i, 3) : [];
  const left = ((at.x ?? 0) / W) * 100;
  const topPct = ((at.y ?? 0) / H) * 100;
  const spec = Math.round(n.specificity * 100);
  return (
    <div className={`galaxy-card${pinned ? " pinned" : ""}`} style={{ left: `${left}%`, top: `${topPct}%`, transform: `translate(${left > 58 ? "calc(-100% - 14px)" : "14px"}, ${topPct > 60 ? "-100%" : "-12px"})` }} onClick={(e) => e.stopPropagation()}>
      <strong>{shortName(n.name, n.domain)}</strong>
      <span className="small muted">
        {domainWord(n.domain)}
        {n.crowd >= 0 ? ` · ${g.done && !n.core ? `fringe of ${crowdName(n.crowd)}` : crowdName(n.crowd)}` : ""}
        {n.landmark ? (yours ? " · probed at your request" : " · probed") : ""}
      </span>
      {!!why.length && (
        <p className="small">
          <span className="muted">Ranked highest by </span>
          {why.map((w, k) => (
            <span key={k}>
              {k ? ", " : ""}
              {shortName(w.landmark, "book")} <span className="muted">({ordinal(Math.round(w.pct * 100))})</span>
            </span>
          ))}
        </p>
      )}
      {spec >= 5 && <p className="small">Loved here {spec} points more than its popularity predicts</p>}
      {spec <= -5 && <p className="small muted">More popular in general than with this crowd in particular</p>}
      {g.done && n.certainty < 1 && (
        <p className="small muted">
          In this crowd in {Math.round(n.certainty * 100)}% of resamples{g.coreAt !== undefined ? `; shuffled data reaches ${Math.round(g.coreAt * 100)}%` : ""}
        </p>
      )}
      {pinned ? (
        <div className="react">
          <button type="button" className={pin?.pin === "us" ? "on" : ""} aria-pressed={pin?.pin === "us"} onClick={() => onPin(n.id, n.name, pin?.pin === "us" ? undefined : "us")}>Our customers love this</button>
          <button type="button" className={pin?.pin === "not_us" ? "on" : ""} aria-pressed={pin?.pin === "not_us"} onClick={() => onPin(n.id, n.name, pin?.pin === "not_us" ? undefined : "not_us")}>Not us</button>
          <button type="button" className="linkish small" aria-label="Close" onClick={onClose}>✕</button>
          {onProbe && (
            <button type="button" className="linkish small probe-btn" onClick={onProbe} title="About 6 Qloo calls">
              Probe it: re-form the map around its fans
            </button>
          )}
        </div>
      ) : (
        <span className="small muted">Click to mark it</span>
      )}
    </div>
  );
}

/** The agent's one question (E8): the familiar entity most evenly between two crowds, where an answer moves the plan most. */
function Question({ q, crowdName, pin, onPin }: { q: NonNullable<GalaxyData["question"]>; crowdName: (c: number) => string; pin?: Pin; onPin: Props["onPin"] }) {
  if (pin)
    return (
      <p className="galaxy-question small">
        Noted: {q.name} {pin.pin === "us" ? "now leads every ranking that follows." : "is left out of every ranking that follows."}{" "}
        <button type="button" className="linkish small" onClick={() => onPin(q.id, q.name, undefined)}>Undo</button>
      </p>
    );
  return (
    <div className="galaxy-question">
      <p>
        <strong>One question.</strong> Would your customers love <strong>{q.name}</strong>? It sits between {crowdName(q.crowds[0])} and {crowdName(q.crowds[1])}, so your answer tells me which way to lean.
      </p>
      <div className="react">
        <button type="button" onClick={() => onPin(q.id, q.name, "us")}>Yes, they would</button>
        <button type="button" onClick={() => onPin(q.id, q.name, "not_us")}>Not really</button>
      </div>
    </div>
  );
}

function GalaxyList({ g, crowds, crowdName, colour, pins, onPin }: { g: GalaxyData; crowds: number[]; crowdName: (c: number) => string; colour: (c: number) => string; pins: Record<string, Pin>; onPin: Props["onPin"] }) {
  const groups = crowds.length ? crowds : [-1];
  return (
    <div className="galaxy-list">
      {groups.map((c) => (
        <div key={c}>
          <h4>
            <span className="swatch" style={{ background: colour(c) }} aria-hidden /> {c >= 0 ? crowdName(c) : "Everything so far"}
          </h4>
          <ul>
            {g.nodes
              .map((n, i) => ({ n, i }))
              .filter(({ n }) => n.crowd === c)
              .sort((a, b) => Number(b.n.core) - Number(a.n.core) || b.n.affinity - a.n.affinity)
              .map(({ n }) => {
                const pin = pins[n.id]?.pin;
                return (
                  <li key={n.id}>
                    <span className="grow">
                      {shortName(n.name, n.domain)} <small className="muted">{domainWord(n.domain)}{g.done && !n.core ? ", fringe" : ""}</small>
                    </span>
                    <button type="button" className={pin === "us" ? "on" : ""} aria-pressed={pin === "us"} aria-label={`Our customers love ${n.name}`} onClick={() => onPin(n.id, n.name, pin === "us" ? undefined : "us")}>Us</button>
                    <button type="button" className={pin === "not_us" ? "on" : ""} aria-pressed={pin === "not_us"} aria-label={`${n.name} is not us`} onClick={() => onPin(n.id, n.name, pin === "not_us" ? undefined : "not_us")}>Not us</button>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}

const LEGEND: Domain[] = ["brand", "artist", "tv_show", "movie", "podcast", "book"];

function Legend() {
  return (
    <ul className="galaxy-legend small muted" aria-label="Legend">
      {LEGEND.map((d) => (
        <li key={d}>
          <svg viewBox="-8 -8 16 16" width="14" height="14" aria-hidden><path d={shape(d, 5)} /></svg>
          {domainWord(d)}
        </li>
      ))}
      <li>Bigger: loved here beyond its popularity</li>
      <li>
        <svg viewBox="-9 -9 18 18" width="14" height="14" aria-hidden><circle r="7" className="legend-ring" /></svg>
        probed
      </li>
      <li>
        <svg viewBox="-9 -9 18 18" width="14" height="14" aria-hidden><circle r="5" className="legend-fringe" /></svg>
        faint: a crowd&apos;s fringe
      </li>
    </ul>
  );
}
