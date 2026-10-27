import { describe, expect, it } from "vitest";
import { emptyJourney, type Journey } from "@/lib/journey/types";
import { applyExternal, type External } from "@/lib/workspace/merge";
import { emptyTeam } from "@/lib/team/types";

// §23.6 a: changes made from outside Athena fold into the journey item by item, the newer change to an item winning,
// and nothing overwrites the whole journey.

const base = (): Journey => ({ ...emptyJourney(), team: emptyTeam() });

describe("applyExternal (§23.6 a)", () => {
  it("folds in a mark newer than the cursor and advances the cursor", () => {
    const ext: External = { marks: { "item-1": { status: "done", at: 100 } } };
    const r = applyExternal(base(), ext, 0);
    expect(r.changed).toBe(true);
    expect(r.cursor).toBe(100);
    expect(r.journey.team?.tasks?.["item-1"]).toEqual({ status: "done", at: 100 });
  });

  it("ignores a change at or before the cursor (never folded in twice)", () => {
    const ext: External = { marks: { "item-1": { status: "done", at: 50 } } };
    const r = applyExternal(base(), ext, 50);
    expect(r.changed).toBe(false);
    expect(r.cursor).toBe(50);
    expect(r.journey.team?.tasks?.["item-1"]).toBeUndefined();
  });

  it("lets the browser's own newer change to a task win over an older external one", () => {
    const j = base();
    j.team = { ...emptyTeam(), tasks: { "item-1": { status: "doing", at: 200 } } };
    const ext: External = { marks: { "item-1": { status: "skipped", at: 150 } } };
    const r = applyExternal(j, ext, 0);
    expect(r.changed).toBe(false);
    expect(r.journey.team?.tasks?.["item-1"].status).toBe("doing");
    expect(r.cursor).toBe(150); // still advanced, so the stale change isn't reconsidered
  });

  it("upserts an answer by question id", () => {
    const j = base();
    j.team = { ...emptyTeam(), answered: [{ id: "q1", agent: "athena", question: "Budget?", answer: "old" }] };
    const ext: External = { answers: { q1: { agent: "athena", question: "Budget?", answer: "$2k/mo", at: 300 } } };
    const r = applyExternal(j, ext, 0);
    expect(r.changed).toBe(true);
    expect(r.journey.team?.answered).toHaveLength(1);
    expect(r.journey.team?.answered?.[0].answer).toBe("$2k/mo");
  });

  it("returns facts to fold in later and never loses them to the cursor it reports", () => {
    const ext: External = { facts: [{ id: "f1", text: "We moved to Oakland", at: 400 }] };
    const r = applyExternal(base(), ext, 0);
    expect(r.newFacts).toEqual([{ id: "f1", text: "We moved to Oakland" }]);
    expect(r.cursor).toBe(400);
    expect(r.changed).toBe(true);
  });

  it("leaves the rest of the journey untouched", () => {
    const j = base();
    j.stop = "crowd";
    j.told = { question: "How do you sell?", answer: "DTC" };
    const r = applyExternal(j, { marks: { x: { status: "done", at: 10 } } }, 0);
    expect(r.journey.stop).toBe("crowd");
    expect(r.journey.told).toEqual({ question: "How do you sell?", answer: "DTC" });
  });

  it("does nothing with no external changes", () => {
    const r = applyExternal(base(), {}, 5);
    expect(r.changed).toBe(false);
    expect(r.cursor).toBe(5);
    expect(r.newFacts).toEqual([]);
  });
});
