import "server-only";
import type { QlooClient } from "@/lib/qloo/client";
import type { CrowdCard } from "@/lib/journey/types";
import type { RetailCategory } from "@/lib/stops/retailers";
import { nextRetailers } from "@/lib/stops/retailers";
import { onlineStop } from "@/lib/stops/online";
import { MAX_SIGNAL } from "@/lib/journey/weights";
import type { CrowdPicks } from "./build";

// Each top crowd's retailers, creators, podcasts and interests (the Next retailers and Online stops, §9.24–9.25),
// gathered before the strategy run so the agent and code both read them as one given source. Bounded in time: what
// isn't back by then is left out, and the strategies are built without it.

export const PICKS_MS = 25_000;

const none = (): CrowdPicks => ({ retailers: [], creators: [], podcasts: [], interests: [] });

/** Never throws; a crowd whose picks aren't back in time gets none. */
export async function gatherPicks(qloo: QlooClient, crowds: CrowdCard[], product: string, opts: { category?: RetailCategory; ms?: number } = {}): Promise<Record<string, CrowdPicks>> {
  const out: Record<string, CrowdPicks> = Object.fromEntries(crowds.map((c) => [c.id, none()]));
  const work = Promise.all(
    crowds.map(async (c) => {
      const signal = c.signal.map((s) => s.id).slice(0, MAX_SIGNAL);
      if (!signal.length) return;
      // The retailers aren't filtered by stockists here: which stores the brand is in is the strategy's context.
      const [r, o] = await Promise.all([nextRetailers(qloo, signal, [], product, { category: opts.category }).catch(() => undefined), onlineStop(qloo, signal).catch(() => undefined)]);
      out[c.id] = {
        retailers: (r?.picks ?? []).filter((p) => !p.ownLabel).map((p) => ({ name: p.name, rank: p.rank })),
        creators: (o?.creators ?? []).map((x) => ({ name: x.name, role: x.role })),
        podcasts: (o?.podcasts ?? []).map((x) => ({ name: x.name })),
        interests: (o?.interests ?? []).map((x) => ({ name: x.name })),
      };
    }),
  ).catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([work, new Promise((res) => (timer = setTimeout(res, opts.ms ?? PICKS_MS)))]);
  clearTimeout(timer);
  // A copy, so late answers don't change what the run already read.
  return JSON.parse(JSON.stringify(out)) as Record<string, CrowdPicks>;
}
