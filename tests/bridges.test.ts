import { describe, expect, it } from "vitest";
import { crowdBridges, crowdProfile } from "@/lib/taste/bridges";
import type { GraphState, Node } from "@/lib/taste/graph";

// Where two crowds meet (§9.28): read from U with no calls; both sides must love an entity, landmarks left out.

/** 12 entities: 0–3 crowd A (landmarks 0, 1), 4–7 crowd B (landmarks 4, 5), 8 loved by both, 9–11 by neither. */
function state(): GraphState {
  const nodes = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, name: `Entity ${i}`, domain: "brand", affinity: 0.5, tags: [] }) as unknown as Node);
  const landmarks = [0, 1, 4, 5];
  const love = (i: number, j: number) => {
    const lm = landmarks[j];
    const inA = lm < 4;
    if (i === 8) return 0.95;
    if (i >= 9) return 0.05 + 0.01 * i;
    if (inA) return i < 4 ? 0.9 - 0.01 * i : i < 8 ? 0.3 : 0.1;
    return i >= 4 && i < 8 ? 0.9 - 0.01 * i : i < 4 ? 0.3 : 0.1;
  };
  const U = nodes.map((_, i) => [0.5, ...landmarks.map((_, j) => love(i, j))]);
  return { seed: {} as GraphState["seed"], nodes, U, landmarks, domains: ["brand"], seedName: "Seed", round: 1, callIds: [], extra: [] };
}

describe("crowd bridges", () => {
  const A = new Set(["e0", "e1", "e2", "e3"]);
  const B = new Set(["e4", "e5", "e6", "e7"]);

  it("profiles a crowd from its own landmarks", () => {
    const p = crowdProfile(state(), A)!;
    expect(p.get("e8")).toBe(1);
    expect(p.get("e2")!).toBeGreaterThan(p.get("e6")!);
    expect(crowdProfile(state(), new Set(["e9"]))).toBeUndefined();
  });

  it("finds the entity both crowds love, and only it", () => {
    const out = crowdBridges(state(), A, B);
    expect(out.map((x) => x.id)).toEqual(["e8"]);
    expect(out[0].score).toBe(1);
  });

  it("leaves out entities only one side loves, and the landmarks", () => {
    const ids = crowdBridges(state(), A, B, { min: 0.3 }).map((x) => x.id);
    for (const lm of ["e0", "e1", "e4", "e5"]) expect(ids).not.toContain(lm);
    expect(ids[0]).toBe("e8");
  });
});
