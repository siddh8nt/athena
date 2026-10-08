import "server-only";
import { runDemoPlan } from "./plan";
import { serverDeps } from "./server-deps";
import { DEMO_BRANDS } from "@/lib/playbook/demo";
import { getQloo } from "@/lib/qloo";
import { compareWithoutQloo } from "@/lib/proof/without-qloo";
import { groundedFestivalDates } from "@/lib/enrich/festival-dates";
import { llmConfigured } from "@/lib/llm/vertex";
import type { PlacesData } from "@/lib/blocks/places";

/**
 * The warm-cache job (§14.9): replays every demo brand's plan so Qloo responses, Ticketmaster shows, Census
 * figures, grounded festival dates, hooks and the Without Qloo comparison are stored before anyone visits.
 * Runs daily (Cloud Scheduler → /api/warm) and locally with `pnpm warm`. Festival misses get 3 tries here,
 * because nobody is waiting.
 */
export async function warmDemoBrands(slugs = DEMO_BRANDS.map((b) => b.slug), log: (line: string) => void = () => undefined) {
  const llm = llmConfigured();
  const summary: { slug: string; ms: number; places: number; moments: number; compared: boolean }[] = [];
  for (const slug of slugs) {
    const brand = DEMO_BRANDS.find((b) => b.slug === slug);
    if (!brand) continue;
    const started = Date.now();
    let places: PlacesData | undefined;
    let moments = 0;
    const deps = serverDeps((e) => {
      if (e.type === "block" && e.block === "places") places = e.data as PlacesData;
      if (e.type === "block" && e.block === "moments") moments = (e.data as { moments: unknown[] }).moments.length;
    });
    if (deps.enrich) deps.enrich.festivalDate = groundedFestivalDates(llm, { attempts: 3 });
    await runDemoPlan(brand, deps);
    let compared = false;
    if (places && llm) {
      const p = places as PlacesData;
      compared = !!(await compareWithoutQloo(
        getQloo(),
        {
          key: slug,
          brandName: brand.name,
          whatYouSell: brand.description.split(",")[0],
          tier: brand.tier,
          metroId: p.metroId,
          channels: p.channels,
          signal: p.signal,
          athena: p.picks.map((x) => ({ id: x.id, name: x.name, popularity: x.popularity, rank: x.rank, evidence: x.reasons.length })),
        },
        () => undefined,
      ).catch(() => undefined));
    }
    const row = { slug, ms: Date.now() - started, places: (places as PlacesData | undefined)?.picks.length ?? 0, moments, compared };
    summary.push(row);
    log(`${slug}: ${row.places} places, ${row.moments} dated moments, comparison ${compared ? "ready" : "skipped"}, ${Math.round(row.ms / 1000)} s`);
  }
  return summary;
}
