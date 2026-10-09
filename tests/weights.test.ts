import { describe, expect, it, vi } from "vitest";
import { crowdIdForStop, crowdSignal, WEIGHT } from "@/lib/journey/weights";
import type { CrowdCard } from "@/lib/journey/types";
import { QlooClient } from "@/lib/qloo/client";

const crowd = (id: string, main: boolean, ids: string[]): CrowdCard => ({ id, name: `Crowd ${id}`, main, loves: [], signal: ids.map((x) => ({ id: x, name: x })), cities: [], size: ids.length });
const crowds = [crowd("a", true, ["a1", "a2", "a3"]), crowd("b", false, ["b1", "b2"]), crowd("c", false, ["c1", "c2"])];

describe("crowd reactions become a weighted signal (§9.23 step 7)", () => {
  it("with no Partly crowds every weight is 1, so requests match the unweighted ones", () => {
    const s = crowdSignal(crowds, "a", { a: "us" })!;
    expect(s.signal.map((x) => x.weight)).toEqual([1, 1, 1]);
    expect(s.exclude).toEqual([]);
  });
  it("Partly blends a crowd in at half weight; Not us is left out and excluded", () => {
    const s = crowdSignal(crowds, "a", { b: "partly", c: "not_us" })!;
    expect(s.signal.filter((x) => x.weight === WEIGHT.chosen).map((x) => x.id)).toEqual(["a1", "a2", "a3"]);
    expect(s.signal.filter((x) => x.weight === WEIGHT.partly).map((x) => x.id)).toEqual(["b1", "b2"]);
    expect(s.exclude).toEqual(["c1", "c2"]);
  });
});

describe("which crowd each stop follows (§7.8)", () => {
  const base = { crowds, crowdId: "b", reactions: {} };
  it("follows the chosen crowd unless the founder said the other picks target the current one", () => {
    expect(crowdIdForStop("places", { ...base, growth: ["new_crowd", "deepen"] })).toBe("b");
    expect(crowdIdForStop("places", { ...base, growth: ["new_crowd", "deepen"], target: "new" })).toBe("b");
  });
  it("'current': New crowd's own stops follow the new crowd, the rest follow the main one", () => {
    const o = { ...base, growth: ["new_crowd", "deepen"] as const, target: "current" as const };
    expect(crowdIdForStop("places", { ...o, growth: [...o.growth] })).toBe("a");
    expect(crowdIdForStop("message", { ...o, growth: [...o.growth] })).toBe("b");
  });
  it("'current' prefers the crowd marked That's us", () => {
    expect(crowdIdForStop("places", { ...base, growth: ["new_crowd", "deepen"], target: "current", reactions: { c: "us" } })).toBe("c");
  });
});

describe("weighted client", () => {
  it("sends unequal weights as the weighted POST and equal ones as a plain GET", async () => {
    const send = vi.fn(async () => ({ status: 200, body: { results: { entities: [] } } }));
    const post = vi.fn(async () => ({ status: 200, body: { results: { entities: [] } } }));
    const q = new QlooClient({ transport: { mode: "fixture", send, post } });
    await q.withWeights(new Map([["x", 3]])).insights({ "filter.type": "urn:entity:brand", "signal.interests.entities": ["x", "y"] });
    expect(post).toHaveBeenCalledTimes(1);
    expect((post.mock.calls[0] as unknown[])[1]).toMatchObject({ "signal.interests.entities": [{ id: "x", weight: 3 }, { id: "y", weight: 1 }] });
    await q.withWeights(new Map([["x", 2], ["y", 2]])).insights({ "signal.interests.entities": ["x", "y"] });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
