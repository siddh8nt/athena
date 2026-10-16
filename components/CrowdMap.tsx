"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import { geohashBounds } from "@/lib/geo/geohash";
import type { Geography } from "@/lib/geo/types";
import { STYLE, css, loadMapLibre } from "./maplibre";
import { ordinal } from "./Blocks";

// Crowd weather (§9.26): every US cell coloured by the crowd whose taste leads there, stronger where its percentile is
// higher; hotspots solid. Linked to the Taste Galaxy: `lit` dims every other crowd, and hovering a cell lights its
// crowd there too. Colour is never alone: hovering names the crowd, and the lists beside the map carry every hotspot.

const LOWER_48: [number, number, number, number] = [-125, 24.3, -66.9, 49.4];

type Feature = { type: "Feature"; properties: Record<string, number | string>; geometry: { type: "Polygon"; coordinates: number[][][] } };

function weatherGeoJSON(g: Geography) {
  return {
    type: "FeatureCollection" as const,
    features: g.cells.flatMap(([gh, c, p, mask]): Feature[] => {
      const b = geohashBounds(gh);
      if (!b) return [];
      const props: Record<string, number | string> = { gh, c, p, hot: mask ? 1 : 0 };
      for (let k = 0; k < g.crowds.length; k++) props[`h${k}`] = (mask >> k) & 1;
      return [{ type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] } }];
    }),
  };
}

const colours = () => [0, 1, 2, 3].map((k) => css(`--crowd-${k}`, ["#4d6a91", "#c8553d", "#2f8a64", "#8a4fa8"][k]));

/**
 * Paint for the current highlight. Every cell is faint, stronger where its crowd ranks higher; hotspot cells are solid,
 * in the leading crowd's colour, or, with one crowd lit, in that crowd's colour wherever it is hot.
 */
function paint(m: MlMap, lit: number | null) {
  const strength = ["interpolate", ["linear"], ["get", "p"], 50, 0, 75, 0.12, 100, 0.32];
  m.setPaintProperty("weather", "fill-opacity", (lit === null ? strength : ["case", ["==", ["get", "c"], lit], strength, 0.02]) as never);
  m.setFilter("hot", lit === null ? ["==", ["get", "hot"], 1] : ["==", ["get", `h${lit}`], 1]);
  const [c0, c1, c2, c3] = colours();
  m.setPaintProperty("hot", "fill-color", (lit === null ? ["match", ["get", "c"], 0, c0, 1, c1, 2, c2, c3] : colours()[lit % 4]) as never);
}

export function CrowdMap({ geography, names, lit, onLight }: { geography: Geography; names: string[]; lit: number | null; onLight: (c: number | null) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const ready = useRef(false);
  const latest = useRef({ geography, lit, onLight });
  latest.current = { geography, lit, onLight };
  const [tip, setTip] = useState<{ x: number; y: number; c: number; p: number; hot: number[] } | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    let cancelled = false;
    let created: MlMap | undefined;
    void loadMapLibre().then((ml) => {
      if (cancelled || !el.current) return;
      const m = new ml.Map({ container: el.current, style: STYLE, bounds: LOWER_48, fitBoundsOptions: { padding: 12 }, attributionControl: { compact: true }, dragRotate: false });
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      m.once("style.load", () => {
        const [c0, c1, c2, c3] = colours();
        m.addSource("weather", { type: "geojson", data: weatherGeoJSON(latest.current.geography) as never });
        m.addLayer({ id: "weather", type: "fill", source: "weather", paint: { "fill-color": ["match", ["get", "c"], 0, c0, 1, c1, 2, c2, c3], "fill-opacity": 0.4 } });
        m.addLayer({ id: "hot", type: "fill", source: "weather", paint: { "fill-opacity": 0.8 } });
        paint(m, latest.current.lit);
        m.on("mousemove", "weather", (e: MapLayerMouseEvent) => {
          const f = e.features?.[0]?.properties;
          if (!f) return;
          const c = Number(f.c);
          const hot = latest.current.geography.crowds.map((_, k) => k).filter((k) => Number(f[`h${k}`]) === 1);
          setTip({ x: e.point.x, y: e.point.y, c, p: Number(f.p), hot });
          latest.current.onLight(c);
        });
        m.on("mouseleave", "weather", () => {
          setTip(null);
          latest.current.onLight(null);
        });
        ready.current = true;
      });
      map.current = m;
      created = m;
      const ro = new ResizeObserver(() => m.resize());
      ro.observe(el.current);
      m.once("remove", () => ro.disconnect());
    });
    return () => {
      cancelled = true;
      created?.remove();
      map.current = null;
      ready.current = false;
    };
  }, []);

  useEffect(() => {
    if (map.current && ready.current) (map.current.getSource("weather") as GeoJSONSource | undefined)?.setData(weatherGeoJSON(geography) as never);
  }, [geography]);

  useEffect(() => {
    if (map.current && ready.current) paint(map.current, lit);
  }, [lit]);

  const name = (k: number) => names[k] ?? `Crowd ${k + 1}`;
  return (
    <div className="crowd-map-stage">
      <div ref={el} className="map crowd-map" role="region" aria-label="Map of where each crowd's taste leads. The lists below name every hotspot." />
      {tip && (
        <div className="crowd-map-tip small" style={{ left: tip.x, top: tip.y }}>
          <strong>
            <span className="swatch" style={{ background: `var(--crowd-${tip.c % 4})` }} aria-hidden /> {name(tip.c)}
          </strong>{" "}
          leads here, at its {ordinal(tip.p)} percentile
          {tip.hot.length > 0 && <span className="muted"> · hotspot for {tip.hot.map(name).join(" and ")}</span>}
        </div>
      )}
    </div>
  );
}
