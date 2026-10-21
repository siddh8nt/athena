"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { itemId, latest } from "@/lib/agent/outcomes";
import type { Handoff } from "@/lib/agent/handoffs";
import { NEAR_MISS_LABEL } from "@/lib/journey/types";
import { TIER_LABEL, type Block, type CrowdPage, type Detail, type Line, type Named, type PageSource, type PageTab, type Section } from "@/lib/team/page";
import { MARKS, MARK_LABEL, type Mark, type Outcome, type WorkItem } from "@/lib/team/types";
import { Handoffs } from "./Team";
import { HeatLayers } from "./HeatLayers";

// One page shape for every subagent (PRD §23.5 b): a tab per crowd (Win first, Win next, Watch) and Across all
// three, the same sections in the same order in every crowd tab. On a phone the tabs swipe, the sections fold into
// cards and a name opens as a full-screen sheet.

const ACROSS = "across";
const TONES = ["More playful", "More premium", "Shorter"];
/** Kinds a founder reaches out to or tries, and so can mark. */
const MARKABLE = new Set(["message", "rival", "show", "podcast", "creator", "partner", "neighbourhood", "step", "venue", "retailer"]);

type Picked = { named: Named; kind: string; src?: PageSource; crowd?: PageTab["crowd"]; detail?: Detail };

export function CrowdTabs({
  page,
  agent,
  outcomes,
  onMark,
  onHandoff,
  onHooks,
}: {
  page: CrowdPage;
  agent: string;
  outcomes: Outcome[];
  onMark: (item: WorkItem, m: Mark) => void;
  onHandoff?: (h: Handoff) => void;
  /** A tab's hooks rewritten in place by a tone button. */
  onHooks?: (crowdId: string, lines: Line[]) => void;
}) {
  const ids = [...page.tabs.map((t) => t.crowd.id), ...(page.across ? [ACROSS] : [])];
  const [on, setOn] = useState(ids[0]);
  const [picked, setPicked] = useState<Picked | null>(null);
  // A row that opens a section on Across all three (a city's own page): the tab switches and the section opens.
  const [focus, setFocus] = useState<string | null>(null);
  const cur = ids.includes(on) ? on : ids[0];
  const tab = page.tabs.find((t) => t.crowd.id === cur);
  const sections = tab?.sections ?? page.across?.sections ?? [];
  const sources = new Map((tab?.sources ?? page.across?.sources ?? []).map((s) => [s.id, s]));
  const marks = new Map(latest(outcomes).filter((o) => o.agent === agent).map((o) => [o.item, o.mark]));
  const mark = (id: string, kind: string, name: string, m: Mark, group?: string) => onMark({ id, kind, name, why: "", group: group ?? kind, sources: [], callIds: [] }, m);
  const go = (id: string) => (setOn(ACROSS), setFocus(id));
  const ctx: Ctx = { tab, sources, marks, mark, pick: setPicked, go, onHooks, avoid: latest(outcomes).filter((o) => o.agent === agent && o.kind === "message" && o.mark === "no").map((o) => o.name) };

  return (
    <div className="crowd-page">
      <div className="dash-tabs crowd-tabs" role="tablist" aria-label="Your crowds">
        {page.tabs.map((t) => (
          <button key={t.crowd.id} type="button" role="tab" aria-selected={cur === t.crowd.id} className={`dash-tab${cur === t.crowd.id ? " on" : ""}`} onClick={() => setOn(t.crowd.id)}>
            <small className="crowd-tier">{TIER_LABEL[t.crowd.tier]}</small>
            <span>{t.crowd.name}</span>
          </button>
        ))}
        {page.across && (
          <button type="button" role="tab" aria-selected={cur === ACROSS} className={`dash-tab${cur === ACROSS ? " on" : ""}`} onClick={() => setOn(ACROSS)}>
            Across all three
          </button>
        )}
      </div>
      <div className="dash-tab-body crowd-body" key={cur} role="tabpanel">
        {tab?.crowd.nearMiss && <p className="small crowd-near">{NEAR_MISS_LABEL}</p>}
        <Folds key={cur} sections={sections} ctx={ctx} onHandoff={onHandoff} focus={cur === ACROSS ? focus : null} />
        <p className="small muted crowd-method">{tab?.method ?? page.across?.method}</p>
      </div>
      {picked && <Sheet p={picked} marks={marks} mark={mark} onHandoff={onHandoff} onClose={() => setPicked(null)} />}
    </div>
  );
}

type Ctx = {
  tab?: PageTab;
  sources: Map<string, PageSource>;
  marks: Map<string, Mark>;
  mark: (id: string, kind: string, name: string, m: Mark, group?: string) => void;
  pick: (p: Picked) => void;
  go: (section: string) => void;
  onHooks?: (crowdId: string, lines: Line[]) => void;
  avoid: string[];
};

/** Each section folds to its title and summary; on a phone only the first starts open. */
function Folds({ sections, ctx, onHandoff, focus }: { sections: Section[]; ctx: Ctx; onHandoff?: (h: Handoff) => void; focus?: string | null }) {
  const [shut, setShut] = useState<string[]>([]);
  useEffect(() => {
    // A city's own page starts folded, so Across reads as its overview first; on a phone only the first section is open.
    const phone = window.matchMedia?.("(max-width: 640px)").matches;
    setShut(sections.filter((s, i) => s.id !== focus && ((phone && i > 0) || s.id.startsWith("city:"))).map((s) => s.id));
    // Only on arrival: a fold the founder opens stays open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!focus) return;
    setShut((x) => x.filter((id) => id !== focus));
    requestAnimationFrame(() => document.getElementById(`sec-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [focus]);
  return (
    <>
      {sections.map((s) => {
        const closed = shut.includes(s.id);
        return (
          <div key={s.id} id={`sec-${s.id}`} className={`kb-fold crowd-sec${closed ? " kb-shut" : ""}`}>
            <button type="button" className="kb-fold-head" aria-expanded={!closed} onClick={() => setShut(closed ? shut.filter((x) => x !== s.id) : [...shut, s.id])}>
              <strong>{s.title}</strong>
              {s.summary && <small className="muted">{s.summary}</small>}
              <span className="kb-chev" aria-hidden style={{ marginLeft: "auto" }} />
            </button>
            {!closed && (
              <div className="kb-fold-body crowd-sec-body">
                {s.blocks.map((b, i) => (
                  <BlockView key={i} b={b} section={s.id} ctx={ctx} />
                ))}
                {s.id === "attention" && ctx.tab && onHandoff && <AttentionHandoffs tab={ctx.tab} onHandoff={onHandoff} />}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Where their attention goes hands on: shows to the Promoter, podcasts and creators to the Matchmaker. */
function AttentionHandoffs({ tab, onHandoff }: { tab: PageTab; onHandoff: (h: Handoff) => void }) {
  const kinds = new Set(tab.sections.find((s) => s.id === "attention")?.blocks.flatMap((b) => (b.type === "names" ? b.groups.flatMap((g) => g.names.map((n) => n.kind)) : [])));
  const list: Handoff[] = [
    ...(kinds.has("show") ? [{ to: "promoter" as const, label: `Reach ${tab.crowd.name} through their shows`, focus: { crowd: tab.crowd.id } }] : []),
    ...(kinds.has("podcast") || kinds.has("creator") ? [{ to: "matchmaker" as const, label: `Partner with who ${tab.crowd.name} follows`, focus: { crowd: tab.crowd.id } }] : []),
  ];
  return list.length ? <Handoffs list={list} onHandoff={onHandoff} /> : null;
}

const KIND_OF_SECTION: Record<string, string> = { words: "message", rivals: "rival" };

function BlockView({ b, section, ctx }: { b: Block; section: string; ctx: Ctx }) {
  if (b.type === "note") return <p className="small muted">{b.text}</p>;
  if (b.type === "facts")
    return (
      <dl className="crowd-facts">
        {b.rows.map((r) => (
          <div key={r.label}>
            <dt className="small muted">{r.label}</dt>
            <dd title={r.src ? ctx.sources.get(r.src)?.label : undefined}>{r.value}</dd>
          </div>
        ))}
      </dl>
    );
  if (b.type === "names")
    return (
      <div className="crowd-names">
        {b.label && <p className="crowd-label">{b.label}</p>}
        {b.groups.map((g) => (
          <div key={g.label} className="crowd-group">
            <p className="small muted crowd-group-label">{g.label}</p>
            <ul className="crowd-chips">
              {g.names.map((n) => {
                const kind = n.kind ?? "name";
                const m = n.item ? ctx.marks.get(n.item) : undefined;
                return (
                  <li key={n.name}>
                    <button
                      type="button"
                      className={`crowd-chip${m ? ` crowd-chip-${m}` : ""}`}
                      title={n.src ? ctx.sources.get(n.src)?.label : undefined}
                      onClick={() => ctx.pick({ named: n, kind, src: n.src ? ctx.sources.get(n.src) : undefined, crowd: ctx.tab?.crowd })}
                    >
                      {n.name}
                      {n.note && <small className="muted"> · {n.note}</small>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    );
  if (b.type === "lines") return <Lines b={b} kind={KIND_OF_SECTION[section] ?? "line"} ctx={ctx} />;
  if (b.type === "images")
    return (
      <div className="crowd-images">
        {b.label && <p className="crowd-label">{b.label}</p>}
        <ul>
          {b.images.map((im) => (
            <Img key={im.url} im={im} />
          ))}
        </ul>
      </div>
    );
  if (b.type === "swatches")
    return (
      <div>
        {b.label && <p className="crowd-label">{b.label}</p>}
        <ul className="crowd-swatches">
          {b.swatches.map((s) => (
            <li key={s.hex + s.name} title={s.from.length ? `From ${s.from.join(", ")}` : undefined}>
              <span className="crowd-swatch" style={{ background: s.hex }} aria-hidden />
              <span className="small">
                {s.name} <span className="muted">{s.hex}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  if (b.type === "budget") return <Budget b={b} />;
  if (b.type === "paths") return <Paths b={b} />;
  if (b.type === "heat") return <HeatLayers b={b} />;
  if (b.type === "table") return <Table b={b} ctx={ctx} />;
  if (b.type === "pipeline") return <Pipeline b={b} ctx={ctx} />;
  if (b.type === "working") return <Working b={b} ctx={ctx} />;
  if (b.type === "checks")
    return (
      <div className="crowd-lines">
        {b.label && <p className="crowd-label">{b.label}</p>}
        <ul>
          {b.checks.map((c) => (
            <li key={c.item} className={`crowd-line nav-check${ctx.marks.get(c.item) === "yes" ? " nav-done" : ""}`}>
              <div>
                <p>{c.text}</p>
                {c.detail && <p className="small muted">{c.detail}</p>}
              </div>
              <Marks name={c.text} mark={ctx.marks.get(c.item)} onMark={(m) => ctx.mark(c.item, "step", c.text, m, c.group)} />
            </li>
          ))}
        </ul>
      </div>
    );
  if (b.type === "steps")
    return (
      <ol className="crowd-steps">
        {b.steps.map((s, i) => (
          <li key={i}>
            <span>{s.text}</span>
            {s.signal && <small className="muted">{s.signal}</small>}
          </li>
        ))}
      </ol>
    );
  return null;
}

/** A table whose rows open: a city's own page on Across all three, or a sheet with the row's detail. On a phone it scrolls sideways inside its card. */
function Table({ b, ctx }: { b: Extract<Block, { type: "table" }>; ctx: Ctx }) {
  const open = (r: (typeof b.rows)[number]) => (r.goto ? ctx.go(r.goto) : r.detail ? ctx.pick({ named: { name: r.detail.title, item: r.detail.item }, kind: r.detail.kind ?? "row", detail: r.detail, crowd: ctx.tab?.crowd }) : undefined);
  const [by, setBy] = useState<Record<string, string>>({});
  const rows = b.rows.filter((r) => Object.entries(by).every(([f, v]) => !v || r.facets?.[f]?.includes(v)));
  return (
    <div className="nav-table">
      {b.label && <p className="crowd-label">{b.label}</p>}
      {!!b.facets?.length && <Facets facets={b.facets} rows={b.rows} by={by} setBy={setBy} />}
      <div className="nav-table-scroll">
        <table>
          <thead>
            <tr>
              {b.columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const m = r.detail?.item ? ctx.marks.get(r.detail.item) : undefined;
              const live = !!(r.goto || r.detail);
              return (
                <tr key={i} className={`${live ? "nav-row" : ""}${m ? ` crowd-chip-${m}` : ""}`} onClick={live ? () => open(r) : undefined}>
                  {r.cells.map((c, j) =>
                    j === 0 && live ? (
                      <th key={j} scope="row">
                        <button type="button" className="linkish" onClick={(e) => (e.stopPropagation(), open(r))}>
                          {c}
                        </button>
                      </th>
                    ) : j === 0 ? (
                      <th key={j} scope="row">
                        {c}
                      </th>
                    ) : (
                      <td key={j}>{c}</td>
                    ),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Filters above a list: one select per facet, with the values its rows have. A facet with one value isn't offered. */
function Facets({ facets, rows, by, setBy }: { facets: string[]; rows: { facets?: Record<string, string[]> }[]; by: Record<string, string>; setBy: (x: Record<string, string>) => void }) {
  const values = (f: string) => [...new Set(rows.flatMap((r) => r.facets?.[f] ?? []))].sort();
  const shown = facets.filter((f) => values(f).length > 1);
  if (!shown.length) return null;
  return (
    <div className="nav-facets" role="group" aria-label="Filter">
      {shown.map((f) => (
        <label key={f} className="small">
          <span className="muted">{f}</span>
          <select value={by[f] ?? ""} onChange={(e) => setBy({ ...by, [f]: e.target.value })}>
            <option value="">All</option>
            {values(f).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

/** Outreach as a board: To pitch, then a column per mark, from the founder's marks as they make them. */
function Pipeline({ b, ctx }: { b: Extract<Block, { type: "pipeline" }>; ctx: Ctx }) {
  const [by, setBy] = useState<Record<string, string>>({});
  const items = b.items.filter((x) => Object.entries(by).every(([f, v]) => !v || x.facets?.[f]?.includes(v)));
  const cols: { id: Mark | "todo"; label: string }[] = [{ id: "todo", label: "To pitch" }, ...MARKS.map((m) => ({ id: m, label: MARK_LABEL[m] }))];
  return (
    <div className="nav-pipeline">
      {b.label && <p className="crowd-label">{b.label}</p>}
      {!!b.facets?.length && <Facets facets={b.facets} rows={b.items} by={by} setBy={setBy} />}
      <div className="nav-pipe-cols">
        {cols.map((c) => {
          const here = items.filter((x) => (ctx.marks.get(x.item) ?? "todo") === c.id);
          return (
            <div key={c.id} className="nav-pipe-col">
              <p className="small">
                <strong>{c.label}</strong> <span className="muted">{here.length}</span>
              </p>
              <ul>
                {here.slice(0, 40).map((x) => (
                  <li key={x.item} className="nav-pipe-card">
                    <span>{x.name}</span>
                    <Marks name={x.name} mark={ctx.marks.get(x.item)} onMark={(m) => ctx.mark(x.item, x.kind, x.name, m, x.group)} />
                  </li>
                ))}
                {here.length > 40 && <li className="small muted">and {here.length - 40} more</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Yes rates from the founder's marks, by shop type, tier and neighbourhood. Until something is heard back, it says how it fills. */
function Working({ b, ctx }: { b: Extract<Block, { type: "working" }>; ctx: Ctx }) {
  const heard = b.items.filter((x) => {
    const m = ctx.marks.get(x.item);
    return m && m !== "pitched";
  });
  if (!heard.length) return <p className="small muted">{b.label ? `${b.label}: ` : ""}as you mark shops Yes, No or No reply, the yes rate by shop type, tier and neighbourhood shows here.</p>;
  return (
    <div className="nav-working">
      {b.label && <p className="crowd-label">{b.label}</p>}
      {b.by.map((f) => {
        const groups = [...new Set(heard.map((x) => x.facets[f]).filter(Boolean))];
        const rate = (v: string) => {
          const g = heard.filter((x) => x.facets[f] === v);
          return { yes: g.filter((x) => ctx.marks.get(x.item) === "yes").length, n: g.length };
        };
        const ranked = groups.map((v) => ({ v, ...rate(v) })).sort((a, z) => z.yes / z.n - a.yes / a.n || z.n - a.n);
        return (
          <div key={f} className="crowd-group">
            <p className="small muted crowd-group-label">By {f.toLowerCase()}</p>
            <ul className="small">
              {ranked.map((r) => (
                <li key={r.v}>
                  <strong>{r.v}</strong> · {r.yes} yes of {r.n} heard back
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** The budget split across partner kinds, as shares the founder can change; never a schedule (§23.5 g). */
function Budget({ b }: { b: Extract<Block, { type: "budget" }> }) {
  const [shares, setShares] = useState(() => b.rows.map((r) => Math.round(r.share)));
  const total = shares.reduce((a, x) => a + x, 0);
  return (
    <div className="crowd-budget">
      {b.label && <p className="crowd-label">{b.label}</p>}
      <ul>
        {b.rows.map((r, i) => (
          <li key={r.label}>
            <label>
              <span>{r.label}</span>
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                value={shares[i]}
                onChange={(e) => setShares(shares.map((x, k) => (k === i ? Math.max(0, Math.min(100, Number(e.target.value) || 0)) : x)))}
                aria-label={`${r.label} share of the budget, percent`}
              />
              <span className="muted">%</span>
            </label>
            <span className="crowd-budget-bar" style={{ width: `${total ? (shares[i] / total) * 100 : 0}%` }} aria-hidden />
            {r.note && <p className="small muted">{r.note}</p>}
          </li>
        ))}
      </ul>
      <p className="small muted">{total === 100 ? "Adds up to 100%." : `Adds up to ${total}%; the bars show each share of that.`}</p>
      {b.note && <p className="small muted">{b.note}</p>}
    </div>
  );
}

/** The tone buttons on an ask; the rewrite keeps every name and number it had (§23.5 g). */
const DRAFT_TONES = ["Warmer", "Shorter", "More premium"];

/** A draft to copy, or open in the mail app when a public email was found. Athena never sends it. */
function Draft({ d: given }: { d: NonNullable<Detail["draft"]> }) {
  const [copied, setCopied] = useState(false);
  const [d, setD] = useState(given);
  const [busy, setBusy] = useState<string>();
  useEffect(() => setD(given), [given]);
  const retone = async (tone: string) => {
    setBusy(tone);
    try {
      const r = await fetch("/api/draft/tone", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject: d.subject, body: d.body, tone, names: given.names ?? [] }) });
      const j = (await r.json().catch(() => ({}))) as { subject?: string; body?: string };
      if (r.ok && j.body) setD({ ...d, ...(j.subject ? { subject: j.subject } : {}), body: j.body });
    } catch {
      // The draft stays as it was.
    } finally {
      setBusy(undefined);
    }
  };
  const text = d.subject ? `Subject: ${d.subject}\n\n${d.body}` : d.body;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // The draft stays on screen to select by hand.
    }
  };
  const mail = d.to ? `mailto:${encodeURIComponent(d.to)}?${new URLSearchParams({ ...(d.subject ? { subject: d.subject } : {}), body: d.body }).toString().replace(/\+/g, "%20")}` : undefined;
  return (
    <div className="nav-draft">
      <p className="crowd-label">Draft{d.to ? ` to ${d.to}` : ""}</p>
      {d.toSrc && <p className="small muted">Email found on {d.toSrc}</p>}
      {d.subject && <p className="small"><strong>{d.subject}</strong></p>}
      <pre className="nav-draft-body">{d.body}</pre>
      {given.names && (
        <div className="nav-draft-acts nav-draft-tones">
          {DRAFT_TONES.map((t) => (
            <button key={t} type="button" disabled={!!busy} onClick={() => retone(t)}>
              {busy === t ? "Rewriting…" : t}
            </button>
          ))}
          {d.body !== given.body && (
            <button type="button" disabled={!!busy} onClick={() => setD(given)}>
              As first written
            </button>
          )}
        </div>
      )}
      <div className="nav-draft-acts">
        <button type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
        {mail && (
          <a className="button" href={mail}>
            Open in mail app
          </a>
        )}
      </div>
    </div>
  );
}

/** An image only shows once it has loaded; one that can't load simply isn't on the board. */
function Img({ im }: { im: { name: string; url: string; kind: string } }) {
  const [ok, setOk] = useState<boolean | null>(null);
  if (ok === false) return null;
  return (
    <li className={ok ? "" : "crowd-img-wait"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={im.url} alt={im.name} loading="lazy" referrerPolicy="no-referrer" onLoad={() => setOk(true)} onError={() => setOk(false)} />
      <small>{im.name}</small>
    </li>
  );
}

/** Lines of copy; the hooks carry the tone buttons and are rewritten in place, from the evidence they came from. */
function Lines({ b, kind, ctx }: { b: Extract<Block, { type: "lines" }>; kind: string; ctx: Ctx }) {
  const [busy, setBusy] = useState<string | null>(null);
  const tab = ctx.tab;
  const rewrite = async (tone: string) => {
    if (!tab?.evidence || !ctx.onHooks) return;
    setBusy(tone);
    try {
      const r = await fetch("/api/hooks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ evidence: tab.evidence, tone: tone.toLowerCase(), avoid: ctx.avoid }) });
      const d = (await r.json().catch(() => ({}))) as { hooks?: { text: string; claims?: { ref: string }[] }[] };
      // No new lines (the model is off, or every claim failed the check): the hooks already there stay.
      if (d.hooks?.length) ctx.onHooks(tab.crowd.id, d.hooks.map((h) => ({ text: h.text, from: (h.claims ?? []).map((c) => c.ref), item: itemId("message", h.text) })));
    } catch {
      // The hooks already there stay.
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="crowd-lines">
      {b.label && <p className="crowd-label">{b.label}</p>}
      {b.rewrite && !!tab?.evidence && !!ctx.onHooks && (
        <div className="crowd-tones" role="group" aria-label="Rewrite the hooks">
          {TONES.map((t) => (
            <button key={t} type="button" className={busy === t ? "on" : ""} disabled={!!busy} onClick={() => rewrite(t)}>
              {t}
            </button>
          ))}
          {busy && <small className="muted">Rewriting the hooks {busy.toLowerCase()}, from the same evidence…</small>}
        </div>
      )}
      <ul className={busy ? "crowd-rewriting" : ""}>
        {b.lines.map((l) => (
          <li key={l.text} className="crowd-line">
            <div>
              {l.tag && <small className="crowd-tag">{l.tag}</small>}
              <p>{l.text}</p>
              {l.reason && <p className="small muted">{l.reason}</p>}
              {!!l.from?.length && <p className="small muted">Built on {l.from.slice(0, 4).join(", ")}</p>}
            </div>
            {l.item && MARKABLE.has(kind) && <Marks name={l.text} mark={ctx.marks.get(l.item)} onMark={(m) => ctx.mark(l.item!, kind, l.text, m)} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Marks({ name, mark, onMark }: { name: string; mark?: Mark; onMark: (m: Mark) => void }) {
  return (
    <span className="spec-marks" role="group" aria-label={`What happened with ${name}`}>
      {MARKS.map((m) => (
        <button key={m} type="button" className={mark === m ? "on" : ""} aria-pressed={mark === m} onClick={() => onMark(m)}>
          {MARK_LABEL[m]}
        </button>
      ))}
    </span>
  );
}

/** The crowds as a small graph: a solid line where they share three or more loves, a thin one for one or two, a dashed leap for none. */
function Paths({ b }: { b: Extract<Block, { type: "paths" }> }) {
  const n = b.nodes.length;
  const pos = (i: number) => (n === 2 ? { x: 70 + i * 180, y: 60 } : { x: [160, 50, 270][i] ?? 160, y: [28, 128, 128][i] ?? 60 });
  const at = new Map(b.nodes.map((x, i) => [x.id, pos(i)]));
  return (
    <div className="crowd-paths">
      <svg viewBox="0 0 320 160" role="img" aria-label="How the crowds connect">
        {b.edges.map((e) => {
          const p = at.get(e.a), q = at.get(e.b);
          if (!p || !q) return null;
          return <line key={e.a + e.b} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className={`path-${e.strength}`} />;
        })}
        {b.nodes.map((x) => {
          const p = at.get(x.id)!;
          return (
            <g key={x.id} transform={`translate(${p.x} ${p.y})`}>
              <circle r="7" className={`path-node path-${x.tier}`} />
              <text y={x.id === b.nodes[0]?.id && n === 3 ? -13 : 22} textAnchor="middle" className="path-name">
                {x.name.length > 22 ? `${x.name.slice(0, 21)}…` : x.name}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="small">
        {b.edges.map((e) => {
          const a = b.nodes.find((x) => x.id === e.a)?.name, c = b.nodes.find((x) => x.id === e.b)?.name;
          return (
            <li key={e.a + e.b}>
              <strong>
                {a} ↔ {c}
              </strong>{" "}
              <span className="muted">· {e.strength === "strong" ? "a strong path" : e.strength === "thin" ? "a thin path" : "a leap"}</span>
              {e.shared.length > 0 && <span>: {e.shared.slice(0, 5).join(", ")}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A name's detail: what it is, where it came from, its marks and where it hands on. A full-screen sheet on a phone. */
function Sheet({ p, marks, mark, onHandoff, onClose }: { p: Picked; marks: Map<string, Mark>; mark: Ctx["mark"]; onHandoff?: (h: Handoff) => void; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const { named: n, kind, src, crowd, detail } = p;
  const next: Handoff[] =
    crowd && onHandoff
      ? kind === "show" || kind === "tv_show"
        ? [{ to: "promoter", label: `Reach ${crowd.name} through ${n.name}`, focus: { crowd: crowd.id } }]
        : kind === "podcast" || kind === "creator"
          ? [{ to: "matchmaker", label: `Partner with ${n.name}`, focus: { crowd: crowd.id } }]
          : []
      : [];
  // On the body, so no transformed panel above it can pin the sheet to itself instead of the screen.
  return createPortal(
    <div className="crowd-sheet-wrap" onClick={onClose}>
      <div className="crowd-sheet card" role="dialog" aria-label={n.name} onClick={(e) => e.stopPropagation()}>
        <div className="crowd-sheet-head">
          <h4>{n.name}</h4>
          <button type="button" className="linkish" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {n.note && <p className="small">{n.note}</p>}
        {!detail && crowd && <p className="small muted">{crowd.name}</p>}
        {detail && (
          <dl className="crowd-facts nav-sheet-facts">
            {detail.facts.map((f) => (
              <div key={f.label}>
                <dt className="small muted">{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {detail?.lines?.map((l) => (
          <p key={l} className="nav-sheet-line">
            {l}
          </p>
        ))}
        {src && <p className="small muted">From {src.label}{src.callId ? ` · call ${src.callId}` : ""}</p>}
        {detail?.draft && <Draft d={detail.draft} />}
        {!!detail?.links?.length && (
          <p className="small nav-sheet-links">
            {detail.links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                {l.label}
              </a>
            ))}
          </p>
        )}
        {n.item && MARKABLE.has(kind) && <Marks name={n.name} mark={marks.get(n.item)} onMark={(m) => mark(n.item!, kind, n.name, m, detail?.group)} />}
        {next.length > 0 && <Handoffs list={next} onHandoff={(h) => (onClose(), onHandoff!(h))} />}
      </div>
    </div>,
    document.body,
  );
}
