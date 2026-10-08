import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { HttpTransport, QlooClient } from "@/lib/qloo/client";
import { StoreCache } from "@/lib/qloo/store-cache";
import { getStore } from "@/lib/store";
import { runDemoPlan, type PlanEvent } from "@/lib/agent/plan";
import { DEMO_BRANDS } from "@/lib/playbook/demo";
import { loadStockists } from "@/lib/playbook/stockists";

// Usage: DEMO=brightland pnpm live. Writes .cache/live/<slug>.json (git-ignored) and prints a summary.
const env = Object.fromEntries(
  readFileSync(path.join(process.cwd(), ".env"), "utf-8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const policy = (process.env.POLICY ?? "brand-led") as "accounts-only" | "brand-led";
const slugs = (process.env.DEMO ?? DEMO_BRANDS.map((b) => b.slug).join(",")).split(",");

for (const slug of slugs) {
  it(`live plan: ${slug}`, async () => {
    const events: PlanEvent[] = [];
    const qloo = new QlooClient({ transport: new HttpTransport(env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com", env.QLOO_API_KEY), cache: new StoreCache(getStore()) });
    await runDemoPlan(DEMO_BRANDS.find((b) => b.slug === slug)!, { qloo, send: (e) => events.push(e), loadStockists, signalPolicy: policy });
    mkdirSync(".cache/live", { recursive: true });
    writeFileSync(`.cache/live/${slug}.${policy}.json`, JSON.stringify(events, null, 1));
    for (const e of events) {
      if (e.type === "event") console.log(`  rail  ${e.event.tool.padEnd(14)} ${e.event.status.padEnd(6)} ${e.event.summary}`);
      if (e.type === "card") console.log(`  card  ${e.card.lines.map((l) => `${l.label}: ${l.value}`).join(" | ")}\n        fingerprint: ${e.card.fingerprint.map((t) => t.name).join(", ")}`);
      if (e.type === "block") console.log(`  block ${e.block.padEnd(9)} ${e.meta.status.padEnd(5)} ${e.meta.calls.length} Qloo calls, ${e.meta.ms} ms${e.meta.thinReason ? ` (${e.meta.thinReason})` : ""}`);
      if (e.type === "done") console.log(`  done  ${e.qlooCalls} Qloo calls in ${e.ms} ms`);
    }
  });
}
