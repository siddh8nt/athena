"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlacesData, VenuePick } from "@/lib/blocks/places";
import { mapsUrl, planRoute, routeIcs, routeMeters, type Stop } from "@/lib/methods/route";

export type Moved = { id: string; from: number; to: number; reason: string };

/** Act (M8): pipeline with the recipe's stages, re-rank from wins and declines (§9.7), and a field-day route (§9.12). */
export function ActView({
  brand,
  storageKey,
  stages,
  places,
  order,
  onReorder,
}: {
  brand: string;
  storageKey: string;
  stages: string[];
  places?: PlacesData;
  order: string[];
  onReorder: (order: string[], moved: Moved[]) => void;
}) {
  const all = [...stages, "Declined"];
  const [stageOf, setStageOf] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [moved, setMoved] = useState<Moved[]>([]);
  const [route, setRoute] = useState<Stop[] | null>(null);

  // The pipeline persists in this browser for the session (§6.2: anonymous, 7 days).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`athena:pipeline:${storageKey}`) ?? "{}") as { at?: number; stages?: Record<string, string> };
      if (saved.at && Date.now() - saved.at < 7 * 864e5 && saved.stages) setStageOf(saved.stages);
      else setStageOf({});
    } catch {
      setStageOf({});
    }
  }, [storageKey]);
  const persist = (next: Record<string, string>) => {
    setStageOf(next);
    try {
      localStorage.setItem(`athena:pipeline:${storageKey}`, JSON.stringify({ at: Date.now(), stages: next }));
    } catch {
      // Storage unavailable: the pipeline still works for this visit.
    }
  };

  const picks = useMemo(() => {
    const byId = new Map((places?.picks ?? []).map((p) => [p.id, p]));
    return (order.length ? order : (places?.picks ?? []).map((p) => p.id)).map((id) => byId.get(id)).filter((p): p is VenuePick => !!p);
  }, [places, order]);
  const wonStages = new Set(stages.length > 3 ? stages.slice(-2) : stages.slice(-1));
  const isOutcome = (st: Record<string, string>, id: string) => wonStages.has(st[id] ?? "") || st[id] === "Declined";

  const rerankWith = async (next: Record<string, string>) => {
    if (!places) return;
    setBusy(true);
    try {
      const res = await fetch("/api/rerank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pool: picks.filter((p) => !isOutcome(next, p.id)).map((p) => p.id),
          signal: places.signal,
          wins: picks.filter((p) => wonStages.has(next[p.id] ?? "")).map((p) => p.id),
          declines: picks.filter((p) => next[p.id] === "Declined").map((p) => p.id),
          tags: picks.map((p) => ({ id: p.id, tags: p.tags.map((t) => t.name) })),
        }),
      });
      const r = (await res.json()) as { order: string[]; moved: Moved[] };
      setMoved(r.moved);
      // Keep outcomes after the re-ranked open venues so nothing disappears from the session.
      onReorder([...r.order, ...picks.filter((p) => isOutcome(next, p.id)).map((p) => p.id)], r.moved);
    } catch {
      // Keep the current order.
    }
    setBusy(false);
  };

  // Saved outcomes from an earlier visit re-apply the re-rank once the picks are here.
  const replayed = useRef("");
  useEffect(() => {
    if (!places || order.length || replayed.current === storageKey) return;
    if (!Object.keys(stageOf).some((id) => isOutcome(stageOf, id))) return;
    replayed.current = storageKey;
    void rerankWith(stageOf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, stageOf, storageKey]);

  if (!places) return <section className="block"><h2>Actions</h2><p className="muted">Your venue picks appear here once Places is ready.</p></section>;

  const wins = picks.filter((p) => wonStages.has(stageOf[p.id] ?? "")).map((p) => p.id);
  const declines = picks.filter((p) => stageOf[p.id] === "Declined").map((p) => p.id);
  // Won and declined venues leave the ranked list (§9.7); they become the signal instead.
  const open = picks.filter((p) => !isOutcome(stageOf, p.id));
  const outcomes = picks.filter((p) => isOutcome(stageOf, p.id));

  const setStage = async (id: string, stage: string) => {
    const next = { ...stageOf, [id]: stage };
    persist(next);
    if (isOutcome(next, id) !== isOutcome(stageOf, id)) await rerankWith(next);
  };

  const planDay = () => {
    const stops = picks
      .filter((p) => stageOf[p.id] !== "Declined" && !wonStages.has(stageOf[p.id] ?? "") && p.lat !== undefined && p.lon !== undefined)
      .map((p) => ({ id: p.id, name: p.name, address: p.address, lat: p.lat!, lon: p.lon! }));
    setRoute(planRoute(stops, 8));
  };

  const downloadIcs = () => {
    if (!route) return;
    const day = new Date();
    day.setDate(day.getDate() + 1);
    day.setHours(10, 0, 0, 0);
    const url = URL.createObjectURL(new Blob([routeIcs(route, day, brand)], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${brand.replace(/\W+/g, "-").toLowerCase()}-field-day.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="block">
      <header className="block-head">
        <h2>What to do on Monday</h2>
        <p className="method">Wins and declines re-rank the list.</p>
      </header>

      <h3>Field day</h3>
      {!route ? (
        <button className="primary" onClick={planDay}>Plan a day (up to 8 stops)</button>
      ) : (
        <div className="route">
          <ol className="plain">{route.map((s) => <li key={s.id}>{s.name}{s.address ? <span className="muted"> · {s.address}</span> : null}</li>)}</ol>
          <p className="muted">{(routeMeters(route) / 1000).toFixed(1)} km between stops, ordered by nearest neighbour.</p>
          <div className="row-actions">
            <a className="button primary" href={mapsUrl(route, "driving")} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
            <button onClick={downloadIcs}>Add to calendar (.ics)</button>
            <button onClick={() => setRoute(null)}>Re-plan</button>
          </div>
        </div>
      )}

      <h3>Pipeline {busy && <span className="muted">· re-ranking from your outcomes…</span>}</h3>
      <p className="note">Mark a venue {[...wonStages].join(" or ")} or Declined, and the list re-ranks: venues like your wins move up, venues like your declines move down.</p>
      {moved.length > 0 && (
        <ul className="moved" aria-live="polite">
          {moved.slice(0, 5).map((m) => {
            const p = picks.find((x) => x.id === m.id);
            return <li key={m.id}><strong>{p?.name}</strong> · #{m.from + 1} → #{m.to + 1} · {m.reason}</li>;
          })}
        </ul>
      )}
      <ol className="list">
        {open.map((p, i) => (
          <li key={p.id} className={stageOf[p.id] === "Declined" ? "declined" : wonStages.has(stageOf[p.id] ?? "") ? "won" : ""}>
            <span className="rank">{i + 1}</span>
            <div className="pipe-row">
              <strong>{p.name}</strong>
              <select aria-label={`Stage for ${p.name}`} value={stageOf[p.id] ?? stages[0]} onChange={(e) => setStage(p.id, e.target.value)}>
                {all.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </li>
        ))}
      </ol>
      {outcomes.length > 0 && (
        <>
          <h3>Outcomes</h3>
          <ol className="list">
            {outcomes.map((p) => (
              <li key={p.id} className={stageOf[p.id] === "Declined" ? "declined" : "won"}>
                <span className="rank">{stageOf[p.id] === "Declined" ? "✕" : "✓"}</span>
                <div className="pipe-row">
                  <strong>{p.name}</strong>
                  <select aria-label={`Stage for ${p.name}`} value={stageOf[p.id]} onChange={(e) => setStage(p.id, e.target.value)}>
                    {all.map((st) => <option key={st}>{st}</option>)}
                  </select>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="note">Wins: {wins.length} · Declines: {declines.length}. Athena never contacts anyone; you do.</p>
    </section>
  );
}
