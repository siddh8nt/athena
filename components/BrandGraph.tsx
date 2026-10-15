"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { forceCollide, forceLink, forceManyBody, forceRadial, forceSimulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import { select } from "d3-selection";
import { Question } from "./Question";
import type { FileChip } from "./chat";
import { sourceLabel } from "@/lib/brief/source";
import type { Sourced } from "@/lib/brief/types";
import { allNodes, buildGraph, fromLabel, listGroups } from "@/lib/graph/build";
import type { EditQuestion, GraphState, Op, SetField } from "@/lib/graph/edit";
import { shapePath } from "@/lib/graph/shapes";
import { RUN_LABEL, staleLine, type RunId } from "@/lib/graph/stale";
import { BRAND, EDGE_TYPES, NODE_TYPES, type GraphEdge, type GraphInput, type GraphNode } from "@/lib/graph/types";

// The Brand Graph (PRD §13.12, §23.2 step 7): the brand's one source of truth, first made at onboarding and read by
// every step after it. A fact strip on top, then the list (the main way to read it, and the only view on a phone)
// or the graph grown from the Galaxy. The founder edits facts, never taste: a fact is edited in place, added by typing
// (resolved first), hidden ("Remove") or marked wrong (which also stops every agent inferring it). What an edit
// changed flashes, with one Undo; the runs it moved are flagged, each with a one-click re-run.

const W = 720;
const H = 460;
const RING = [0, 120, 185, 225];
const FLASH_MS = 2400;

type Props = {
  input: GraphInput;
  state: GraphState;
  chips: FileChip[];
  /** The brief is still being written (onboarding): empty fields shimmer instead of asking. */
  busy: boolean;
  /** An edit being resolved: "Finding Sightglass…". */
  working?: string;
  questions: EditQuestion[];
  onEdit: (ops: Op[]) => void;
  onAnswer: (q: EditQuestion, answer: string) => void;
  onUndo: () => void;
  onRerun: (run: RunId) => void;
};

const nodeColour = (n: GraphNode) => {
  const c = NODE_TYPES[n.type].colour;
  return c === "crowd" ? `var(--crowd-${n.crowd ?? 0})` : c;
};
/** Founder-given nodes are solid; Athena's own reads and guesses are drawn hollow, so a guess never looks like a fact. */
const guessed = (n: GraphNode) => n.source.kind === "inferred" || n.source.kind === "agent_guess";

function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia?.("(max-width: 639px)");
    if (!m) return;
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function BrandGraph(props: Props) {
  const { input, state, chips, busy, working, questions, onEdit, onAnswer, onUndo, onRerun } = props;
  const narrow = useNarrow();
  const [view, setView] = useState<"list" | "graph">("list");
  const shown = narrow ? "list" : view;
  const last = state.log.at(-1);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [undid, setUndid] = useState<string>();
  // What a new edit changed flashes once: not again on a reload, nor when an undo uncovers the edit before it.
  const seen = useRef(new Set(state.log.map((e) => e.id)));
  useEffect(() => {
    if (!last || seen.current.has(last.id)) return;
    seen.current.add(last.id);
    setUndid(undefined);
    setFlash(new Set(last.changed));
    const t = setTimeout(() => setFlash(new Set()), FLASH_MS);
    return () => clearTimeout(t);
  }, [last?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const held = (Object.entries(state.held) as [RunId, NonNullable<GraphState["held"][RunId]>][]).filter(([, h]) => h);
  const b = input.brief;

  return (
    <section className="brand-graph card" aria-label="Brand Graph">
      <header className="bg-head">
        <div>
          <p className="bg-kicker">Brand Graph</p>
          <h2 className="bg-title">{b.name?.value || (busy ? "Reading your brand…" : "Your brand")}</h2>
        </div>
        {!narrow && (
          <div className="seg bg-views" role="radiogroup" aria-label="View">
            {(["list", "graph"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
                {v === "list" ? "List" : "Graph"}
              </button>
            ))}
          </div>
        )}
      </header>

      <FactStrip input={input} busy={busy} flash={flash} onEdit={onEdit} />

      {(last || undid) && (
        <p className="bg-note" role="status">
          {undid ? <>Undone: {undid}</> : last && <>{last.note}{last.before && <> · <button type="button" className="linkish" onClick={() => (setUndid(last.note.split(":")[0]), onUndo())}>Undo</button></>}</>}
        </p>
      )}
      {held.map(([run, h]) => (
        <StaleFlag key={run} run={run} line={staleLine(run, h)} onRerun={() => onRerun(run)} />
      ))}
      {working && <p className="bg-working small"><span className="spin" aria-hidden /> <span className="shimmer-text">{working}</span></p>}
      {questions.map((q) => (
        <Question key={q.id} q={q} onAnswer={(a) => onAnswer(q, a)} />
      ))}

      {shown === "graph" ? <GraphView input={input} flash={flash} onEdit={onEdit} /> : <ListView input={input} flash={flash} onEdit={onEdit} />}

      {!!b.research?.sources.length && (
        <details className="small research">
          <summary>Researched {b.research.sources.length} pages</summary>
          <ul>
            {b.research.sources.map((s, i) => (
              <li key={i}>{s.uri ? <a href={s.uri} target="_blank" rel="noreferrer noopener">{s.title ?? s.uri}</a> : s.title}</li>
            ))}
          </ul>
        </details>
      )}
      {b.qloo && <p className="small muted">{b.qloo.match ? `In Qloo as ${b.qloo.match.name}` : "Not in Qloo yet, which is normal for a young brand: I'll read brands like it"}</p>}
      {!!chips.length && (
        <ul className="file-chips">
          {chips.map((c, i) => <li key={i} className={c.busy ? "busy" : ""}><strong>{c.name}</strong> <span className="muted">{c.status}</span></li>)}
        </ul>
      )}
    </section>
  );
}

/** A run held on the inputs it ran on (§13.12): "Cities may change: you added a comparable. Re-run?" */
export function StaleFlag({ run, line, onRerun }: { run: RunId; line: string; onRerun: () => void }) {
  return (
    <p className="stale-flag small">
      {line}{" "}
      <button type="button" className="linkish" onClick={onRerun} aria-label={`Re-run ${RUN_LABEL[run]}`}>Re-run?</button>
    </p>
  );
}

const TIERS = ["mass", "mainstream", "premium", "luxury"];
const STRIP: { field: SetField; label: string; choices?: { value: string; label: string }[]; placeholder: string }[] = [
  { field: "name", label: "Name", placeholder: "Your brand's name" },
  { field: "sells", label: "What it sells", placeholder: "What you sell, in a line" },
  { field: "channel", label: "Channel", placeholder: "", choices: [{ value: "online", label: "Mostly online" }, { value: "offline", label: "Mostly in stores" }, { value: "both", label: "Online and in stores" }] },
  { field: "tierHint", label: "Tier", placeholder: "", choices: TIERS.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) })) },
  { field: "stageHint", label: "Stage", placeholder: "", choices: [{ value: "prelaunch", label: "Pre-launch" }, { value: "early", label: "Early stage" }, { value: "scaling", label: "Scaling" }] },
  { field: "activeCity", label: "Home city", placeholder: "Where you're based" },
];

/** The fact strip (§13.12): name, what it sells, channel, tier, stage and home city, each with its source, edited in place. */
function FactStrip({ input, busy, flash, onEdit }: { input: GraphInput; busy: boolean; flash: Set<string>; onEdit: (ops: Op[]) => void }) {
  const [open, setOpen] = useState<SetField>();
  const [draft, setDraft] = useState("");
  const b = input.brief;
  const commit = (field: SetField, value: string) => {
    setOpen(undefined);
    const v = value.trim();
    if (v && v !== (b[field] as Sourced<string> | undefined)?.value) onEdit([{ op: "set", field, value: v }]);
  };
  return (
    <dl className="bg-strip">
      {STRIP.map((f) => {
        const s = b[f.field] as Sourced<string> | undefined;
        const value = s?.value ?? "";
        const label = f.choices?.find((c) => c.value === value)?.label ?? value;
        const lit = flash.has(f.field === "name" || f.field === "sells" ? BRAND : `trait:${f.field}`);
        return (
          <div key={f.field} className={`bg-fact${lit ? " flash" : ""}`}>
            <dt>{f.label}</dt>
            <dd>
              {open === f.field ? (
                f.choices ? (
                  <select autoFocus value={value} aria-label={f.label} onChange={(e) => commit(f.field, e.target.value)} onBlur={() => setOpen(undefined)}>
                    {!value && <option value="">Choose…</option>}
                    {f.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                ) : (
                  <form onSubmit={(e) => (e.preventDefault(), commit(f.field, draft))}>
                    <input
                      autoFocus
                      value={draft}
                      maxLength={200}
                      aria-label={f.label}
                      placeholder={f.placeholder}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => commit(f.field, draft)}
                      onKeyDown={(e) => e.key === "Escape" && setOpen(undefined)}
                    />
                  </form>
                )
              ) : (
                <button type="button" className="bg-value" onClick={() => (setDraft(value), setOpen(f.field))} aria-label={`${f.label}: ${label || "not set"}. Edit`}>
                  {label || (busy && (f.field === "name" || f.field === "sells") ? <span className="shimmer-bar" aria-hidden /> : <span className="muted">Add</span>)}
                </button>
              )}
              {s && open !== f.field && <small className={`src src-${s.source.kind}`}>{sourceLabel(s.source, s.confirmed)}</small>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Remove and Wrong, for the founder's facts only (§23.2 step 7c: facts, never taste). */
function Actions({ n, onEdit }: { n: GraphNode; onEdit: (ops: Op[]) => void }) {
  if (NODE_TYPES[n.type].edit !== "fact" || n.members) return null;
  return (
    <span className="bg-actions">
      <button type="button" className="linkish" onClick={() => onEdit([{ op: "remove", node: n.id }])} title="Hide it from the graph; Athena still reads it">Remove</button>
      <button type="button" className="linkish" onClick={() => onEdit([{ op: "wrong", node: n.id }])} title="It's wrong: hide it, and Athena stops inferring it">Wrong</button>
    </span>
  );
}

function Swatch({ n, type }: { n?: GraphNode; type: string }) {
  const t = NODE_TYPES[type];
  const fill = n ? nodeColour(n) : t.colour === "crowd" ? "var(--crowd-0)" : t.colour;
  const hollow = n ? guessed(n) : false;
  return (
    <svg className="bg-swatch" width="14" height="14" viewBox="-7 -7 14 14" aria-hidden>
      <path d={shapePath(t.shape, 4.5)} fill={hollow ? "none" : fill} stroke={fill} strokeWidth={1.5} />
    </svg>
  );
}

/** Add by typing (§23.2 step 7c): the name is resolved before it joins (a brand in Qloo, a venue or a city). */
function AddRow({ type, onEdit }: { type: string; onEdit: (ops: Op[]) => void }) {
  const t = NODE_TYPES[type];
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [city, setCity] = useState("");
  if (!t.add) return null;
  const venue = t.add.kind === "venue";
  if (!open) return <button type="button" className="linkish bg-add" onClick={() => setOpen(true)}>+ Add {t.label.toLowerCase()}</button>;
  return (
    <form
      className="bg-add-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onEdit([{ op: "add", type: type as Extract<Op, { op: "add" }>["type"], value: value.trim(), ...(venue && city.trim() ? { city: city.trim() } : {}) }]);
        setValue("");
        setCity("");
        setOpen(false);
      }}
    >
      <input autoFocus value={value} maxLength={120} placeholder={venue ? "The shop's name" : t.add.placeholder} aria-label={t.add.placeholder} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)} />
      {venue && <input value={city} maxLength={80} placeholder="Its city" aria-label="Its city" onChange={(e) => setCity(e.target.value)} />}
      <button type="submit" disabled={!value.trim()}>Add</button>
      <button type="button" className="linkish" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}

/** Why a node is there, in words: the reason on its strongest edge (§13.12: every edge has a reason). */
function reasonOf(n: GraphNode, edges: GraphEdge[]): string | undefined {
  const e = edges.find((x) => x.from === n.id || x.to === n.id);
  return e?.reason;
}

/** The list view: the main way to read the graph (§23.2 step 7b), every type in the registry's order. */
function ListView({ input, flash, onEdit }: { input: GraphInput; flash: Set<string>; onEdit: (ops: Op[]) => void }) {
  const groups = listGroups(input);
  const edges = useMemo(() => allNodes(input).edges, [input]);
  const addable = Object.entries(NODE_TYPES).filter(([type, t]) => t.add && !groups.some((g) => g.type === type));
  return (
    <div className="bg-list">
      {groups
        .filter((g) => g.type !== "brand" && g.type !== "trait")
        .map(({ type, t, nodes }) => (
          <section key={type} className="bg-group">
            <h4 className="bg-label"><Swatch type={type} n={nodes[0]} /> {t.plural} <span className="bg-count">{nodes.length}</span></h4>
            <ul>
              {nodes.map((n) => {
                const why = n.tier?.reason || (t.ring >= 2 || n.type === "city" ? reasonOf(n, edges) : undefined);
                return (
                  <li key={n.id} className={flash.has(n.id) ? "flash" : ""}>
                    <div className="bg-row">
                      <Swatch type={type} n={n} />
                      <strong className="bg-name">{n.label}</strong>
                      {n.tier && <span className={`bg-tier${n.tier.watch ? " watch" : ""}`}>{n.tier.label}</span>}
                      {n.when && <span className="bg-when">{n.when}</span>}
                      <Actions n={n} onEdit={onEdit} />
                    </div>
                    {(n.detail || why) && <p className="bg-detail">{[n.detail, why].filter(Boolean).join(" · ")}</p>}
                    <small className={`src src-${n.source.kind}`}>{fromLabel(n)}</small>
                  </li>
                );
              })}
            </ul>
            <AddRow type={type} onEdit={onEdit} />
          </section>
        ))}
      {!!addable.length && (
        <section className="bg-group bg-empty">
          {addable.map(([type]) => <AddRow key={type} type={type} onEdit={onEdit} />)}
        </section>
      )}
    </div>
  );
}

type SimNode = SimulationNodeDatum & { id: string; r: number; ring: number };
type SimLink = SimulationLinkDatum<SimNode> & { id: string };

/** The graph view: grown from the Galaxy (d3-force, zoom and pan), shape and colour by type, never colour alone. */
function GraphView({ input, flash, onEdit }: { input: GraphInput; flash: Set<string>; onEdit: (ops: Op[]) => void }) {
  const g = useMemo(() => buildGraph(input), [input]);
  const svg = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const placed = useRef(new Map<string, { x: number; y: number }>());
  const [, setFrame] = useState(0);
  const [t, setT] = useState<ZoomTransform>(zoomIdentity);
  const [picked, setPicked] = useState<string>();
  const [tip, setTip] = useState<{ e: GraphEdge; x: number; y: number }>();
  const shape = JSON.stringify([g.nodes.map((n) => n.id), g.edges.map((e) => e.id)]);

  useEffect(() => {
    const prev = placed.current;
    const nodes: SimNode[] = g.nodes.map((n, i) => {
      const ty = NODE_TYPES[n.type];
      const p = prev.get(n.id);
      const a = (i / Math.max(1, g.nodes.length)) * Math.PI * 2;
      const r = n.members ? ty.size + 4 : ty.size;
      return n.id === BRAND ? { id: n.id, r, ring: 0, x: 0, y: 0, fx: 0, fy: 0 } : { id: n.id, r, ring: ty.ring, x: p?.x ?? Math.cos(a) * RING[ty.ring], y: p?.y ?? Math.sin(a) * RING[ty.ring] };
    });
    const ids = new Set(nodes.map((n) => n.id));
    const links: SimLink[] = g.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ id: e.id, source: e.from, target: e.to }));
    const sm = forceSimulation(nodes)
      .force("link", forceLink<SimNode, SimLink>(links).id((d) => d.id).distance((l) => 40 + 30 * Math.abs((l.source as SimNode).ring - (l.target as SimNode).ring)).strength(0.2))
      .force("radial", forceRadial<SimNode>((d) => RING[d.ring], 0, 0).strength(0.8))
      .force("charge", forceManyBody().strength(-70))
      .force("collide", forceCollide<SimNode>((d) => d.r + 10));
    const keep = () => nodes.forEach((n) => placed.current.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 }));
    if (reducedMotion()) {
      sm.stop();
      sm.tick(220);
      keep();
      setFrame((f) => f + 1);
      return;
    }
    // Nodes already placed hold still; only the new ones settle in.
    if (prev.size) sm.alpha(0.35);
    let raf = 0;
    sm.on("tick", () => {
      keep();
      if (!raf) raf = requestAnimationFrame(() => ((raf = 0), setFrame((f) => f + 1)));
    });
    return () => {
      sm.stop();
      cancelAnimationFrame(raf);
    };
  }, [shape]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!svg.current) return;
    const s = select(svg.current);
    s.call(zoom<SVGSVGElement, unknown>().scaleExtent([0.5, 4]).on("zoom", (e: { transform: ZoomTransform }) => setT(e.transform)));
    return () => void s.on(".zoom", null);
  }, []);

  const at = (id: string) => placed.current.get(id) ?? { x: 0, y: 0 };
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const node = picked ? byId.get(picked) : undefined;
  const labelled = (n: GraphNode) => n.id === BRAND || n.type === "crowd" || !!n.members || g.nodes.length <= 22 || picked === n.id;
  const types = [...new Set(g.nodes.map((n) => n.type))];
  const short = (s: string) => (s.length > 20 ? `${s.slice(0, 19)}…` : s);

  return (
    <div className="bg-graph" ref={wrap}>
      <svg ref={svg} viewBox={`${-W / 2} ${-H / 2} ${W} ${H}`} role="img" aria-label={`The Brand Graph: ${g.nodes.length} nodes. The list view reads the same graph.`} onClick={(e) => e.target === svg.current && setPicked(undefined)}>
        <g transform={t.toString()}>
          {g.edges.map((e) => {
            const a = at(e.from);
            const b = at(e.to);
            const lit = picked && (e.from === picked || e.to === picked);
            return (
              <g key={e.id}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`bg-edge${lit ? " lit" : ""}${tip?.e.id === e.id ? " hover" : ""}`} />
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className="bg-edge-hit"
                  onMouseMove={(ev) => {
                    const r = wrap.current?.getBoundingClientRect();
                    if (r) setTip({ e, x: ev.clientX - r.left, y: ev.clientY - r.top });
                  }}
                  onMouseLeave={() => setTip(undefined)}
                />
              </g>
            );
          })}
          {g.nodes.map((n) => {
            const p = at(n.id);
            const tt = NODE_TYPES[n.type];
            const r = n.members ? tt.size + 4 : tt.size;
            const c = nodeColour(n);
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                className={`bg-node${flash.has(n.id) || n.members?.some((m) => flash.has(m.id)) ? " flash" : ""}${picked === n.id ? " picked" : ""}${n.tier?.watch ? " watch" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`${tt.label}: ${n.label}`}
                onClick={() => setPicked(n.id === picked ? undefined : n.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setPicked(n.id === picked ? undefined : n.id))}
              >
                <path d={shapePath(tt.shape, r)} fill={guessed(n) ? "var(--surface)" : c} stroke={c} strokeWidth={guessed(n) ? 1.8 : 1} strokeDasharray={guessed(n) ? "2 2" : undefined} />
                {labelled(n) && <text y={r + 12} className={n.id === BRAND ? "bg-node-label brand" : "bg-node-label"}>{short(n.label)}</text>}
              </g>
            );
          })}
        </g>
      </svg>
      {tip && (
        <div className="bg-tip" style={{ left: Math.min(tip.x + 12, (wrap.current?.clientWidth ?? W) - 240), top: tip.y + 12 }} role="tooltip">
          <span className="bg-label">{EDGE_TYPES[tip.e.kind]}</span>
          <span>{tip.e.reason}</span>
          <small className={`src src-${tip.e.source.kind}`}>{sourceLabel(tip.e.source)}</small>
        </div>
      )}
      <ul className="bg-legend" aria-label="Key">
        {types.map((type) => <li key={type}><Swatch type={type} /> {NODE_TYPES[type].plural}</li>)}
        <li><svg className="bg-swatch" width="14" height="14" viewBox="-7 -7 14 14" aria-hidden><path d={shapePath("circle", 4.5)} fill="none" stroke="var(--muted)" strokeDasharray="2 2" strokeWidth={1.5} /></svg> My read, not yet yours</li>
      </ul>
      <p className="small muted bg-hint">Drag to pan, scroll or pinch to zoom. Tap a node for its card, hover a line for why it&apos;s there.</p>
      {node && <NodeCard n={node} edges={g.edges} names={byId} onEdit={(ops) => (setPicked(undefined), onEdit(ops))} onPick={setPicked} />}
    </div>
  );
}

/** A node's card (§13.12): what it is, where it came from, why it's linked, and Remove / Wrong for a fact. */
function NodeCard({ n, edges, names, onEdit, onPick }: { n: GraphNode; edges: GraphEdge[]; names: Map<string, GraphNode>; onEdit: (ops: Op[]) => void; onPick: (id: string) => void }) {
  const t = NODE_TYPES[n.type];
  const mine = edges.filter((e) => e.from === n.id || e.to === n.id).slice(0, 4);
  return (
    <article className="bg-card" aria-label={n.label}>
      <p className="bg-label"><Swatch type={n.type} n={n} /> {n.members ? t.plural : t.label}</p>
      <h4 className="bg-card-title">{n.label}</h4>
      {n.tier && <p className="small"><span className={`bg-tier${n.tier.watch ? " watch" : ""}`}>{n.tier.label}</span> {n.tier.reason}</p>}
      {n.when && <p className="small"><span className="bg-when">{n.when}</span></p>}
      {n.detail && !n.members && <p className="small">{n.detail}</p>}
      {n.members ? (
        <ul className="bg-members small">
          {n.members.map((m) => (
            <li key={m.id}>
              {m.label} <small className={`src src-${m.source.kind}`}>{fromLabel(m)}</small> <Actions n={m} onEdit={onEdit} />
            </li>
          ))}
        </ul>
      ) : (
        <>
          {mine.map((e) => {
            const other = names.get(e.from === n.id ? e.to : e.from);
            return (
              <p key={e.id} className="small bg-why">
                {e.reason}
                {other && other.id !== BRAND && <> · <button type="button" className="linkish" onClick={() => onPick(other.id)}>{other.label}</button></>}
              </p>
            );
          })}
          <small className={`src src-${n.source.kind}`}>{fromLabel(n)}</small>
          <div><Actions n={n} onEdit={onEdit} /></div>
        </>
      )}
    </article>
  );
}
