// MapLibre, shared by the maps (§13.4). Client only.

export type MapLibre = typeof import("maplibre-gl");

/** Loads MapLibre from /public/maplibre (copied by scripts/copy-maplibre.mjs), unbundled, so its worker resolves. */
export function loadMapLibre(): Promise<MapLibre> {
  if (!document.querySelector("link[data-maplibre]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/maplibre/maplibre-gl.css";
    link.dataset.maplibre = "1";
    document.head.appendChild(link);
  }
  return import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "/maplibre/maplibre-gl.mjs" as string) as Promise<MapLibre>;
}

// Muted basemap so pins carry the story (§13.10). OpenFreeMap: free, no key [VERIFY terms before launch].
export const STYLE = "https://tiles.openfreemap.org/styles/positron";

/** A CSS custom property's value, for map paint (MapLibre can't read CSS variables). */
export const css = (name: string, fallback: string) =>
  typeof window === "undefined" ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
