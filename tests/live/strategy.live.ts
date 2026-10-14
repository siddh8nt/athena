import { readFileSync } from "node:fs";
import { it } from "vitest";
import { BENCH_BRANDS } from "@/lib/bench/truth";
import type { AgentStreamEvent } from "@/lib/agent/loop";
import type { StrategyEvent } from "@/lib/agent/strategy";
import type { FitsEvent } from "@/lib/agent/fits";
import type { CrowdsEvent } from "@/lib/journey/types";

// Usage: STRATEGY_BRAND="Your Brand" pnpm live tests/live/strategy.live.ts (§23.2 step 6's live check).
// Measures the crowds and ranks the fits once, plans a baseline strategy, then plans again four times, each with one
// invented founder fact added to the baseline (a stockist, an ample budget, a launch date, one region at a time), and
// prints which actions each fact changed for every top fit. STRATEGY_SEED='{"comparables":[…],"lookalikes":[…]}'
// sets the taste seed; STRATEGY_SELLS the product. Held-out Bench brands are refused before any call.
for (const l of readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
}

const brand = process.env.STRATEGY_BRAND?.trim();
if (!brand) throw new Error('Set STRATEGY_BRAND, e.g. STRATEGY_BRAND="Your Brand" pnpm live tests/live/strategy.live.ts');
const seed = { comparables: [brand], lookalikes: [] as string[], traits: [] as string[], ...(process.env.STRATEGY_SEED ? (JSON.parse(process.env.STRATEGY_SEED) as object) : {}) };

// Bench integrity: no held-out brand is run here, as the brand or anywhere in the seed.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const named = [brand, ...Object.values(seed).flatMap((v) => (Array.isArray(v) ? v : [v]))].filter((v): v is string => typeof v === "string").map(norm);
const held = BENCH_BRANDS.filter((b) => !b.tuning && named.some((n) => n === norm(b.name) || n === norm(b.slug)));
if (held.length) throw new Error(`Held-out Bench brands are never run here: ${held.map((b) => b.name).join(", ")}`);

// Nothing secret reaches the log.
const secrets = Object.entries(process.env).filter(([k, v]) => /KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i.test(k) && v && v.length >= 8).map(([, v]) => v!);
const redact = (s: string) => secrets.reduce((x, v) => x.split(v).join("[redacted]"), s);
const log = (...xs: unknown[]) => console.log(redact(xs.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")));

async function stream<E>(post: (req: Request) => Promise<Response>, body: unknown, on: (e: E) => void): Promise<void> {
  const res = await post(new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "live-strategy" }, body: JSON.stringify(body) }));
  const text = await res.text();
  for (const p of text.split("\n\n")) if (p.startsWith("data:")) on(JSON.parse(p.slice(5)) as E);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

it("plans a strategy for every top fit, and each context fact changes its own actions", { timeout: 900_000 }, async () => {
  const crowdsRoute = await import("@/app/api/crowds/route");
  const fitsRoute = await import("@/app/api/fits/route");
  const strategyRoute = await import("@/app/api/strategy/route");
  const calls = new Set<string>();
  const brief = { name: { value: brand, source: { kind: "message" } }, ...(process.env.STRATEGY_SELLS ? { sells: { value: process.env.STRATEGY_SELLS, source: { kind: "message" } } } : {}), websites: [], stockists: [], comparables: [], competitors: [], notes: [], turns: 0, calls: 0 };

  let crowdsDone = false;
  await stream<CrowdsEvent>(crowdsRoute.POST, seed, (e) => {
    if (e.type === "status") log(`  crowds: ${e.text}`);
    if (e.type === "result") {
      crowdsDone = true;
      e.result.callIds.forEach((c) => calls.add(c));
      log(`crowds: ${e.result.crowds.map((c) => c.name).join("; ")}`);
    }
  });
  if (!crowdsDone) throw new Error("no crowds came back");

  let fits: FitsEvent | undefined;
  await stream<AgentStreamEvent>(fitsRoute.POST, { seed, probes: [], brief, facts: [] }, (e) => {
    if (e.type === "event") e.event.callIds.forEach((c) => calls.add(c));
    if (e.type === "fits") fits = e;
  });
  if (!fits) throw new Error("no fits came back");
  log(`fits: ${fits.fits.fits.map((f) => `${f.rank}. ${f.name} (${f.tier})`).join("; ")}`);
  const reach = fits.geography?.crowds.length ? Object.fromEntries(fits.geography.crowds.map((c) => [c.id, [...c.reach].sort((a, b) => b.reach - a.reach).slice(0, 8).map((m) => ({ metro: m.name, people: m.people }))])) : undefined;

  const plan = async (label: string, facts: { id: string; text: string; where: string; source: string }[]) => {
    let out: StrategyEvent | undefined;
    const t0 = Date.now();
    await stream<AgentStreamEvent>(strategyRoute.POST, { seed, probes: [], brief, facts, fits: fits!.fits, calendar: fits!.calendar, reach }, (e) => {
      if (e.type === "event") {
        e.event.callIds.forEach((c) => calls.add(c));
        if (e.event.status !== "running") log(`  [${e.event.status}] ${e.event.tool}: ${e.event.why.slice(0, 100)} -> ${String(e.event.summary ?? "").slice(0, 140)}`);
      }
      if (e.type === "ask") log(`  ASK: ${e.ask.question}`);
      if (e.type === "strategy") out = e;
    });
    if (!out) throw new Error(`${label}: no strategy came back`);
    out.sources.forEach((s) => s.callIds.forEach((c) => calls.add(c)));
    log(`\n== ${label} (${Date.now() - t0} ms): ${out.answer.headline}`);
    for (const c of out.result.context) log(`  context ${c.key}: ${c.text}`);
    log(`  assumed: ${out.result.assumed.join("; ") || "nothing"}`);
    return out;
  };

  const base = await plan("baseline, no context", []);
  for (const s of base.result.strategies) {
    log(`\n${s.rank}. ${s.name}: where ${s.where.map((w) => `${w.metro}${w.now ? " (now)" : ""}`).join(", ")}; through ${s.through.join(", ")}`);
    for (const a of s.actions) log(`   ${a.when} ${a.startBy} ${a.channel}: ${a.text}`);
    for (const l of base.answer.lines.filter((x) => x.crowd === s.crowd)) log(`   says: ${l.text} [${l.sources.join(",")}]`);
  }

  // The first retailer the baseline recommends, so the stockist fact touches a real action.
  const retail = base.result.strategies.flatMap((s) => s.actions).find((a) => a.channel === "retail")?.where ?? base.result.strategies.flatMap((s) => s.actions).find((a) => a.channel === "indie")?.where;
  const launch = new Date(`${base.result.date}T00:00:00Z`);
  launch.setUTCDate(launch.getUTCDate() + 90);
  const fact = (id: string, text: string) => ({ id, text, where: "the founder, in this test", source: "the founder" });
  const flips = [
    ...(retail ? [{ label: "stockist", fact: fact("t-stockist", `We're already stocked at ${retail}.`) }] : []),
    { label: "budget", fact: fact("t-budget", "We have about $40,000 a month for marketing.") },
    { label: "launch", fact: fact("t-launch", `We launch on ${iso(launch)}.`) },
    { label: "capacity", fact: fact("t-capacity", "Our team can only handle one region at a time.") },
  ];

  for (const f of flips) {
    const run = await plan(`+ ${f.label}: "${f.fact.text}"`, [f.fact]);
    for (const s of base.result.strategies) {
      const after = run.result.strategies.find((x) => x.crowd === s.crowd);
      if (!after) {
        log(`  ${s.name}: no strategy in this run`);
        continue;
      }
      const was = new Map(s.actions.map((a) => [a.id, a]));
      const now = new Map(after.actions.map((a) => [a.id, a]));
      const key = (a: (typeof s.actions)[number]) => `${a.when}|${a.startBy}|${a.text}|${a.where ?? ""}`;
      const removed = [...was.keys()].filter((id) => !now.has(id));
      const added = [...now.keys()].filter((id) => !was.has(id));
      const changed = [...now.keys()].filter((id) => was.has(id) && key(was.get(id)!) !== key(now.get(id)!));
      log(`  ${s.name}: ${added.length} added, ${removed.length} removed, ${changed.length} changed${s.through.join() !== after.through.join() ? `; through ${s.through.join(", ")} -> ${after.through.join(", ")}` : ""}`);
      for (const id of removed) log(`    - ${was.get(id)!.when} ${was.get(id)!.text}`);
      for (const id of added) log(`    + ${now.get(id)!.when} ${now.get(id)!.startBy} ${now.get(id)!.text} (shaped by ${now.get(id)!.shapedBy.join(", ") || "nothing"})`);
      for (const id of changed) log(`    ~ ${was.get(id)!.when} ${was.get(id)!.startBy} -> ${now.get(id)!.when} ${now.get(id)!.startBy}: ${now.get(id)!.text}`);
    }
  }
  log(`\nQloo calls across the run: ${calls.size}`);
});
