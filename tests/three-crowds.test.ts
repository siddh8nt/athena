import { describe, expect, it } from "vitest";
import { crowdRulesOf } from "@/lib/taste/cluster";
import { NEAR_MIN, nearMissOf, type GraphState, type Node } from "@/lib/taste/graph";
import { crowdBridges, crowdProfile, STAND_IN } from "@/lib/taste/bridges";
import { meetingsOf } from "@/lib/taste/engine";
import { rankFits, type CrowdEvidence } from "@/lib/fits/score";
import { heldCrowds, probeWhen, WIDER } from "@/lib/agent/evidence";
import type { AgentState } from "@/lib/agent/tools";
import type { TeamCtx } from "@/lib/agent/plays";
import type { CrowdsResult } from "@/lib/journey/types";

// The Analyst's three crowds (§23.5 c): measure as usual, seed wider, then the near-miss fills Watch, labelled.

describe("the near-miss group", () => {
  const vec = (a: number) => [a, 1 - a];

  it("remembers the strongest group that failed the size rule", () => {
    const groups = [...Array(9).fill(0), ...Array(9).fill(1), ...Array(5).fill(2)];
    const vectors = [...Array(9).fill(vec(1)), ...Array(9).fill(vec(0)), ...Array(5).fill(vec(0.6))];
    const members = groups.map((_, i) => ({ domain: i % 2 ? "brand" : "artist" }));
    const { groups: out, missed } = crowdRulesOf(groups, vectors, members);
    expect(new Set(out).size).toBe(2);
    expect(missed).toEqual([18, 19, 20, 21, 22]);
  });

  it("misses nothing when every group holds", () => {
    const groups = [...Array(9).fill(0), ...Array(9).fill(1)];
    const vectors = [...Array(9).fill(vec(1)), ...Array(9).fill(vec(0))];
    const members = groups.map((_, i) => ({ domain: i % 2 ? "brand" : "artist" }));
    expect(crowdRulesOf(groups, vectors, members).missed).toEqual([]);
  });

  const node = (i: number, o: Partial<Node> = {}) => ({ id: `e${i}`, name: `Entity ${i}`, domain: i % 2 ? "brand" : "artist", affinity: 0.5, tags: [], ...o }) as unknown as Node;

  it("takes the failed group first, when it is big enough", () => {
    const nodes = Array.from({ length: 12 }, (_, i) => node(i));
    expect(nearMissOf({ nodes, U: [] }, [3, 4, 5, 6])!.map((n) => n.id)).toEqual(["e3", "e4", "e5", "e6"]);
  });

  it("else groups the entities outside both crowds by the taste axis they lean on", () => {
    // 8 core entities, then 10 on the fringe: 5 loving columns 1–2, 5 loving columns 3–4.
    const nodes = Array.from({ length: 18 }, (_, i) => node(i, { core: i < 8 }));
    const U = nodes.map((_, i) => {
      const j = (i * 7) % 5;
      if (i < 8) return [0.5, 0.5, 0.5, 0.5, 0.5].map((v) => v + 0.02 * j);
      return i < 13 ? [0.5, 0.95 - 0.01 * j, 0.9, 0.1, 0.05] : [0.5, 0.05, 0.1 + 0.01 * j, 0.9, 0.95];
    });
    const group = nearMissOf({ nodes, U }, [0, 1])!;
    expect(group.length).toBeGreaterThanOrEqual(NEAR_MIN);
    expect(group.every((n) => n.core === false)).toBe(true);
    expect(new Set(group.map((n) => n.domain)).size).toBeGreaterThanOrEqual(2);
  });

  it("finds none when too few entities sit outside the crowds", () => {
    const nodes = Array.from({ length: 12 }, (_, i) => node(i, { core: i > 2 }));
    expect(nearMissOf({ nodes, U: nodes.map(() => [0.5, 0.5, 0.5, 0.5, 0.5]) }, [])).toBeUndefined();
  });
});

describe("where the near-miss meets both crowds", () => {
  /** 12 entities: 0–3 crowd A (landmarks 0, 1), 4–7 crowd B (landmarks 4, 5), 8 loved by all, 9–11 the near-miss (no landmark; leans on B's columns). */
  function state(): GraphState {
    const nodes = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, name: `Entity ${i}`, domain: "brand", affinity: 0.5, tags: [] }) as unknown as Node);
    const landmarks = [0, 1, 4, 5];
    const love = (i: number, j: number) => {
      const inA = landmarks[j] < 4;
      if (i === 8) return 0.95;
      if (i >= 9) return inA ? 0.2 : 0.6 + 0.01 * i;
      if (inA) return i < 4 ? 0.9 - 0.01 * i : 0.3;
      return i >= 4 && i < 8 ? 0.9 - 0.01 * i : 0.3;
    };
    const U = nodes.map((_, i) => [0.5, ...landmarks.map((_, j) => love(i, j))]);
    return { seed: {} as GraphState["seed"], nodes, U, landmarks, domains: ["brand"], seedName: "Seed", round: 1, callIds: [], extra: [] };
  }
  const A = new Set(["e0", "e1", "e2", "e3"]);
  const B = new Set(["e4", "e5", "e6", "e7"]);
  const N = new Set(["e9", "e10", "e11"]);

  it("reads a group with no landmark through the columns it loves most", () => {
    expect(crowdProfile(state(), N)).toBeUndefined();
    expect(crowdProfile(state(), N, { stand: STAND_IN })!.get("e8")).toBe(1);
    expect(crowdBridges(state(), A, N, { stand: STAND_IN }).map((x) => x.id)).toContain("e8");
  });

  it("is met from every measured crowd, the other crowd only from the main one", () => {
    const m = meetingsOf(state(), [
      { id: "a", main: true, members: A },
      { id: "b", main: false, members: B },
      { id: "n", main: false, nearMiss: true, members: N },
    ]);
    expect(m.map((x) => `${x.a}>${x.b}`).sort()).toEqual(["a>b", "a>n", "b>n"]);
  });
});

describe("Watch from the near-miss rule", () => {
  const crowd = (id: string, o: Partial<CrowdEvidence>): CrowdEvidence => ({ id, name: id, members: 10, core: 4, stability: 0.6, fit: 0.5, specificity: 0, ...o });

  it("is always Watch and last, and leaves Win first / Win next as measured", () => {
    const date = "2026-10-14";
    const measured = [crowd("x", { fit: 0.5 }), crowd("y", { fit: 0.45 })];
    // The near-miss scores highest on the numbers, and still can't take a measured tier.
    const near = crowd("n", { fit: 0.9, members: 5, specificity: 0.2, nearMiss: true });
    const without = rankFits(measured, { date }).fits;
    const fits = rankFits([near, ...measured], { date }).fits;
    expect(fits.map((f) => f.crowd)).toEqual(["x", "y", "n"]);
    expect(fits.slice(0, 2).map((f) => [f.crowd, f.tier])).toEqual(without.map((f) => [f.crowd, f.tier]));
    expect(fits[2]).toMatchObject({ tier: "watch", nearMiss: true });
  });
});

describe("seeding wider", () => {
  const n = (id: string, o: Record<string, unknown> = {}) => ({ id, name: id, domain: "brand", crowd: 0, landmark: false, affinity: 0.5, certainty: 0.9, core: true, ...o });
  function agent(crowds: number, o: { wider?: boolean; nearMiss?: boolean; comparables?: { id: string; name: string }[] } = {}): AgentState {
    const r = {
      seed: { brand: { id: "seed" }, lookalikes: [{ id: "look" }] },
      crowds: [
        ...Array.from({ length: crowds }, (_, i) => ({ id: `c${i}`, name: `Crowd ${i}`, size: 10, stability: 0.9 })),
        ...(o.nearMiss ? [{ id: "c9", name: "Near", size: 5, nearMiss: true }] : []),
      ],
      galaxy: {
        nodes: [
          n("seed", { affinity: 1 }),
          n("look", { affinity: 0.95 }),
          n("lm", { landmark: true, affinity: 0.9 }),
          n("Starbucks", { affinity: 0.85 }),
          n("b1", { affinity: 0.8 }),
          n("b2", { affinity: 0.7 }),
          n("b3", { affinity: 0.6 }),
          n("b4", { affinity: 0.5 }),
          n("artist", { domain: "artist", affinity: 0.99 }),
          n("off", { crowd: -1, affinity: 0.98 }),
        ],
      },
    } as unknown as CrowdsResult;
    const team = { brand: { comparables: o.comparables ?? [], competitors: [] }, probe: { ran: 0, wider: o.wider } } as unknown as TeamCtx;
    return { crowds: r, probes: [], asks: 0, team, ran: [] };
  }

  /** probeWhen's decision, read loosely: a probe carries args and why, a skip its reason. */
  const decide = (s: AgentState) => probeWhen(s) as { args?: { entity_ids: string[] }; why?: string; skip?: string };

  it("counts only measured crowds as held", () => {
    expect(heldCrowds(agent(2, { nearMiss: true }).crowds)).toBe(2);
  });

  it("probes the brands most like yours when only two crowds hold", () => {
    const d = decide(agent(2, { nearMiss: true }))!;
    expect(d.args?.entity_ids).toEqual(["b1", "b2", "b3"]);
    expect(d.args?.entity_ids).toHaveLength(WIDER);
    expect(d.why).toMatch(/Only 2 crowds held/);
  });

  it("tops up a probe of named brands with brands like yours", () => {
    const d = decide(agent(2, { comparables: [{ id: "named", name: "Named" }] }))!;
    expect(d.args?.entity_ids).toEqual(["named", "b1", "b2"]);
    expect(d.why).toMatch(/You named Named.*brands like yours/);
  });

  it("doesn't seed wider at three crowds, or once it has", () => {
    expect(decide(agent(3))!.skip).toBeDefined();
    expect(decide(agent(2, { wider: true }))!.skip).toBeDefined();
  });
});
