import { describe, expect, it } from "vitest";
import { writeDraft } from "@/lib/agent/draft";

// A slow model never leaves the founder without a draft: at the deadline the template stands in.

describe("writeDraft", () => {
  it("falls back to the template when the model is slower than the deadline", async () => {
    const slow = (() => new Promise(() => {})) as never;
    const t0 = Date.now();
    const d = await writeDraft({ brand: "Brightland", product: "olive oil", to: { kind: "venue", name: "Corner Shop", tags: [], reasons: [] }, partners: [], generate: slow, llm: true, maxMs: 50 });
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(d.subject).toBe("Brightland for Corner Shop");
    expect(d.sentences[0].text).toBe("Hi Corner Shop team,");
  });
});
