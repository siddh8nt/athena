import { describe, expect, it, vi } from "vitest";
import { QlooClient } from "@/lib/qloo/client";
import { buildPlaybook, type Signal } from "@/lib/playbook/config";
import { METROS } from "@/lib/playbook/metros";
import { markets } from "@/lib/blocks/markets";

// Markets (§9.3, v4.0): with a crowd, every named metro but home is scored on the crowd's brands.

const brands = ["b1", "b2", "b3", "b4", "b5", "b6"];
// Each metro's affinity for each brand: metros later in the list score lower, except b6, which peaks in Austin.
const affinity = (metro: string, brand: string) => {
  const i = METROS.findIndex((m) => m.query === metro);
  if (brand === "b6") return metro === "Austin" ? 0.99 : 0.1;
  return 0.9 - i * 0.02 - Number(brand.slice(1)) * 0.01;
};

function client() {
  const send = vi.fn(async (_path: string, q: Record<string, string>) => {
    if (q["filter.type"] === "urn:entity:brand") {
      const ids = q["filter.results.entities"].split(",");
      return { status: 200, body: { results: { entities: ids.map((id) => ({ entity_id: id, name: id.toUpperCase(), query: { affinity: affinity(q["signal.location.query"], id) } })) } } };
    }
    return { status: 200, body: { results: { entities: [], heatmap: [] } } };
  });
  return { send, qloo: new QlooClient({ transport: { mode: "fixture", send, post: send } }) };
}

const signal = (s: Partial<Signal>): Signal => ({ accounts: [], wins: [], declines: [], comparables: [], tags: [], crowd: ["c1"], ...s });
const pb = (s: Partial<Signal>, homeMetro?: string) => buildPlaybook({ brandName: "Test", category: "G1", tier: "premium", signal: signal(s), homeMetro, targetMetro: "nyc" });

describe("Markets, brands method (§9.3)", () => {
  it("scores every named metro but home, one call each, and ranks by mean affinity", async () => {
    const { send, qloo } = client();
    const r = await markets({ pb: pb({ crowdBrands: brands }, "nyc"), qloo, names: new Map(), emit: () => undefined });
    expect(r.data.method).toBe("brands");
    expect(r.data.metros.map((m) => m.metroId)).not.toContain("nyc");
    expect(r.data.metros).toHaveLength(METROS.length - 1);
    expect(send.mock.calls.filter(([, q]) => q["filter.type"] === "urn:entity:brand")).toHaveLength(METROS.length - 1);
    const scores = r.data.metros.map((m) => m.score ?? -1);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(r.data.metros[0].metroId).toBe("la");
  });

  it("a metro's reason names the brands it scores furthest above their own average", async () => {
    const { qloo } = client();
    const r = await markets({ pb: pb({ crowdBrands: brands }), qloo, names: new Map(), emit: () => undefined });
    const austin = r.data.metros.find((m) => m.metroId === "austin")!;
    expect(austin.leans?.[0]).toBe("B6");
    expect(austin.reason).toMatch(/^Over-indexes on B6/);
  });

  it("with fewer than 5 brands it falls back to the venues method", async () => {
    const { send, qloo } = client();
    const r = await markets({ pb: pb({ crowdBrands: ["b1", "b2"] }), qloo, names: new Map(), emit: () => undefined });
    expect(r.data.method).toBe("venues");
    expect(send.mock.calls.some(([, q]) => q["filter.type"] === "urn:entity:brand")).toBe(false);
  });
});
