import { describe, expect, it } from "vitest";
import { auc, bridges, classifyTag, median, mutualFit, percentiles, positioning, rerank } from "@/lib/methods/rank";
import { accept, cleanVenue, isChainName, nameSim, seqRatio } from "@/lib/methods/names";
import { ALL_AUDIENCE_TYPES, BRAND_FINGERPRINT_TYPES, VENUE_FINGERPRINT_TYPES, isAllowedAudienceType, isAllowedTag } from "@/lib/methods/allowlist";

describe("percentiles", () => {
  it("maps rank to 1 − (rank − 1)/(n − 1)", () => {
    const p = percentiles(["a", "b", "c", "d", "e"]);
    expect(p.get("a")).toBe(1);
    expect(p.get("c")).toBe(0.5);
    expect(p.get("e")).toBe(0);
  });
  it("gives a single item 1", () => expect(percentiles(["x"]).get("x")).toBe(1));
});

describe("mutual fit and bridges use min()", () => {
  it("mutual fit is the weaker side", () => {
    expect(mutualFit(0.91, 0.4)).toBe(0.4);
    expect(mutualFit(0.3, 0.8)).toBe(0.3);
    expect(mutualFit(0.9, undefined)).toBeUndefined();
  });
  it("a bridge needs ≥ 0.70 on both sides, top 2 only", () => {
    const acc = new Map([["b1", 0.95], ["b2", 0.9], ["b3", 0.99], ["b4", 0.8]]);
    const venue = new Map([["b1", 0.85], ["b2", 0.6], ["b3", 0.92], ["b4", 0.75]]);
    const out = bridges(acc, venue);
    expect(out.map((b) => b.id)).toEqual(["b3", "b1"]);
    expect(out[0].value).toBe(0.92);
  });
});

describe("rerank", () => {
  const pool = ["a", "b", "c", "d", "e"];
  it("moves items similar to declines down", () => {
    const fit = new Map([["a", 0.9], ["b", 0.8], ["c", 0.7], ["d", 0.6]]);
    const dec = new Map([["a", 1.0], ["b", 0.0], ["c", 0.1], ["d", 0.2]]);
    const out = rerank(pool, fit, dec, 0.5).map((r) => r.id);
    expect(out.indexOf("a")).toBeGreaterThan(out.indexOf("b"));
  });
  it("keeps unscored items below scored ones, in their previous order", () => {
    const fit = new Map([["c", 0.2], ["e", 0.1]]);
    const out = rerank(pool, fit, undefined);
    expect(out.map((r) => r.id)).toEqual(["c", "e", "a", "b", "d"]);
    expect(out[2].scored).toBe(false);
  });
  it("treats a missing decline score as 0", () => {
    const out = rerank(["a"], new Map([["a", 0.5]]), new Map());
    expect(out[0].score).toBe(0.5);
  });
});

describe("positioning (§9.16)", () => {
  it("classifies with the 0.70 / 0.40 thresholds", () => {
    expect(classifyTag(0.8, 0.75)).toBe("shared");
    expect(classifyTag(0.8, 0.3)).toBe("onlyYou");
    expect(classifyTag(0.2, 0.9)).toBe("onlyThem");
    expect(classifyTag(0.8, 0.5)).toBeNull();
    expect(classifyTag(0.9, undefined)).toBe("onlyYou");
  });
  it("returns up to 3 tags per class", () => {
    const pool = ["t1", "t2", "t3", "t4", "t5"];
    const you = new Map([["t1", 0.9], ["t2", 0.95], ["t3", 0.8], ["t4", 0.75], ["t5", 0.1]]);
    const them = new Map([["t1", 0.9], ["t2", 0.2], ["t3", 0.1], ["t4", 0.0], ["t5", 0.99]]);
    const out = positioning(pool, you, them);
    expect(out.shared).toEqual(["t1"]);
    expect(out.onlyYou).toEqual(["t2", "t3", "t4"]);
    expect(out.onlyThem).toEqual(["t5"]);
  });
});

describe("ranking-check AUC (§10.3)", () => {
  it("is 1 when every positive outranks every negative", () => {
    const rank = new Map([["p1", 0], ["p2", 1], ["n1", 2], ["n2", 3]]);
    expect(auc(["p1", "p2"], ["n1", "n2"], rank)).toBe(1);
  });
  it("counts unscored pairs as ties", () => {
    const rank = new Map([["p1", 0]]);
    // p1 beats n1 (unscored); p2 (unscored) ties n1 → (1 + 0.5) / 2
    expect(auc(["p1", "p2"], ["n1"], rank)).toBe(0.75);
  });
  it("is 0.5 on synthetic random order, on average", () => {
    let total = 0;
    for (let s = 0; s < 200; s++) {
      const ids = Array.from({ length: 50 }, (_, i) => (i < 25 ? `p${i}` : `n${i}`));
      const shuffled = ids.map((id) => [id, Math.sin(s * 999 + id.length * 7 + Number(id.slice(1)) * 13.37)] as const).sort((a, b) => a[1] - b[1]);
      const rank = new Map(shuffled.map(([id], i) => [id, i]));
      total += auc(ids.slice(0, 25), ids.slice(25), rank);
    }
    expect(total / 200).toBeGreaterThan(0.4);
    expect(total / 200).toBeLessThan(0.6);
  });
  it("median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeUndefined();
  });
});

describe("name matching (§9.1)", () => {
  it("matches difflib's ratio", () => {
    expect(seqRatio("abcd", "bcde")).toBeCloseTo(0.75);
    expect(seqRatio("", "")).toBe(1);
  });
  it("cleans location suffixes", () => {
    expect(cleanVenue("A.MANO Brooklyn - Ground Floor")).toBe("A.MANO Brooklyn");
    expect(cleanVenue("Foo (Downtown)")).toBe("Foo");
  });
  it("ignores generic words and accents", () => {
    expect(nameSim("Café Olé", "Ole Cafe")).toBe(1);
    expect(nameSim("Bang Bang Pie & Biscuits", "Bang Bang Pie and Biscuits")).toBe(1);
  });
  it("accepts on name + street number, or exact name within 300 m", () => {
    expect(accept({ name: "Saltie Girl", address: "279 Dartmouth St" }, { name: "Saltie Girl", address: "279 Dartmouth Street" }).ok).toBe(true);
    expect(accept({ name: "Saltie Girl", lat: 42.35, lon: -71.077 }, { name: "Saltie Girl", lat: 42.352, lon: -71.077 }).ok).toBe(true);
    expect(accept({ name: "Saltie Girl", lat: 42.35, lon: -71.077 }, { name: "Saltie Girl", lat: 42.36, lon: -71.077 }).ok).toBe(false);
    expect(accept({ name: "Blue Plate", address: "1 Main St" }, { name: "Red Plate", address: "1 Main St" }).ok).toBe(false);
  });
  it("matches chains as whole words only", () => {
    expect(isChainName("Whole Foods Market")).toBe(true);
    expect(isChainName("Trader Joe's")).toBe(true);
    expect(isChainName("Buvons")).toBe(false);
  });
});

describe("allow-lists (§9.2, §9.17)", () => {
  it("rejects customer_identity and audience tags everywhere", () => {
    expect(isAllowedTag({ id: "urn:tag:customer_identity:qloo:x", type: "urn:tag:customer_identity:qloo", name: "X" }, [...VENUE_FINGERPRINT_TYPES])).toBe(false);
    expect(isAllowedTag({ id: "urn:tag:target_gender:qloo:f", type: "urn:tag:target_gender:qloo", name: "F" }, ["urn:tag:target_gender:qloo"])).toBe(false);
  });
  it("rejects political or religious names", () => {
    expect(isAllowedTag({ id: "urn:tag:keyword:qloo:faith", type: "urn:tag:keyword:qloo", name: "Christian Living" }, [...BRAND_FINGERPRINT_TYPES])).toBe(false);
  });
  it("accepts allow-listed types", () => {
    expect(isAllowedTag({ id: "urn:tag:ambience:qloo:cozy", subtype: "urn:tag:ambience:qloo", name: "Cozy" }, [...VENUE_FINGERPRINT_TYPES])).toBe(true);
  });
  it("shows only the four allowed audience types", () => {
    const allowed = ALL_AUDIENCE_TYPES.filter(isAllowedAudienceType);
    expect(allowed).toEqual([
      "urn:audience:hobbies_and_interests",
      "urn:audience:leisure",
      "urn:audience:professional_area",
      "urn:audience:spending_habits",
    ]);
  });
});

describe("grounded festival dates (§9.18)", () => {
  it("parses dates the way pages write them", async () => {
    const { parseLooseDate } = await import("@/lib/enrich/festival-dates");
    const today = "2026-10-08";
    expect(parseLooseDate("OCT 25 2026!", today)).toBe("2026-10-25");
    expect(parseLooseDate("Saturday, October 17, 2026", today)).toBe("2026-10-17");
    expect(parseLooseDate("Dec 13 - Dec 14, 2026 (expected)", today)).toBe("2026-12-13");
    expect(parseLooseDate("May 9th", today)).toBe("2027-05-09");
    expect(parseLooseDate("Sat 10th", today)).toBeUndefined();
    expect(parseLooseDate("June 1, 2025", today)).toBeUndefined();
  });
  it("keeps a date only when the cited page's domain is a grounding source", async () => {
    const { verifyAnswer } = await import("@/lib/enrich/festival-dates");
    const today = "2026-10-08";
    const text = "DATE: OCT 25 2026! | URL: https://topangavintagemarket.com/";
    expect(verifyAnswer(text, ["topangavintagemarket.com", "fleamapket.com"], today)).toEqual({ date: "2026-10-25", url: "https://topangavintagemarket.com/", site: "topangavintagemarket.com" });
    expect(verifyAnswer(text, ["fleamapket.com"], today)).toBeUndefined();
    expect(verifyAnswer(text, [], today)).toBeUndefined();
    expect(verifyAnswer("No date found.", ["x.com"], today)).toBeUndefined();
  });
});

describe("grounding validator (§9.10)", () => {
  const allowed = { brand: ["Brightland"], theme: ["Connection", "Authenticity"], tag: ["Minimalist"], reference: ["Chef's Table", "Julie & Julia"], interest: ["Cooking"] };
  it("accepts a sentence whose claims and names are all in the evidence", async () => {
    const { validate } = await import("@/lib/methods/validator");
    const s = { text: "For people who love Chef's Table: Brightland makes dinner a ritual.", claims: [{ kind: "reference" as const, ref: "Chef's Table" }, { kind: "brand" as const, ref: "Brightland" }] };
    expect(validate([s], allowed).ok).toHaveLength(1);
  });
  it("rejects a fake venue, a claim outside the evidence, a number and customer-as-person copy", async () => {
    const { validate } = await import("@/lib/methods/validator");
    const out = validate(
      [
        { text: "Find Brightland at Fake Café 99 this weekend.", claims: [{ kind: "brand", ref: "Brightland" }] },
        { text: "Made for slow mornings.", claims: [{ kind: "theme", ref: "Slow Living" }] },
        { text: "Loved by 90% of home cooks.", claims: [] },
        { text: "Your customers are foodies.", claims: [] },
      ],
      allowed,
    );
    expect(out.ok).toHaveLength(0);
    expect(out.violations).toHaveLength(4);
  });
});

describe("field-day route (§9.12)", () => {
  const stops = [
    { id: "a", name: "A", lat: 34.05, lon: -118.25 },
    { id: "c", name: "C", lat: 34.1, lon: -118.25 },
    { id: "b", name: "B", lat: 34.075, lon: -118.25 },
    { id: "d", name: "D", lat: 34.125, lon: -118.25 },
  ];
  it("orders stops by nearest neighbour + 2-opt from the top pick", async () => {
    const { planRoute } = await import("@/lib/methods/route");
    expect(planRoute(stops).map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("builds a Maps link with stops in order and a valid calendar", async () => {
    const { planRoute, mapsUrl, routeIcs } = await import("@/lib/methods/route");
    const order = planRoute(stops);
    const url = mapsUrl(order, "walking");
    expect(url).toContain("origin=34.05%2C-118.25");
    expect(url).toContain("destination=34.125%2C-118.25");
    expect(url.indexOf("34.075")).toBeLessThan(url.indexOf("34.1%2C"));
    const ics = routeIcs(order, new Date("2026-10-20T16:00:00Z"), "Brightland");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    expect(ics).toContain("SUMMARY:Brightland visit: A");
  });
});

describe("validator name scan", () => {
  it("doesn't treat a sentence's first word as a name, but still catches names mid-sentence", async () => {
    const { properNouns } = await import("@/lib/methods/validator");
    expect(properNouns("Crowds like yours and ours both over-index on Great Jones and Material.")).toEqual(["Great Jones", "Material"]);
    expect(properNouns("Find us at Fake Café this weekend.")).toEqual(["Fake Café"]);
  });
});

describe("Wikidata website check (§9.19)", () => {
  it("keeps a site only when its domain carries the brand name and isn't a government site", async () => {
    const { plausibleSite } = await import("@/lib/enrich/wikidata");
    expect(plausibleSite("Thrive Market", "https://thrivemarket.com")).toBe(true);
    expect(plausibleSite("Daily Harvest", "https://www.daily-harvest.com/")).toBe(true);
    expect(plausibleSite("CARAA", "http://www.caraa.rs.gov.br/")).toBe(false);
    expect(plausibleSite("Ritual", "https://example.org")).toBe(false);
  });
});
