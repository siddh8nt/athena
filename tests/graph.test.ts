import { describe, expect, it, vi } from "vitest";
import { QlooClient } from "@/lib/qloo/client";
import { buildGraph, extendGraph, type Seed } from "@/lib/taste/graph";

// The taste graph end to end on a planted world (§9.23): two crowds, A and B, in two domains. A probe ranks its own
// crowd first. Click to probe (§13.11) adds one landmark to the stored matrix without repeating the graph's probes.

const crowdOf = (id: string) => id[0];
const noise = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7) % 1000;
const ids = (d: string) => Array.from({ length: 24 }, (_, i) => `${i % 2 ? "A" : "B"}-${d}-${i}`);
const DOMAIN_IDS: Record<string, string[]> = { brand: ids("brand"), artist: ids("artist") };

function client() {
  const send = vi.fn(async (_path: string, q: Record<string, unknown>) => {
    const domain = String(q["filter.type"]).replace("urn:entity:", "");
    const pool = q["filter.results.entities"] ? String(q["filter.results.entities"]).split(",") : DOMAIN_IDS[domain] ?? [];
    const signal = String(q["signal.interests.entities"] ?? "").split(",")[0];
    // The seed loves both crowds alike; a landmark ranks its own crowd first, each half in its own scrambled order.
    const mix = (list: string[]) => [...list].sort((a, b) => noise(signal + a) - noise(signal + b));
    const order = signal === "seed" ? pool : [...mix(pool.filter((id) => crowdOf(id) === crowdOf(signal))), ...mix(pool.filter((id) => crowdOf(id) !== crowdOf(signal)))];
    return { status: 200, body: { results: { entities: order.map((id) => ({ entity_id: id, name: id, popularity: 0.5 })) } } };
  });
  return { send, qloo: new QlooClient({ transport: { mode: "fixture", send, post: send } }) };
}

const seed: Seed = { brand: { id: "seed", name: "Seed" }, lookalikes: [], tags: [] };

describe("taste graph and click to probe", () => {
  it("finds the planted crowds and keeps the matrix for later probes", async () => {
    const { qloo } = client();
    const g = await buildGraph(qloo, seed);
    expect(g.crowds.length).toBeGreaterThanOrEqual(2);
    for (const c of g.crowds) expect(new Set(c.entities.map((n) => crowdOf(n.id))).size).toBe(1);
    expect(g.state?.U.length).toBe(g.nodes.length);
    expect(g.state?.U[0].length).toBe(g.landmarks.length);
  });

  it("probes one more landmark, one call per domain, and re-forms the crowds", async () => {
    const { send, qloo } = client();
    const g = await buildGraph(qloo, seed);
    const target = g.galaxy!.nodes.find((n) => !n.landmark)!;
    const before = send.mock.calls.length;
    const x = await extendGraph(qloo, g.state!, [target.id]);
    expect(send.mock.calls.length - before).toBe(2);
    expect(x.landmarks.length).toBe(g.landmarks.length + 1);
    expect(x.galaxy!.nodes.find((n) => n.id === target.id)!.landmark).toBe(true);
    expect(x.state!.extra).toEqual([target.id]);
    expect(x.crowds.length).toBeGreaterThanOrEqual(2);
    for (const c of x.crowds) expect(new Set(c.entities.map((n) => crowdOf(n.id))).size).toBe(1);
    expect(x.galaxy!.done).toBe(true);
  });

  it("never probes the same entity twice, and leaves the stored graph unchanged", async () => {
    const { qloo } = client();
    const g = await buildGraph(qloo, seed);
    const target = g.galaxy!.nodes.find((n) => !n.landmark)!;
    const cols = g.state!.U[0].length;
    const once = await extendGraph(qloo, g.state!, [target.id]);
    const twice = await extendGraph(qloo, once.state!, [target.id]);
    expect(twice.landmarks.length).toBe(once.landmarks.length);
    expect(g.state!.U[0].length).toBe(cols);
    expect(g.state!.extra).toEqual([]);
  });
});
