import type { QlooBody, QlooCall, QlooEntity, QlooParams, QlooResponse, QlooResults, QlooStatus } from "./types";

// Qloo client (PRD §11.1): cache, bounded retries, one shared pacer that holds each key's per-second limit
// (§14.9), and a call log that feeds the trace and the per-block "Built from n Qloo calls" count (F14).
// With several keys, each key is a lane with its own limit: a call takes the free lane with the most monthly
// headroom, a key at its limit hands the retry to another key at once, identical calls in flight are sent once, and a
// call that runs far past its usual time is hedged on an idle key (first answer wins).

export const MAX_TAKE = 50; // Qloo's `take` and `filter.results.entities` limit (S7, 8 Oct)
/** Each key's limit, read from `x-second-ratelimit-limit` on 10 Oct, and on 12 Oct for the second key (§11.1). */
export const LIVE_PER_SECOND = 5;
const INSIGHTS_TTL_MS = 24 * 60 * 60 * 1000;
const FOREVER = Number.POSITIVE_INFINITY;

/** A key's monthly quota, from `x-month-ratelimit-remaining` and `x-month-ratelimit-reset` (seconds). */
export type KeyLimits = { monthRemaining?: number; monthResetMs?: number };
export type RawResult = { status: number; body: QlooBody | null; limits?: KeyLimits; lane?: number; hedged?: boolean };

/** Which key (lane) sends a request, and a signal that cancels it when a hedge wins. */
export type SendOptions = { lane?: number; signal?: AbortSignal };

/** Sends one request. The HTTP transport talks to Qloo; the fixture transport fabricates data. */
export interface QlooTransport {
  readonly mode: "live" | "fixture";
  /** How many keys requests can be spread across; 1 when absent. */
  readonly lanes?: number;
  send(path: string, query: Record<string, string>, opts?: SendOptions): Promise<RawResult>;
  /** POST with a JSON body: needed for per-entity signal weights (Q24). */
  post(path: string, body: Record<string, unknown>, opts?: SendOptions): Promise<RawResult>;
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
  /** One key or several: each key is a lane, chosen per request by the pacer. */
  constructor(
    private readonly baseUrl: string,
    apiKey: string | string[],
    private readonly timeoutMs = 60_000,
  ) {
    this.keys = (Array.isArray(apiKey) ? apiKey : [apiKey]).filter(Boolean);
  }

  get lanes() {
    return this.keys.length;
  }

  private key(lane?: number) {
    return this.keys[(lane ?? this.next++) % this.keys.length];
  }

  private signal(opts: SendOptions) {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    return opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  }

  async send(path: string, query: Record<string, string>, opts: SendOptions = {}): Promise<RawResult> {
    const qs = new URLSearchParams(query).toString();
    return this.read(
      await fetch(`${this.baseUrl}${path}${qs ? `?${qs}` : ""}`, {
        headers: { "X-Api-Key": this.key(opts.lane), Accept: "application/json" },
        signal: this.signal(opts),
        cache: "no-store",
      }),
    );
  }

  async post(path: string, body: Record<string, unknown>, opts: SendOptions = {}): Promise<RawResult> {
    return this.read(
      await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "X-Api-Key": this.key(opts.lane), Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: this.signal(opts),
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
    const num = (h: string) => {
      const v = Number(res.headers.get(h) ?? NaN);
      return Number.isFinite(v) ? v : undefined;
    };
    const reset = num("x-month-ratelimit-reset");
    return { status: res.status, body, limits: { monthRemaining: num("x-month-ratelimit-remaining"), monthResetMs: reset === undefined ? undefined : reset * 1000 } };
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

/** Lets a queued call move up when a more urgent caller asks for the same thing. */
export type Ticket = { promote(priority: Priority): void };
type Lane = { starts: number[]; blockedUntil: number; monthRemaining?: number; resetAt?: number };
type Waiter = { rank: number; seq: number; avoid?: number; go: (lane: number) => void };

/**
 * Holds each key's per-second limit for every call the server makes, retries included: at most `perSecond` starts per
 * lane (key) in any rolling window. One pacer is shared by every client derived from the server's client, so all
 * visitors share it. A waiting call takes the free lane with the most monthly headroom (calls left ÷ time to the
 * key's reset), so no key runs dry while another still has room; a key that just answered 429 sits out one window.
 */
export class Pacer {
  private lanes: Lane[];
  private waiting: Waiter[] = [];
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    readonly perSecond: number,
    private readonly windowMs = 1050, // a little over a second, so Qloo's own window never sees perSecond + 1
    private readonly now: () => number = Date.now,
    lanes = 1,
  ) {
    this.lanes = Array.from({ length: Math.max(1, lanes) }, () => ({ starts: [], blockedUntil: 0 }));
  }

  get laneCount() {
    return this.lanes.length;
  }

  /** Resolves with the lane this call may start on. */
  acquire(priority: Priority = "now", opts: { avoid?: number; ticket?: (t: Ticket) => void } = {}): Promise<number> {
    if (!Number.isFinite(this.perSecond)) return Promise.resolve(0);
    return new Promise((go) => {
      const w: Waiter = { rank: RANK[priority], seq: this.seq++, avoid: opts.avoid, go };
      this.waiting.push(w);
      opts.ticket?.({
        promote: (p) => {
          if (RANK[p] >= w.rank || !this.waiting.includes(w)) return;
          w.rank = RANK[p];
          this.sort();
          this.pump();
        },
      });
      this.sort();
      this.pump();
    });
  }

  /** A start right now on a lane other than `avoid`, only when one is free and nothing is waiting: a hedge never delays a real call. */
  tryAcquire(avoid: number): number | undefined {
    if (this.waiting.length || !Number.isFinite(this.perSecond)) return undefined;
    const t = this.now();
    this.trim(t);
    const lane = this.best(t, avoid, true);
    if (lane !== undefined) this.lanes[lane].starts.push(t);
    return lane;
  }

  /** What a lane's last response said about its key. */
  report(lane: number, status: number, limits?: KeyLimits) {
    const l = this.lanes[lane];
    if (!l) return;
    const t = this.now();
    if (limits?.monthRemaining !== undefined) l.monthRemaining = limits.monthRemaining;
    if (limits?.monthResetMs !== undefined) l.resetAt = t + limits.monthResetMs;
    if (status === 429) l.blockedUntil = t + this.windowMs;
  }

  /** Calls waiting to start, for tests and the trace. */
  get queued() {
    return this.waiting.length;
  }

  /** Each lane's known calls left this month. */
  get monthRemaining(): (number | undefined)[] {
    return this.lanes.map((l) => l.monthRemaining);
  }

  private sort() {
    this.waiting.sort((a, b) => a.rank - b.rank || a.seq - b.seq);
  }

  private trim(t: number) {
    for (const l of this.lanes) {
      l.starts = l.starts.filter((s) => t - s < this.windowMs);
      if (l.resetAt !== undefined && t >= l.resetAt) l.monthRemaining = l.resetAt = undefined;
    }
  }

  /** Lanes whose key has calls left this month; all of them when every key is spent (each call then ends like any 429). */
  private usable() {
    const all = this.lanes.map((_, i) => i);
    const left = all.filter((i) => this.lanes[i].monthRemaining !== 0);
    return left.length ? left : all;
  }

  /** Calls left per millisecond until the key resets: the rate it can sustain without running dry. */
  private headroom(i: number, t: number) {
    const l = this.lanes[i];
    if (l.monthRemaining === undefined) return Number.POSITIVE_INFINITY;
    return l.monthRemaining / Math.max(1, (l.resetAt ?? t + 30 * 86_400_000) - t);
  }

  /** The best free lane: most headroom, then least busy, then lowest index. `avoid` is only a preference unless `strict`. */
  private best(t: number, avoid: number | undefined, strict: boolean): number | undefined {
    const free = this.usable().filter((i) => this.lanes[i].starts.length < this.perSecond && this.lanes[i].blockedUntil <= t);
    const others = free.filter((i) => i !== avoid);
    const from = others.length || strict ? others : free;
    return from.sort((a, b) => this.headroom(b, t) - this.headroom(a, t) || this.lanes[a].starts.length - this.lanes[b].starts.length || a - b)[0];
  }

  private pump() {
    const t = this.now();
    this.trim(t);
    while (this.waiting.length) {
      const lane = this.best(t, this.waiting[0].avoid, false);
      if (lane === undefined) break;
      this.lanes[lane].starts.push(t);
      this.waiting.shift()!.go(lane);
    }
    if (this.waiting.length && !this.timer) {
      const wake = Math.min(
        ...this.usable().map((i) => {
          const l = this.lanes[i];
          return Math.max(l.blockedUntil, l.starts.length >= this.perSecond ? l.starts[0] + this.windowMs : t);
        }),
      );
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.pump();
      }, Math.max(1, wake - t));
    }
  }
}

export type HedgeOptions = { defaultMs: number; minMs: number; maxMs: number; share: number };
export const HEDGE: HedgeOptions = { defaultMs: 4000, minMs: 1500, maxMs: 12_000, share: 0.15 };

/**
 * When to hedge a slow call (§14.9). Latency is mostly set by the query (12 Oct: the same call on both keys at once
 * took 3.88 s and 3.89 s), so a hedge pays only when one call stalls far past its kind's usual time: after 1.25× the
 * 90th percentile of recent calls of that kind, and for at most `share` of the last minute's sends.
 */
export class Hedger {
  private samples = new Map<string, number[]>();
  private sends: number[] = [];
  private hedges: number[] = [];

  constructor(
    readonly opts: HedgeOptions = HEDGE,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records one finished request's own latency. */
  add(kind: string, ms: number) {
    const list = this.samples.get(kind) ?? [];
    list.push(ms);
    if (list.length > 50) list.shift();
    this.samples.set(kind, list);
  }

  /** How long a call of this kind runs before it's hedged. */
  after(kind: string): number {
    const list = this.samples.get(kind);
    if (!list || list.length < 8) return this.opts.defaultMs;
    const sorted = [...list].sort((a, b) => a - b);
    const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
    return Math.min(this.opts.maxMs, Math.max(this.opts.minMs, p90 * 1.25));
  }

  noteSend() {
    this.sends.push(this.now());
  }

  /** Whether the budget has room for one more hedge: at most `share` of the last minute's sends, and always at least 2. */
  room(): boolean {
    const t = this.now();
    this.sends = this.sends.filter((s) => t - s < 60_000);
    this.hedges = this.hedges.filter((s) => t - s < 60_000);
    return this.hedges.length < Math.max(2, Math.floor(this.sends.length * this.opts.share));
  }

  spend() {
    this.hedges.push(this.now());
  }
}

/** Calls of one kind take similar times: same endpoint and entity type, and whether a place or a fixed pool is set. */
export function latencyKind(path: string, query: Record<string, string>): string {
  const loc = query["filter.location"] || query["filter.location.query"] ? "loc" : "";
  return `${path}|${query["filter.type"] ?? ""}|${loc}|${query["filter.results.entities"] ? "pool" : ""}`;
}

/** The first answer that isn't worth retrying; the last one if none is. */
function firstUseful(calls: Promise<RawResult>[]): Promise<RawResult> {
  return new Promise((resolve) => {
    let left = calls.length;
    for (const c of calls) void c.then((r) => (classify(r.status, r.body) !== "retryable" || --left === 0) && resolve(r));
  });
}

let callSeq = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A call already on its way: later callers for the same request share it, and can make it more urgent. */
type InFlight = { result: Promise<RawResult>; promote(p: Priority): void };

export type QlooClientOptions = {
  transport: QlooTransport;
  cache?: ResponseCache;
  /** Called for every call, including cache hits, so the run log stays complete. */
  onCall?: (call: QlooCall) => void;
  retryDelayMs?: number;
  /** Starts allowed per second per key; defaults to the key's limit live and to no limit for fixtures. */
  perSecond?: number;
  /** Share an existing pacer (child clients do). */
  pacer?: Pacer;
  /** Hedge settings; false turns hedging off. Hedging needs a live transport with two or more keys. */
  hedge?: HedgeOptions | false;
  /** Shared by child clients. */
  hedger?: Hedger;
  inflight?: Map<string, InFlight>;
  /** Per-entity weights for insights signals (§9.23 step 7); entities not listed weigh 1. */
  weights?: ReadonlyMap<string, number>;
};

/** One entity in a weighted signal (§9.23 step 7). */
export type Weighted = { id: string; weight: number };

export type CallOptions = {
  priority?: Priority;
  /** false: never hedge this call. For calls that are slow by nature (a US-wide heatmap, about 10 s), where a hedge only doubles the cost. */
  hedge?: boolean;
};
/** Longest query string sent as a GET. */
const MAX_GET = 6000;

export class QlooClient {
  readonly mode: "live" | "fixture";
  private readonly transport: QlooTransport;
  private readonly cache: ResponseCache;
  private readonly onCall?: (call: QlooCall) => void;
  private readonly retryDelayMs: number;
  readonly pacer: Pacer;
  private readonly hedger?: Hedger;
  private readonly inflight: Map<string, InFlight>;
  private readonly weights?: ReadonlyMap<string, number>;

  constructor(opts: QlooClientOptions) {
    this.transport = opts.transport;
    this.mode = opts.transport.mode;
    this.cache = opts.cache ?? new MemoryCache();
    this.onCall = opts.onCall;
    this.retryDelayMs = opts.retryDelayMs ?? 1000;
    this.weights = opts.weights;
    const lanes = opts.transport.lanes ?? 1;
    this.pacer = opts.pacer ?? new Pacer(opts.perSecond ?? (this.mode === "live" ? LIVE_PER_SECOND : Number.POSITIVE_INFINITY), undefined, undefined, lanes);
    this.hedger = opts.hedger ?? (opts.hedge !== false && this.mode === "live" && this.pacer.laneCount > 1 ? new Hedger(opts.hedge || HEDGE) : undefined);
    this.inflight = opts.inflight ?? new Map();
  }

  /** Everything a child client shares with its parent: cache, transport, pacer, hedge budget and calls in flight. */
  private child(onCall: QlooClientOptions["onCall"], weights: QlooClientOptions["weights"]): QlooClient {
    return new QlooClient({ transport: this.transport, cache: this.cache, pacer: this.pacer, hedger: this.hedger, hedge: this.hedger ? undefined : false, inflight: this.inflight, onCall, retryDelayMs: this.retryDelayMs, weights });
  }

  /** A child client that also logs into another sink (one per block). Parents still see every call. */
  withLog(onCall: (call: QlooCall) => void): QlooClient {
    const parent = this.onCall;
    return this.child((c) => (parent?.(c), onCall(c)), this.weights);
  }

  /**
   * A child client whose insights calls weigh these entities wherever they appear in the signal (the founder's crowd
   * reactions, §9.23 step 7). Blocks don't change: a signal with unequal weights goes as the weighted POST.
   */
  withWeights(weights: ReadonlyMap<string, number>): QlooClient {
    return this.child(this.onCall, weights);
  }

  async get(path: string, params: QlooParams = {}, opts: CallOptions = {}): Promise<QlooResponse> {
    const query = toQuery(params);
    if (query.take && Number(query.take) > MAX_TAKE) throw new Error(`take must be ≤ ${MAX_TAKE}`);
    for (const k of ["filter.results.entities", "filter.results.tags"]) {
      if (query[k] && query[k].split(",").length > MAX_TAKE) throw new Error(`${k} must hold ≤ ${MAX_TAKE} IDs`);
    }
    return this.fetch(path, query, cacheKey(path, query), (o) => this.transport.send(path, query, o), opts);
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
    const res = await this.fetch("/v2/insights", logged, `POST ${cacheKey("/v2/insights", logged)}`, (o) => this.transport.post("/v2/insights", body, o), opts);
    return { ...res, results: results(res) };
  }

  private async fetch(path: string, query: Record<string, string>, key: string, send: (o: SendOptions) => Promise<RawResult>, opts: CallOptions): Promise<QlooResponse> {
    const started = Date.now();
    const hit = await this.cache.get(key);
    if (hit) return this.log(path, query, hit, 0, true);
    const priority = opts.priority ?? "now";

    // The same request already on its way (a prefetch, another visitor on the same pack): share it, and hurry it up.
    const shared = this.inflight.get(key);
    if (shared) {
      shared.promote(priority);
      return this.log(path, query, await shared.result, Date.now() - started, true);
    }
    const state = { priority, ticket: undefined as Ticket | undefined, hedge: opts.hedge !== false };
    const flight: InFlight = {
      result: this.run(path, query, send, state),
      promote: (p) => {
        if (RANK[p] >= RANK[state.priority]) return;
        state.priority = p;
        state.ticket?.promote(p);
      },
    };
    this.inflight.set(key, flight);
    let raw: RawResult;
    try {
      raw = await flight.result;
    } finally {
      this.inflight.delete(key);
    }
    if (raw.status === 200) {
      const ttl = path.startsWith("/search") || path.startsWith("/entities") || path.startsWith("/v2/tags") || path.startsWith("/v2/audiences") ? FOREVER : INSIGHTS_TTL_MS;
      await this.cache.set(key, { status: raw.status, body: raw.body }, ttl);
    }
    return this.log(path, query, raw, Date.now() - started, false);
  }

  /** Up to three attempts. A key at its per-second limit hands the retry to another key at once; anything else backs off. */
  private async run(path: string, query: Record<string, string>, send: (o: SendOptions) => Promise<RawResult>, state: { priority: Priority; ticket?: Ticket; hedge: boolean }): Promise<RawResult> {
    let raw: RawResult = { status: 0, body: null };
    let avoid: number | undefined;
    for (let attempt = 0; attempt <= 2; attempt++) {
      const lane = await this.pacer.acquire(state.priority, { avoid, ticket: (t) => (state.ticket = t) });
      raw = await this.attempt(latencyKind(path, query), send, lane, state.hedge ? state.priority : "later");
      if (classify(raw.status, raw.body) !== "retryable" || attempt === 2) break;
      avoid = raw.lane ?? lane;
      if (raw.status !== 429 || this.pacer.laneCount < 2) await sleep(this.retryDelayMs * 2 ** attempt);
    }
    return raw;
  }

  /** One attempt on one lane, hedged on another idle lane if it runs far past its kind's usual time. */
  private async attempt(kind: string, send: (o: SendOptions) => Promise<RawResult>, lane: number, priority: Priority): Promise<RawResult> {
    const once = (l: number, signal: AbortSignal) => {
      const t0 = Date.now();
      this.hedger?.noteSend();
      return send({ lane: l, signal })
        .catch((): RawResult => ({ status: 0, body: null }))
        .then((r) => {
          this.pacer.report(l, r.status, r.limits);
          if (r.status === 200 && !signal.aborted) this.hedger?.add(kind, Date.now() - t0);
          return { ...r, lane: l };
        });
    };
    const a = new AbortController();
    const first = once(lane, a.signal);
    // Background work never hedges: nobody is waiting on it.
    if (!this.hedger || priority === "later") return first;
    const early = await Promise.race([first, sleep(this.hedger.after(kind)).then(() => undefined)]);
    if (early) return early;
    const other = this.hedger.room() ? this.pacer.tryAcquire(lane) : undefined;
    if (other === undefined) return first;
    this.hedger.spend();
    const b = new AbortController();
    const second = once(other, b.signal).then((r) => ({ ...r, hedged: true }));
    const winner = await firstUseful([first, second]);
    (winner.lane === lane ? b : a).abort();
    return winner;
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
      ...(raw.hedged && !cached ? { hedged: true } : {}),
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
      const res = await this.fetch("/v2/insights", query, `POST ${cacheKey("/v2/insights", query)}`, (o) => this.transport.post("/v2/insights", body, o), opts);
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
