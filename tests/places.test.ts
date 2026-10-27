import { describe, expect, it } from "vitest";
import { resolvePlace, type Resolution } from "@/lib/places/resolve";
import { metroById, metroLevel } from "@/lib/playbook/metros";
import places from "@/data/places.json";
import outlinesFile from "@/data/outlines.json";
import type { PlaceRow } from "@/lib/places/data";

// Typed locations (§9.3) against the real Overture + Census data. No model: informal places are covered separately.
const data = { rows: places.rows as PlaceRow[], outlines: new Set(Object.keys(outlinesFile.outlines)) };
const go = (t: string, interpret?: Parameters<typeof resolvePlace>[2]) => resolvePlace(t, data, interpret);
const okLabel = (r: Resolution) => (r.status === "ok" ? r.label : `${r.status}: ${r.status === "ask" ? r.options.map((o) => o.label).join(" | ") : r.question}`);

describe("typed locations", () => {
  it("states by name or code search their outline and name towns", async () => {
    for (const t of ["Ohio", "OH", "ohio"]) {
      const r = await go(t);
      expect(okLabel(r)).toBe("Ohio");
      const m = metroById((r as { id: string }).id);
      expect(m.area).toEqual(["o:OH"]);
      expect(m.scale).toBe("region");
    }
  });
  it("cities with a state, with or without a comma", async () => {
    expect(okLabel(await go("Austin, TX"))).toBe("Austin, TX");
    expect(okLabel(await go("Austin TX"))).toBe("Austin, TX");
    expect(okLabel(await go("Portland Oregon"))).toBe("Portland, OR");
  });
  it("asks when a name fits several real places of similar size", async () => {
    const r = await go("Portland");
    expect(r.status).toBe("ask");
    expect((r as { options: { label: string }[] }).options.map((o) => o.label)).toEqual(expect.arrayContaining(["Portland, OR", "Portland, ME"]));
    expect((await go("Springfield")).status).toBe("ask");
  });
  it("reads a consolidated city-county as the one city it is", async () => {
    expect(okLabel(await go("Denver"))).toBe("Denver, CO");
    expect(okLabel(await go("San Francisco"))).toBe("San Francisco, CA");
  });
  it("counties and zip codes", async () => {
    expect(okLabel(await go("Cook County, IL"))).toBe("Cook County, IL");
    const z = await go("11211");
    expect(okLabel(z)).toMatch(/^11211 \(New York, NY\)$/);
    expect(metroById((z as { id: string }).id).scale).toBe("local");
  });
  it("neighbourhoods with their city", async () => {
    expect(okLabel(await go("Silver Lake, Los Angeles"))).toBe("Silver Lake, Los Angeles");
  });
  it("informal places go to the model, and only real places are kept", async () => {
    const r = await go("Bay Area", async () => ({ label: "Bay Area", parts: [{ name: "Alameda County", kind: "county", state: "CA" }, { name: "San Francisco County", kind: "county", state: "CA" }, { name: "Atlantis County", kind: "county", state: "CA" }] }));
    expect(r.status).toBe("ok");
    expect((r as { read: string[] }).read).toEqual(["Alameda County, CA", "San Francisco, CA"]);
    expect(metroById((r as { id: string }).id).area).toEqual(["o:CA|Alameda County", "o:CA|San Francisco"]);
  });
  it("asks instead of guessing when nothing can be placed", async () => {
    const r = await go("somewhere nice", async () => ({ parts: [], ask: "Which city are you thinking of?" }));
    expect(r).toEqual({ status: "none", question: "Which city are you thinking of?" });
  });
});

describe("typed locations, harder forms", () => {
  it("a neighbourhood qualified by the borough Overture doesn't file it under", async () => {
    const r = await go("Williamsburg, Brooklyn");
    expect(r.status).toBe("ok");
    expect(metroById((r as { id: string }).id).scale).toBe("local");
  });
  it("a landmark read as its neighbourhood keeps the neighbourhood, not the whole city", async () => {
    const r = await go("near UCLA", async () => ({ label: "Westwood", parts: [{ name: "Westwood", kind: "neighborhood", state: "CA", city: "Los Angeles" }, { name: "Los Angeles", kind: "city", state: "CA" }] }));
    expect((r as { read: string[] }).read).toEqual(["Westwood, Los Angeles"]);
    expect(metroById((r as { id: string }).id).scale).toBe("local");
  });
});

describe("typed places at metro level", () => {
  it("a city typed as a home base is the named metro it sits in; a state stays itself", async () => {
    for (const t of ["Los Angeles, CA", "Brooklyn"]) {
      const r = await go(t);
      expect(r.status).toBe("ok");
      expect(metroLevel(metroById((r as { id: string }).id)).id).toBe(t === "Brooklyn" ? "nyc" : "la");
    }
    const state = await go("Ohio");
    expect(metroLevel(metroById((state as { id: string }).id)).id).toBe((state as { id: string }).id);
  });
});
