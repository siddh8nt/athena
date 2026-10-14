// Crowd geography (§9.26) as the client sees it. Pure types, no server imports.

/** A significant hot cluster: connected cells whose neighbourhoods love the crowd's taste more than chance allows. */
export type Hotspot = {
  label: string;
  cells: number;
  /** Residents in its cells (Census), and the same weighted by each cell's percentile. */
  people: number;
  reach: number;
  center: [number, number]; // lat, lon
};

/** A named metro's taste-weighted reach: residents in its area, each weighted by the crowd's percentile where they live. */
export type MetroReach = { metroId: string; name: string; reach: number; people: number; pct: number };

export type GeoCrowd = {
  id: string;
  name: string;
  /** Cells Qloo scored for this crowd inside the US, and how many are in significant hot clusters. */
  cells: number;
  hot: number;
  hotspots: Hotspot[];
  /** Its hot clusters where no other crowd's percentile is higher: what sets this crowd's map apart. */
  standsOut: Hotspot[];
  reach: MetroReach[];
  /** Residents in cells where this crowd's taste leads every other crowd's ("crowd weather"). */
  leads: number;
  /** Residents of all its significant hot cells (Census): who this crowd can reach. */
  hotPeople?: number;
};

/** [geohash, the crowd that leads here (index), its percentile 0–100, bit k set when the cell is hot for crowd k]. */
export type GeoCell = [string, number, number, number];

export type Geography = {
  crowds: GeoCrowd[];
  cells: GeoCell[];
  calls: number;
  callIds: string[];
  /** The false discovery rate the hotspots are held to. */
  q: number;
  /** When nothing came back: the panel says what it would need, never an error. */
  empty?: boolean;
};
