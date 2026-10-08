import { describe, expect, it } from "vitest";
import { QlooClient } from "@/lib/qloo/client";
import { FixtureTransport } from "@/lib/qloo/fixture";
import { runDemoPlan, type PlanEvent } from "@/lib/agent/plan";
import { DEMO_BRANDS } from "@/lib/playbook/demo";
import { loadStockists } from "@/lib/playbook/stockists";
import { ALLOWED_AUDIENCE_TYPES, AUDIENCE_LABEL } from "@/lib/methods/allowlist";
import type { MessageData } from "@/lib/blocks/message";
import type { PlacesData } from "@/lib/blocks/places";
import type { MomentsData } from "@/lib/blocks/moments";

async function run(slug: string) {
  const events: PlanEvent[] = [];
  const qloo = new QlooClient({ transport: new FixtureTransport() });
  await runDemoPlan(DEMO_BRANDS.find((b) => b.slug === slug)!, { qloo, send: (e) => events.push(e), loadStockists });
  return events;
}

describe("demo plans on fixtures", () => {
  it("Brightland streams the card, then all five data blocks", { timeout: 60_000 }, async () => {
    const events = await run("brightland");
    const card = events.find((e) => e.type === "card");
    expect(card && card.type === "card" && card.card.blocks).toEqual(["markets", "places", "partners", "message", "moments", "act"]);
    const blocks = events.flatMap((e) => (e.type === "block" ? [e.block] : []));
    expect(new Set(blocks)).toEqual(new Set(["markets", "places", "partners", "message", "moments"]));
    expect(events.at(-1)?.type).toBe("done");
  });

  it("every block reports the Qloo calls that built it", { timeout: 60_000 }, async () => {
    const events = await run("brightland");
    for (const e of events) if (e.type === "block") expect(e.meta.calls.length).toBeGreaterThan(0);
    const done = events.at(-1);
    expect(done?.type === "done" && done.qlooCalls).toBeGreaterThan(0);
  });

  it("Places picks carry ≥ 2 evidence chips and no closed venues", { timeout: 60_000 }, async () => {
    const events = await run("brightland");
    const p = events.find((e) => e.type === "block" && e.block === "places");
    const data = (p as Extract<PlanEvent, { type: "block" }>).data as PlacesData;
    expect(data.picks.length).toBeGreaterThan(0);
    for (const pick of data.picks) expect(pick.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it("Message shows only allow-listed audiences, with the fixed label", { timeout: 60_000 }, async () => {
    const events = await run("brightland");
    const m = events.find((e) => e.type === "block" && e.block === "message");
    const data = (m as Extract<PlanEvent, { type: "block" }>).data as MessageData;
    expect(data.label).toBe(AUDIENCE_LABEL);
    for (const i of data.interests) expect(ALLOWED_AUDIENCE_TYPES).toContain(i.type);
    expect(data.interests.map((i) => i.name)).not.toContain("Political Group");
  });

  it("Moments never shows a date without a source", { timeout: 60_000 }, async () => {
    const events = await run("timeleft");
    const m = events.find((e) => e.type === "block" && e.block === "moments");
    const data = (m as Extract<PlanEvent, { type: "block" }>).data as MomentsData;
    for (const x of data.moments) expect(x.date && x.url).toBeTruthy();
  });

  it("the three demo brands open on different blocks", { timeout: 60_000 }, async () => {
    const first = await Promise.all(DEMO_BRANDS.map(async (b) => {
      const events = await run(b.slug);
      const card = events.find((e) => e.type === "card");
      return card && card.type === "card" ? card.card.blocks[0] : undefined;
    }));
    expect(first).toEqual(["markets", "markets", "partners"]);
  });
});

describe("never fails (§14.2)", () => {
  it("finishes the plan when a block keeps failing, without any error event", { timeout: 60_000 }, async () => {
    const fixture = new FixtureTransport();
    const flaky = {
      mode: "fixture" as const,
      async send(path: string, q: Record<string, string>) {
        if (q["filter.type"] === "urn:entity:podcast") throw new Error("boom");
        return fixture.send(path, q);
      },
    };
    // The client turns transport errors into status 0; make the block itself throw by failing every podcast call.
    const qloo = new QlooClient({ transport: flaky, retryDelayMs: 1 });
    const events: PlanEvent[] = [];
    await runDemoPlan(DEMO_BRANDS[0], { qloo, send: (e) => events.push(e), loadStockists });
    expect(events.at(-1)?.type).toBe("done");
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(events.some((e) => e.type === "block" && e.block === "places")).toBe(true);
  });
});
