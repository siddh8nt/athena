// Shapes of the Qloo hackathon API responses Athena reads (PRD §11.1).
// Only the fields Athena uses are typed; everything else stays `unknown`.

export type QlooParams = Record<string, string | number | boolean | string[] | undefined>;

export type QlooTag = {
  id?: string;
  tag_id?: string;
  name: string;
  type?: string;
  subtype?: string;
  value?: string;
  weight?: number | null;
  query?: { affinity?: number; rank?: number };
};

export type Explainability = Record<string, { entity_id: string; score: number }[]>;

export type QlooEntity = {
  entity_id: string;
  name: string;
  type?: string;
  subtype?: string;
  types?: string | string[];
  popularity?: number;
  disambiguation?: string;
  location?: { lat: number; lon: number; geohash?: string };
  tags?: QlooTag[];
  external?: Record<string, unknown>;
  properties?: {
    address?: string;
    phone?: string;
    website?: string;
    is_closed?: boolean;
    price_level?: number;
    price_tier?: number;
    business_rating?: number;
    neighborhood?: string;
    geocode?: { city?: string; metro?: string; name?: string; admin1_region?: string; country_code?: string };
    episode_count?: string;
    release_date?: string;
    [k: string]: unknown;
  };
  query?: {
    affinity?: number;
    rank?: number;
    distance?: number;
    measurements?: { audience_growth?: number };
    explainability?: Explainability;
  };
};

export type HeatmapCell = {
  location: { latitude: number; longitude: number; geohash: string };
  query: { affinity: number; affinity_rank: number; popularity: number };
};

export type Demographics = {
  entity_id?: string;
  query?: { age?: Record<string, number>; gender?: Record<string, number> };
};

export type QlooResults = {
  entities?: QlooEntity[];
  tags?: QlooTag[];
  heatmap?: HeatmapCell[];
  demographics?: Demographics[];
  audiences?: QlooEntity[];
  audience_types?: { type: string; parents?: { type: string }[] }[];
};

export type QlooBody = {
  success?: boolean;
  results?: QlooResults | QlooEntity[];
  errors?: { message: string; path?: string }[];
  [k: string]: unknown;
};

/** One logged call, as stored in the run log and shown in the trace. The key is never stored (PRD §14.4). */
export type QlooCall = {
  id: string;
  endpoint: string;
  params: Record<string, string>;
  status: number;
  ms: number;
  resultCount: number;
  cached: boolean;
  at: string;
};

export type QlooResponse = {
  call: QlooCall;
  status: number;
  body: QlooBody | null;
};

export type QlooStatus = "ok" | "empty" | "error" | "retryable" | "config";
