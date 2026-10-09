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
