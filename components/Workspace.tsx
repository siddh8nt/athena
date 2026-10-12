"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePlan, type PlanSource } from "./usePlan";
import { InlineQuestions, BuiltFrom, type Answers } from "./InlineQuestions";
import type { BrandBrief } from "@/lib/brief/types";
import type { InlineQuestion } from "@/lib/agent/plan";
import { ActView, type Moved } from "./Act";
import { TryThis, TRY_ITEMS, type TryKey } from "./TryThis";
import { MarketsView, MessageView, MomentsView, PartnersView, PlacesView, ReadView } from "./Blocks";
import type { MapPin } from "./MapView";
import type { MarketsData } from "@/lib/blocks/markets";
import type { PlacesData } from "@/lib/blocks/places";
import type { PartnersData } from "@/lib/blocks/partners";
import type { MessageData } from "@/lib/blocks/message";
import type { MomentsData } from "@/lib/blocks/moments";
import type { Block } from "@/lib/playbook/config";
import type { QlooCall } from "@/lib/qloo/types";
import type { PlacesComparison } from "@/lib/proof/without-qloo";
import { comparisonLine } from "@/lib/proof/line";

const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), { ssr: false, loading: () => <div className="map map-loading" /> });

export type BrandTab = { slug: string; name: string; blurb: string };

const TAB_LABEL: Record<Block | "read", string> = { read: "Read", markets: "Markets", places: "Places", partners: "Partners", message: "Message", moments: "Moments", act: "Actions" };

/**
 * The workspace: a demo brand's plan, or (v3.0) the dashboard for a journey's plan, the advanced view with
 * everything on one screen (§13.2). `custom` is the journey's input: the brief, the chosen crowd, city and growth.
 */
export function Workspace({ slug, brands, custom: fromJourney, onBack }: { slug: string; brands: BrandTab[]; custom?: { brief: BrandBrief; input: Record<string, unknown> }; onBack?: () => void }) {
  const [custom, setCustom] = useState<{ name: string; runId: number; brief: BrandBrief; answers: Answers; answered: string[]; source: PlanSource } | null>(() =>
    fromJourney ? { name: (fromJourney.brief.name?.value ?? "Your brand").trim(), runId: 1, brief: fromJourney.brief, answers: {}, answered: [], source: { kind: "custom", input: fromJourney.input, id: 1 } } : null,
  );
  const intake = () => (window.location.href = "/plan");
  const source: PlanSource = custom?.source ?? { kind: "demo", slug };
  const plan = usePlan(source);
  const activeKey = custom ? custom.source : null;
  const [tab, setTab] = useState<Block | "read">("read");
  const [selected, setSelected] = useState<string>();
  const [trace, setTrace] = useState<{ title: string; calls: QlooCall[] } | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [comparison, setComparison] = useState<PlacesComparison | null>(null);
  const [cachedComparison, setCachedComparison] = useState<PlacesComparison | null>(null);
  const [placesOrder, setPlacesOrder] = useState<string[]>([]);
  const [movedNotes, setMovedNotes] = useState<Moved[]>([]);

  // "Try this" (§2.4): items tick as they're done (kept in this browser); the card points, never presses.
  const [tryOpen, setTryOpen] = useState(true);
  const [tryDone, setTryDone] = useState<Set<TryKey>>(new Set());
  const [tryActive, setTryActive] = useState<TryKey | null>(null);
  const [firstSlug] = useState(slug);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("athena:try") ?? "{}") as { done?: TryKey[]; open?: boolean };
      if (saved.done) setTryDone(new Set(saved.done));
      // On phones the card starts as a chip (§2.4); on desktop it starts open unless the visitor closed it.
      if (saved.open === false || window.innerWidth < 760) setTryOpen(false);
    } catch {
      // Storage unavailable: the card still works for this visit.
    }
    // Deep links: /brightland?try=compare opens that item (§2.4).
    const params = new URLSearchParams(window.location.search);
    // Older links: "Try your own brand" now lives in the journey.
    if (params.get("own") === "1") intake();
    const k = params.get("try") as TryKey | null;
    if (k && TRY_ITEMS.some((i) => i.key === k)) pickTry(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const saveTry = (done: Set<TryKey>, open: boolean) => {
    try {
      localStorage.setItem("athena:try", JSON.stringify({ done: [...done], open }));
    } catch {
      // Ignore.
    }
  };
  const tick = (k: TryKey) =>
    setTryDone((d) => {
      if (d.has(k)) return d;
      const next = new Set(d).add(k);
      saveTry(next, tryOpen);
      if (tryActive === k) setTryActive(null);
      return next;
    });
  function pickTry(k: TryKey) {
    setTryActive(k);
    if (k === "compare" || k === "evidence") setTab("places");
    if (k === "message") setTab("message");
    if (k === "moments") setTab("moments");
  }

  // Reset per brand, only when the brand actually changes (a deep link may already have chosen a tab).
  const brandKey = custom ? `custom:${custom.name}:${custom.runId}` : `demo:${slug}`;
  const lastBrand = useRef(brandKey);
  useEffect(() => {
    if (lastBrand.current === brandKey) return;
    lastBrand.current = brandKey;
    setTab("read");
    setSelected(undefined);
    setComparison(null);
    setPlacesOrder([]);
    setMovedNotes([]);
  }, [slug, activeKey]);
  useEffect(() => {
    if (!fromJourney) setCustom(null);
  }, [slug, fromJourney]);
  useEffect(() => {
    if (slug !== firstSlug || custom) tick("switch");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, custom]);
  useEffect(() => {
    if (tab === "message" && plan.blocks.message) tick("message");
    if (tab === "moments" && plan.blocks.moments) tick("moments");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, plan.blocks.message, plan.blocks.moments]);
  useEffect(() => {
    if (selected) tick("evidence");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  useEffect(() => {
    if (comparison) tick("compare");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparison]);

  const tabs: (Block | "read")[] = ["read", ...(plan.card?.blocks ?? [])];
  const markets = plan.blocks.markets?.data as MarketsData | undefined;
  const rawPlaces = plan.blocks.places?.data as PlacesData | undefined;
  // After a re-rank (§9.7), Places, the map and the pipeline all follow the new order.
  const places = useMemo(() => {
    if (!rawPlaces || !placesOrder.length) return rawPlaces;
    const byId = new Map(rawPlaces.picks.map((p) => [p.id, p]));
    const picks = placesOrder.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p).map((p, i) => ({ ...p, rank: i + 1 }));
    return { ...rawPlaces, picks };
  }, [rawPlaces, placesOrder]);

  const pins: MapPin[] = useMemo(() => {
    // Without Qloo flipped: the chatbot's found venues as their own markers (§13.4); Athena's picks hidden.
    if (comparison) return comparison.llm.filter((v) => v.lat !== undefined && v.lon !== undefined).map((v, i) => ({ id: v.qlooId ?? `llm${i}`, rank: i + 1, name: v.name, lat: v.lat!, lon: v.lon!, kind: "llm" as const }));
    return (places?.picks ?? []).filter((p) => p.lat !== undefined && p.lon !== undefined).map((p) => ({ id: p.id, rank: p.rank, name: p.name, lat: p.lat!, lon: p.lon!, kind: "pick" as const }));
  }, [places, comparison]);
  const center: [number, number] = markets?.target.center ?? [34.0522, -118.2437];
  const compareKey = custom ? `custom-${custom.name}` : slug;
  useEffect(() => {
    setCachedComparison(null);
    if (!places?.metroId) return;
    fetch(`/api/compare?key=${encodeURIComponent(compareKey)}&metroId=${places.metroId}`)
      .then((r) => r.json())
      .then((c: PlacesComparison | null) => setCachedComparison(c))
      .catch(() => undefined);
  }, [compareKey, places?.metroId]);
  const line = (comparison ?? cachedComparison) && places ? comparisonLine((comparison ?? cachedComparison)!, places.picks.length) : undefined;
  // An inline answer (§6.2.2) re-runs only what it changes; everything else stays on screen.
  const answer = (q: InlineQuestion, a: Answers) =>
    setCustom((c) => {
      if (!c) return c;
      // Keep Athena's comparable pick fixed so a re-run doesn't drift from the blocks already on screen.
      const swap = plan.questions.find((x) => x.id === "swap_comparables");
      const answers = { ...(swap && !c.answers.pinnedComparables ? { pinnedComparables: swap.assumed.split(", ") } : {}), ...c.answers, ...a };
      return { ...c, answers, answered: [...c.answered, q.id], source: { kind: "custom", input: { ...(c.source.kind === "custom" ? c.source.input : {}), answers }, id: Date.now(), scope: q.reruns } };
    });
  const openQuestions = custom ? plan.questions.filter((q) => !custom.answered.includes(q.id)) : [];
  const openTrace = (b: Block | "read") => {
    const calls = b === "read" ? (plan.cardMeta?.calls ?? []) : (plan.blocks[b as Block]?.meta.calls ?? []);
    setTrace({ title: TAB_LABEL[b], calls });
  };

  const body = () => {
    if (tab === "read") {
      if (plan.card)
        return (
          <>
            {custom && <BuiltFrom card={plan.card} brief={custom.brief} questions={openQuestions} onReopenBrief={() => (onBack ? onBack() : intake())} onOpenQuestions={() => document.querySelector(".inline-qs")?.scrollIntoView({ behavior: "smooth" })} />}
            <ReadView card={plan.card} meta={plan.cardMeta} onTrace={() => openTrace("read")} />
          </>
        );
      const asks = plan.status === "done" ? plan.rail.filter((e) => e.status === "needs_input") : [];
      if (asks.length) return <section className="block"><h2>One more thing</h2>{asks.map((e, i) => <p key={i}>{e.why}: {e.summary}.</p>)}<button className="primary" onClick={() => (onBack ? onBack() : intake())}>Add details</button></section>;
      return <ReadingNow steps={plan.rail} />;
    }
    const b = plan.blocks[tab];
    if (tab === "act")
      return (
        <ActView
          brand={plan.card?.brand ?? ""}
          storageKey={custom ? `custom-${custom.name}` : slug}
          stages={plan.card?.pipelineStages ?? ["Target", "Contacted", "Won"]}
          places={places}
          order={placesOrder}
          onReorder={(order, moved) => {
            setPlacesOrder(order);
            setMovedNotes(moved);
          }}
        />
      );
    if (!b) return <Skeleton label={`Building ${TAB_LABEL[tab]}`} />;
    const t = () => openTrace(tab);
    switch (tab) {
      case "markets": return <MarketsView data={b.data as MarketsData} meta={b.meta} onTrace={t} />;
      case "places": {
        const what = plan.card?.lines.find((l) => l.label === "What you sell")?.value ?? "";
        const tier = /(mass|mainstream|premium|luxury)$/.exec(what)?.[1] ?? "";
        const compare = plan.card ? { key: custom ? `custom-${custom.name}` : slug, brandName: plan.card.brand, whatYouSell: what.replace(/, (mass|mainstream|premium|luxury)$/, ""), tier } : undefined;
        const partnersData = plan.blocks.partners?.data as PartnersData | undefined;
        const draft = plan.card ? { brand: plan.card.brand, product: what.replace(/, (mass|mainstream|premium|luxury)$/, ""), partners: (partnersData?.brands ?? []).map((p) => ({ id: p.id, name: p.name, pForward: p.pForward })) } : undefined;
        return <PlacesView data={places ?? (b.data as PlacesData)} meta={b.meta} moved={movedNotes} draft={draft} selectedId={selected} onSelect={(id) => setSelected(id === selected ? undefined : id)} onTrace={t} compare={compare} onCompare={setComparison} highlight={tryActive === "compare" ? "flip" : tryActive === "evidence" ? "first" : undefined} />;
      }
      case "partners": return <PartnersView data={b.data as PartnersData} meta={b.meta} onTrace={t} />;
      case "message": return <MessageView data={b.data as MessageData} meta={b.meta} onTrace={t} />;
      case "moments": return <MomentsView data={b.data as MomentsData} meta={b.meta} onTrace={t} />;
    }
  };

  return (
    <div className="workspace">
      <header className="topbar">
        <div className="brandmark">
          <Link href="/" className="wordmark-link"><strong>Athena</strong></Link>
          <span className="muted">the taste-led growth agent for consumer startups</span>
        </div>
        <nav className={`switcher ${tryActive === "switch" ? "pulse-target" : ""}`} aria-label="Demo brands">
          {brands.map((b) => (
            <Link key={b.slug} href={`/${b.slug}`} onClick={() => { setCustom(null); if (b.slug !== slug) tick("switch"); }} className={!custom && b.slug === slug ? "active" : ""} aria-current={!custom && b.slug === slug ? "page" : undefined}>
              <span>{b.name}</span>
              <small>{b.blurb}</small>
            </Link>
          ))}
          {custom && (
            <span className="active custom-chip">
              <span>{custom.name}</span>
              <small>Your brand · live</small>
            </span>
          )}
        </nav>
        <div className="top-actions">
          {onBack ? <button onClick={onBack}>← Back to the journey</button> : <Link className="button primary" href="/plan">Try your own brand</Link>}
          <button onClick={() => setTrace({ title: "All blocks", calls: [...(plan.cardMeta?.calls ?? []), ...Object.values(plan.blocks).flatMap((x) => x?.meta.calls ?? [])] })}>Trace</button>
        </div>
      </header>

      {line && (
        <p className="headline-line" aria-live="polite">
          {line} <span className="muted">Demonstrated, not measured.</span>
        </p>
      )}

      <main className="stage">
        <MapView center={center} bbox={markets?.target.bbox} cells={markets?.heatmap.cells ?? []} pins={pins} selectedId={selected} onSelect={(id) => { setTab("places"); setSelected(id); }} />

        <aside className="panel" aria-live="polite">
          <div className="tabs" role="tablist">
            {tabs.map((t) => {
              const ready = t === "read" ? !!plan.card : t === "act" || !!plan.blocks[t as Block];
              return (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  className={`${tab === t ? "active" : ""} ${ready ? "" : "pending"} ${tryActive && tab !== t && ((t === "places" && (tryActive === "compare" || tryActive === "evidence")) || t === tryActive) ? "pulse-target" : ""}`}
                  onClick={() => setTab(t)}
                >
                  {TAB_LABEL[t]}
                </button>
              );
            })}
          </div>
          <div className="panel-body">
            {!!openQuestions.length && <InlineQuestions questions={openQuestions} onAnswer={answer} />}
            {body()}
          </div>
        </aside>

        <TryThis
          done={tryDone}
          active={tryActive}
          open={tryOpen}
          onPick={pickTry}
          onToggle={() => {
            setTryOpen(!tryOpen);
            saveTry(tryDone, !tryOpen);
          }}
          onOwnBrand={intake}
        />

        <div className={`rail ${railOpen ? "open" : ""}`}>
          <button className="rail-toggle" onClick={() => setRailOpen(!railOpen)}>
            {plan.status === "done" ? `Done · ${plan.qlooCalls} Qloo calls · ${((plan.ms ?? 0) / 1000).toFixed(1)} s` : "Working…"}
          </button>
          <ol>
            {(railOpen ? plan.rail : plan.rail.slice(-3)).map((e, i) => (
              <li key={i} className={`rail-${e.status}`}>
                <span className="why">{e.why}</span> → <span>{e.summary}</span>
              </li>
            ))}
          </ol>
        </div>
      </main>

      {trace && (
        <div className="trace" role="dialog" aria-label="Trace">
          <header>
            <h2>Trace · {trace.title}</h2>
            <button onClick={() => setTrace(null)}>Close</button>
          </header>
          <p className="muted">{trace.calls.length} Qloo calls. Keys are never shown.</p>
          <ol>
            {trace.calls.map((c) => (
              <li key={c.id}>
                <code>{c.id}</code> <strong>{c.endpoint}</strong> · HTTP {c.status} · {c.resultCount} results · {c.cached ? "cached" : `${c.ms} ms${c.hedged ? " · answered by a second key" : ""}`}
                <pre>{Object.entries(c.params).map(([k, v]) => `${k}=${v.length > 120 ? `${v.slice(0, 120)}…` : v}`).join("\n")}</pre>
              </li>
            ))}
          </ol>
        </div>
      )}

      <footer className="foot">
        <Link href="/method">Method</Link> · <Link href="/sources">Sources</Link> · <Link href="/unknowns">What we don&apos;t know</Link> · Illustrative plan from public data; not affiliated with the brands shown · Data: Qloo · Map © OpenFreeMap, OpenMapTiles, OpenStreetMap contributors
      </footer>
    </div>
  );
}

/** While the agent reads the business, show each step as it happens rather than a blank wait. */
function ReadingNow({ steps }: { steps: { why: string; summary: string; status: string }[] }) {
  return (
    <section className="block" aria-live="polite">
      <h2>Reading the business…</h2>
      <ol className="steps">
        {steps.map((e, i) => (
          <li key={i} className={`step-${e.status}`}>
            <strong>{e.why}</strong>
            <span className="muted"> · {e.summary}</span>
          </li>
        ))}
        {!steps.length && <li className="step-running"><strong>Starting</strong></li>}
      </ol>
    </section>
  );
}

function Skeleton({ label }: { label: string }) {
  return (
    <section className="block skeleton" aria-busy="true">
      <h2>{label}…</h2>
      {[0, 1, 2, 3].map((i) => <div key={i} className="sk-row" />)}
    </section>
  );
}
