"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { CrowdCard } from "@/lib/journey/types";
import type { Geography, Hotspot } from "@/lib/geo/types";

const CrowdMap = dynamic(() => import("./CrowdMap").then((m) => m.CrowdMap), { ssr: false, loading: () => <div className="map crowd-map map-loading" /> });

// Where each crowd lives (§9.26), under the Taste Galaxy and linked to it. One US-wide heatmap per crowd; the lists
// beside the map name every hotspot, so nothing depends on colour.

const people = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

export function CrowdGeography({ crowds, lit, onLight }: { crowds: CrowdCard[]; lit: number | null; onLight: (c: number | null) => void }) {
  const body = JSON.stringify({ crowds: crowds.map((c) => ({ id: c.id, name: c.name, signal: c.signal.map((s) => s.id).slice(0, 10) })) });
  const [g, setG] = useState<(Geography & { note?: string }) | null>(null);
  useEffect(() => {
    let live = true;
    setG(null);
    fetch("/api/geography", { method: "POST", headers: { "Content-Type": "application/json" }, body })
      .then((r) => r.json() as Promise<Geography & { note?: string }>)
      .then((d) => live && setG(d))
      .catch(() => live && setG({ crowds: [], cells: [], calls: 0, callIds: [], q: 0.05, empty: true }));
    return () => {
      live = false;
    };
  }, [body]);

  if (!g)
    return (
      <section className="card crowd-geo" aria-busy="true">
        <h3>Where each crowd lives</h3>
        <p className="galaxy-step small">
          <span className="spin" aria-hidden />
          <span className="shimmer-text">Mapping each crowd across the US: one Qloo heatmap per crowd, about 10 seconds</span>
        </p>
      </section>
    );
  if (g.empty || !g.crowds.length)
    return (
      <section className="card crowd-geo">
        <h3>Where each crowd lives</h3>
        <p className="small muted">{g.note ?? "Qloo doesn't place these crowds on the map yet. Where takes it city by city in the next stop."}</p>
      </section>
    );

  const names = g.crowds.map((c) => c.name);
  const many = g.crowds.length > 1;
  return (
    <section className="card crowd-geo" aria-label="Where each crowd lives">
      <header className="galaxy-head">
        <h3>Where each crowd lives</h3>
        <p className="small muted galaxy-method">
          {many ? "Colour: the crowd whose taste leads in each area, stronger where it ranks higher. " : "Stronger where the crowd's taste ranks higher. "}
          Solid: hotspots, areas that love it more than chance allows (Gi*, {Math.round(g.q * 100)}% false discovery rate). Residents from the Census.
          {g.calls ? ` ${g.calls} Qloo calls.` : ""}
        </p>
      </header>
      <div className="crowd-geo-body">
        <CrowdMap geography={g} names={names} lit={lit} onLight={onLight} />
        <div className="crowd-geo-lists">
          {g.crowds.map((c, k) => (
            <article key={c.id} className={`crowd-geo-crowd${lit !== null && lit !== k ? " dimmed" : ""}`} onMouseEnter={() => onLight(k)} onMouseLeave={() => onLight(null)} onFocus={() => onLight(k)} onBlur={() => onLight(null)} tabIndex={0}>
              <h4>
                <span className="swatch" style={{ background: `var(--crowd-${k % 4})` }} aria-hidden /> {c.name}
              </h4>
              {many && (
                <p className="small">
                  Leads in areas home to {people(c.leads)} people{c.standsOut.length ? <>; stands out in {spots(c.standsOut.slice(0, 3))}</> : null}
                </p>
              )}
              {!!c.hotspots.length && (
                <p className="small">
                  <strong>Hotspots</strong> {spots(c.hotspots.slice(0, 4))}
                </p>
              )}
              {!!c.reach.length && (
                <p className="small" title="Residents in each metro's area, each weighted by how highly this crowd's taste ranks where they live">
                  <strong>Taste-weighted reach</strong> {c.reach.slice(0, 4).map((r) => `${r.name} ${people(r.reach)}`).join(" · ")}
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function spots(list: Hotspot[]) {
  return list.map((h, i) => (
    <span key={i}>
      {i ? ", " : ""}
      {h.label} <span className="muted">({people(h.people)} residents)</span>
    </span>
  ));
}
