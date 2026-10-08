import type { QlooBody, QlooCall, QlooEntity, QlooParams, QlooResponse, QlooResults, QlooStatus } from "./types";

// Qloo client (PRD §11.1): cache, bounded retries, at most 6 calls in flight, and a call log
// that feeds the trace and the per-block "Built from n Qloo calls" count (F14).

export const MAX_TAKE = 50; // Qloo's `take` and `filter.results.entities` limit (S7, 8 Oct)
export const MAX_IN_FLIGHT = 6; // §14.9
const INSIGHTS_TTL_MS = 24 * 60 * 60 * 1000;
const FOREVER = Number.POSITIVE_INFINITY;

export type RawResult = { status: number; body: QlooBody | null };

/** Sends one request. The HTTP transport talks to Qloo; the fixture transport fabricates data. */
export interface QlooTransport {
  readonly mode: "live" | "fixture";
  send(path: string, query: Record<string, string>): Promise<RawResult>;
}

export interface ResponseCache {
  get(key: string): Promise<RawResult | undefined>;
  set(key: string, value: RawResult, ttlMs: number): Promise<void>;
}

export class MemoryCache implements ResponseCache {
  private store = new Map<string, { value: RawResult; expires: number }>();
  async get(key: string) {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }
  async set(key: string, value: RawResult, ttlMs: number) {
    this.store.set(key, { value, expires: Date.now() + ttlMs });
  }
}

export class HttpTransport implements QlooTransport {
  readonly mode = "live" as const;
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 60_000,
  ) {}

  async send(path: string, query: Record<string, string>): Promise<RawResult> {
    const qs = new URLSearchParams(query).toString();
    const res = await fetch(`${this.baseUrl}${path}${qs ? `?${qs}` : ""}`, {
      headers: { "X-Api-Key": this.apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(this.timeoutMs),
      cache: "no-store",
    });
    let body: QlooBody | null = null;
    try {
      body = (await res.json()) as QlooBody;
    } catch {
      body = null;
    }
    return { status: res.status, body };
  }
}

/** Flattens params the way Qloo expects: arrays become comma lists; empty values are dropped. */
export function toQuery(params: QlooParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = Array.isArray(v) ? v.join(",") : String(v);
  }
  return out;
}

export function cacheKey(path: string, query: Record<string, string>): string {
  const sorted = Object.keys(query)
    .sort()
    .map((k) => `${k}=${query[k]}`)
    .join("&");
  return `${path}?${sorted}`;
}

export function classify(status: number, body: QlooBody | null): QlooStatus {
  if (status === 401 || status === 403) return "config";
  if (status === 429 || status >= 500 || status === 0) return "retryable";
  if (status >= 400) return "error";
  return resultCount(body) > 0 ? "ok" : "empty";
}

export function resultCount(body: QlooBody | null): number {
  const r = body?.results;
  if (!r) return 0;
  if (Array.isArray(r)) return r.length;
  return (
    (r.entities?.length ?? 0) +
    (r.tags?.length ?? 0) +
    (r.heatmap?.length ?? 0) +
    (r.demographics?.length ?? 0) +
    (r.audiences?.length ?? 0) +
    (r.audience_types?.length ?? 0)
  );
}

class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private readonly limit: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

let callSeq = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type QlooClientOptions = {
  transport: QlooTransport;
  cache?: ResponseCache;
  /** Called for every call, including cache hits, so the run log stays complete. */
  onCall?: (call: QlooCall) => void;
  retryDelayMs?: number;
};

export class QlooClient {
  readonly mode: "live" | "fixture";
  private readonly transport: QlooTransport;
  private readonly cache: ResponseCache;
  private readonly onCall?: (call: QlooCall) => void;
  private readonly retryDelayMs: number;
  private readonly gate = new Semaphore(MAX_IN_FLIGHT);

  constructor(opts: QlooClientOptions) {
    this.transport = opts.transport;
    this.mode = opts.transport.mode;
    this.cache = opts.cache ?? new MemoryCache();
    this.onCall = opts.onCall;
    this.retryDelayMs = opts.retryDelayMs ?? 1000;
  }

  /** A child client that also logs into another sink (one per block), sharing cache and transport. Parents still see every call. */
  withLog(onCall: (call: QlooCall) => void): QlooClient {
    const parent = this.onCall;
    return new QlooClient({ transport: this.transport, cache: this.cache, onCall: (c) => (parent?.(c), onCall(c)), retryDelayMs: this.retryDelayMs });
  }

  async get(path: string, params: QlooParams = {}): Promise<QlooResponse> {
    const query = toQuery(params);
    if (query.take && Number(query.take) > MAX_TAKE) throw new Error(`take must be ≤ ${MAX_TAKE}`);
    for (const k of ["filter.results.entities", "filter.results.tags"]) {
      if (query[k] && query[k].split(",").length > MAX_TAKE) throw new Error(`${k} must hold ≤ ${MAX_TAKE} IDs`);
    }
    const key = cacheKey(path, query);
    const started = Date.now();
    const hit = await this.cache.get(key);
    if (hit) return this.log(path, query, hit, 0, true);

    const raw = await this.gate.run(async () => {
      let last: RawResult = { status: 0, body: null };
      for (let attempt = 0; attempt <= 2; attempt++) {
        try {
          last = await this.transport.send(path, query);
        } catch {
          last = { status: 0, body: null };
        }
        if (classify(last.status, last.body) !== "retryable" || attempt === 2) break;
        await sleep(this.retryDelayMs * 2 ** attempt);
      }
      return last;
    });
    if (raw.status === 200) {
      const ttl = path.startsWith("/search") || path.startsWith("/entities") || path.startsWith("/v2/tags") || path.startsWith("/v2/audiences") ? FOREVER : INSIGHTS_TTL_MS;
      await this.cache.set(key, raw, ttl);
    }
    return this.log(path, query, raw, Date.now() - started, false);
  }

  private log(path: string, query: Record<string, string>, raw: RawResult, ms: number, cached: boolean): QlooResponse {
    const call: QlooCall = {
      id: `q${++callSeq}`,
      endpoint: path,
      params: query,
      status: raw.status,
      ms,
      resultCount: resultCount(raw.body),
      cached,
      at: new Date().toISOString(),
    };
    this.onCall?.(call);
    return { call, status: raw.status, body: raw.body };
  }

  // ---- Convenience wrappers ----------------------------------------------------------------

  async insights(params: QlooParams) {
    const res = await this.get("/v2/insights", params);
    return { ...res, results: results(res) };
  }

  async search(params: QlooParams) {
    const res = await this.get("/search", params);
    const r = res.body?.results;
    const entities: QlooEntity[] = Array.isArray(r) ? r : (r?.entities ?? []);
    return { ...res, entities };
  }
}

export function results(res: QlooResponse): QlooResults {
  const r = res.body?.results;
  if (!r || Array.isArray(r)) return { entities: Array.isArray(r) ? r : [] };
  return r;
}
