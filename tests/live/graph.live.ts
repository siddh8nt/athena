import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { HttpTransport, QlooClient } from "@/lib/qloo/client";
import { StoreCache } from "@/lib/qloo/store-cache";
import { getStore } from "@/lib/store";
import { resolveBrand } from "@/lib/methods/resolve";
import { buildGraph, whyOf, type Seed } from "@/lib/taste/graph";
import { readEnv } from "@/lib/env";
import { crowdDetails, fallbackName } from "@/lib/taste/crowds";

// Usage: pnpm live tests/live/graph.live.ts. Builds the taste graph for a few brands and prints the crowds.
const env = Object.fromEntries(
  readFileSync(path.join(process.cwd(), ".env"), "utf-8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const CASES: { label: string; brand?: string; lookalikes: string[]; tagQueries: string[] }[] = [
  { label: "Liquid Death (in Qloo)", brand: "Liquid Death", lookalikes: [], tagQueries: [] },
  { label: "Brightland (in Qloo)", brand: "Brightland", lookalikes: [], tagQueries: [] },
  { label: "Fishwife (not in Qloo: lookalikes + tags)", lookalikes: ["Brightland", "Great Jones", "Momofuku"], tagQueries: ["seafood"] },
];

mkdirSync(".cache/live", { recursive: true });
const log = (s: string) => (console.log(s), appendFileSync(".cache/live/graph.txt", `${s}\n`));

for (const c of CASES.filter((x) => !process.env.ONLY || x.label.startsWith(process.env.ONLY))) {
  it(c.label, async () => {
    let calls = 0;
    const qloo = new QlooClient({ transport: new HttpTransport(readEnv(env).qlooBaseUrl, readEnv(env).qlooApiKeys), cache: new StoreCache(getStore()), onCall: (x) => !x.cached && calls++ });
    const ref = async (n: string) => {
      const r = await resolveBrand(qloo, n);
      return r.entity ? { id: r.entity.entity_id, name: r.entity.name } : undefined;
    };
    const tags = [];
    for (const q of c.tagQueries) {
      const r = await qloo.get("/v2/tags", { "filter.query": q, take: 5 });
      const t = ((r.body?.results as { tags?: { id: string; name: string }[] })?.tags ?? [])[0];
      if (t) tags.push({ id: t.id, name: t.name });
    }
    const seed: Seed = { brand: c.brand ? await ref(c.brand) : undefined, lookalikes: (await Promise.all(c.lookalikes.map(ref))).filter((x) => !!x), tags };
    const t0 = Date.now();
    const g = await buildGraph(qloo, seed, { onStep: (s) => log(`   … ${s} (+${((Date.now() - t0) / 1000).toFixed(1)} s)`), onRound: (x) => log(`   round ${x.round}: k=${x.k}, ${x.landmarks.length} probes, ${x.calls} calls, eigenvalues ${x.eigenvalues.join(" ")}`) });
    log(`\n${c.label}: seed ${[seed.brand?.name, ...seed.lookalikes.map((l) => l.name), ...seed.tags.map((x) => x.name)].filter(Boolean).join(", ")}`);
    log(`  ${g.nodes.length} nodes over ${new Set(g.nodes.map((n) => n.domain)).size} domains; landmarks: ${g.landmarks.map((h) => h.name).join(", ")}`);
    const top = [...g.nodes].sort((a, b) => (b.specificity ?? 0) - (a.specificity ?? 0)).slice(0, 6);
    log(`  most specific: ${top.map((n) => `${n.name} (${n.domain}, +${n.specificity}, pop ${n.popularity?.toFixed(2)})`).join(", ")}`);
    if (g.galaxy?.question) log(`  agent's question: ${g.galaxy.question.name} (between crowds ${g.galaxy.question.crowds.join(" and ")})`);
    if (g.galaxy) log(`  why ${g.galaxy.nodes[0].name}: ${whyOf(g.galaxy, 0).map((w) => `${w.landmark} ${w.pct.toFixed(2)}`).join(", ")}`);
    log(`  ${g.calls} graph calls (${calls} uncached incl. resolution) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    for (const cr of g.crowds) {
      log(`  ${cr.main ? "MAIN" : "adj."} ${cr.id} (${cr.entities.length}, holds ${Math.round((cr.stability ?? 0) * 100)}%, signal ${cr.signal.map((s) => s.name).join(" / ")}): ${cr.domains.map((d) => `${d}: ${cr.entities.filter((n) => n.domain === d).slice(0, 5).map((n) => n.name).join(", ")}`).join(" || ")}`);
      const d = await crowdDetails(qloo, cr);
      log(`       ${fallbackName(cr)} · skew ${d.skew?.clear ? JSON.stringify({ ...d.skew.age, ...d.skew.gender }) : "none clear"}`);
      log(`       cities: ${d.cities.map((x) => `${x.name} (${x.venues}: ${x.venue})`).join(" | ")}`);
      log(`       sample tags: ${[...new Set(cr.entities.flatMap((n) => n.tags))].slice(0, 12).join(", ")}`);
    }
  });
}
