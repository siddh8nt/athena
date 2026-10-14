import { it } from "vitest";
import { crawlSite } from "@/lib/crawl/site";

// Live check of the crawl (PRD §23.2 step 4a, b): `pnpm live tests/live/crawl.live.ts`. Prints what was read.
const SITES = (process.env.SITES ?? "eatfishwife.com,olipop.com,patagonia.com").split(",");

for (const s of SITES) {
  it(`crawls ${s}`, async () => {
    const c = await crawlSite(s, { maxPages: 12, status: (x) => console.log(`  [${s}] ${x}`) });
    console.log(
      JSON.stringify(
        {
          site: c.site, ms: c.ms, thin: c.thin, candidates: c.candidates, products: c.products.length,
          firstProducts: c.products.slice(0, 3).map((p) => `${p.title} ${p.price ?? ""}`),
          pages: c.pages.map((p) => `${p.url} · ${p.text.length} chars · ld:${p.jsonld.map((j) => j["@type"]).join("/")}`),
          skipped: c.skipped.slice(0, 5), skippedCount: c.skipped.length,
        },
        null, 1,
      ),
    );
  }, 60_000);
}
