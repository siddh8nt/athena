import { describe, expect, it } from "vitest";
import { Pacer, QlooClient, type QlooTransport, type RawResult } from "@/lib/qloo/client";

// The shared Qloo pacer (PRD §14.9, F46): never more than the key's per-second limit, highest priority first.

/** A transport that records when each request started. */
function recorder() {
  const starts: { at: number; tag: string }[] = [];
  const ok: RawResult = { status: 200, body: { results: { entities: [{ entity_id: "x", name: "x" }] } } };
  const t: QlooTransport = {
    mode: "live",
    async send(_path, q) {
      starts.push({ at: Date.now(), tag: q.tag ?? "" });
      return ok;
    },
    async post(_path, body) {
      starts.push({ at: Date.now(), tag: String(body.tag ?? "") });
      return ok;
    },
  };
  return { t, starts };
}

describe("Pacer", () => {
  it("starts at most perSecond calls in any rolling second", async () => {
    const { t, starts } = recorder();
    const qloo = new QlooClient({ transport: t, perSecond: 5 });
    await Promise.all(Array.from({ length: 12 }, (_, i) => qloo.get("/v2/insights", { tag: `c${i}` })));
    expect(starts).toHaveLength(12);
    for (const s of starts) expect(starts.filter((o) => o.at >= s.at && o.at < s.at + 1000).length).toBeLessThanOrEqual(5);
  });

  it("starts waiting calls by priority, then in order", async () => {
    const { t, starts } = recorder();
    const qloo = new QlooClient({ transport: t, perSecond: 2 });
    const jobs = [
      qloo.get("/v2/insights", { tag: "a" }, { priority: "later" }),
      qloo.get("/v2/insights", { tag: "b" }, { priority: "later" }),
      qloo.get("/v2/insights", { tag: "c" }, { priority: "later" }),
      qloo.get("/v2/insights", { tag: "d" }, { priority: "next" }),
      qloo.get("/v2/insights", { tag: "e" }, { priority: "now" }),
    ];
    await Promise.all(jobs);
    // a and b start at once; then the founder's call, then the next stop's, then the rest.
    expect(starts.map((s) => s.tag)).toEqual(["a", "b", "e", "d", "c"]);
  });

  it("is shared by child clients, so blocks can't each take the full limit", async () => {
    const { t, starts } = recorder();
    const qloo = new QlooClient({ transport: t, perSecond: 3 });
    const a = qloo.withLog(() => {});
    const b = qloo.withLog(() => {});
    await Promise.all([0, 1, 2, 3].flatMap((i) => [a.get("/v2/insights", { tag: `a${i}` }), b.get("/v2/insights", { tag: `b${i}` })]));
    expect(a.pacer).toBe(qloo.pacer);
    for (const s of starts) expect(starts.filter((o) => o.at >= s.at && o.at < s.at + 1000).length).toBeLessThanOrEqual(3);
  });

  it("doesn't limit fixture runs", async () => {
    const p = new Pacer(Number.POSITIVE_INFINITY);
    await Promise.all(Array.from({ length: 50 }, () => p.acquire()));
    expect(p.queued).toBe(0);
  });
});

// Several keys (§14.9, 12 Oct): each key is a lane with its own per-second limit.

type Sent = { at: number; tag: string; lane: number };
const OK: RawResult = { status: 200, body: { results: { entities: [{ entity_id: "x", name: "x" }] } } };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A two-key live transport; `respond` decides each lane's answer and delay. */
function lanes(respond: (lane: number, tag: string, n: number) => { ms?: number; result?: RawResult } = () => ({})) {
  const sent: Sent[] = [];
  const t: QlooTransport = {
    mode: "live",
    lanes: 2,
    async send(_path, q, opts) {
      const lane = opts?.lane ?? 0;
      sent.push({ at: Date.now(), tag: q.tag ?? "", lane });
      const r = respond(lane, q.tag ?? "", sent.length);
      if (r.ms) await wait(r.ms);
      if (opts?.signal?.aborted) return { status: 0, body: null };
      return r.result ?? OK;
    },
    async post() {
      return OK;
    },
  };
  return { t, sent };
}

describe("key lanes", () => {
  it("holds each key's limit separately, so two keys start twice as many calls", async () => {
    const { t, sent } = lanes();
    const qloo = new QlooClient({ transport: t, perSecond: 3, hedge: false });
    const t0 = Date.now();
    await Promise.all(Array.from({ length: 12 }, (_, i) => qloo.get("/v2/insights", { tag: `c${i}` })));
    expect(new Set(sent.map((s) => s.lane))).toEqual(new Set([0, 1]));
    for (const lane of [0, 1]) {
      const mine = sent.filter((s) => s.lane === lane);
      for (const s of mine) expect(mine.filter((o) => o.at >= s.at && o.at < s.at + 1000).length).toBeLessThanOrEqual(3);
    }
    // 12 calls at 6 a second: two windows, not four.
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("hands a 429 to the other key at once, without the backoff", async () => {
    const { t, sent } = lanes((lane, _tag, n) => (lane === 0 && n === 1 ? { result: { status: 429, body: null } } : {}));
    const qloo = new QlooClient({ transport: t, retryDelayMs: 10_000, hedge: false });
    const t0 = Date.now();
    const r = await qloo.get("/v2/insights", { tag: "a" });
    expect(r.status).toBe(200);
    expect(sent.map((s) => s.lane)).toEqual([0, 1]);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("prefers the key with more calls left per day until its reset, and skips a spent key", async () => {
    const p = new Pacer(5, 1050, Date.now, 2);
    p.report(0, 200, { monthRemaining: 7000, monthResetMs: 25 * 86_400_000 });
    p.report(1, 200, { monthRemaining: 9900, monthResetMs: 30 * 86_400_000 });
    expect(await p.acquire()).toBe(1); // 330 a day beats 280 a day
    p.report(1, 429, { monthRemaining: 0, monthResetMs: 30 * 86_400_000 });
    expect(await p.acquire()).toBe(0);
    expect(await p.acquire()).toBe(0);
    expect(p.monthRemaining).toEqual([7000, 0]);
  });

  it("sends identical calls in flight once, and a founder's call hurries a queued prefetch", async () => {
    const { t, sent } = lanes(() => ({ ms: 30 }));
    const qloo = new QlooClient({ transport: t, perSecond: 1, hedge: false });
    // Fill both lanes' windows so the next calls queue.
    await Promise.all([qloo.get("/v2/insights", { tag: "busy1" }), qloo.get("/v2/insights", { tag: "busy2" })]);
    const order: string[] = [];
    const later = qloo.get("/v2/insights", { tag: "bg" }, { priority: "later" }).then(() => order.push("bg"));
    const other = qloo.get("/v2/insights", { tag: "other" }, { priority: "next" }).then(() => order.push("other"));
    const dup = qloo.get("/v2/insights", { tag: "bg" }, { priority: "now" });
    const [res] = await Promise.all([dup, later, other]);
    expect(sent.filter((s) => s.tag === "bg")).toHaveLength(1);
    expect(res.call.cached).toBe(true);
    expect(sent.map((s) => s.tag).slice(2)).toEqual(["bg", "other"]);
    expect(order[0]).toBe("bg");
  });

  it("hedges a stalled call on the idle key and takes the first answer", async () => {
    const { t, sent } = lanes((lane) => (lane === 0 ? { ms: 1500 } : { ms: 20 }));
    const qloo = new QlooClient({ transport: t, hedge: { defaultMs: 100, minMs: 50, maxMs: 1000, share: 0.5 } });
    const t0 = Date.now();
    const r = await qloo.get("/v2/insights", { tag: "slow" });
    expect(Date.now() - t0).toBeLessThan(800);
    expect(r.status).toBe(200);
    expect(r.call.hedged).toBe(true);
    expect(sent.map((s) => s.lane)).toEqual([0, 1]);
  });

  it("never hedges background work, and never past its budget", async () => {
    // Every call's first send stalls; a hedge answers at once.
    const seen = new Set<string>();
    const { t, sent } = lanes((_lane, tag) => (seen.has(tag) ? {} : (seen.add(tag), { ms: 300 })));
    const qloo = new QlooClient({ transport: t, perSecond: 50, hedge: { defaultMs: 50, minMs: 10, maxMs: 1000, share: 0 } });
    await qloo.get("/v2/insights", { tag: "bg" }, { priority: "later" });
    expect(sent).toHaveLength(1);
    // A budget of share 0 still allows 2 a minute; the third stalled call waits for its own answer.
    const r = await Promise.all(["a", "b", "c"].map((tag) => qloo.get("/v2/insights", { tag })));
    expect(r.filter((x) => x.call.hedged)).toHaveLength(2);
  });

  it("doesn't hedge with a single key", async () => {
    const { t } = recorder();
    const qloo = new QlooClient({ transport: t });
    expect(qloo.pacer.laneCount).toBe(1);
  });
});

describe("weighted signals (Q24)", () => {
  it("sends unequal weights as a POST body with id keys", async () => {
    const bodies: Record<string, unknown>[] = [];
    const t: QlooTransport = {
      mode: "fixture",
      send: async () => ({ status: 200, body: { results: { entities: [{ entity_id: "g", name: "get" }] } } }),
      post: async (_p, body) => (bodies.push(body), { status: 200, body: { results: { entities: [{ entity_id: "p", name: "post" }] } } }),
    };
    const qloo = new QlooClient({ transport: t });
    const r = await qloo.insightsWeighted({ "filter.type": "urn:entity:brand", take: 10 }, [{ id: "A", weight: 3 }, { id: "B", weight: 1 }, { id: "C", weight: 0 }]);
    expect(r.results.entities?.[0].name).toBe("post");
    expect(bodies[0]["signal.interests.entities"]).toEqual([{ id: "A", weight: 3 }, { id: "B", weight: 1 }]);
    expect(bodies[0]["filter.type"]).toBe("urn:entity:brand");
    expect(r.call.params["signal.interests.entities"]).toBe("A^3,B^1");
  });

  it("sends equal weights as a plain GET", async () => {
    const t: QlooTransport = {
      mode: "fixture",
      send: async (_p, q) => ({ status: 200, body: { results: { entities: [{ entity_id: "g", name: q["signal.interests.entities"] }] } } }),
      post: async () => ({ status: 500, body: null }),
    };
    const qloo = new QlooClient({ transport: t });
    const r = await qloo.insightsWeighted({ "filter.type": "urn:entity:brand" }, [{ id: "A", weight: 1 }, { id: "B", weight: 1 }]);
    expect(r.results.entities?.[0].name).toBe("A,B");
  });
});
