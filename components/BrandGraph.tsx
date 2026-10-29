"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKey, type MouseEvent as ReactMouse } from "react";
import { createPortal } from "react-dom";
import { StepTimer } from "./Progress";
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { select } from "d3-selection";
import { Question } from "./Question";
import type { FileChip } from "./chat";
import { sourceLabel } from "@/lib/brief/source";
import type { Sourced } from "@/lib/brief/types";
import { allNodes, fromLabel, listGroups } from "@/lib/graph/build";
import type { EditQuestion, GraphState, Op, SetField } from "@/lib/graph/edit";
import { shapePath } from "@/lib/graph/shapes";
import { RUN_LABEL, staleLine, type RunId } from "@/lib/graph/stale";
import { BRAND, EDGE_TYPES, NODE_TYPES, themeId, typesInOrder, type Graph, type GraphEdge, type GraphInput, type GraphNode } from "@/lib/graph/types";
import { sourcesOf, themesOf } from "@/lib/knowledge/notes";
import type { LiveFact } from "@/lib/knowledge/types";

// The Brand Graph (PRD §13.12, §23.2 step 7): the brand's one source of truth, first made at onboarding and read by
// every step after it. One view (§23.2 step 7.1): the fact strip on top, then the graph grown from the Galaxy, then
// the list from "Brands like you" down, the same order on a phone. The founder edits facts, never taste: a fact is
// edited in place, added by typing
// (resolved first), hidden ("Remove") or marked wrong (which also stops every agent inferring it). What an edit
// changed flashes, with one Undo; the runs it moved are flagged, each with a one-click re-run.

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

/** Each theme a tint of one soft family (§23.5 r), the same in the graph and the list. */
const HUES = 8;
const themeHue = (themes: string[], t: string) => `var(--theme-${Math.max(0, themes.indexOf(t)) % HUES})`;
/** The list's swatches keep each type's colour and shape. */
const nodeColour = (n: GraphNode) => {
  const c = NODE_TYPES[n.type].colour;
  return c === "crowd" ? `var(--crowd-${n.crowd ?? 0})` : c;
};
/** Founder-given nodes are solid; Athena's own reads and guesses are drawn as a thin outline, so a guess never looks like a fact. */
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
                const reason = n.tier?.reason || (t.ring >= 2 || n.type === "city" ? reasonOf(n, edges) : undefined);
                // A line's reason often repeats the item's own detail with who found it, which the source line below already says.
                const why = reason && n.detail && reason.includes(n.detail) ? undefined : reason;
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

// The graph (§23.5 r), in the Galaxy's style: themes are soft regions round the brand with a dot for each note, and
// everything else is a small dot on an outer ring, grouped by type. Every position is worked out once, with every
// note placed, so opening a theme zooms to it instead of moving anything.

/** Layout units, about a pixel at rest: notes sit this far apart inside a theme, ring dots this far apart. */
const NOTE_GAP = 7;
const RING_GAP = 12;
const GROUP_GAP = 30;
/** The card's width beside the graph on a wide screen, kept clear when a theme's notes are named. */
const CARD_W = 280;
/** An open theme's names get at least this much room, a row this tall each; more rows than fit scroll. */
const COL_W = 160;
const ROW = 14;
/** Small caps at 10px run about 7px a character; text at 11px about 6. */
const CAPS_W = 7;
const TEXT_W = 6;
/** A theme's region stops growing here; past it, its notes sit closer together, so no one theme fills the graph. */
const MAX_R = 40;
/** A ring group's label runs about this wide a character (small caps at 9px). */
const GROUP_W = 6.2;
/** A ring group's label, shorter than its type's plural where that runs long. */
const GROUP_NAME: Record<string, string> = { fact: "Notes", lead: "Leads" };

type Spot = { x: number; y: number };
type Size = { w: number; h: number };
type Region = { n: GraphNode; notes: GraphNode[]; x: number; y: number; R: number; gap: number; tint: string };
type Arc = { type: string; n: number; a0: number; a1: number };
type Layout = { at: Map<string, Spot>; regions: Region[]; arcs: Arc[]; ring: string[]; dots: Spot[]; Ro: number; a: number; k0: number };
type Box = { x0: number; y0: number; x1: number; y1: number };
type Place = "out" | "above" | "below" | "left" | "right" | "in";
type Tip = { x: number; y: number; head: string; body: string; edge?: GraphEdge; why?: string[] };
/** A faint line that is always drawn: the brand to a theme, a theme to its notes, a note to what it's about. */
type Link = { id: string; a: string; b: string; why: string; tint?: string };

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1)).trimEnd()}…` : s);

/** Words into at most two lines of about n characters, the second cut with "…". */
function lines(s: string, n: number): string[] {
  const out: string[] = [];
  for (const word of s.split(/\s+/).filter(Boolean)) {
    const last = out.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= n) out[out.length - 1] = `${last} ${word}`;
    else out.push(word);
  }
  return out.length <= 2 ? out.map((l) => cut(l, n + 4)) : [cut(out[0], n + 4), cut(out.slice(1).join(" "), n)];
}

/** Every position, once: the brand at the centre, the themes on a ring round it, everything else on an outer ring. */
function layout(g: Graph, themes: string[], { w, h }: Size, brandW: number): Layout {
  const at = new Map<string, Spot>([[BRAND, { x: 0, y: 0 }]]);
  // A wide box stretches the rings sideways, so the graph uses the width it has.
  const a = Math.min(1.9, Math.max(1, w / h));
  const clear = Math.max(34, brandW / 2 + 10);
  const regions: Region[] = g.nodes
    .filter((n) => n.type === "theme")
    .map((n) => {
      const notes = g.nodes.filter((x) => x.parent === n.id);
      const R = Math.min(MAX_R, Math.max(18, NOTE_GAP * Math.sqrt(notes.length) + 8));
      return { n, notes, x: 0, y: 0, R, gap: Math.min(NOTE_GAP, (R - 8) / Math.sqrt(Math.max(1, notes.length))), tint: themeHue(themes, n.label) };
    });
  const maxR = Math.max(0, ...regions.map((r) => r.R));
  let Rt = 0;
  if (regions.length) {
    // Each theme takes its share of the ring by size, the first at the top; the ring grows until no two touch.
    const need = regions.reduce((s, r) => s + 2 * r.R + 14, 0);
    Rt = Math.max(clear + maxR + 8, need / (2 * Math.PI));
    for (let i = 0; i < 80; i++, Rt *= 1.04) {
      let th = -Math.PI / 2 - ((2 * regions[0].R + 14) / need) * Math.PI;
      for (const r of regions) {
        const span = ((2 * r.R + 14) / need) * 2 * Math.PI;
        r.x = Math.cos(th + span / 2) * Rt * a;
        r.y = Math.sin(th + span / 2) * Rt;
        th += span;
      }
      const apart = regions.every((r, j) => {
        const s = regions[(j + 1) % regions.length];
        return r === s || Math.hypot(r.x - s.x, r.y - s.y) >= r.R + s.R + 10;
      });
      if (apart) break;
    }
    // Notes on a sunflower spiral inside their theme: evenly spread, the first at the middle.
    for (const r of regions) {
      at.set(r.n.id, { x: r.x, y: r.y });
      r.notes.forEach((n, j) => {
        const d = r.gap * Math.sqrt(j + 0.5);
        at.set(n.id, { x: r.x + Math.cos(j * 2.39996) * d, y: r.y + Math.sin(j * 2.39996) * d });
      });
    }
  }
  // Everything else on the outer ring: one run per type in the registry's order, clockwise from the top.
  const groups = typesInOrder()
    .filter(([type]) => type !== "brand" && type !== "theme")
    .map(([type]) => ({ type, nodes: g.nodes.filter((n) => n.type === type && !n.parent) }))
    .filter((x) => x.nodes.length);
  const runs = groups.reduce((s, x) => s + (x.nodes.length - 1) * RING_GAP, 0);
  const Ro = Math.max(regions.length ? Rt + maxR + 36 : clear + 40, (runs + groups.length * GROUP_GAP) / (2 * Math.PI));
  const gap = (2 * Math.PI - runs / Ro) / Math.max(1, groups.length);
  const arcs: Arc[] = [];
  const dots: Spot[] = [];
  let th = -Math.PI / 2 + gap / 2;
  for (const x of groups) {
    const a0 = th;
    x.nodes.forEach((n, i) => {
      const an = th + (i * RING_GAP) / Ro;
      const p = { x: Math.cos(an) * Ro * a, y: Math.sin(an) * Ro };
      at.set(n.id, p);
      dots.push(p);
    });
    th += ((x.nodes.length - 1) * RING_GAP) / Ro;
    arcs.push({ type: x.type, n: x.nodes.length, a0, a1: th });
    th += gap;
  }
  const fit = Math.min(2.2, (w / 2 - 14) / (Ro * a + 12), (h / 2 - 14) / (Ro + 12));
  // Room for each group's label outside its arc, without shrinking the graph past two thirds; a label still short of
  // room is pulled in from the edge.
  const room = arcs.map((x) => {
    const g = groupLabel({ Ro, a } as Layout, x);
    const wd = g.text.length * GROUP_W;
    const cx = Math.abs(g.u.x);
    const cy = Math.abs(g.u.y);
    const across = g.anchor === "middle" ? wd / 2 : wd;
    return Math.min(cx > 0.05 ? (w / 2 - 6 - across - 10 * cx) / (cx * (Ro + 9) * a) : Infinity, cy > 0.05 ? (h / 2 - 8 - 10 * cy - (g.anchor === "middle" ? 10 : 5)) / (cy * (Ro + 9)) : Infinity);
  });
  const k0 = Math.max(0.2, fit * 0.66, Math.min(fit, ...room));
  return { at, regions, arcs, ring: groups.map((x) => x.type), dots, Ro, a, k0 };
}

/** A ring group's label ("Stockists · 4"), just outside the middle of its arc, reading away from the centre. */
function groupLabel(L: Pick<Layout, "Ro" | "a">, x: Arc) {
  const an = (x.a0 + x.a1) / 2;
  const u = { x: Math.cos(an), y: Math.sin(an) };
  const anchor: "start" | "end" | "middle" = u.x > 0.35 ? "start" : u.x < -0.35 ? "end" : "middle";
  return { at: { x: u.x * (L.Ro + 9) * L.a, y: u.y * (L.Ro + 9) }, u, anchor, text: `${GROUP_NAME[x.type] ?? NODE_TYPES[x.type].plural} · ${x.n}` };
}

/**
 * Where each group's label sits on screen, outside the middle of its arc, from where the layout's points land (`at`).
 * A label that would run off the stage or over another, as on a phone, is left out: its group is named in the key.
 */
function ringNames(L: Layout, at: (p: Spot) => Spot, size: Size) {
  const out: { type: string; text: string; x: number; y: number; anchor: "start" | "end" | "middle"; box: Box }[] = [];
  for (const arc of L.arcs) {
    const g = groupLabel(L, arc);
    const p = at(g.at);
    const wd = g.text.length * GROUP_W;
    const y = p.y + g.u.y * 10 + (g.anchor !== "middle" ? 3.5 : g.u.y > 0 ? 9 : -2);
    const x = p.x + g.u.x * 10;
    const x0 = g.anchor === "start" ? x : g.anchor === "end" ? x - wd : x - wd / 2;
    const box = { x0, y0: y - 8, x1: x0 + wd, y1: y + 2 };
    if (box.x0 < 4 || box.x1 > size.w - 4 || box.y0 < 4 || box.y1 > size.h - 4 || out.some((o) => overlaps(o.box, box))) continue;
    out.push({ type: arc.type, text: g.text, x, y, anchor: g.anchor, box });
  }
  return out;
}

/** A label's box: beside its region facing away from the brand, above, below, to the left or right of it, or over it. */
function capsBox(place: Place, text: string[], c: Spot, Rs: number, u: Spot): Box {
  const wd = Math.max(...text.map((l) => l.length)) * CAPS_W;
  const ht = text.length * 12;
  const [cx, top] =
    place === "out"
      ? [c.x + u.x * (Rs + 6) + (u.x * wd) / 2, c.y + u.y * (Rs + 6) - ht / 2 + (u.y * ht) / 2]
      : place === "above"
        ? [c.x, c.y - Rs - 5 - ht]
        : place === "below"
          ? [c.x, c.y + Rs + 5]
          : place === "left"
            ? [c.x - Rs - 5 - wd / 2, c.y - ht / 2]
            : place === "right"
              ? [c.x + Rs + 5 + wd / 2, c.y - ht / 2]
              : [c.x, c.y - ht / 2];
  return { x0: cx - wd / 2, y0: top, x1: cx + wd / 2, y1: top + ht };
}

const overlaps = (p: Box, q: Box) => p.x0 < q.x1 + 2 && q.x0 < p.x1 + 2 && p.y0 < q.y1 + 2 && q.y0 < p.y1 + 2;
const touches = (b: Box, c: Spot, R: number) => Math.hypot(Math.max(b.x0, Math.min(c.x, b.x1)) - c.x, Math.max(b.y0, Math.min(c.y, b.y1)) - c.y) < R + 1;
const unit = (from: Spot, to: Spot) => {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  return d ? { x: (to.x - from.x) / d, y: (to.y - from.y) / d } : { x: 0, y: -1 };
};

/**
 * Where each theme's name sits at rest, and how it wraps. No name overlaps another or the brand's, or runs off the stage;
 * each keeps clear of other themes and the ring's dots where it can. A name with no clear place, as on a small phone
 * with many themes, is left to its hover tip and the list below rather than drawn over another.
 */
function placeCaps(L: Layout, size: Size, brand: Box): Map<string, { place: Place; text: string[] }> {
  const at = (p: Spot) => ({ x: size.w / 2 + p.x * L.k0, y: size.h / 2 + p.y * L.k0 });
  const centre = at({ x: 0, y: 0 });
  const placed: Box[] = [brand, ...ringNames(L, at, size).map((x) => x.box)];
  const out = new Map<string, { place: Place; text: string[] }>();
  for (const r of [...L.regions].sort((p, q) => q.notes.length - p.notes.length)) {
    const c = at(r);
    let best: { place: Place; text: string[]; box: Box; score: number } | undefined;
    // The wide wrap first; the narrow one only when it finds a clearer place.
    for (const wrap of [20, 12]) {
      const text = lines(r.n.label, wrap);
      for (const place of ["out", "above", "below", "left", "right", "in"] as const) {
        const box = capsBox(place, text, c, r.R * L.k0, unit(centre, c));
        if (placed.some((p) => overlaps(p, box)) || box.x0 < 4 || box.y0 < 4 || box.x1 > size.w - 4 || box.y1 > size.h - 4) continue;
        const score =
          L.regions.filter((o) => o !== r && touches(box, at(o), o.R * L.k0)).length +
          L.dots.filter((d) => touches(box, at(d), 4)).length +
          // Over its own dots only when nothing outside is clear.
          (place === "in" && r.notes.length ? 1.5 : 0) +
          (wrap < 20 ? 0.5 : 0);
        if (!best || score < best.score) best = { place, text, box, score };
        if (!score) break;
      }
      if (best && !best.score) break;
    }
    if (!best) continue;
    placed.push(best.box);
    out.set(r.n.id, { place: best.place, text: best.text });
  }
  return out;
}

const onKey = (go: () => void) => (e: ReactKey) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go());

/**
 * The graph sits inside the scrolling list, so it never traps the page: a mouse zooms with Ctrl or ⌘ held (a trackpad
 * pinch sends that), and a finger scrolls the page while two fingers pan and pinch the graph. Full screen, one finger pans.
 */
function GraphView({ input, flash, narrow, onEdit }: { input: GraphInput; flash: Set<string>; narrow: boolean; onEdit: (ops: Op[]) => void }) {
  const all = useMemo(() => allNodes(input), [input]);
  const byId = useMemo(() => new Map(all.nodes.map((n) => [n.id, n])), [all]);
  const themes = themesOf(input.facts);
  const brandName = byId.get(BRAND)?.label ?? "";
  const brandText = lines(brandName, 18);
  const shape = all.nodes.map((n) => `${n.id}<${n.parent ?? ""}`).join("|");

  const wrap = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const zr = useRef<ZoomBehavior<SVGSVGElement, unknown>>(undefined);
  const tNow = useRef<ZoomTransform>(zoomIdentity);
  const anim = useRef(0);
  const held = useRef(0);
  const [size, setSize] = useState<Size>({ w: 720, h: 420 });
  const [t, setT] = useState<ZoomTransform>(zoomIdentity);
  const [moving, setMoving] = useState(false);
  const [focus, setFocus] = useState<string>();
  const [picked, setPicked] = useState<string>();
  const [full, setFull] = useState(false);
  const [tip, setTip] = useState<Tip>();
  const [hot, setHot] = useState<{ id: string; y: number }>();
  const [hov, setHov] = useState<string>();

  const L = useMemo(
    () => layout(all, themes, size, Math.max(...brandText.map((l) => l.length)) * CAPS_W),
    [shape, themes.join("|"), brandName, size.w, size.h], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const base = (p: Spot) => ({ x: size.w / 2 + p.x * L.k0, y: size.h / 2 + p.y * L.k0 });
  const on = (p: Spot) => {
    const b = base(p);
    return { x: t.x + t.k * b.x, y: t.y + t.k * b.y };
  };
  const pos = (id: string) => on(L.at.get(id) ?? { x: 0, y: 0 });
  const region = (id?: string) => (id ? L.regions.find((r) => r.n.id === id) : undefined);
  const brandBox = (c: Spot): Box => {
    const wd = Math.max(...brandText.map((l) => l.length)) * CAPS_W;
    return { x0: c.x - wd / 2, y0: c.y + 10, x1: c.x + wd / 2, y1: c.y + 10 + brandText.length * 12 };
  };
  const caps = useMemo(() => placeCaps(L, size, brandBox(base({ x: 0, y: 0 }))), [L]); // eslint-disable-line react-hooks/exhaustive-deps

  // A stage too narrow for the card beside an open theme's names puts the card under the graph, as on a phone.
  const tight = narrow || size.w < 760;
  const right = (tight ? size.w : size.w - CARD_W - 24) - 8;
  // A theme opened sits on the left, large, its notes named in a column to its right.
  const Rf = Math.max(30, Math.min(0.3 * size.h, 0.2 * size.w, (right - 38 - COL_W) / 2));
  const focusT = (r: Region) => {
    const k = Math.max(1, Math.min(8, Rf / (r.R * L.k0)));
    const b = base(r);
    return zoomIdentity.translate(16 + Rf - k * b.x, size.h / 2 - k * b.y).scale(k);
  };

  /** Zooms to a transform, the given point gliding to its new place as the scale eases (none with reduced motion). */
  const go = (to: ZoomTransform, about: Spot = { x: 0, y: 0 }) => {
    const s = svg.current;
    const z = zr.current;
    if (!s || !z) return;
    cancelAnimationFrame(anim.current);
    const from = tNow.current;
    const b = base(about);
    const s0 = { x: from.x + from.k * b.x, y: from.y + from.k * b.y };
    const s1 = { x: to.x + to.k * b.x, y: to.y + to.k * b.y };
    const ms = reducedMotion() ? 0 : 450;
    const t0 = performance.now();
    setMoving(true);
    const step = (now: number) => {
      const p = ms ? Math.min(1, (now - t0) / ms) : 1;
      const e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
      const k = from.k * (to.k / from.k) ** e;
      z.transform(select(s), zoomIdentity.translate(s0.x + (s1.x - s0.x) * e - k * b.x, s0.y + (s1.y - s0.y) * e - k * b.y).scale(k));
      if (p < 1) anim.current = requestAnimationFrame(step);
      else setMoving(false);
    };
    anim.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    if (!svg.current) return;
    const s = select(svg.current);
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.6, 8])
      .filter((e: MouseEvent & TouchEvent & WheelEvent) => (e.type === "wheel" ? e.ctrlKey || e.metaKey : e.type.startsWith("touch") ? full || e.touches.length > 1 : !e.button))
      .on("zoom", (e: D3ZoomEvent<SVGSVGElement, unknown>) => {
        tNow.current = e.transform;
        setT(e.transform);
        // The founder's own zoom or pan stops a zoom under way.
        if (e.sourceEvent) (cancelAnimationFrame(anim.current), setMoving(false));
      });
    s.call(z).on("dblclick.zoom", null);
    zr.current = z;
    return () => void s.on(".zoom", null);
  }, [full]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width: w, height: h } = e.contentRect;
      if (w > 40 && h > 40) setSize((s) => (Math.abs(s.w - w) < 1 && Math.abs(s.h - h) < 1 ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [full]);

  // A new size or a new graph keeps the view: the theme open stays open, otherwise the whole graph shows.
  useEffect(() => {
    const s = svg.current;
    const z = zr.current;
    if (!s || !z) return;
    cancelAnimationFrame(anim.current);
    setMoving(false);
    const r = region(focus);
    z.transform(select(s), r ? focusT(r) : zoomIdentity);
    if (focus && !r) setFocus(undefined);
  }, [L, full]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => void (document.body.style.overflow = prev);
  }, [full]);

  const zoomed = t.k !== 1 || t.x !== 0 || t.y !== 0;
  /** Esc or a click on empty space: back to the whole graph. */
  const back = () => {
    const r = region(focus);
    setPicked(undefined);
    setFocus(undefined);
    setTip(undefined);
    setHot(undefined);
    if (r || zoomed) go(zoomIdentity, r ?? { x: 0, y: 0 });
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target as HTMLElement | null)?.closest?.("input, textarea, select")) return;
      if (focus || picked || zoomed) back();
      else if (full) setFull(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const openTheme = (r: Region, note?: string) => {
    setPicked(note);
    setTip(undefined);
    setHot(undefined);
    if (focus === r.n.id) return;
    setFocus(r.n.id);
    go(focusT(r), r);
  };
  const pickRing = (n: GraphNode, toggle = true) => {
    const r = region(focus);
    if (r) (setFocus(undefined), go(zoomIdentity, r));
    setPicked(toggle && picked === n.id ? undefined : n.id);
  };
  /** A name in the card: its theme opens for a theme or a note, otherwise it is picked. */
  const pickAny = (id: string) => {
    const n = byId.get(id);
    const r = n && region(n.type === "theme" ? n.id : n.parent);
    if (r) openTheme(r, n.type === "theme" ? undefined : id);
    else if (n && n.id !== BRAND) pickRing(n, false);
  };

  // Lines show only for the node picked, never to its own theme.
  const own = (e: GraphEdge) => byId.get(e.from)?.parent === e.to || byId.get(e.to)?.parent === e.from || byId.get(e.from)?.type === "theme";
  const shown = picked ? all.edges.filter((e) => (e.from === picked || e.to === picked) && !own(e)) : [];
  const near = new Set(shown.flatMap((e) => [e.from, e.to]));
  const open = region(focus);
  const lit = focus || picked ? new Set([...(open ? [open.n.id, ...open.notes.map((n) => n.id)] : []), ...(picked ? [picked] : []), ...near]) : undefined;
  const dim = focus ? 0.12 : 0.3;
  const alpha = (id: string) => (!lit || lit.has(id) ? 1 : dim);
  const dotR = (r: number) => r * Math.sqrt(L.k0 * t.k);

  // Faint lines, always drawn (§23.9 g): the brand to each theme, each theme to its notes, a note to the stockist, city,
  // crowd or brand it's about. Pointing at a node lights its lines and says why each is there.
  const links = useMemo(() => {
    const out: Link[] = [];
    for (const r of L.regions) {
      out.push({ id: `${BRAND}>${r.n.id}`, a: BRAND, b: r.n.id, why: `A theme in what I know about ${brandName}`, tint: r.tint });
      for (const n of r.notes) out.push({ id: `${r.n.id}>${n.id}`, a: r.n.id, b: n.id, why: `A note under ${r.n.label}`, tint: r.tint });
    }
    for (const e of all.edges) {
      const from = byId.get(e.from);
      const to = byId.get(e.to);
      if (!from || !to || to.parent || to.type === "theme" || to.id === BRAND) continue;
      // A note on the outer ring (no theme) still draws what it's about.
      if (!from.parent && e.kind !== "about") continue;
      out.push({ id: e.id, a: e.from, b: e.to, why: e.reason });
    }
    return out;
  }, [L, all, byId, brandName]);
  /** Why a node's lines are there, for its tip: a note's own reasons, and for anything a note is about, the note. */
  const whyOf = (id: string) => {
    const out: string[] = [];
    let kids = 0;
    for (const l of links) {
      if (l.a !== id && l.b !== id) continue;
      if (id === BRAND || (l.a === id && byId.get(id)?.type === "theme")) kids++;
      else if (l.a === id || l.a === BRAND || byId.get(l.a)?.type === "theme") out.push(l.why);
      else out.push(`A note says: ${cut(byId.get(l.a)?.label ?? "", 56)}`);
    }
    if (kids) out.push(id === BRAND ? `${kids} theme${kids === 1 ? "" : "s"} in what I know about you` : `${kids} note${kids === 1 ? "" : "s"} under it`);
    return [...new Set(out)].slice(0, 4);
  };

  const hover = (head: string, body: string, edge?: GraphEdge, id?: string) => (e: ReactMouse) => {
    const b = wrap.current?.getBoundingClientRect();
    if (b) setTip({ x: e.clientX - b.left, y: e.clientY - b.top, head, body, edge, why: id ? whyOf(id) : undefined });
    if (id !== hov) setHov(id);
  };
  const unhover = () => (setTip(undefined), setHov(undefined));

  // The open theme's notes, named in a column clear of the card, each joined to its dot, none overlapping. A theme with
  // more notes than the column holds lists them in a scrolling column instead, joining only the one pointed at.
  const colX = open ? on(open).x + open.R * L.k0 * t.k + 22 : 0;
  const notes = open && !moving ? open.notes.map((n) => ({ n, d: pos(n.id) })).sort((p, q) => p.d.y - q.d.y) : [];
  const listed = notes.length > Math.floor((size.h - 28) / ROW) + 1;
  const column = (() => {
    if (listed) return [];
    const x = colX;
    const chars = Math.max(8, Math.floor((right - x) / TEXT_W));
    const rows = notes;
    const top = 16;
    const bottom = size.h - 12;
    const gap = Math.min(15, (bottom - top) / Math.max(1, rows.length - 1));
    const ys: number[] = [];
    rows.forEach((row, i) => ys.push(Math.max(row.d.y, i ? ys[i - 1] + gap : top)));
    for (let i = ys.length - 1, lim = bottom; i >= 0; lim = ys[i] - gap, i--) ys[i] = Math.min(ys[i], lim);
    for (let i = 0, lo = top; i < ys.length; lo = ys[i] + gap, i++) ys[i] = Math.max(ys[i], lo);
    return rows.map((row, i) => ({ ...row, x, y: ys[i], text: cut(row.n.label, chars) }));
  })();

  // A picked ring node is named beside its dot, and so is each node its lines reach where the name has room; the
  // rest are named on hover and in the card, so no two names overlap.
  const centre = pos(BRAND);
  const named = (() => {
    if (focus || !picked) return [];
    const ids = [...new Set([picked, ...near])].filter((id) => id !== BRAND && !byId.get(id)?.parent && byId.get(id)?.type !== "theme");
    const taken: Box[] = [brandBox(centre)];
    const out: { id: string; x: number; y: number; anchor: "start" | "end" | "middle"; text: string }[] = [];
    for (const id of ids) {
      const p = pos(id);
      const u = unit(centre, p);
      const text = cut(byId.get(id)!.label, 28);
      const anchor = u.x > 0.3 ? "start" : u.x < -0.3 ? "end" : "middle";
      const x = p.x + u.x * 9;
      const y = p.y + u.y * 9 + 4;
      const w = text.length * TEXT_W;
      const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
      const box = { x0, y0: y - 10, x1: x0 + w, y1: y + 3 };
      if (id !== picked && taken.some((b) => overlaps(box, b))) continue;
      taken.push(box);
      out.push({ id, x, y, anchor, text });
    }
    return out.slice(0, 9);
  })();

  const arcPath = (x: Arc) => {
    const d = 5 / L.Ro;
    const from = x.a0 - d;
    const span = x.a1 - x.a0 + 2 * d;
    const n = Math.max(2, Math.ceil((span * L.Ro) / 6));
    const R = L.Ro + 9;
    return Array.from({ length: n + 1 }, (_, i) => {
      const an = from + (span * i) / n;
      const p = on({ x: Math.cos(an) * R * L.a, y: Math.sin(an) * R });
      return `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join("");
  };

  const card = picked ? byId.get(picked) : open?.n;
  // The ring's groups named where they fit; with any left out, the key under the graph names them all, in order.
  const ringLabels = ringNames(L, on, size);
  const ringTypes = L.ring.map((type) => (GROUP_NAME[type] ?? NODE_TYPES[type].plural).replace(/^\w/, (c) => c.toLowerCase()));
  const brandAt = pos(BRAND);
  const bb = brandBox(brandAt);

  const view = (
    <div className={`bg-graph${full ? " full" : ""}${tight ? " tight" : ""}`} ref={wrap}>
      <div className="bg-stage" ref={stage}>
        <svg
          ref={svg}
          viewBox={`0 0 ${size.w} ${size.h}`}
          role="img"
          aria-label={`The Brand Graph: ${L.regions.length} themes and ${all.nodes.length - L.regions.length - 1} other nodes. The list below reads the same graph.`}
          onClick={(e) => e.target === svg.current && (focus || picked || zoomed) && back()}
        >
          <g style={{ opacity: focus ? dim : picked ? 0.5 : 1 }} className="bg-fade">
            {L.arcs.map((x) => <path key={x.type} className="bg-arc" d={arcPath(x)} />)}
            {ringLabels.map((x) => (
              <text key={x.type} x={x.x} y={x.y} textAnchor={x.anchor} className="bg-ring-name" aria-hidden>
                {x.text}
              </text>
            ))}
          </g>
          <g style={{ opacity: focus ? dim : picked ? 0.5 : 1 }} className="bg-fade">
            {links.map((l) => {
              const p = pos(l.a);
              let q = pos(l.b);
              // The brand's line stops at its theme's edge rather than running into its notes.
              const r = l.a === BRAND ? region(l.b) : undefined;
              if (r) {
                const u = unit(q, p);
                const R = r.R * L.k0 * t.k;
                q = { x: q.x + u.x * R, y: q.y + u.y * R };
              }
              return <line key={l.id} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={l.tint ?? "var(--muted)"} className={`bg-link${l.a !== BRAND && l.tint ? " spoke" : ""}${hov && (l.a === hov || l.b === hov) ? " lit" : ""}`} />;
            })}
          </g>
          {L.regions.map((r) => {
            const c = on(r);
            const go = () => openTheme(r);
            return (
              <circle
                key={r.n.id}
                cx={c.x}
                cy={c.y}
                r={r.R * L.k0 * t.k}
                fill={r.tint}
                stroke={r.tint}
                className={`bg-region bg-fade${focus === r.n.id ? " on" : ""}${flash.has(r.n.id) ? " flash" : ""}`}
                style={{ opacity: !lit || lit.has(r.n.id) || r.notes.some((n) => lit.has(n.id)) ? 1 : dim }}
                role="button"
                tabIndex={focus && focus !== r.n.id ? -1 : 0}
                aria-label={`Theme: ${r.n.label}, ${r.notes.length} note${r.notes.length === 1 ? "" : "s"}`}
                aria-expanded={focus === r.n.id}
                onClick={go}
                onKeyDown={onKey(go)}
                // At rest a theme's tip names it and says why its lines are there.
                onMouseMove={!focus ? hover("Theme", r.n.label, undefined, r.n.id) : undefined}
                onMouseLeave={unhover}
              />
            );
          })}
          {shown.map((e) => {
            const a = pos(e.from);
            const b = pos(e.to);
            return (
              <g key={e.id}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`bg-edge${tip?.edge?.id === e.id ? " hover" : ""}`} />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="bg-edge-hit" onMouseMove={hover(EDGE_TYPES[e.kind], e.reason, e)} onMouseLeave={unhover} />
              </g>
            );
          })}
          {open && column.map((row) => <line key={row.n.id} x1={row.d.x} y1={row.d.y} x2={row.x - 4} y2={row.y} stroke={open.tint} className="bg-lead" />)}
          {open && listed && hot && (() => {
            const d = pos(hot.id);
            return <line x1={d.x} y1={d.y} x2={colX - 4} y2={hot.y} stroke={open.tint} className="bg-lead" />;
          })()}
          {all.nodes.map((n) => {
            if (n.type === "theme") return null;
            const p = pos(n.id);
            const home = region(n.parent);
            const brand = n.id === BRAND;
            const fill = brand ? "var(--ink)" : home ? home.tint : n.type === "crowd" ? `var(--crowd-${n.crowd ?? 0})` : "var(--muted)";
            const r = brand ? 5.5 : dotR(n.type === "crowd" ? 4.4 : home ? 3 : 3.4);
            const guess = !brand && guessed(n);
            const inside = !!home && focus === home.n.id;
            const pick = () => (home ? (inside ? setPicked(picked === n.id ? undefined : n.id) : openTheme(home)) : pickRing(n));
            const head = NODE_TYPES[n.type].label;
            const body = n.detail && home ? n.detail : n.label;
            return (
              <g key={n.id} className="bg-fade" style={{ opacity: alpha(n.id) }}>
                <circle cx={p.x} cy={p.y} r={r} fill={guess ? "var(--sunken)" : fill} stroke={fill} className={`bg-dot${guess ? " guess" : ""}${flash.has(n.id) ? " flash" : ""}${picked === n.id ? " picked" : ""}${hot?.id === n.id ? " hot" : ""}`} />
                {brand ? (
                  <circle cx={p.x} cy={p.y} r={9} className="bg-hit still" onMouseMove={hover("Brand", n.label, undefined, BRAND)} onMouseLeave={unhover} />
                ) : (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={home && !inside ? r + 1 : Math.max(r + 3, 8)}
                    className="bg-hit"
                    role="button"
                    tabIndex={home && !inside ? -1 : 0}
                    aria-label={`${head}: ${home ? body : n.label}`}
                    onClick={pick}
                    onKeyDown={onKey(pick)}
                    onMouseMove={hover(head, body, undefined, n.id)}
                    onMouseLeave={unhover}
                  />
                )}
              </g>
            );
          })}
          <text className="bg-cap brand bg-fade" style={{ opacity: alpha(BRAND) }} aria-hidden>
            {brandText.map((l, i) => <tspan key={i} x={(bb.x0 + bb.x1) / 2} y={bb.y0 + 9 + i * 12}>{l}</tspan>)}
          </text>
          {L.regions.map((r) => {
            const rest = caps.get(r.n.id);
            const place = focus ? (focus === r.n.id ? "above" : undefined) : rest?.place;
            if (!place) return null;
            const c = on(r);
            const text = focus ? lines(r.n.label, 20) : rest!.text;
            const b = capsBox(place, text, c, r.R * L.k0 * t.k, unit(centre, c));
            return (
              <text key={r.n.id} className="bg-cap bg-fade" style={{ opacity: !lit || lit.has(r.n.id) || r.notes.some((n) => lit.has(n.id)) ? 1 : dim }} onClick={() => openTheme(r)} aria-hidden>
                {text.map((l, i) => <tspan key={i} x={(b.x0 + b.x1) / 2} y={b.y0 + 9 + i * 12}>{l}</tspan>)}
              </text>
            );
          })}
          {column.map((row) => (
            <text
              key={row.n.id}
              x={row.x}
              y={row.y + 4}
              className={`bg-nlabel${picked === row.n.id ? " picked" : ""}`}
              onClick={() => setPicked(picked === row.n.id ? undefined : row.n.id)}
              onMouseMove={row.text === row.n.label && !row.n.detail ? undefined : hover(NODE_TYPES[row.n.type].label, row.n.detail ?? row.n.label)}
              onMouseLeave={unhover}
            >
              {row.text}
            </text>
          ))}
          {named.map((l) => (
            <text key={l.id} x={l.x} y={l.y} textAnchor={l.anchor} className={`bg-nlabel still${l.id === picked ? " picked" : ""}`}>
              {l.text}
            </text>
          ))}
        </svg>
        {open && listed && (
          <ul className="bg-names" style={{ left: colX, width: right - colX }} aria-label={`Notes in ${open.n.label}`} onScroll={() => setHot(undefined)}>
            {notes.map(({ n }) => {
              const point = (e: { currentTarget: HTMLElement }) => {
                const b = e.currentTarget.getBoundingClientRect();
                const s = stage.current?.getBoundingClientRect();
                if (s) setHot({ id: n.id, y: b.top + b.height / 2 - s.top });
              };
              const long = !!n.detail || n.label.length * TEXT_W > right - colX - 8;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    className={picked === n.id ? "picked" : undefined}
                    aria-pressed={picked === n.id}
                    onClick={() => setPicked(picked === n.id ? undefined : n.id)}
                    onMouseEnter={point}
                    onFocus={point}
                    onMouseMove={long ? hover(NODE_TYPES[n.type].label, n.detail ?? n.label) : undefined}
                    onMouseLeave={() => (setHot(undefined), unhover())}
                    onBlur={() => setHot(undefined)}
                  >
                    {n.label}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {open && <button type="button" className="bg-out" onClick={back}>All themes</button>}
        <button
          type="button"
          className="bg-expand"
          aria-pressed={full}
          onClick={() => {
            held.current = wrap.current?.offsetHeight ?? 0;
            setTip(undefined);
            setFull((f) => !f);
          }}
        >
          {full ? "Close" : "Expand"}
        </button>
      </div>
      {tip && (
        <div className="bg-tip" style={{ left: Math.max(8, Math.min(tip.x + 12, (wrap.current?.clientWidth ?? size.w) - 250)), top: Math.min(tip.y + 14, size.h - 56) }} role="tooltip">
          <span className="bg-label">{tip.head}</span>
          <span>{tip.body}</span>
          {tip.why?.map((w) => <span key={w} className="bg-tip-why">{w}</span>)}
          {tip.edge && <small className={`src src-${tip.edge.source.kind}`}>{sourceLabel(tip.edge.source)}</small>}
        </div>
      )}
      {card && <NodeCard n={card} tint={region(card.type === "theme" ? card.id : card.parent)?.tint} edges={all.edges} names={byId} facts={input.facts} onEdit={(ops) => (setPicked(undefined), onEdit(ops))} onPick={pickAny} />}
      <p className="small muted bg-key">
        {L.regions.length ? "Shaded: your themes, a dot for each note. " : ""}
        {!L.ring.length ? "" : ringLabels.length < L.ring.length ? `Outer ring, clockwise from the top: ${ringTypes.join(", ")}. ` : "Outer ring: everything else, grouped. "}A faint line joins what's linked; point at a dot to see why. A thin outline: my read, not yet yours.
      </p>
      <p className="small muted bg-hint">
        {narrow
          ? "Tap a theme to open it, or empty space to zoom back out. Two fingers pan and pinch."
          : "Click a theme to open it; Esc or a click on empty space zooms back out. Drag to pan; scroll with Ctrl or ⌘ held to zoom."}
      </p>
    </div>
  );
  if (!full) return view;
  // Full screen sits over the page; a block of the same height keeps the page from jumping under it.
  return (
    <>
      <div className="bg-graph-held" style={{ height: held.current }} aria-hidden />
      {createPortal(view, document.body)}
    </>
  );
}

/** A node's card (§13.12): what it is, where it came from, why it's linked, and its edits. */
function NodeCard({ n, tint, edges, names, facts, onEdit, onPick }: { n: GraphNode; tint?: string; edges: GraphEdge[]; names: Map<string, GraphNode>; facts: LiveFact[]; onEdit: (ops: Op[]) => void; onPick: (id: string) => void }) {
  const t = NODE_TYPES[n.type];
  const note = n.parent && n.type === "fact" ? facts.find((f) => `fact:${f.id}` === n.id) : undefined;
  const srcs = note ? sourcesOf(note) : [];
  // Its own lines: not the ones joining a note to its theme, nor a theme's to the brand.
  const mine = edges
    .filter((e) => (e.from === n.id || e.to === n.id) && names.get(e.from)?.parent !== e.to && names.get(e.to)?.parent !== e.from && !(n.type === "theme" && (e.from === BRAND || e.to === BRAND)))
    .slice(0, 4);
  const fill = tint ?? (n.type === "crowd" ? `var(--crowd-${n.crowd ?? 0})` : "var(--muted)");
  return (
    <article className="bg-card" aria-label={n.label}>
      <p className="bg-label">
        <svg className="bg-swatch" width="14" height="14" viewBox="-7 -7 14 14" aria-hidden>
          <circle r={4.5} fill={guessed(n) ? "none" : fill} stroke={fill} strokeWidth={1.2} />
        </svg>{" "}
        {t.label}
      </p>
      <h4 className="bg-card-title">{n.label}</h4>
      {n.tier && <p className="small"><span className={`bg-tier${n.tier.watch ? " watch" : ""}`}>{n.tier.label}</span> {n.tier.reason}</p>}
      {n.when && <p className="small"><span className="bg-when">{n.when}</span></p>}
      {n.detail && <p className="small">{n.detail}</p>}
      {mine.map((e) => {
        const other = names.get(e.from === n.id ? e.to : e.from);
        return (
          <p key={e.id} className="small bg-why">
            {e.reason}
            {other && other.id !== BRAND && <> · <button type="button" className="linkish" onClick={() => onPick(other.id)}>{other.label}</button></>}
          </p>
        );
      })}
      {srcs.length ? (
        <ul className="bg-sources small muted">{srcs.map((w) => <li key={w}>{w}</li>)}</ul>
      ) : (
        <small className={`src src-${n.source.kind}`}>{fromLabel(n)}</small>
      )}
      <div><Actions n={n} onEdit={onEdit} facts={facts} /></div>
    </article>
  );
}
