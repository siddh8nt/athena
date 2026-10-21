"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import type { Block } from "@/lib/team/page";
import { STYLE, css, loadMapLibre } from "./maplibre";

// A city's taste map with one layer per crowd (§23.5 e), each toggled on its own: where two layers glow together, two
// crowds run hot in the same streets.

type Heat = Extract<Block, { type: "heat" }>;

const TIER_COLOR: Record<string, [string, string]> = { win_first: ["--accent", "#7e2b34"], win_next: ["--account", "#3c8d6e"], watch: ["--watch", "#b7832f"] };
const color = (tier: string) => css(...(TIER_COLOR[tier] ?? TIER_COLOR.watch));

const geo = (cells: [number, number, number][]) => ({
  type: "FeatureCollection",
  features: cells.map(([lat, lon, v]) => ({ type: "Feature", properties: { v }, geometry: { type: "Point", coordinates: [lon, lat] } })),
});

export function HeatLayers({ b }: { b: Heat }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [off, setOff] = useState<string[]>([]);

  useEffect(() => {
    if (!el.current) return;
    let cancelled = false;
    let created: MlMap | undefined;
    loadMapLibre().then((ml) => {
      if (cancelled || !el.current) return;
      const m = new ml.Map({
        container: el.current,
        style: STYLE,
        center: [b.city.center[1], b.city.center[0]],
        zoom: 10,
        ...(b.city.bbox ? { bounds: b.city.bbox, fitBoundsOptions: { padding: 16 } } : {}),
        attributionControl: { compact: true },
        cooperativeGestures: true,
      });
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      m.once("style.load", () => {
        for (const l of b.layers) {
          m.addSource(`heat-${l.crowd}`, { type: "geojson", data: geo(l.cells) as never });
          m.addLayer({
            id: `heat-${l.crowd}`,
            type: "circle",
            source: `heat-${l.crowd}`,
            paint: {
              "circle-color": color(l.tier),
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 12, 12, 14, 26],
              "circle-blur": 0.6,
              "circle-opacity": ["interpolate", ["linear"], ["get", "v"], 0, 0, 0.5, 0.12, 1, 0.55],
            },
          });
        }
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
    };
    // The map is drawn once per city; the layers toggle below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.city.name]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const l of b.layers) if (m.getLayer(`heat-${l.crowd}`)) m.setLayoutProperty(`heat-${l.crowd}`, "visibility", off.includes(l.crowd) ? "none" : "visible");
  }, [off, b.layers]);

  if (!b.layers.length) return null;
  return (
    <div className="nav-heat">
      <div className="nav-heat-keys" role="group" aria-label={`Crowd layers on the map of ${b.city.name}`}>
        {b.layers.map((l) => (
          <button
            key={l.crowd}
            type="button"
            aria-pressed={!off.includes(l.crowd)}
            className={off.includes(l.crowd) ? "" : "on"}
            onClick={() => setOff(off.includes(l.crowd) ? off.filter((x) => x !== l.crowd) : [...off, l.crowd])}
          >
            <span className="nav-heat-dot" style={{ background: color(l.tier) }} aria-hidden />
            {l.name}
          </button>
        ))}
      </div>
      <div ref={el} className="nav-heat-map" role="img" aria-label={`Where each crowd's taste runs hot in ${b.city.name}`} />
    </div>
  );
}
