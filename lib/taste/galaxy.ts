import { topLandmarks } from "./embed";

// What the Taste Galaxy draws (PRD §13, v4.0), shared by the server that measures it and the browser that draws it.
// Pure: no server imports, so the client bundle stays small.

export type Domain = "brand" | "artist" | "tv_show" | "movie" | "podcast" | "book";
export const DOMAINS: Domain[] = ["brand", "artist", "tv_show", "movie", "podcast", "book"];

export type Ref = { id: string; name: string };

/** Indices refer to `nodes`; columns of `u` to `landmarks`. */
export type Galaxy = {
  nodes: {
    id: string;
    name: string;
    domain: Domain;
    /** Index into the graph's crowds, or -1 for none yet. */
    crowd: number;
    /** Share of resamples in which it landed in its crowd. */
    certainty: number;
    /** Above what shuffled data reaches: drawn solid; the fringe is drawn faint. */
    core: boolean;
    specificity: number;
    affinity: number;
    popularity?: number;
    /** Starting position from the spectral embedding, in [-1, 1]. */
    x: number;
    y: number;
    landmark: boolean;
  }[];
  /** Each entity's strongest similarities: [i, j, correlation]. */
  edges: [number, number, number][];
  /** Column 0 is the seed; the rest are entities probed as landmarks. */
  landmarks: Ref[];
  /** Percentile of each entity under each landmark, 2 decimals: the data behind every "why". */
  u: number[][];
  k: number;
  eigenvalues: number[];
  /** 0 is the first ring before any probe; each later round adds landmarks. */
  round: number;
  done: boolean;
  calls: number;
  /** The bar for the core: the 95th percentile of certainty on shuffled probes. */
  coreAt?: number;
};

/** Explains one entity's place: the landmarks that rank it highest, from the probes already made (E6, 0 calls). */
export function whyOf(g: Galaxy, i: number, k = 3): { landmark: string; pct: number }[] {
  return topLandmarks(g.u[i] ?? [], k + 1)
    .filter((x) => g.landmarks[x.col]?.id !== g.nodes[i]?.id)
    .slice(0, k)
    .map((x) => ({ landmark: g.landmarks[x.col]?.name ?? "", pct: x.pct }));
}

const DOMAIN_WORDS: Record<Domain, string> = { brand: "brands", artist: "music", tv_show: "TV", movie: "film", podcast: "podcasts", book: "books" };
export const domainWord = (d: Domain) => DOMAIN_WORDS[d];

/** A display name: a book's subtitle dropped ("Freshwater: A Novel" → "Freshwater"). */
export const shortName = (name: string, domain: string) => (domain === "book" ? name.split(/:\s/)[0] : name);
