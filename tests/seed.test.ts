import { describe, expect, it } from "vitest";
import { pickTag, sharesWord } from "@/lib/taste/seed";

// Product traits → Qloo tags (PRD §9.23 step 1): only tags tag search returned, matching the trait, never place-like.

describe("pickTag", () => {
  it("rejects tags that share no word with the trait", () => {
    expect(sharesWord("Ziti Alla Genovese", "Gen Z")).toBe(false);
    expect(pickTag([{ id: "urn:tag:menu_highlight:qloo:ziti_alla_genovese", name: "Ziti Alla Genovese" }], "Gen Z")).toBeUndefined();
  });

  it("prefers a brand genre, then a Qloo style tag, and never a place tag", () => {
    const tags = [
      { id: "urn:tag:category:place:skin_care", name: "Skin care" },
      { id: "urn:tag:style:qloo:skincare", name: "Skincare" },
      { id: "urn:tag:genre:brand:health_and_beauty:skincare", name: "Skincare" },
    ];
    expect(pickTag(tags, "skincare")?.id).toBe("urn:tag:genre:brand:health_and_beauty:skincare");
    expect(pickTag([tags[0]], "skin care")).toBeUndefined();
    // 10 Oct: place descriptors came back for product traits.
    expect(pickTag([{ id: "urn:tag:cuisine:qloo:tinned_fish", name: "Tinned fish" }], "tinned fish")).toBeUndefined();
    expect(pickTag([{ id: "urn:tag:room_type:qloo:premium", name: "Premium" }, { id: "urn:tag:ambience:qloo:premium", name: "Premium" }], "premium")).toBeUndefined();
  });

  it("matches plurals and close forms", () => {
    expect(sharesWord("Playful", "playful packaging")).toBe(true);
    expect(sharesWord("Minimalist", "minimal design")).toBe(true);
  });
});
