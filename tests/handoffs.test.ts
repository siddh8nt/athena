import { describe, expect, it } from "vitest";
import { fromCity, fromCrowd, fromWork } from "@/lib/agent/handoffs";
import type { Work } from "@/lib/team/types";

// Fictional names only (no Qloo data in the repo).
const work = (agent: Work["agent"], extra: Partial<Work> = {}) => ({ agent, goal: "g", headline: "", results: [], claims: [], sources: [], ms: 0, qlooCalls: 0, at: 0, ...extra }) as Work;

describe("handoffs (§23.2 step 8.3b)", () => {
  it("hands a crowd to the Navigator and the Scout, with the crowd as focus", () => {
    const [nav, scout] = fromCrowd({ id: "c2", name: "Fern Folk" }, false);
    expect(nav).toMatchObject({ to: "navigator", focus: { crowd: "c2" } });
    expect(scout).toMatchObject({ to: "scout", label: "Win Fern Folk next", focus: { next: "c2" } });
    expect(fromCrowd({ id: "c1", name: "Moss Set" }, true)[1].focus).toEqual({ crowd: "c1" });
  });

  it("hands a city to the Rep and the Promoter", () => {
    expect(fromCity({ id: "aus", name: "Fernvale" }).map((h) => [h.to, h.focus.city])).toEqual([["rep", "aus"], ["promoter", "aus"]]);
  });

  it("hands each finished run on to whoever works its results next, and the end of the line to no one", () => {
    expect(fromWork(work("navigator", { shared: { city: { id: "aus", name: "Fernvale" } } }), () => undefined).map((h) => h.to)).toEqual(["rep", "promoter"]);
    expect(fromWork(work("scout", { shared: { crowd: "Fern Folk" } }), () => "c2").map((h) => [h.to, h.focus.crowd])).toEqual([["matchmaker", "c2"], ["promoter", "c2"]]);
    expect(fromWork(work("rep"), () => undefined)).toEqual([]);
  });
});
