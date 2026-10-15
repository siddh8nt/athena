import { describe, expect, it } from "vitest";
import { keptOptions, liveFacts, type Knowledge } from "@/lib/knowledge/types";

const kb = {
  facts: [
    { id: "f1", text: "A jar is $12", where: [], source: "site" },
    { id: "f2", text: "A jar is $15", where: [], source: "deck" },
  ],
  conflicts: [{ id: "c1", about: "Price of a jar", options: [{ value: "$12", facts: ["f1"] }, { value: "$15", facts: ["f2"] }], recommended: 0, why: "" }],
  coverage: [],
} as unknown as Knowledge;

describe("a founder's answer to a conflict", () => {
  it("a number keeps that one option", () => expect(keptOptions(kb.conflicts[0], 1)).toEqual([1]));
  it("unanswered keeps my pick", () => expect(keptOptions(kb.conflicts[0], undefined)).toEqual([0]));
  it("a resolution keeps several, and adds their words as a fact", () => {
    const r = { keep: [0, 1], fact: "A jar is $12 online and $15 in stores.", said: "both" };
    expect(keptOptions(kb.conflicts[0], r)).toEqual([0, 1]);
    const live = liveFacts(kb, { c1: r });
    expect(live.map((f) => f.text)).toContain(r.fact);
    expect(live.some((f) => f.text === "A jar is $15")).toBe(true);
  });
  it("a resolution with none kept drops both values, keeping only their words", () => {
    const live = liveFacts(kb, { c1: { keep: [], fact: "A jar is $14 now.", said: "neither, it's 14" } });
    expect(live.map((f) => f.text)).toEqual(["A jar is $14 now."]);
  });
});
