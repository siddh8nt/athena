import type { QlooBody, QlooCall, QlooEntity, QlooParams, QlooResponse, QlooResults, QlooStatus } from "./types";

// Qloo client (PRD §11.1): cache, bounded retries, one shared pacer that holds the key's per-second limit
// (§14.9), and a call log that feeds the trace and the per-block "Built from n Qloo calls" count (F14).

export const MAX_TAKE = 50; // Qloo's `take` and `filter.results.entities` limit (S7, 8 Oct)
/** Our key's limit, read from `x-second-ratelimit-limit` on 10 Oct (§11.1). */
export const LIVE_PER_SECOND = 5;
const INSIGHTS_TTL_MS = 24 * 60 * 60 * 1000;
const FOREVER = Number.POSITIVE_INFINITY;

export type RawResult = { status: number; body: QlooBody | null };

/** Sends one request. The HTTP transport talks to Qloo; the fixture transport fabricates data. */
export interface QlooTransport {
  readonly mode: "live" | "fixture";
  send(path: string, query: Record<string, string>): Promise<RawResult>;
  /** POST with a JSON body: needed for per-entity signal weights (Q24). */
  post(path: string, body: Record<string, unknown>): Promise<RawResult>;
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
  private readonly keys: string[];
  private next = 0;
  /** One key or several: requests rotate across keys, so each key sees an equal share of the pacer's rate. */
  constructor(
    private readonly baseUrl: string,
    apiKey: string | string[],
    private readonly timeoutMs = 60_000,
  ) {
    this.keys = (Array.isArray(apiKey) ? apiKey : [apiKey]).filter(Boolean);
  }

  /** How many keys this transport rotates across. */
  get keyCount() {
    return this.keys.length;
  }

  private get apiKey() {
    return this.keys[this.next++ % this.keys.length];
  }

  async send(path: string, query: Record<string, string>): Promise<RawResult> {
    const qs = new URLSearchParams(query).toString();
    return this.read(
      await fetch(`${this.baseUrl}${path}${qs ? `?${qs}` : ""}`, {
        headers: { "X-Api-Key": this.apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
      }),
    );
  }

  async post(path: string, body: Record<string, unknown>): Promise<RawResult> {
    return this.read(
      await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "X-Api-Key": this.apiKey, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
      }),
    );
  }

  private async read(res: Response): Promise<RawResult> {
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

/**
 * Who is waiting on a call (§14.9): "now" is what the founder is looking at, "next" prepares the likely next stop,
 * "later" is background work. Higher priorities always start first.
 */
export type Priority = "now" | "next" | "later";
const RANK: Record<Priority, number> = { now: 0, next: 1, later: 2 };

/**
 * Holds the key's per-second limit for every call the server makes, retries included: at most `perSecond` starts in
 * any rolling window. One pacer is shared by every client derived from the server's client, so all visitors share it.
 */
export class Pacer {
  private starts: number[] = [];
  private waiting: { rank: number; seq: number; go: () => void }[] = [];
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    readonly perSecond: number,
    private readonly windowMs = 1050, // a little over a second, so Qloo's own window never sees perSecond + 1
    private readonly now: () => number = Date.now,
  ) {}

  /** Resolves when this call may start. */
  acquire(priority: Priority = "now"): Promise<void> {
    if (!Number.isFinite(this.perSecond)) return Promise.resolve();
    return new Promise((go) => {
      this.waiting.push({ rank: RANK[priority], seq: this.seq++, go });
      this.waiting.sort((a, b) => a.rank - b.rank || a.seq - b.seq);
      this.pump();
    });
  }

  /** Calls waiting to start, for tests and the trace. */
  get queued() {
    return this.waiting.length;
  }

  private pump() {
    const t = this.now();
    this.starts = this.starts.filter((s) => t - s < this.windowMs);
    while (this.waiting.length && this.starts.length < this.perSecond) {
      this.starts.push(t);
      this.waiting.shift()!.go();
    }
    if (this.waiting.length && !this.timer) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.pump();
      }, Math.max(1, this.starts[0] + this.windowMs - t));
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
  /** Starts allowed per second; defaults to the key's limit live and to no limit for fixtures. */
  perSecond?: number;
  /** Share an existing pacer (child clients do). */
  pacer?: Pacer;
  /** Per-entity weights for insights signals (§9.23 step 7); entities not listed weigh 1. */
  weights?: ReadonlyMap<string, number>;
};

/** One entity in a weighted signal (§9.23 step 7). */
export type Weighted = { id: string; weight: number };

export type CallOptions = { priority?: Priority };
/** Longest query string sent as a GET. */
const MAX_GET = 6000;

export class QlooClient {
  readonly mode: "live" | "fixture";
  private readonly transport: QlooTransport;
  private readonly cache: ResponseCache;
  private readonly onCall?: (call: QlooCall) => void;
  private readonly retryDelayMs: number;
  readonly pacer: Pacer;
  private readonly weights?: ReadonlyMap<string, number>;

  constructor(opts: QlooClientOptions) {
    this.transport = opts.transport;
    this.mode = opts.transport.mode;
    this.cache = opts.cache ?? new MemoryCache();
    this.onCall = opts.onCall;
    this.retryDelayMs = opts.retryDelayMs ?? 1000;
    this.weights = opts.weights;
    const keys = opts.transport instanceof HttpTransport ? opts.transport.keyCount : 1;
    this.pacer = opts.pacer ?? new Pacer(opts.perSecond ?? (this.mode === "live" ? LIVE_PER_SECOND * keys : Number.POSITIVE_INFINITY));
  }

  /** A child client that also logs into another sink (one per block), sharing cache, transport and pacer. Parents still see every call. */
  withLog(onCall: (call: QlooCall) => void): QlooClient {
    const parent = this.onCall;
    return new QlooClient({ transport: this.transport, cache: this.cache, pacer: this.pacer, onCall: (c) => (parent?.(c), onCall(c)), retryDelayMs: this.retryDelayMs, weights: this.weights });
  }

  /**
   * A child client whose insights calls weigh these entities wherever they appear in the signal (the founder's crowd
   * reactions, §9.23 step 7). Blocks don't change: a signal with unequal weights goes as the weighted POST.
   */
  withWeights(weights: ReadonlyMap<string, number>): QlooClient {
    return new QlooClient({ transport: this.transport, cache: this.cache, pacer: this.pacer, onCall: this.onCall, retryDelayMs: this.retryDelayMs, weights });
  }

  async get(path: string, params: QlooParams = {}, opts: CallOptions = {}): Promise<QlooResponse> {
    const query = toQuery(params);
    if (query.take && Number(query.take) > MAX_TAKE) throw new Error(`take must be ≤ ${MAX_TAKE}`);
    for (const k of ["filter.results.entities", "filter.results.tags"]) {
      if (query[k] && query[k].split(",").length > MAX_TAKE) throw new Error(`${k} must hold ≤ ${MAX_TAKE} IDs`);
    }
    return this.fetch(path, query, cacheKey(path, query), () => this.transport.send(path, query), opts);
  }

  /** POST /v2/insights with per-entity weights (Q24). Equal weights go as a plain GET, which Qloo treats the same (10 Oct). */
  async insightsWeighted(params: QlooParams, signal: Weighted[], opts: CallOptions = {}) {
    const live = signal.filter((s) => s.weight > 0);
    if (live.every((s) => s.weight === live[0]?.weight)) {
      const res = await this.get("/v2/insights", { ...params, "signal.interests.entities": live.map((s) => s.id) }, opts);
      return { ...res, results: results(res) };
    }
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
      body[k] = v;
    }
    body["signal.interests.entities"] = live.map(({ id, weight }) => ({ id, weight }));
    const logged = { ...toQuery(params), "signal.interests.entities": live.map((s) => `${s.id}^${s.weight}`).join(",") };
    const res = await this.fetch("/v2/insights", logged, `POST ${cacheKey("/v2/insights", logged)}`, () => this.transport.post("/v2/insights", body), opts);
    return { ...res, results: results(res) };
  }

  private async fetch(path: string, query: Record<string, string>, key: string, send: () => Promise<RawResult>, opts: CallOptions): Promise<QlooResponse> {
    const started = Date.now();
    const hit = await this.cache.get(key);
    if (hit) return this.log(path, query, hit, 0, true);

    let raw: RawResult = { status: 0, body: null };
    for (let attempt = 0; attempt <= 2; attempt++) {
      await this.pacer.acquire(opts.priority);
      try {
        raw = await send();
      } catch {
        raw = { status: 0, body: null };
      }
      if (classify(raw.status, raw.body) !== "retryable" || attempt === 2) break;
      await sleep(this.retryDelayMs * 2 ** attempt);
    }
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

  async insights(params: QlooParams, opts: CallOptions = {}) {
    const raw = params["signal.interests.entities"];
    const ids = Array.isArray(raw) ? raw : typeof raw === "string" && raw ? raw.split(",") : [];
    if (this.weights && ids.some((id) => (this.weights!.get(id) ?? 1) !== 1)) {
      const { ["signal.interests.entities"]: _, ...rest } = params;
      return this.insightsWeighted(rest, ids.map((id) => ({ id, weight: this.weights!.get(id) ?? 1 })), opts);
    }
    // A long request (a region's outline, §9.3) goes as a POST body; URLs over ~8 KB fail. Verified 10 Oct.
    const query = toQuery(params);
    if (new URLSearchParams(query).toString().length > MAX_GET) {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(params)) if (!(v === undefined || v === "" || (Array.isArray(v) && v.length === 0))) body[k] = v;
      const res = await this.fetch("/v2/insights", query, `POST ${cacheKey("/v2/insights", query)}`, () => this.transport.post("/v2/insights", body), opts);
      return { ...res, results: results(res) };
    }
    const res = await this.get("/v2/insights", params, opts);
    return { ...res, results: results(res) };
  }

  async search(params: QlooParams, opts: CallOptions = {}) {
    const res = await this.get("/search", params, opts);
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
