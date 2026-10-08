"use client";

import { useEffect, useRef } from "react";
import type { Map as MlMap, GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";

type MapLibre = typeof import("maplibre-gl");
/** Loads MapLibre from /public/maplibre (copied by scripts/copy-maplibre.mjs), unbundled, so its worker resolves. */
function loadMapLibre(): Promise<MapLibre> {
  if (!document.querySelector('link[data-maplibre]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/maplibre/maplibre-gl.css";
    link.dataset.maplibre = "1";
    document.head.appendChild(link);
  }
  return import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "/maplibre/maplibre-gl.mjs" as string) as Promise<MapLibre>;
}
import type { HeatmapCell } from "@/lib/qloo/types";

// Muted basemap so pins carry the story (§13.10). OpenFreeMap: free, no key [VERIFY terms before launch].
const STYLE = "https://tiles.openfreemap.org/styles/positron";

// Minimal GeoJSON shapes (avoids a @types/geojson dependency).
type Feature = { type: "Feature"; properties: Record<string, unknown>; geometry: { type: "Polygon"; coordinates: number[][][] } | { type: "Point"; coordinates: number[] } };
type FeatureCollection = { type: "FeatureCollection"; features: Feature[] };

export type MapPin = { id: string; rank: number; name: string; lat: number; lon: number; kind: "pick" | "account" | "llm" };

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Geohash → [minLon, minLat, maxLon, maxLat]. */
export function geohashBounds(hash: string): [number, number, number, number] | undefined {
  let even = true;
  const lat = [-90, 90];
  const lon = [-180, 180];
  for (const ch of hash.toLowerCase()) {
    const v = BASE32.indexOf(ch);
    if (v < 0) return undefined;
    for (let bit = 4; bit >= 0; bit--) {
      const b = (v >> bit) & 1;
      const r = even ? lon : lat;
      const mid = (r[0] + r[1]) / 2;
      if (b) r[0] = mid;
      else r[1] = mid;
      even = !even;
    }
  }
  return [lon[0], lat[0], lon[1], lat[1]];
}

function cellsGeoJSON(cells: HeatmapCell[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: cells.map((c) => {
      const b = geohashBounds(c.location.geohash) ?? [c.location.longitude - 0.008, c.location.latitude - 0.006, c.location.longitude + 0.008, c.location.latitude + 0.006];
      return {
        type: "Feature",
        properties: { rank: c.query.affinity_rank, pop: c.query.popularity },
        geometry: { type: "Polygon", coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] },
      };
    }),
  };
}

function pinsGeoJSON(pins: MapPin[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: pins.map((p) => ({ type: "Feature", properties: { id: p.id, rank: p.rank, name: p.name, kind: p.kind }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })),
  };
}

const css = (name: string, fallback: string) =>
  typeof window === "undefined" ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export function MapView(props: {
  center: [number, number];
  cells: HeatmapCell[];
  pins: MapPin[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const ready = useRef(false);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    if (!el.current || map.current) return;
    let cancelled = false;
    let created: MlMap | undefined;
    loadMapLibre().then((ml) => {
    if (cancelled || !el.current) return;
    const m = new ml.Map({
      container: el.current,
      style: STYLE,
      center: [latest.current.center[1], latest.current.center[0]],
      zoom: 10.5,
      attributionControl: { compact: true },
    });
    m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
    // "style.load", not "load": "load" waits for every initial tile and can stall if one tile is slow.
    m.once("style.load", () => {
      m.addSource("cells", { type: "geojson", data: cellsGeoJSON([]) as never });
      m.addSource("pins", { type: "geojson", data: pinsGeoJSON([]) as never });
      m.addLayer({
        id: "cells",
        type: "fill",
        source: "cells",
        paint: {
          "fill-color": ["interpolate", ["linear"], ["get", "rank"], 0, css("--heat-0", "#f3efe6"), 0.6, css("--heat-1", "#f2b880"), 1, css("--heat-2", "#c8553d")],
          "fill-opacity": ["interpolate", ["linear"], ["get", "pop"], 0, 0.15, 1, 0.55],
        },
      });
      m.addLayer({
        id: "pins",
        type: "circle",
        source: "pins",
        paint: {
          "circle-radius": ["case", ["==", ["get", "kind"], "account"], 4, 11],
          "circle-color": ["match", ["get", "kind"], "pick", css("--pick", "#2b50c8"), "llm", css("--llm", "#7a6a55"), css("--account", "#3c8d6e")],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });
      m.addLayer({
        id: "pin-labels",
        type: "symbol",
        source: "pins",
        filter: ["==", ["get", "kind"], "pick"],
        layout: { "text-field": ["to-string", ["get", "rank"]], "text-size": 11, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true },
        paint: { "text-color": "#ffffff" },
      });
      m.on("click", "pins", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) latest.current.onSelect?.(String(id));
      });
      m.on("mouseenter", "pins", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "pins", () => (m.getCanvas().style.cursor = ""));
      ready.current = true;
      sync(m, latest.current);
    });
    map.current = m;
    created = m;
    // Keep the canvas sized to its container (the page layout can shift after load).
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(el.current!);
    m.once("remove", () => ro.disconnect());
    if (process.env.NODE_ENV !== "production") (window as unknown as { __athenaMap?: MlMap }).__athenaMap = m;
    });
    return () => {
      cancelled = true;
      created?.remove();
      map.current = null;
      ready.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (map.current && ready.current) sync(map.current, props);
  }, [props.cells, props.pins]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.current?.flyTo({ center: [props.center[1], props.center[0]], zoom: 10.5, duration: reduce ? 0 : 1200 });
  }, [props.center[0], props.center[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const p = props.pins.find((x) => x.id === props.selectedId);
    if (p && map.current) map.current.easeTo({ center: [p.lon, p.lat], zoom: Math.max(map.current.getZoom(), 12.5), duration: 600 });
  }, [props.selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="map" role="region" aria-label="Map of picks and taste heatmap" />;
}

function sync(m: MlMap, p: { cells: HeatmapCell[]; pins: MapPin[] }) {
  (m.getSource("cells") as GeoJSONSource | undefined)?.setData(cellsGeoJSON(p.cells) as never);
  (m.getSource("pins") as GeoJSONSource | undefined)?.setData(pinsGeoJSON(p.pins) as never);
}
