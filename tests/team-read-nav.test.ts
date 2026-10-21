import { describe, expect, it } from "vitest";
import { readTeam } from "@/lib/team/read";

// The Navigator's read travels with the journey (§23.5 e), so a later run's Rep works its cities without mapping again.

const nav = {
  crowds: [{ id: "c0", tier: "win_first", cities: [{ metroId: "nyc", name: "New York", score: 0.8, z: 1.2, reason: "runs hot", leans: ["Diaspora"] }] }],
  cities: [
    {
      metroId: "nyc",
      name: "New York",
      center: [40.71, -74],
      bbox: [-74.2, 40.5, -73.7, 40.9],
      census: { residents: 8000000 },
      rivals: ["Graza"],
      yours: false,
      layers: [{ crowd: "c0", cells: [[40.7, -73.9, 0.9]], callId: "q1" }],
      hoods: [{ name: "Williamsburg", at: [40.71, -73.95], cells: 4, heat: { c0: 0.9 }, area: { zip: { id: "11211", income: 90000 } } }],
    },
  ],
  cap: 2,
  calls: 12,
  callIds: ["q1"],
};

const team = (shared: unknown) => readTeam({ works: { navigator: { headline: "Mapped", results: [], shared } } });

describe("the saved Navigator read", () => {
  it("comes back from the client whole, without heat cells", () => {
    const back = team({ city: { id: "nyc", name: "New York" }, nav }).works.navigator?.shared;
    expect(back?.city).toEqual({ id: "nyc", name: "New York" });
    expect(back?.nav?.crowds[0]).toMatchObject({ id: "c0", tier: "win_first", cities: [{ metroId: "nyc" }] });
    expect(back?.nav?.cities[0]).toMatchObject({ metroId: "nyc", center: [40.71, -74], yours: false, hoods: [{ name: "Williamsburg", area: { zip: { id: "11211" } } }] });
    expect(back?.nav?.cities[0].layers[0].cells).toEqual([]);
  });

  it("is left out when malformed, never an error", () => {
    expect(team({ nav: { crowds: [{ id: "c0", tier: "nope" }], cities: [] } }).works.navigator?.shared).toBeUndefined();
    expect(team({ nav: "x", crowd: "Pantry cooks" }).works.navigator?.shared).toEqual({ crowd: "Pantry cooks" });
  });
});
