import { describe, expect, it, vi } from "vitest";
import type { CrowdsResult } from "@/lib/journey/types";
import type { SeedInput } from "@/lib/taste/seed";

vi.mock("server-only", () => ({}));
const store = new Map<string, unknown>();
vi.mock("@/lib/store", () => ({
  getStore: () => ({ get: async (ns: string, k: string) => (store.has(`${ns}:${k}`) ? { value: store.get(`${ns}:${k}`) } : undefined), set: async (ns: string, k: string, v: unknown) => void store.set(`${ns}:${k}`, v) }),
}));

const { baseKey, latestCrowds, rememberCrowds } = await import("@/lib/taste/engine");

// A brand's newest crowds are kept per workspace (found in the pre-deploy test pass): two founders who type the same
// brand name never get each other's crowds on a re-plan. Every name here is made up.

const seed = (lookalike: string) => ({ brand: { id: "b1", name: "Tidepool Tins" }, comparables: [], lookalikes: [lookalike], traits: [] }) as unknown as SeedInput;
const measured = (s: SeedInput, crowd: string) =>
  store.set(`crowds:${baseKey(s)}`, { seed: { lookalikes: [], tags: [], missing: [] }, crowds: [{ name: crowd, after: crowd }], calls: 0, callIds: [], axes: [], meetings: [] } as unknown as CrowdsResult);

describe("a brand's newest crowds", () => {
  it("are each workspace's own, even for the same brand name", async () => {
    const one = seed("Brine & Co");
    const two = seed("Corner Larder");
    measured(one, "Pantry cooks");
    measured(two, "Gift buyers");
    await rememberCrowds("ws-one", "Tidepool Tins", one, []);
    await rememberCrowds("ws-two", "tidepool tins", two, []);
    expect((await latestCrowds("ws-one", "Tidepool Tins"))?.crowds.crowds[0].name).toBe("Pantry cooks");
    expect((await latestCrowds("ws-two", "Tidepool Tins"))?.crowds.crowds[0].name).toBe("Gift buyers");
    expect(await latestCrowds("ws-three", "Tidepool Tins")).toBeUndefined();
  });

  it("are neither kept nor read without a workspace", async () => {
    store.clear();
    await rememberCrowds("", "Tidepool Tins", seed("Brine & Co"), []);
    expect([...store.keys()]).toEqual([]);
    expect(await latestCrowds("", "Tidepool Tins")).toBeUndefined();
  });
});
