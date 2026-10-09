import { describe, expect, it } from "vitest";
import { blockedReason, decisionsFor, labelFor, motionsFor, orderFor, spreadNote, stopsFor, suggest } from "@/lib/journey/growth";

// Growth types (PRD §7.8, F41): one test per rule.

describe("ordering and labels", () => {
  it("puts the channel's suggestions first and hides nothing", () => {
    const online = orderFor("online");
    expect(online.slice(0, 2)).toEqual(["borrow", "online"]);
    expect(online).toHaveLength(7);
    expect(orderFor("offline").slice(0, 2)).toEqual(["deepen", "new_city"]);
  });

  it('shows Deepen as "Get into stores" to an online brand', () => {
    expect(labelFor("deepen", "online")).toBe("Get into stores");
    expect(labelFor("deepen", "offline")).toBe("Deepen");
  });
});

describe("prerequisites", () => {
  it("greys out Deepen for an offline brand with no presence, with a reason", () => {
    expect(blockedReason("deepen", { channel: "offline", hasPresence: false, physical: true })).toMatch(/New city/);
    expect(blockedReason("deepen", { channel: "offline", hasPresence: true, physical: true })).toBeUndefined();
  });

  it("keeps Get into stores open for an online brand", () => {
    expect(blockedReason("deepen", { channel: "online", hasPresence: false, physical: true })).toBeUndefined();
  });

  it("greys out Own location without a physical product", () => {
    expect(blockedReason("own_location", { channel: "online", hasPresence: false, physical: false })).toMatch(/physical/);
  });
});

describe("suggestions", () => {
  it("pre-selects 1–2 open types for the channel", () => {
    expect(suggest({ channel: "online", hasPresence: false, physical: true })).toEqual(["borrow", "online"]);
    expect(suggest({ channel: "offline", hasPresence: false, physical: true })).toEqual(["new_city"]);
    expect(suggest({ channel: "offline", hasPresence: true, physical: true })).toEqual(["deepen", "new_city"]);
  });
});

describe("combinations", () => {
  it("asks which city first for Deepen + New city", () => {
    expect(decisionsFor(["deepen", "new_city"]).map((d) => d.id)).toEqual(["first_city"]);
  });

  it("asks which crowd the other picks target when New crowd is picked", () => {
    const d = decisionsFor(["new_crowd", "borrow"]);
    expect(d[0].id).toBe("which_crowd");
    expect(d[0].for).toEqual(["borrow"]);
    expect(decisionsFor(["new_crowd"])).toEqual([]);
  });

  it("says in plain words past 3 picks, without blocking", () => {
    expect(spreadNote(["deepen", "new_city", "borrow"])).toBeUndefined();
    expect(spreadNote(["deepen", "new_city", "borrow", "online"])).toMatch(/4 directions/);
  });
});

describe("stops", () => {
  it("merges each pick's stops in pick order, each once, the first pick leading", () => {
    expect(stopsFor(["online", "new_crowd"])).toEqual(["product", "growth", "crowd", "online", "message", "go"]);
    expect(stopsFor(["deepen", "borrow"])).toEqual(["product", "growth", "crowd", "where", "places", "retailers", "partners", "go"]);
  });

  it("gives three different journeys for three different picks (F6)", () => {
    const a = stopsFor(["deepen"]).join();
    const b = stopsFor(["online"]).join();
    const c = stopsFor(["show_up", "borrow"]).join();
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("maps picks to motions for the plan engine", () => {
    expect(motionsFor(["deepen", "borrow"])).toEqual(["venue", "retail", "partnership"]);
  });
});
