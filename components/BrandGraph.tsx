"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { StepTimer } from "./Progress";
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
import { BRAND, EDGE_TYPES, NODE_TYPES, themeId, type GraphEdge, type GraphInput, type GraphNode } from "@/lib/graph/types";
import { sourcesOf, themesOf } from "@/lib/knowledge/notes";
import type { LiveFact } from "@/lib/knowledge/types";

// The Brand Graph (PRD §13.12, §23.2 step 7): the brand's one source of truth, first made at onboarding and read by
// every step after it. One view (§23.2 step 7.1): the fact strip on top, then the graph grown from the Galaxy, then
// the list from "Brands like you" down, the same order on a phone. The founder edits facts, never taste: a fact is
// edited in place, added by typing
// (resolved first), hidden ("Remove") or marked wrong (which also stops every agent inferring it). What an edit
// changed flashes, with one Undo; the runs it moved are flagged, each with a one-click re-run.

const W = 720;
const H = 460;
/** On a phone the graph is drawn taller than wide, so the rings still fit a narrow screen. */
const NARROW = { w: 560, h: 520 };
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

/** Each theme its own hue, and its notes and their sources the same hue, lighter (§23.2 step 8.2b). */
const HUES = 8;
const themeHue = (themes: string[], t: string) => `var(--theme-${Math.max(0, themes.indexOf(t)) % HUES})`;
const nodeColour = (n: GraphNode, byId?: Map<string, GraphNode>, themes: string[] = []) => {
  const root = byId && n.parent ? (byId.get(n.parent)?.parent ? byId.get(byId.get(n.parent)!.parent!) : byId.get(n.parent)) : n;
  if (root?.type === "theme" && themes.length) return themeHue(themes, root.label);
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
      {working && (
        <p className="bg-working" role="status">
          <span className="spin" aria-hidden /> <span className="shimmer-text">{working}</span>
          <StepTimer />
        </p>
      )}
      {questions.map((q) => (
        <Question key={q.id} q={q} onAnswer={(a) => onAnswer(q, a)} />
      ))}

      {/* The graph and the list read the same input and edit through the same onEdit, so an edit in either shows in both. */}
      {/* While it groups, the graph says so over itself: the themes are still to land (founder, 17 Oct). */}
      <div className={`bg-graph-hold${working ? " loading" : ""}`} aria-busy={!!working}>
        <GraphView input={input} flash={flash} narrow={narrow} onEdit={onEdit} />
        {working && (
          <div className="bg-veil" aria-hidden>
            <span className="spin" />
            <strong>Grouping into themes</strong>
            <small>The graph fills in when it&apos;s done</small>
          </div>
        )}
      </div>
      <ListView input={input} flash={flash} onEdit={onEdit} />

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
function Actions({ n, onEdit, facts = [] }: { n: GraphNode; onEdit: (ops: Op[]) => void; facts?: LiveFact[] }) {
  if (NODE_TYPES[n.type].edit !== "fact" || n.members) return null;
  if (n.type === "theme") return <ThemeActions theme={n.label} onEdit={onEdit} />;
  const note = n.parent && facts.find((f) => `fact:${f.id}` === n.id);
  if (note) return <NoteActions note={note} themes={themesOf(facts)} onEdit={onEdit} />;
  return (
    <span className="bg-actions">
      <button type="button" className="linkish" onClick={() => onEdit([{ op: "remove", node: n.id }])} title="Hide it from the graph; Athena still reads it">Remove</button>
      <button type="button" className="linkish" onClick={() => onEdit([{ op: "wrong", node: n.id }])} title="It's wrong: hide it, and Athena stops inferring it">Wrong</button>
    </span>
  );
}

/** Rename or remove a theme (§23.2 step 8.2d): each one edit with Undo. */
function ThemeActions({ theme, onEdit }: { theme: string; onEdit: (ops: Op[]) => void }) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(theme);
  if (renaming)
    return (
      <form className="bg-add-form" onSubmit={(e) => (e.preventDefault(), setRenaming(false), draft.trim() && draft.trim() !== theme && onEdit([{ op: "theme", theme, to: draft.trim() }]))}>
        <input autoFocus value={draft} maxLength={60} aria-label="Theme name" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setRenaming(false)} />
        <button type="submit">Rename</button>
        <button type="button" className="linkish" onClick={() => setRenaming(false)}>Cancel</button>
      </form>
    );
  return (
    <span className="bg-actions">
      <button type="button" className="linkish" onClick={() => (setDraft(theme), setRenaming(true))}>Rename</button>
      <button type="button" className="linkish" onClick={() => onEdit([{ op: "theme", theme }])} title="Remove the theme and its notes: Athena stops reading them">Remove</button>
    </span>
  );
}

/** Edit, move, split or delete a note (§23.2 step 8.2d): each one edit with Undo; the note becomes the founder's. */
function NoteActions({ note, themes, onEdit }: { note: LiveFact; themes: string[]; onEdit: (ops: Op[]) => void }) {
  const [mode, setMode] = useState<"edit" | "move" | "split">();
  const [draft, setDraft] = useState("");
  const done = (ops: Op[]) => (setMode(undefined), onEdit(ops));
  if (mode === "edit" || mode === "split")
    return (
      <form className="bg-add-form bg-note-form" onSubmit={(e) => {
        e.preventDefault();
        if (mode === "edit") return draft.trim() && draft.trim() !== note.text ? done([{ op: "note", id: note.id, text: draft.trim() }]) : setMode(undefined);
        const parts = draft.split("\n").map((x) => x.trim()).filter(Boolean);
        return parts.length > 1 ? done([{ op: "split", id: note.id, parts }]) : setMode(undefined);
      }}>
        <textarea autoFocus value={draft} rows={mode === "split" ? 3 : 2} maxLength={600} aria-label={mode === "edit" ? "The note" : "One note per line"} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setMode(undefined)} />
        {mode === "split" && <small className="muted">One note per line</small>}
        <button type="submit">{mode === "edit" ? "Save" : "Split"}</button>
        <button type="button" className="linkish" onClick={() => setMode(undefined)}>Cancel</button>
      </form>
    );
  if (mode === "move")
    return (
      <form className="bg-add-form" onSubmit={(e) => (e.preventDefault(), draft.trim() ? done([{ op: "move", id: note.id, theme: draft.trim() }]) : setMode(undefined))}>
        <input autoFocus list={`themes-${note.id}`} value={draft} maxLength={60} placeholder="A theme, or a new one" aria-label="Move to theme" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setMode(undefined)} />
        <datalist id={`themes-${note.id}`}>{themes.filter((t) => t !== note.theme).map((t) => <option key={t} value={t} />)}</datalist>
        <button type="submit">Move</button>
        <button type="button" className="linkish" onClick={() => setMode(undefined)}>Cancel</button>
      </form>
    );
  return (
    <span className="bg-actions">
      <button type="button" className="linkish" onClick={() => (setDraft(note.text), setMode("edit"))}>Edit</button>
      <button type="button" className="linkish" onClick={() => (setDraft(""), setMode("move"))}>Move</button>
      <button type="button" className="linkish" onClick={() => (setDraft(note.text.split(/(?<=[.;])\s+/).join("\n")), setMode("split"))}>Split</button>
      <button type="button" className="linkish" onClick={() => onEdit([{ op: "drop", id: note.id }])} title="Delete it: Athena stops reading it">Delete</button>
    </span>
  );
}

/**
 * The list's knowledge (§23.2 step 8.2c): one box that scrolls on its own, a folded section per theme, each note one
 * line until opened for its full text, sources and edits.
 */
function ThemeList({ facts, flash, onEdit }: { facts: LiveFact[]; flash: Set<string>; onEdit: (ops: Op[]) => void }) {
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<string[]>([]);
  const [all, setAll] = useState(false);
  const themes = themesOf(facts);
  const toggle = (id: string) => setShown((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  if (!themes.length) return null;
  return (
    <section className="bg-group bg-notes">
      <h4 className="bg-label">Notes <span className="bg-count">{facts.filter((f) => f.theme).length}</span></h4>
    <div className={`bg-themes${all || picked.length > 1 ? " all" : ""}`}>
      {themes.map((theme) => {
        const notes = facts.filter((f) => f.theme === theme);
        const tid = themeId(theme);
        const on = shown.has(tid) || notes.some((n) => flash.has(`fact:${n.id}`));
        return (
          <section key={theme} className={`bg-group bg-theme${on ? " open" : ""}${flash.has(tid) ? " flash" : ""}`} style={{ "--hue": themeHue(themes, theme) } as CSSProperties}>
            <h4 className="bg-label">
              <button type="button" className="bg-fold" aria-expanded={on} onClick={() => toggle(tid)}>
                <span className="bg-hue" aria-hidden /> {theme} <span className="bg-count">{notes.length}</span>
              </button>
              {on && <ThemeActions theme={theme} onEdit={onEdit} />}
            </h4>
            {!on && <p className="bg-peek small muted">{notes[0]?.text}</p>}
            {on && (
              <ul>
                {notes.map((n) => {
                  const srcs = sourcesOf(n);
                  const sel = picked.includes(n.id);
                  const open = shown.has(n.id);
                  return (
                    <li key={n.id} className={`bg-note-line${open ? " open" : ""}${flash.has(`fact:${n.id}`) ? " flash" : ""}`}>
                      <div className="bg-row">
                        <input type="checkbox" checked={sel} aria-label={`Pick “${n.text.slice(0, 40)}” to merge`} onChange={() => setPicked((p) => (sel ? p.filter((x) => x !== n.id) : [...p, n.id]))} />
                        <button type="button" className="bg-note-text" aria-expanded={open} onClick={() => toggle(n.id)}>
                          {n.text}{n.mine && <small className="muted"> · yours</small>}
                        </button>
                      </div>
                      {open && (
                        <div className="bg-note-more">
                          {!!srcs.length && <ul className="bg-sources small muted">{srcs.map((w) => <li key={w}>{w}</li>)}</ul>}
                          <NoteActions note={n} themes={themes} onEdit={onEdit} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      {picked.length > 1 && (
        <p className="bg-merge small">
          {picked.length} notes picked · <button type="button" className="linkish" onClick={() => (onEdit([{ op: "merge", ids: picked }]), setPicked([]))}>Merge them</button> · <button type="button" className="linkish" onClick={() => setPicked([])}>Clear</button>
        </p>
      )}
    </div>
      <button type="button" className="linkish small bg-more" aria-expanded={all} onClick={() => setAll((a) => !a)}>{all ? "Show less" : `Show all ${themes.length} themes`}</button>
    </section>
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

/** The list: the main way to read the graph (§23.2 step 7b), every type in the registry's order, below the graph (7.1). */
function ListView({ input, flash, onEdit }: { input: GraphInput; flash: Set<string>; onEdit: (ops: Op[]) => void }) {
  const groups = listGroups(input);
  const edges = useMemo(() => allNodes(input).edges, [input]);
  const addable = Object.entries(NODE_TYPES).filter(([type, t]) => t.add && !groups.some((g) => g.type === type));
  return (
    <div className="bg-list">
      <ThemeList facts={input.facts} flash={flash} onEdit={onEdit} />
      {groups
        .filter((g) => g.type !== "brand" && g.type !== "trait" && g.type !== "theme")
        .map((g) => ({ ...g, nodes: g.nodes.filter((n) => !n.parent) }))
        .filter((g) => g.nodes.length)
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

type SimNode = SimulationNodeDatum & { id: string; r: number; ring: number; pad?: number };
type SimLink = SimulationLinkDatum<SimNode> & { id: string };

/**
 * The graph: grown from the Galaxy (d3-force, zoom and pan), shape and colour by type, never colour alone. It sits
 * inside the scrolling list, so it never traps the page: a mouse zooms with Ctrl or ⌘ held (a trackpad pinch sends
 * that), and a finger pans the page while two fingers pan and pinch the graph.
 */
function GraphView({ input, flash, narrow, onEdit }: { input: GraphInput; flash: Set<string>; narrow: boolean; onEdit: (ops: Op[]) => void }) {
  // Themes collapsed by default (§23.2 step 8.2b): one theme open at a time, and one of its notes.
  const [open, setOpen] = useState<string[]>([]);
  const g = useMemo(() => buildGraph({ ...input, open }), [input, open]);
  const expand = (n: GraphNode) =>
    setOpen((o) => (o.includes(n.id) ? o.filter((x) => x !== n.id && !(n.type === "theme" && x.startsWith("fact:"))) : n.type === "theme" ? [n.id] : [...o.filter((x) => !x.startsWith("fact:")), n.id]));
  const svg = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const placed = useRef(new Map<string, { x: number; y: number }>());
  const [, setFrame] = useState(0);
  const [t, setT] = useState<ZoomTransform>(zoomIdentity);
  const [picked, setPicked] = useState<string>();
  const [tip, setTip] = useState<{ e: GraphEdge; x: number; y: number }>();
  const [hover, setHover] = useState<string>();
  const themes = themesOf(input.facts);
  const shape =JSON.stringify([g.nodes.map((n) => n.id), g.edges.map((e) => e.id)]);

  useEffect(() => {
    const prev = placed.current;
    const nodes: SimNode[] = g.nodes.map((n, i) => {
      const ty = NODE_TYPES[n.type];
      const p = prev.get(n.id);
      // The golden angle, so one type's nodes start spread round the ring, not bunched on one side.
      const a = i * 2.39996;
      const r = n.members ? ty.size + 4 : ty.size;
      return n.id === BRAND ? { id: n.id, r, ring: 0, x: 0, y: 0, fx: 0, fy: 0 } : { id: n.id, r, ring: ty.ring, pad: n.type === "theme" || n.members ? 30 : 12, x: p?.x ?? Math.cos(a) * RING[ty.ring], y: p?.y ?? Math.sin(a) * RING[ty.ring] };
    });
    const ids = new Set(nodes.map((n) => n.id));
    const links: SimLink[] = g.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ id: e.id, source: e.from, target: e.to }));
    const sm = forceSimulation(nodes)
      .force("link", forceLink<SimNode, SimLink>(links).id((d) => d.id).distance((l) => 40 + 30 * Math.abs((l.source as SimNode).ring - (l.target as SimNode).ring)).strength(0.2))
      .force("radial", forceRadial<SimNode>((d) => RING[d.ring], 0, 0).strength(0.8))
      .force("charge", forceManyBody().strength(-70))
      .force("collide", forceCollide<SimNode>((d) => d.r + (d.pad ?? 10)));
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
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 4])
      .filter((e: MouseEvent & TouchEvent & WheelEvent) => (e.type === "wheel" ? e.ctrlKey || e.metaKey : e.type.startsWith("touch") ? e.touches.length > 1 : !e.button))
      .on("zoom", (e: { transform: ZoomTransform }) => setT(e.transform));
    s.call(z);
    return () => void s.on(".zoom", null);
  }, []);

  const at = (id: string) => placed.current.get(id) ?? { x: 0, y: 0 };
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const node = picked ? byId.get(picked) : undefined;
  const labelled = (n: GraphNode) => n.id === BRAND || n.type === "crowd" || n.type === "theme" || !!n.members || g.nodes.length <= 22 || picked === n.id;
  const types = [...new Set(g.nodes.map((n) => n.type))];
  const short = (s: string) => (s.length > 20 ? `${s.slice(0, 19)}…` : s);

  return (
    <div className="bg-graph" ref={wrap}>
      <svg ref={svg} viewBox={narrow ? `${-NARROW.w / 2} ${-NARROW.h / 2} ${NARROW.w} ${NARROW.h}` : `${-W / 2} ${-H / 2} ${W} ${H}`} role="img" aria-label={`The Brand Graph: ${g.nodes.length} nodes. The list below reads the same graph.`} onClick={(e) => e.target === svg.current && setPicked(undefined)}>
        <g transform={t.toString()}>
          {g.edges.map((e) => {
            const a = at(e.from);
            const b = at(e.to);
            const lit = picked && (e.from === picked || e.to === picked);
            const child = byId.get(e.from)?.parent === e.to ? byId.get(e.from) : byId.get(e.to)?.parent === e.from ? byId.get(e.to) : undefined;
            return (
              <g key={e.id}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`bg-edge${child ? " child" : ""}${lit ? " lit" : ""}${tip?.e.id === e.id ? " hover" : ""}`} style={child ? { stroke: nodeColour(child, byId, themes) } : undefined} />
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
            const c = nodeColour(n, byId, themes);
            const theme = n.type === "theme";
            const sub = !!n.parent;
            // A theme opens on click, as its card's button does; a note opens its sources the same way.
            const pick = () => {
              setPicked(n.id === picked ? undefined : n.id);
              if (theme || (sub && n.type === "fact")) expand(n);
            };
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                className={`bg-node${theme ? " theme" : ""}${sub ? " sub" : ""}${flash.has(n.id) || n.members?.some((m) => flash.has(m.id)) ? " flash" : ""}${picked === n.id ? " picked" : ""}${n.tier?.watch ? " watch" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`${tt.label}: ${n.label}`}
                aria-expanded={theme ? open.includes(n.id) : undefined}
                onClick={pick}
                onMouseEnter={() => theme && setHover(n.id)}
                onMouseLeave={() => theme && setHover(undefined)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick())}
              >
                {theme || n.members ? (
                  <>
                    <circle r={r + 7} className="bg-halo" fill={c} />
                    <circle r={r + 1} fill={c} stroke="var(--surface)" strokeWidth={1.5} />
                    <text y={3.5} className="bg-node-count">{theme ? input.facts.filter((f) => f.theme === n.label).length : n.members!.length}</text>
                  </>
                ) : n.id === BRAND ? (
                  <path d={shapePath(tt.shape, r)} fill={c} stroke={c} strokeWidth={1} />
                ) : (
                  // A soft disc in the type's colour, its shape marked inside, so type never rests on colour alone;
                  // Athena's own reads stay hollow and dashed.
                  <>
                    <circle r={r + 5} className="bg-halo" fill={c} />
                    <circle r={r + 1.5} fill={guessed(n) ? "var(--surface)" : c} stroke={c} strokeWidth={guessed(n) ? 1.5 : 1} strokeDasharray={guessed(n) ? "2 2" : undefined} />
                    <path d={shapePath(tt.shape, Math.max(2, r * 0.55))} fill={guessed(n) ? c : "var(--surface)"} opacity={0.9} />
                  </>
                )}
                {labelled(n) && (() => {
                  // Labels point away from the brand, so they fan out with the graph instead of piling under nodes.
                  if (n.id === BRAND) return <text y={r + 14} className="bg-node-label brand">{short(n.label)}</text>;
                  const a = Math.atan2(p.y, p.x);
                  const d = r + (theme || n.members ? 12 : 8);
                  const cx = Math.cos(a);
                  const anchor = cx > 0.35 ? "start" : cx < -0.35 ? "end" : "middle";
                  return (
                    <text x={cx * d} y={Math.sin(a) * d + (anchor === "middle" ? (Math.sin(a) > 0 ? 8 : -2) : 3.5)} textAnchor={anchor} className={theme ? "bg-node-label theme" : "bg-node-label"}>
                      {short(n.label)}
                    </text>
                  );
                })()}
              </g>
            );
          })}
          {hover && !open.includes(hover) && (() => {
            // A closed theme, hovered: its notes appear faintly around it, not yet part of the graph.
            const h = byId.get(hover);
            if (!h) return null;
            const p = at(hover);
            const c = nodeColour(h, byId, themes);
            const notes = input.facts.filter((f) => f.theme === h.label).slice(0, 12);
            const away = Math.atan2(p.y, p.x);
            return (
              <g className="bg-ghosts" aria-hidden>
                {notes.map((f, i) => {
                  const a = away + (notes.length > 1 ? (i / (notes.length - 1) - 0.5) * Math.PI * 0.9 : 0);
                  const x = p.x + Math.cos(a) * 42;
                  const y = p.y + Math.sin(a) * 42;
                  return (
                    <g key={f.id}>
                      <line x1={p.x} y1={p.y} x2={x} y2={y} stroke={c} />
                      <circle cx={x} cy={y} r={3.5} fill={c} />
                    </g>
                  );
                })}
              </g>
            );
          })()}
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
      <p className="small muted bg-hint">{narrow ? "Pinch to zoom, two fingers to pan. Tap a node for its card." : "Drag to pan; pinch, or scroll with Ctrl or ⌘ held, to zoom. Click a node for its card, hover a line for why it's there."}</p>
      {node && <NodeCard n={node} edges={g.edges} names={byId} facts={input.facts} open={open.includes(node.id)} onExpand={() => expand(node)} onEdit={(ops) => (setPicked(undefined), onEdit(ops))} onPick={setPicked} />}
    </div>
  );
}

/** A node's card (§13.12): what it is, where it came from, why it's linked, and Remove / Wrong for a fact. */
function NodeCard({ n, edges, names, facts, open, onExpand, onEdit, onPick }: { n: GraphNode; edges: GraphEdge[]; names: Map<string, GraphNode>; facts: LiveFact[]; open: boolean; onExpand: () => void; onEdit: (ops: Op[]) => void; onPick: (id: string) => void }) {
  const t = NODE_TYPES[n.type];
  const note = n.parent && n.type === "fact" ? facts.find((f) => `fact:${f.id}` === n.id) : undefined;
  const opens = n.type === "theme" ? (open ? "Hide its notes" : "Show its notes") : note ? (open ? "Hide sources" : `${sourcesOf(note).length} source${sourcesOf(note).length === 1 ? "" : "s"}`) : undefined;
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
          {opens && <div><button type="button" className="linkish small" aria-expanded={open} onClick={onExpand}>{opens}</button></div>}
          <div><Actions n={n} onEdit={onEdit} facts={facts} /></div>
        </>
      )}
    </article>
  );
}
