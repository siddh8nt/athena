import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { it } from "vitest";
import { HttpTransport, QlooClient } from "@/lib/qloo/client";
import { StoreCache } from "@/lib/qloo/store-cache";
import { getStore } from "@/lib/store";
import { readEnv } from "@/lib/env";
import { quotaLeft } from "@/lib/taste/graph";
import { censusMarket } from "@/lib/enrich/census";
import { METROS } from "@/lib/playbook/metros";
import { aucOf, ndcgAt, pairedBootstrap, precisionAt, spearman, type Ranking } from "@/lib/bench/metrics";
import { BENCH_BRANDS, T1_MIN_METROS, metroTruth, readStockists } from "@/lib/bench/truth";
import {
  METRO_IDS, brandLine, brandRef, engineOf, llmArm, metrosCovered, profileOf, retailerPool, t1Athena, t1Naive, t1Popularity, t2Athena, t2Naive, t2Popularity, t3Athena, t3Popularity, venuePool,
  type Condition, type Engine, type LlmSample,
} from "@/lib/bench/arms";

// The Taste Bench (PRD §10.6). Usage: BRANDS=brightland,fishwife pnpm live tests/live/bench.live.ts
// Held-out brands are refused until the prereg-v2 tag exists. Tuning brands write to proof/bench/tuning, held-out
// ones to proof/bench/results: metrics and public-candidate rankings only. Raw Qloo and LLM outputs stay in .cache/bench.

for (const l of readFileSync(path.join(process.cwd(), ".env"), "utf-8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
}

const slugs = (process.env.BRANDS ?? "brightland,fishwife").split(",").map((s) => s.trim()).filter(Boolean);
const brands = slugs.map((s) => BENCH_BRANDS.find((b) => b.slug === s) ?? (() => { throw new Error(`unknown Bench brand ${s}`); })());
const registered = execSync("git tag -l prereg-v2", { encoding: "utf-8" }).trim() === "prereg-v2";
const refused = brands.filter((b) => !b.tuning && !registered);
// No Qloo or LLM call on a held-out brand before registration (§10.6). Checked before anything else runs.
if (refused.length) throw new Error(`Held out until prereg-v2 is tagged: ${refused.map((b) => b.name).join(", ")}`);

const descriptions = JSON.parse(readFileSync(path.join(process.cwd(), "proof", "bench", "descriptions.json"), "utf-8")) as Record<string, string>;
const code = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim() + (execSync("git status --porcelain lib tests", { encoding: "utf-8" }).trim() ? "+dirty" : "");
const MIN_QUOTA = 1500;

mkdirSync(".cache/bench", { recursive: true });
const log = (s: string) => appendFileSync(".cache/bench/run.txt", `${new Date().toISOString().slice(11, 19)} ${s}\n`);

let calls = 0;
const env = readEnv(process.env);
const qloo = new QlooClient({ transport: new HttpTransport(env.qlooBaseUrl, env.qlooApiKeys), cache: new StoreCache(getStore()), onCall: (x) => !x.cached && calls++ });
const census = censusMarket(env.censusKey);

const r3 = (x: number) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const mean = (xs: number[]) => (xs.filter(Number.isFinite).length ? xs.filter(Number.isFinite).reduce((s, x) => s + x, 0) / xs.filter(Number.isFinite).length : NaN);
const sampleInfo = (s: LlmSample) => ({ model: s.model, parsed: s.parsed, queries: s.queries.length, tokens: s.tokens, tries: s.tries });

type ArmScore = Record<string, number | null | unknown>;

for (const b of brands) {
  it(b.name, async () => {
    const t0 = Date.now();
    const start = calls;
    const rows = readStockists(b.slug);
    const description = descriptions[b.slug];
    if (!description) throw new Error(`no registered description for ${b.slug}`);
    log(`\n== ${b.name} (${b.tuning ? "tuning" : "held out"}), code ${code}`);

    const profile = await profileOf(b.slug, description);
    log(`profile: ${JSON.stringify({ traits: profile.traits, lookalikes: profile.lookalikes, retail: profile.retail, tier: profile.tier, category: profile.category, motions: profile.motions })}`);
    const own = await brandRef(qloo, b.name);
    const left = quotaLeft(qloo);
    log(`Qloo month quota left (all keys): ${left ?? "unknown"}; own brand in Qloo: ${own.ref ? "yes" : "no"}`);
    if (left !== undefined && left < MIN_QUOTA) throw new Error(`Qloo quota below ${MIN_QUOTA}; stopping`);

    const engines: Record<Condition, Engine> = { cold: await engineOf(qloo, profile, undefined, (s) => log(`   cold … ${s}`)), known: undefined as unknown as Engine };
    engines.known = own.ref ? await engineOf(qloo, profile, own, (s) => log(`   known … ${s}`)) : engines.cold;
    for (const c of ["cold", "known"] as Condition[]) log(`${c}: ${engines[c].crowds} crowds, signal ${engines[c].signal.length}${engines[c].fallback ? " (fallback: lookalikes)" : ""}; seed ${engines[c].seed.lookalikes.length} lookalikes, ${engines[c].seed.tags.length} tags, missing ${engines[c].seed.missing.join(", ") || "none"}`);
    const conds: Condition[] = ["cold", "known"];
    const key = (c: Condition) => `${b.slug}/${c}`;
    const head = (c: Condition) => brandLine(c, profile, b.name);

    // T1 Where to launch.
    const pop = new Map<string, number>();
    for (const m of METROS) {
      const v = (await census(m).catch(() => undefined))?.population?.value;
      if (v) pop.set(m.id, v);
    }
    const truth1 = metroTruth(rows, pop);
    const gain1 = new Map(truth1.map((t) => [t.metroId, t.perMillion]));
    const covered = metrosCovered(rows);
    const t1: Record<string, unknown> = { eligible: covered >= T1_MIN_METROS && pop.size === METROS.length, metrosCovered: covered, truth: Object.fromEntries(truth1.map((t) => [t.metroId, { independents: t.independents, perMillion: r3(t.perMillion) }])) };
    if (t1.eligible) {
      const score = (r: Ranking) => ({ rho: r3(spearman(r, gain1)), ndcg5: r3(ndcgAt(r, gain1, 5)) });
      const items = METROS.map((m) => ({ id: m.id, label: m.name }));
      const arms: Record<string, Record<string, ArmScore>> = {};
      for (const c of conds) {
        const athena = await t1Athena(qloo, profile, engines[c]);
        const naive = await t1Naive(qloo, engines[c]);
        const [plain, search] = await Promise.all([llmArm(key(c), "t1", head(c), items, false), llmArm(key(c), "t1", head(c), items, true)]);
        const llm = (x: typeof plain) => ({ rho: r3(mean(x.rankings.map((r) => spearman(r, gain1)))), ndcg5: r3(mean(x.rankings.map((r) => ndcgAt(r, gain1, 5)))), samples: x.samples.map((s, i) => ({ ...sampleInfo(s), ...score(x.rankings[i]), ranking: x.rankings[i] })) });
        arms[c] = { athena: { ...score(athena), ranking: athena }, naive: { ...score(naive), ranking: naive }, popularity: { ...score(t1Popularity(pop)), ranking: t1Popularity(pop) }, llm: llm(plain), llmSearch: llm(search) };
        log(`T1 ${c}: ${Object.entries(arms[c]).map(([k, v]) => `${k} ρ ${v.rho} ndcg5 ${v.ndcg5}`).join(" · ")}`);
      }
      t1.arms = arms;
    } else log(`T1 ineligible: independents in ${covered} of 25 metros`);

    // T2 Which retailer next.
    const pool = await retailerPool(qloo, profile, rows);
    const pos = new Set(pool.positives);
    const name = new Map(pool.candidates.map((c) => [c.id, c.name]));
    const named = (r: Ranking) => r.map((g) => g.map((id) => name.get(id) ?? id));
    const t2: Record<string, unknown> = { category: pool.category, candidates: pool.candidates.map((c) => c.name), unresolved: pool.unresolved, stocked: pool.positives.map((id) => name.get(id)), eligible: pos.size > 0 && pos.size < pool.candidates.length };
    if (t2.eligible) {
      const score = (r: Ranking) => ({ auc: r3(aucOf(r, pos)), p5: r3(precisionAt(r, pos, 5)) });
      const items = pool.candidates.map((c) => ({ id: c.id, label: c.name }));
      const arms: Record<string, Record<string, ArmScore>> = {};
      for (const c of conds) {
        const athena = await t2Athena(qloo, profile, engines[c], pool);
        const naive = await t2Naive(qloo, engines[c], pool);
        const [plain, search] = await Promise.all([llmArm(key(c), "t2", head(c), items, false), llmArm(key(c), "t2", head(c), items, true)]);
        const llm = (x: typeof plain) => ({ auc: r3(mean(x.rankings.map((r) => aucOf(r, pos)))), p5: r3(mean(x.rankings.map((r) => precisionAt(r, pos, 5)))), samples: x.samples.map((s, i) => ({ ...sampleInfo(s), ...score(x.rankings[i]), ranking: named(x.rankings[i]) })) });
        arms[c] = { athena: { ...score(athena), ranking: named(athena) }, naive: { ...score(naive), ranking: named(naive) }, popularity: { ...score(t2Popularity(pool)), ranking: named(t2Popularity(pool)) }, llm: llm(plain), llmSearch: llm(search) };
        log(`T2 ${c} (${pool.category}, ${pos.size} of ${pool.candidates.length} stocked): ${Object.entries(arms[c]).map(([k, v]) => `${k} AUC ${v.auc} P@5 ${v.p5}`).join(" · ")}`);
      }
      t2.arms = arms;
    } else log(`T2 ineligible: ${pos.size} of ${pool.candidates.length} ${pool.category} retailers stocked`);

    // T3 Which venues (the ranking check). Venue rankings hold Qloo entities, so only metrics are written.
    const vp = await venuePool(qloo, b.slug, rows);
    const t3: Record<string, unknown> = { eligible: vp.eligible, reason: vp.reason, metroA: vp.metroA, metroB: vp.metroB, signal: vp.signal.length, stockists: vp.stockists.length, decoys: vp.decoys.length, tried: vp.tried, coverage: vp.coverage, match: vp.matches.length ? { jaccard: r3(mean(vp.matches.map((m) => m.jaccard))), dPop: r3(mean(vp.matches.map((m) => m.dPop))), bands: Object.fromEntries([...new Set(vp.matches.map((m) => m.band))].map((b) => [b, vp.matches.filter((m) => m.band === b).length])) } : undefined };
    if (vp.eligible) {
      const pos3 = new Set(vp.stockists.map((v) => v.id));
      const athena = await t3Athena(qloo, vp);
      const items = vp.pool.map((v) => ({ id: v.id, label: v.hood ? `${v.name} (${v.hood})` : v.name }));
      const ctx = { metroA: METROS.find((m) => m.id === vp.metroA)?.name, metroB: METROS.find((m) => m.id === vp.metroB)?.name, signal: vp.signal.map((v) => v.name) };
      const arms: Record<string, Record<string, ArmScore>> = {};
      for (const c of conds) {
        const [plain, search] = await Promise.all([llmArm(key(c), "t3", head(c), items, false, ctx), llmArm(key(c), "t3", head(c), items, true, ctx)]);
        const llm = (x: typeof plain) => ({ auc: r3(mean(x.rankings.map((r) => aucOf(r, pos3)))), samples: x.samples.map((s, i) => ({ ...sampleInfo(s), auc: r3(aucOf(x.rankings[i], pos3)) })) });
        arms[c] = { athena: { auc: r3(aucOf(athena.ranking, pos3)), scoredShare: r3(athena.scored / vp.pool.length) }, popularity: { auc: r3(aucOf(t3Popularity(vp), pos3)) }, llm: llm(plain), llmSearch: llm(search) };
        log(`T3 ${c} (${vp.metroA} → ${vp.metroB}, ${vp.signal.length} signal, scored ${athena.scored}/${vp.pool.length}): ${Object.entries(arms[c]).map(([k, v]) => `${k} AUC ${v.auc}`).join(" · ")}`);
      }
      t3.arms = arms;
    } else log(`T3 ineligible: ${vp.reason}`);

    const out = {
      brand: b.name,
      slug: b.slug,
      set: b.tuning ? "tuning" : "held-out",
      code,
      ranAt: new Date().toISOString(),
      profile: { description, sells: profile.sells, traits: profile.traits, lookalikes: profile.lookalikes, retail: profile.retail, tier: profile.tier, category: profile.category, motions: profile.motions, categoryFallback: profile.categoryFallback },
      engine: Object.fromEntries(conds.map((c) => [c, { ownBrandInSeed: !!engines[c].brandId, lookalikesInQloo: engines[c].seed.lookalikes.length, tags: engines[c].seed.tags.length, crowds: engines[c].crowds, signal: engines[c].signal.length, fallback: engines[c].fallback }])),
      t1,
      t2,
      t3,
      qlooCalls: calls - start,
    };
    const dir = path.join("proof", "bench", b.tuning ? "tuning" : "results");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${b.slug}.json`), JSON.stringify(out, null, 1) + "\n");
    log(`${b.name}: ${calls - start} uncached Qloo calls, ${((Date.now() - t0) / 60000).toFixed(1)} min; quota left ${quotaLeft(qloo) ?? "unknown"}`);
  }, 3_600_000);
}

// Paired comparisons over every brand written so far in each set (§10.6 statistics).
it("summary", () => {
  for (const set of ["tuning", "results"]) {
    const dir = path.join("proof", "bench", set);
    if (!existsSync(dir)) continue;
    const runs = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "summary.json").map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf-8")));
    const get = (r: Record<string, any>, task: string, cond: string, arm: string, metric: string) => r[task]?.arms?.[cond]?.[arm]?.[metric] ?? NaN; // eslint-disable-line @typescript-eslint/no-explicit-any
    const rows: string[] = [];
    const out: Record<string, unknown> = {};
    const compare = (label: string, task: string, metric: string, cond: string, arm: string) => {
      const diffs = runs.map((r) => get(r, task, cond, "athena", metric) - get(r, task, cond, arm, metric));
      const ci = pairedBootstrap(diffs);
      const a = mean(runs.map((r) => get(r, task, cond, "athena", metric)));
      const o = mean(runs.map((r) => get(r, task, cond, arm, metric)));
      out[label] = { athena: r3(a), other: r3(o), n: ci.n, diff: r3(ci.mean), lo: r3(ci.lo), hi: r3(ci.hi), pass: ci.pass };
      rows.push(`| ${label} | ${ci.n} | ${r3(a)} | ${r3(o)} | ${r3(ci.mean)} [${r3(ci.lo)}, ${r3(ci.hi)}] | ${ci.pass ? "yes" : "no"} |`);
    };
    for (const [task, metric] of [["t1", "rho"], ["t2", "auc"], ["t3", "auc"]]) compare(`PRIMARY ${task} ${metric}: Athena − LLM-only (cold)`, task, metric, "cold", "llm");
    for (const cond of ["cold", "known"])
      for (const [task, metric] of [["t1", "rho"], ["t1", "ndcg5"], ["t2", "auc"], ["t2", "p5"], ["t3", "auc"]])
        for (const arm of ["llm", "llmSearch", "naive", "popularity"]) {
          if (task === "t3" && arm === "naive") continue;
          if (cond === "cold" && arm === "llm" && metric === (task === "t1" ? "rho" : "auc")) continue;
          compare(`${task} ${metric}: Athena − ${arm} (${cond})`, task, metric, cond, arm);
        }
    writeFileSync(path.join(dir, "summary.json"), JSON.stringify({ brands: runs.map((r) => r.slug), comparisons: out }, null, 1) + "\n");
    writeFileSync(
      path.join(dir, "summary.md"),
      `# Taste Bench: ${set === "tuning" ? "tuning brands" : "held-out brands"}\n\nBrands: ${runs.map((r) => r.brand).join(", ")}. Paired difference Athena − other arm, mean over brands, 95% bootstrap CI (10,000 resamples). Pass: mean > 0 and the CI excludes 0. A brand ineligible for a task is left out of that task.\n\n| Comparison | n | Athena | Other | Difference [95% CI] | Pass |\n|---|---|---|---|---|---|\n${rows.join("\n")}\n`,
    );
  }
});
