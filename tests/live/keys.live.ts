import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HttpTransport, MemoryCache, QlooClient } from "@/lib/qloo/client";
import { readEnv } from "@/lib/env";

// Both keys under real load (§14.9, 12 Oct): a burst of distinct calls spreads across the keys at each key's own
// limit, with no 429s, and each key's monthly quota is read from the response headers. About 22 calls.

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^\w+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);

describe("Qloo keys (live)", () => {
  it("spreads a burst across every key without a 429", async () => {
    const { qlooApiKeys, qlooBaseUrl } = readEnv(env);
    expect(qlooApiKeys.length).toBeGreaterThanOrEqual(2);
    const calls: { status: number; ms: number; hedged?: boolean }[] = [];
    const qloo = new QlooClient({ transport: new HttpTransport(qlooBaseUrl, qlooApiKeys), cache: new MemoryCache(), onCall: (c) => calls.push(c) });
    const seed = await qloo.search({ query: "Brightland", types: "urn:entity:brand", take: 1 });
    const id = seed.entities[0].entity_id;
    // Distinct `take` values keep every call out of any cache.
    const nonce = 10 + Math.floor(Math.random() * 20);
    const t0 = Date.now();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        qloo.insights({ "filter.type": i % 2 ? "urn:entity:brand" : "urn:entity:tv_show", "signal.interests.entities": [id], take: nonce + Math.floor(i / 2) }),
      ),
    );
    const ms = Date.now() - t0;
    const statuses = calls.map((c) => c.status);
    console.log(`20 calls in ${ms} ms; statuses ${[...new Set(statuses)].join(",")}; hedged ${calls.filter((c) => c.hedged).length}; calls left per key ${qloo.pacer.monthRemaining.join(" / ")}`);
    expect(statuses.every((s) => s === 200)).toBe(true);
    expect(qloo.pacer.monthRemaining.every((n) => typeof n === "number")).toBe(true);
  });
});
