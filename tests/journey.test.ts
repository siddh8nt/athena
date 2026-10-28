import { describe, expect, it } from "vitest";
import { alreadyIn, retailCategory, OWN_LABEL } from "@/lib/stops/retailers";
import { creatorRole, MIN_CREATORS } from "@/lib/stops/online";
import { candidatesOf, citiesFrom, readSkew, validName } from "@/lib/taste/crowds";
import { checkPick, checkPicks, fallbackFor, handleOf, shortOf } from "@/lib/taste/naming";
import { seedSignal, type Crowd } from "@/lib/taste/graph";
import type { QlooEntity } from "@/lib/qloo/types";

// The v3.0 journey's pure parts: crowds (§9.23), the retail step-up (§9.25), and Online (§9.24).

const crowd = (names: [string, string][], tags: string[] = []): Crowd => ({
  id: "c0",
  main: true,
  entities: names.map(([name, domain], i) => ({ id: `e${i}`, name, domain: domain as "brand", affinity: 1 - i / 10, tags })),
  signal: [],
  brands: [],
  domains: ["brand"],
});

describe("axis name validator (§9.27)", () => {
  const c = crowd([["Great Jones", "brand"], ["Chef's Table", "tv_show"], ["Patty Griffin", "artist"]], ["Cooking", "Folk", "Minimalist"]);

  it("accepts a name built from the entities and tags", () => {
    expect(validName("Minimalist folk cooks", c)).toBe(true);
  });

  it("rejects a word Qloo didn't show", () => {
    expect(validName("Wealthy suburban moms", c)).toBe(false);
  });
});

describe("crowd names after what they love (§23.8 a)", () => {
  const cands = [
    { name: "Liquid I.V.", kind: "brand" },
    { name: "Verb Energy Co.", kind: "brand" },
    { name: "The Rachel Hollis Podcast", kind: "podcast" },
    { name: "Seth Ennis", kind: "artist" },
  ];

  it("takes the model's two members and short forms when they're on the crowd's list", () => {
    const n = checkPick({ after: ["liquid i.v.", "The Rachel Hollis Podcast"], short: ["Liquid I.V.", "Rachel Hollis"], shared: "Wellness routines and country radio" }, cands);
    expect(n).toEqual({ name: "Liquid I.V. and Rachel Hollis fans", handle: "the Liquid I.V. crowd", after: ["Liquid I.V.", "The Rachel Hollis Podcast"], shared: "Wellness routines and country radio." });
  });

  it("keeps the full name when a short form adds a word", () => {
    expect(shortOf("The Rachel Hollis Podcast", "Rachel Hollis Show")).toBe("The Rachel Hollis Podcast");
    expect(shortOf("The Rachel Hollis Podcast", "The")).toBe("The Rachel Hollis Podcast");
    expect(shortOf("Verb Energy Co.", "Verb")).toBe("Verb");
  });

  it("falls back to the strongest members of different kinds when a pick isn't on the list", () => {
    const n = checkPick({ after: ["Liquid I.V.", "Peloton"], short: [], shared: "x" }, cands);
    expect(n.name).toBe("Liquid I.V. and The Rachel Hollis Podcast fans");
    expect(n.shared).toBeUndefined();
  });

  it("never lets one member name two crowds", () => {
    const [a, b] = checkPicks([{ after: ["Liquid I.V.", "Seth Ennis"] }, { after: ["Liquid I.V.", "Verb Energy Co."] }], [cands, cands]);
    expect(a.name).toBe("Liquid I.V. and Seth Ennis fans");
    expect(b.after).not.toContain("Liquid I.V.");
  });

  it("names a one-member crowd, an empty one, and doesn't double 'The' in the handle", () => {
    expect(fallbackFor([{ name: "The Durrells", kind: "TV" }])).toEqual({ name: "The Durrells fans", handle: "the Durrells crowd", after: ["The Durrells"] });
    expect(fallbackFor([]).name).toBe("This crowd");
    expect(handleOf("The Culinistas")).toBe("the Culinistas crowd");
  });

  it("offers the core, most widely known first", () => {
    const c = crowd([["Great Jones", "brand"], ["Chef's Table", "tv_show"], ["Patty Griffin", "artist"], ["Our Place", "brand"]]);
    c.entities[2].popularity = 0.9;
    c.entities[3].core = false;
    expect(candidatesOf(c).map((x) => x.name)).toEqual(["Patty Griffin", "Great Jones", "Chef's Table", "Our Place"]);
  });
});

describe("crowd cities and skew", () => {
  const place = (name: string, metro: string, country = "US"): QlooEntity => ({ entity_id: name, name, properties: { geocode: { metro, country_code: country } } });

  it("names any US metro Qloo returns, ranked by first appearance (§9.3, v3.0)", () => {
    const cities = citiesFrom([place("A", "Bozeman"), place("B", "Bozeman"), place("C", "Asheville"), place("D", "Asheville"), place("E", "Paris", "FR"), place("F", "New York City"), place("G", "New York City")]);
    expect(cities.map((c) => c.name)).toEqual(["Bozeman", "Asheville", "New York"]);
  });

  it("marks a skew clear only when a bar reaches ±0.10 (§9.17)", () => {
    expect(readSkew({ age: { "25_to_29": 0.05 }, gender: { male: 0.02 } })?.clear).toBe(false);
    expect(readSkew({ age: { "25_to_29": 0.12 }, gender: { male: 0.02 } })?.clear).toBe(true);
  });
});

describe("seed signal (§9.23 step 1)", () => {
  it("uses tags only when brands are scarce", () => {
    const tags = [{ id: "urn:tag:genre:brand:x", name: "X" }];
    expect(seedSignal({ lookalikes: [{ id: "a", name: "A" }, { id: "b", name: "B" }], tags }).tags).toEqual([]);
    expect(seedSignal({ lookalikes: [{ id: "a", name: "A" }], tags }).tags).toEqual(["urn:tag:genre:brand:x"]);
  });

  it("leads with the brand itself when Qloo knows it", () => {
    expect(seedSignal({ brand: { id: "own", name: "Own" }, lookalikes: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }], tags: [] }).entities).toEqual(["own", "a", "b"]);
  });
});

describe("next retailers (§9.25)", () => {
  it("reads the product's category", () => {
    expect(retailCategory("premium tinned seafood")).toBe("food");
    expect(retailCategory("pimple patches and skincare")).toBe("beauty");
    expect(retailCategory("hand-poured candles")).toBe("home");
    expect(retailCategory("an app for dinner parties")).toBe("general");
  });

  it("knows which retailers the brand is already in", () => {
    const evidence = ["Sold at Whole Foods, Sprouts and specialty grocers", "Erewhon"];
    expect(alreadyIn("Whole Foods Market", evidence)).toBe(true);
    expect(alreadyIn("Sprouts Farmers Market", evidence)).toBe(true);
    expect(alreadyIn("Erewhon", evidence)).toBe(true);
    expect(alreadyIn("Eataly", evidence)).toBe(false);
  });

  it("flags own-label retailers", () => {
    expect(OWN_LABEL.has("trader joe s")).toBe(true);
  });
});

describe("online creators (§9.24)", () => {
  const person = (tags: string[]): QlooEntity => ({ entity_id: "p", name: "P", tags: tags.map((name) => ({ name })) });

  it("keeps people whose Qloo tags say they make things people follow", () => {
    expect(creatorRole(person(["Tiktoker", "Person"]))).toBe("Tiktoker");
    expect(creatorRole(person(["American Cookbook Writers"]))).toBe("American Cookbook Writers");
  });

  it("drops non-creators and people tied to another country", () => {
    expect(creatorRole(person(["Bodyguards", "Person"]))).toBeUndefined();
    expect(creatorRole(person(["Indian Television Actresses", "Model"]))).toBeUndefined();
    expect(MIN_CREATORS).toBe(3);
  });
});

describe("message themes (§15)", () => {
  it("never offers tragedy, violence or identity as a theme to build a message on", async () => {
    const { isAllowedTheme } = await import("@/lib/methods/allowlist");
    expect(isAllowedTheme("Slavery")).toBe(false);
    expect(isAllowedTheme("Sports History")).toBe(true);
    expect(isAllowedTheme("Belonging")).toBe(true);
  });
});

describe("any US metro (§9.3, v3.0)", () => {
  it("rebuilds a metro outside the named list from its id alone", async () => {
    const { metroById, metroIdFor, isMetroId } = await import("@/lib/playbook/metros");
    const id = metroIdFor("Bozeman Micropolitan Area", [45.68, -111.04]);
    expect(id).toBe("q~Bozeman~45.680,-111.040");
    const m = metroById(id);
    expect(m.name).toBe("Bozeman");
    expect(m.center).toEqual([45.68, -111.04]);
    expect(isMetroId(id)).toBe(true);
    expect(isMetroId("q~")).toBe(false);
  });

  it("keeps the named metros' checked details", async () => {
    const { metroById, metroIdFor } = await import("@/lib/playbook/metros");
    expect(metroIdFor("New York City")).toBe("nyc");
    expect(metroById("nyc").cbsa).toBe("35620");
  });

  it("finds a metro's Census row by its first city, largest first", async () => {
    const { byName } = await import("@/lib/enrich/census");
    const all = new Map([
      ["14580", { name: "Bozeman, MT Micropolitan Statistical Area", population: 120000, income: 80000 }],
      ["19740", { name: "Denver-Aurora-Centennial, CO Metro Area", population: 3000000, income: 95000 }],
      ["99999", { name: "Aurora, NE Micropolitan Statistical Area", population: 9000, income: 60000 }],
    ]);
    expect(byName(all, "Bozeman")?.population).toBe(120000);
    expect(byName(all, "Aurora")?.population).toBe(3000000);
    expect(byName(all, "Nowhere")).toBeUndefined();
  });
});
