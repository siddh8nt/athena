"use client";

import { useEffect, useRef, useState } from "react";
import type { ReadCard } from "@/lib/agent/plan";
import type { MarketsData } from "@/lib/blocks/markets";
import type { PlacesData, VenuePick } from "@/lib/blocks/places";
import type { PartnersData, PartnerCard } from "@/lib/blocks/partners";
import type { MessageData } from "@/lib/blocks/message";
import type { MomentsData, Moment } from "@/lib/blocks/moments";
import type { BlockMeta, Evidence, Source } from "@/lib/blocks/types";
import type { PlacesComparison } from "@/lib/proof/without-qloo";
import type { PodcastNumbers } from "@/lib/enrich/podcast-numbers";
import { metroById } from "@/lib/playbook/metros";

export function SourceTag({ source }: { source: Source }) {
  return <span className={`src src-${source.replace(/\s/g, "").toLowerCase()}`}>{source}</span>;
}

/** `method`: one quiet line on how the block was ranked. */
export function BlockHeader({ title, meta, onTrace, method }: { title: string; meta?: BlockMeta; onTrace?: () => void; method?: string }) {
  return (
    <header className="block-head">
      <h2>{title}</h2>
      {method && <p className="method">{method}</p>}
      {meta && (
        <button className="calls" onClick={onTrace} title="Open these calls in the trace">
          Built from {meta.calls.length} Qloo call{meta.calls.length === 1 ? "" : "s"}
        </button>
      )}
      {meta?.status === "thin" && <p className="thin">Thin results: {meta.thinReason}</p>}
      {meta?.fallbackFrom && <p className="thin">Showing the last live run from {new Date(meta.fallbackFrom).toLocaleString()}</p>}
    </header>
  );
}

function Chips({ items }: { items: Evidence[] }) {
  return (
    <ul className="chips">
      {items.map((r, i) => (
        <li key={i} className={`chip chip-${r.kind}`}>
          {r.label}
        </li>
      ))}
    </ul>
  );
}

export function ReadView({ card, meta, onTrace }: { card: ReadCard; meta?: BlockMeta; onTrace: () => void }) {
  return (
    <section className="block">
      <BlockHeader title="How I read your business" meta={meta} onTrace={onTrace} method={card.lines.some((l) => l.label === "Taste signal" && l.value.includes(":")) ? "The taste of the crowd you chose, from Qloo." : "The taste your accounts' crowds have in common."} />
      <p className={`badge badge-${card.status}`}>{card.status === "tuned" ? "Tuned ✓" : "Beta: not tuned yet; results may be thinner"}</p>
      <dl className="card-lines">
        {card.lines.map((l) => (
          <div key={l.label}>
            <dt>{l.label}</dt>
            <dd>
              {l.value}
              {l.evidence && <em className="evidence"> · {l.evidence}</em>}
            </dd>
          </div>
        ))}
      </dl>
      {card.fingerprint.length > 0 && (
        <>
          <h3>Taste fingerprint <SourceTag source="Qloo" /></h3>
          <ul className="chips">
            {card.fingerprint.map((t) => (
              <li key={t.id} className="chip chip-tag">{t.name}</li>
            ))}
          </ul>
        </>
      )}
      <div className="row-actions">
        <button className="primary">Looks right</button>
        <button>Edit</button>
      </div>
    </section>
  );
}

export function MarketsView({ data, meta, onTrace }: { data: MarketsData; meta: BlockMeta; onTrace: () => void }) {
  return (
    <section className="block">
      <BlockHeader title="Where to grow next" meta={meta} onTrace={onTrace} method={data.method === "brands" ? "Each city scored on how strongly your crowd's brands rank there." : "Ranked by how much of your crowd's taste each metro holds."} />
      <ol className="list">
        {data.metros.slice(0, 10).map((m) => (
          <li key={m.metroId} className={m.metroId === data.target.metroId ? "is-target" : ""}>
            <span className="rank">{m.rank}</span>
            <div>
              <strong>{m.name}</strong>
              <p className="reason">{m.reason}</p>
              {m.census?.population && (
                <p className="enrich">
                  Population {(m.census.population.value / 1e6).toFixed(1)}M
                  {m.census.medianIncome && <> · median household income ${m.census.medianIncome.value.toLocaleString()}</>} <SourceTag source="Census" /> <span className="muted">ACS 2020–2024</span>
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      <h3>Where the taste concentrates in {data.target.name} <SourceTag source="Qloo" /></h3>
      {data.neighbourhoods?.length ? (
        <ul className="plain">
          {data.neighbourhoods.slice(0, 5).map((n) => (
            <li key={n.name}>
              {n.name} · {n.cells} cells <SourceTag source={n.source} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Neighbourhood names unavailable. The map shows {data.heatmap.cells.length} taste cells (brighter means more of your crowd&apos;s taste).</p>
      )}
    </section>
  );
}


export type DraftContext = { brand: string; product: string; partners: { id: string; name: string; pForward: number }[] };
type Draft = { subject: string; sentences: { text: string }[]; bridges: { name: string; pAccounts: number; pVenue: number }[]; removed: number };

/** A venue pitch (§9.8, §9.10): shared loves first, every name checked; copy or open in Gmail, never sent. */
function DraftPanel({ v, ctx }: { v: VenuePick; ctx: DraftContext }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const write = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: ctx.brand,
          product: ctx.product,
          partners: ctx.partners,
          venue: { id: v.id, name: v.name, neighbourhood: v.neighbourhood, tags: v.tags.map((t) => t.name), reasons: v.reasons.map((r) => r.label) },
        }),
      });
      if (res.ok) setDraft((await res.json()) as Draft);
    } catch {
      // The button stays available.
    }
    setBusy(false);
  };
  if (!draft)
    return (
      <button className="primary" onClick={write} disabled={busy}>
        {busy ? "Finding shared loves and writing…" : "Draft a pitch"}
      </button>
    );
  const body = draft.sentences.map((s) => s.text).join("\n\n");
  return (
    <div className="draft">
      {draft.bridges.length > 0 && (
        <div className="bridges">
          {draft.bridges.map((b) => (
            <p key={b.name}>
              <strong>{b.name}</strong> · your crowd: {ordinal(Math.round(b.pAccounts * 100))} percentile · this venue&apos;s crowd: {ordinal(Math.round(b.pVenue * 100))} <SourceTag source="Qloo" />
            </p>
          ))}
        </div>
      )}
      <p className="draft-label">Draft <SourceTag source="Agent" /> · nothing is sent</p>
      <p><strong>Subject:</strong> {draft.subject}</p>
      {draft.sentences.map((s, i) => <p key={i}>{s.text}</p>)}
      {draft.removed > 0 && <p className="note">{draft.removed} sentence{draft.removed === 1 ? "" : "s"} removed: not supported by the evidence.</p>}
      <div className="row-actions">
        <button
          onClick={() => {
            navigator.clipboard?.writeText(`Subject: ${draft.subject}\n\n${body}`).then(() => setCopied(true)).catch(() => undefined);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <a className="button" href={`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(body)}`} target="_blank" rel="noreferrer">
          Open in Gmail ↗
        </a>
        <button onClick={() => { setDraft(null); setCopied(false); }}>Rewrite</button>
      </div>
    </div>
  );
}

function VenueRow({ v, selected, onSelect, draft, pulse }: { v: VenuePick; selected: boolean; onSelect: () => void; draft?: DraftContext; pulse?: boolean }) {
  return (
    <li className={selected ? "is-selected" : ""}>
      <button className={`row ${pulse ? "pulse-target" : ""}`} onClick={onSelect} aria-expanded={selected}>
        <span className="rank">{v.rank}</span>
        <div>
          <strong>{v.name}</strong>
          <p className="reason">{[v.neighbourhood, v.address].filter(Boolean).join(" · ")}</p>
          <Chips items={v.reasons} />
        </div>
      </button>
      {selected && (
        <div className="drawer">
          <p>
            Priority {v.rank} · {v.reasons.map((r) => r.label).join(" · ")}
          </p>
          {v.tags.length > 0 && <p className="muted">Tags: {v.tags.map((t) => t.name).join(", ")}</p>}
          <p className="contact">
            {v.contact.phone && <>{v.contact.phone.value} <SourceTag source={v.contact.phone.source} /> </>}
            {v.contact.website && (
              <a href={v.contact.website.value} target="_blank" rel="noreferrer">
                Website ↗
              </a>
            )}
            {!v.contact.phone && !v.contact.website && <span className="muted">Contact not found</span>}
          </p>
          <p className="note">Stocking also depends on price, margin, distribution and timing.</p>
          {draft ? <DraftPanel v={v} ctx={draft} /> : null}
        </div>
      )}
    </li>
  );
}

export type CompareRequest = { key: string; brandName: string; whatYouSell: string; tier: string };

/** 1st, 2nd, 3rd, 4th… 11th, 12th, 13th, 21st. */
export function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

const pct = (x: number | undefined) => (x === undefined ? "—" : `${Math.round(x * 100)}%`);

/** Without Qloo (§9.9, M3): the same question to a chatbot with Google Search and no Qloo, every venue checked. */
function WithoutQloo({ data, request, onResult }: { data: PlacesData; request: CompareRequest; onResult: (c: PlacesComparison | null) => void }) {
  const [state, setState] = useState<{ steps: string[]; result?: PlacesComparison | null; running: boolean }>({ steps: [], running: false });
  const run = async () => {
    setState({ steps: [], running: true });
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...request,
          metroId: data.metroId,
          channels: data.channels,
          signal: data.signal,
          athena: data.picks.map((p) => ({ id: p.id, name: p.name, popularity: p.popularity, rank: p.rank, evidence: p.reasons.length })),
        }),
      });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i).trim();
          buf = buf.slice(i + 2);
          if (!chunk.startsWith("data:")) continue;
          const e = JSON.parse(chunk.slice(5)) as { type: "step"; step: string } | { type: "result"; comparison: PlacesComparison | null };
          if (e.type === "step") setState((s) => ({ ...s, steps: [...s.steps, e.step] }));
          else {
            setState((s) => ({ ...s, running: false, result: e.comparison }));
            onResult(e.comparison);
          }
        }
      }
    } catch {
      // Quietly reset; the button stays available.
    }
    setState((s) => ({ ...s, running: false }));
  };
  // Run once per mount (React's dev double-invoke would otherwise ask the chatbot twice).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const c = state.result;
  if (!c) {
    return (
      <div className="compare">
        <ol className="steps" aria-live="polite">
          {state.steps.map((s, i) => (
            <li key={i} className={i === state.steps.length - 1 && state.running ? "step-running" : ""}>{s}</li>
          ))}
          {!state.steps.length && <li className="step-running">Starting the comparison</li>}
        </ol>
        {!state.running && <button onClick={run}>Run the comparison again</button>}
      </div>
    );
  }
  const m = c.metrics;
  return (
    <div className="compare">
      <div className="metrics" aria-live="polite">
        <div><strong>{pct(m.cantFindOrClosed)}</strong><span>of the chatbot&apos;s venues are closed or couldn&apos;t be verified in Qloo</span></div>
        <div><strong>{pct(m.mostObviousLlm)}</strong><span>are among the most popular 5% in Qloo (Athena: {pct(m.mostObviousAthena)})</span></div>
        <div><strong>{pct(m.evidenceAthena)}</strong><span>of Athena&apos;s picks carry ≥ 2 Qloo evidence chips (chatbot: 0%)</span></div>
        {m.tasteFitMedianRank !== undefined && <div><strong>#{Math.round(m.tasteFitMedianRank)}</strong><span>median taste rank of the chatbot&apos;s found venues, in one pool of {m.poolSize} with Athena&apos;s</span></div>}
      </div>
      <p className="note">
        Demonstrated, not measured: {c.model} with Google Search and no Qloo, asked the same question on {new Date(c.ranAt).toLocaleDateString()}; each venue was then looked up in Qloo.
        &quot;Couldn&apos;t verify&quot; means no match nearby, not that the place is made up.
      </p>
      <ol className="list">
        {c.llm.map((v, i) => (
          <li key={i}>
            <span className="rank">{i + 1}</span>
            <div>
              <strong>{v.name}</strong>
              <p className="reason">{[v.address, v.why].filter(Boolean).join(" · ")}</p>
              <ul className="chips">
                <li className={`chip chip-${v.status}`}>
                  {v.status === "found" ? `found · ${ordinal(Math.round((v.popularity ?? 0) * 100))} popularity percentile` : v.status === "closed" ? "closed in Qloo" : "couldn't verify"}
                </li>
                {v.athenaRank && <li className="chip chip-contribution">also Athena #{v.athenaRank}</li>}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function PlacesView({ data, meta, selectedId, onSelect, onTrace, compare, onCompare, moved, draft, highlight }: { data: PlacesData; meta: BlockMeta; selectedId?: string; onSelect: (id: string) => void; onTrace: () => void; compare?: CompareRequest; onCompare?: (c: PlacesComparison | null) => void; moved?: { id: string; from: number; to: number; reason: string }[]; draft?: DraftContext; highlight?: "flip" | "first" }) {
  const [without, setWithout] = useState(false);
  return (
    <section className="block">
      <BlockHeader title="Which venues to approach" meta={meta} onTrace={onTrace} method={`Ranked by how closely each venue's crowd matches ${data.fromCrowd ? "your crowd's" : "your accounts'"} taste, in ${metroById(data.metroId).name}.`} />
      {compare && (
        <div className="flip" role="group" aria-label="Compare with a chatbot">
          <button className={!without ? "active" : ""} aria-pressed={!without} onClick={() => { setWithout(false); onCompare?.(null); }}>With Qloo</button>
          <button className={`${without ? "active" : ""} ${highlight === "flip" && !without ? "pulse-target" : ""}`} aria-pressed={without} onClick={() => setWithout(true)}>Without Qloo</button>
        </div>
      )}
      {!without && moved && moved.length > 0 && (
        <ul className="moved" aria-live="polite">
          <li><strong>What changed</strong> after your outcomes:</li>
          {moved.slice(0, 4).map((m) => <li key={m.id}>{data.picks.find((p) => p.id === m.id)?.name}: #{m.from + 1} → #{m.to + 1} · {m.reason}</li>)}
        </ul>
      )}
      {without && compare ? (
        <WithoutQloo data={data} request={compare} onResult={(c) => onCompare?.(c)} />
      ) : (
        <ol className="list">
          {data.picks.map((v, i) => (
            <VenueRow key={v.id} v={v} selected={v.id === selectedId} onSelect={() => onSelect(v.id)} draft={draft} pulse={highlight === "first" && i === 0 && !selectedId} />
          ))}
        </ol>
      )}
    </section>
  );
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Who listens (§9.6): Qloo insights with the show as the signal. Aggregate skew, never a head count. */
function Listeners({ l }: { l: NonNullable<PartnerCard["listeners"]> }) {
  const lean = [l.gender && `skews ${l.gender.label}`, l.age && `${l.gender ? "" : "skews "}${l.age.label}`].filter(Boolean).join(", ");
  return (
    <div className="listeners">
      <p className="listeners-head">Who listens <span className="muted">· based on Qloo Insights</span></p>
      {lean && <p><span className="k">Audience</span>{lean[0].toUpperCase() + lean.slice(1)} <span className="muted">(a skew, not a head count)</span></p>}
      {l.brands.length > 0 && <p><span className="k">They also love</span>{l.brands.join(", ")}</p>}
      {l.tv.length > 0 && <p><span className="k">They watch</span>{l.tv.join(", ")}</p>}
      {l.shared.length > 0 && (
        <p><span className="k">Common ground</span>{l.shared.map((s) => `${s.name} (your crowd: ${ordinal(Math.round(s.pYou * 100))} percentile, theirs: ${ordinal(Math.round(s.pThem * 100))})`).join("; ")}</p>
      )}
      {l.likesYou && <p><span className="k">How they rate you</span>#{l.likesYou.rank} of {l.likesYou.of} brands like you</p>}
    </div>
  );
}

/** Public figures, searched only when asked (§9.6): each one dated, sourced and checked against Google's sources. */
function PublicNumbers({ p }: { p: PartnerCard }) {
  const [state, setState] = useState<{ steps: string[]; running: boolean; result?: PodcastNumbers | null }>({ steps: [], running: false });
  const handle = p.contact.instagram?.value.split("/").filter(Boolean).pop();
  const run = async (fresh = false) => {
    setState({ steps: [], running: true });
    try {
      const res = await fetch("/api/podcast-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, name: p.name, description: p.description, appleId: p.itunesId, instagram: handle, website: p.contact.site?.value, fresh }),
      });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i).trim();
          buf = buf.slice(i + 2);
          if (!chunk.startsWith("data:")) continue;
          const e = JSON.parse(chunk.slice(5)) as { type: "step"; step: string } | { type: "result"; numbers: PodcastNumbers | null };
          if (e.type === "step") setState((s) => ({ ...s, steps: [...s.steps, e.step] }));
          else setState((s) => ({ ...s, running: false, result: e.numbers }));
        }
      }
    } catch {
      // The button stays available.
    }
    setState((s) => ({ ...s, running: false }));
  };
  const r = state.result;
  if (r) {
    return (
      <div className="numbers">
        {r.figures.length > 0 ? (
          <ul className="plain">
            {r.figures.map((f) => (
              <li key={f.url + f.text}>
                {f.kind === "sponsor" ? <a href={f.url} target="_blank" rel="noreferrer">{f.text} ↗</a> : f.text}
                <span className="muted">
                  {" · "}{f.estimate ? `estimate by ${f.site}` : f.site}{f.asOf ? `, ${f.asOf}` : ", undated"}{f.old ? " (may be out of date)" : ""}
                  {f.kind !== "sponsor" && <> · <a href={f.url} target="_blank" rel="noreferrer">source ↗</a></>}
                </span>{" "}
                <SourceTag source="Web" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Podcasts usually share audience numbers in a media kit on request{p.contact.email ? <>: <a href={`mailto:${p.contact.email.value}`}>{p.contact.email.value}</a></> : ""}.</p>
        )}
        <p className="muted">
          {r.figures.length > 0 && <>Confirmed {shortDate(new Date(r.ranAt).toISOString())}{r.unchanged && r.checkedAt ? `; searched again ${shortDate(new Date(r.checkedAt).toISOString())}, nothing newer` : ""} · </>}
          <button className="linkish" onClick={() => run(true)}>Search again</button>
        </p>
        {r.searchEntryPoint && (
          <iframe className="search-chip" title="Google Search Suggestions" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={`<base target="_blank">${r.searchEntryPoint}`} />
        )}
      </div>
    );
  }
  if (state.running || state.steps.length) {
    return (
      <ol className="steps" aria-live="polite">
        {state.steps.map((s, i) => <li key={i} className={i === state.steps.length - 1 && state.running ? "step-running" : ""}>{s}</li>)}
        {!state.steps.length && <li className="step-running">Starting the search</li>}
      </ol>
    );
  }
  return <button className="linkish" onClick={() => run()}>Find public audience numbers</button>;
}

function PodcastDetails({ p }: { p: PartnerCard }) {
  const c = p.contact;
  return (
    <>
      {(c.episodes || c.lastEpisode) && (
        <p className="enrich">
          {[c.episodes && `${c.episodes.value.toLocaleString()} episodes`, c.lastEpisode && `latest ${shortDate(c.lastEpisode.value)}`, p.genre].filter(Boolean).join(" · ")}
          {p.inactive && <span className="muted"> · no new episode in 2+ months</span>} <SourceTag source="Apple Podcasts" />
        </p>
      )}
      {p.listeners && <Listeners l={p.listeners} />}
      <p className="contact">
        {c.website && <a href={c.website.value} target="_blank" rel="noreferrer">Listen ↗</a>}
        {c.site && <a href={c.site.value} target="_blank" rel="noreferrer">Website ↗</a>}
        {c.email && <a href={`mailto:${c.email.value}`}>{c.email.value}</a>}
        {c.instagram && <a href={c.instagram.value} target="_blank" rel="noreferrer">Instagram ↗</a>}
      </p>
      <PublicNumbers p={p} />
    </>
  );
}

function PartnerRow({ p }: { p: PartnerCard }) {
  const links = [
    p.contact.website && { label: p.kind === "podcast" ? "Listen" : "Website", ...p.contact.website },
    p.contact.instagram && { label: "Instagram", ...p.contact.instagram },
    p.contact.x && { label: "X", ...p.contact.x },
  ].filter(Boolean) as { label: string; value: string; source: Source }[];
  return (
    <li>
      <span className="rank">{p.rank}</span>
      <div>
        <strong>{p.name}</strong>
        <div className="fit" title="Mutual fit is the weaker of the two sides">
          <span className="side">
            <span className="side-label">You → them</span>
            <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.round(p.pForward * 100)}%` }} /></span>
            <span>{ordinal(Math.round(p.pForward * 100))} percentile</span>
          </span>
          {p.reverseRank ? (
            <span className="side">
              <span className="side-label">Them → you</span>
              <span className="bar-track"><span className="bar-fill rev" style={{ width: `${Math.round((p.pReverse ?? 0) * 100)}%` }} /></span>
              <span>#{p.reverseRank.rank} of {p.reverseRank.of} brands like you</span>
            </span>
          ) : null}
        </div>
        {p.reasons.length > 0 && <Chips items={p.reasons} />}
        {p.kind === "podcast" ? (
          <PodcastDetails p={p} />
        ) : (
          <p className="contact">
            {links.map((l) => (
              <a key={l.label} href={l.value} target="_blank" rel="noreferrer">
                {l.label} ↗
              </a>
            ))}
            {links.length > 0 && <SourceTag source={links[0].source} />}
          </p>
        )}
      </div>
    </li>
  );
}

export function PartnersView({ data, meta, onTrace }: { data: PartnersData; meta: BlockMeta; onTrace: () => void }) {
  return (
    <section className="block">
      <BlockHeader title="Who to team up with" meta={meta} onTrace={onTrace} method="Scored from both sides: your crowd's taste for them, and theirs for you." />
      <h3>Collab brands <SourceTag source="Qloo" /></h3>
      <ol className="list">{data.brands.map((p) => <PartnerRow key={p.id} p={p} />)}</ol>
      {data.podcasts.length > 0 && (
        <>
          <h3>Podcasts to sponsor <SourceTag source="Qloo" /></h3>
          <ol className="list">{data.podcasts.map((p) => <PartnerRow key={p.id} p={p} />)}</ol>
        </>
      )}
      <p className="note">Fit means shared taste, not a deal.</p>
    </section>
  );
}

const AGE_LABEL: Record<string, string> = { "24_and_younger": "24 and under", "25_to_29": "25–29", "30_to_34": "30–34", "35_to_44": "35–44", "45_to_54": "45–54", "55_and_older": "55+" };

export function MessageView({ data, meta, onTrace }: { data: MessageData; meta: BlockMeta; onTrace: () => void }) {
  const kinds: [string, string][] = [["tv_show", "TV"], ["movie", "Film"], ["artist", "Music"], ["book", "Books"]];
  return (
    <section className="block">
      <BlockHeader title="How to talk to your crowd" meta={meta} onTrace={onTrace} method="What your crowd over-indexes on, across categories. Hooks are written only from these." />
      <h3>Taste themes <SourceTag source="Qloo" /></h3>
      <ul className="chips">{data.themes.map((t) => <li key={t.id} className="chip chip-tag">{t.name}</li>)}</ul>
      <h3>Cultural references <SourceTag source="Qloo" /></h3>
      <dl className="refs">
        {kinds.map(([k, label]) => {
          const refs = data.references.filter((r) => r.kind === k);
          return refs.length ? (
            <div key={k}>
              <dt>{label}</dt>
              <dd>{refs.map((r) => `#${r.rank} ${r.name}`).join(" · ")}</dd>
            </div>
          ) : null;
        })}
      </dl>
      <p className="note">Artists are cultural references, not contacts.</p>
      {data.positioning.length > 0 && (
        <>
          <h3>Positioning <SourceTag source="Qloo" /></h3>
          {data.positioning.map((p) => (
            <div key={p.competitorId} className="position">
              <strong>vs {p.competitorName}</strong>
              <p>Shared: {p.shared.join(", ") || "none found"}</p>
              <p>Only you: {p.onlyYou.join(", ") || "none found"}</p>
              <p>Only them: {p.onlyThem.join(", ") || "none found"}</p>
            </div>
          ))}
        </>
      )}
      {data.interests.length > 0 && (
        <>
          <h3>Interests your crowd over-indexes on <SourceTag source="Qloo" /></h3>
          <ul className="chips">{data.interests.map((i) => <li key={i.id} className="chip">{i.name}</li>)}</ul>
        </>
      )}
      {data.skew && (
        <>
          <h3>Audience skew <SourceTag source="Qloo" /></h3>
          {data.skew.weak ? (
            <p className="muted">No clear skew</p>
          ) : (
            <table className="skew">
              <tbody>
                {[...Object.entries(data.skew.age).map(([k, v]) => [AGE_LABEL[k] ?? k, v] as const), ...Object.entries(data.skew.gender).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), v] as const)].map(([k, v]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td>
                      <span className={`bar ${v >= 0 ? "pos" : "neg"}`} style={{ width: `${Math.min(50, Math.abs(v) * 100)}%` }} />
                    </td>
                    <td className="num">{v >= 0 ? "over-indexes" : "under-indexes"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {data.hooks && (data.hooks.hooks.length > 0 || data.hooks.ideas.length > 0) && (
        <>
          <h3>Hooks <SourceTag source="Agent" /></h3>
          {data.hooks.tone && <p className="tone">{data.hooks.tone.text}</p>}
          <ol className="hooks">{data.hooks.hooks.map((h, i) => <li key={i}>{h.text}</li>)}</ol>
          {data.hooks.ideas.length > 0 && (
            <>
              <h3>Content ideas <SourceTag source="Agent" /></h3>
              <ol className="hooks">{data.hooks.ideas.map((h, i) => <li key={i}>{h.text}</li>)}</ol>
            </>
          )}
          <p className="note">Written by Gemini from the Qloo evidence above; every name is checked against it{data.hooks.removed ? `, and ${data.hooks.removed} unsupported sentence${data.hooks.removed === 1 ? " was" : "s were"} removed` : ""}.</p>
        </>
      )}
      <p className="label-fixed">{data.label}</p>
    </section>
  );
}

function MomentRow({ m }: { m: Moment }) {
  return (
    <li>
      <span className="rank">#{m.tasteRank}</span>
      <div>
        <strong>{m.name}</strong>
        <p className="reason">
          {m.kind === "show" ? `Your crowd's #${m.tasteRank} artist` : `Festival taste match #${m.tasteRank}`}
          {m.date && <> · {new Date(m.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</>}
          {m.venue && <> · {m.venue}</>}
          {m.soon && <span className="soon"> soon</span>}
        </p>
        {m.url && m.source && (
          <p className="contact">
            <a href={m.url} target="_blank" rel="noreferrer">{m.kind === "show" ? "Tickets" : m.site ? `Source: ${m.site}` : "Source"} ↗</a> <SourceTag source={m.source} />
          </p>
        )}
        {m.searchEntryPoint && (
          // Google Search Suggestions chip, shown as provided (grounding terms). Sandboxed; links open in a new tab.
          <iframe className="search-chip" title="Google Search Suggestions" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={`<base target="_blank">${m.searchEntryPoint}`} />
        )}
      </div>
    </li>
  );
}

export function MomentsView({ data, meta, onTrace }: { data: MomentsData; meta: BlockMeta; onTrace: () => void }) {
  const [byDate, setByDate] = useState(false);
  const list = byDate ? [...data.moments].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")) : data.moments;
  return (
    <section className="block">
      <BlockHeader title="When and where to show up" meta={meta} onTrace={onTrace} method="Ordered by your crowd's taste, not by date." />
      {list.length > 1 && (
        <label className="toggle">
          <input type="checkbox" checked={byDate} onChange={(e) => setByDate(e.target.checked)} /> Soonest first
        </label>
      )}
      {list.length > 0 && <ol className="list">{list.map((m, i) => <MomentRow key={`${m.qlooId}-${i}`} m={m} />)}</ol>}
      {data.checking.length > 0 && (
        <ul className="checking" aria-live="polite">
          {data.checking.map((c) => (
            <li key={c.name}>
              <span className="pulse" aria-hidden /> <strong>{c.name}</strong>: {c.step}…
            </li>
          ))}
        </ul>
      )}
      {data.artists.length > 0 && (
        <>
          <h3>Your crowd&apos;s top artists <SourceTag source="Qloo" /></h3>
          <p className="muted">{data.artists.map((a) => `#${a.rank} ${a.name}`).join(" · ")}</p>
        </>
      )}
    </section>
  );
}
