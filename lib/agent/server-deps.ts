import "server-only";
import { addApplePodcastDetails } from "@/lib/enrich/apple-podcasts";
import { getQloo } from "@/lib/qloo";
import { readEnv } from "@/lib/env";
import { loadStockists } from "@/lib/playbook/stockists";
import { ticketmasterShows } from "@/lib/enrich/ticketmaster";
import { censusMarket } from "@/lib/enrich/census";
import { overtureNeighbourhoods } from "@/lib/enrich/neighbourhoods";
import { groundedFestivalDates } from "@/lib/enrich/festival-dates";
import { addWikidataWebsites } from "@/lib/enrich/wikidata";
import { llmConfigured } from "@/lib/llm/vertex";
import { lastRun } from "./last-run";
import { chooseComparables, classifyBusiness, parseAccounts, readWebsite } from "./intake";
import { writeHooks, type HookEvidence, type Hooks } from "./hooks";
import { getStore } from "@/lib/store";

/** Hooks are cached per exact evidence for 7 days: the same Qloo evidence gets the same checked copy. */
async function cachedHooks(ev: HookEvidence): Promise<Hooks | undefined> {
  const key = JSON.stringify(ev);
  const hit = await getStore().get<Hooks>("hooks", key);
  if (hit) return hit.value;
  const fresh = await writeHooks(ev);
  if (fresh && (fresh.hooks.length || fresh.ideas.length)) await getStore().set("hooks", key, fresh, 7 * 24 * 60 * 60 * 1000);
  return fresh;
}
import type { PlanDeps, PlanEvent } from "./plan";
import type { TeamEnrich } from "./plays";

/** Everything a plan needs on the server. Enrichments and LLM steps run only in live mode; fixtures stay synthetic. */
export function serverDeps(send: (e: PlanEvent) => void): PlanDeps {
  const qloo = getQloo();
  const env = readEnv();
  const live = qloo.mode === "live";
  const llm = live && llmConfigured();
  return {
    qloo,
    send,
    loadStockists,
    lastRun,
    enrich: live ? { shows: ticketmasterShows(env.ticketmasterKey), markets: { census: censusMarket(env.censusKey), neighbourhoods: overtureNeighbourhoods }, festivalDate: groundedFestivalDates(llm), websites: addWikidataWebsites, podcastDetails: addApplePodcastDetails } : {},
    intake: llm ? { readWebsite, classify: classifyBusiness, parseAccounts, chooseComparables, writeHooks: cachedHooks } : undefined,
  };
}

/** The team's enrichers (§23.2 step 8): the plan's live ones, with checked hooks for the drafts; empty with fixtures. */
export function teamEnrich(): TeamEnrich {
  const env = readEnv();
  if (getQloo().mode !== "live") return {};
  const llm = llmConfigured();
  return {
    shows: ticketmasterShows(env.ticketmasterKey),
    markets: { census: censusMarket(env.censusKey), neighbourhoods: overtureNeighbourhoods },
    festivalDate: groundedFestivalDates(llm),
    websites: addWikidataWebsites,
    podcastDetails: addApplePodcastDetails,
    ...(llm ? { writeHooks: cachedHooks } : {}),
  };
}

/** Server-sent events over a ReadableStream that always closes with a final "done". */
export function planStream<E extends { type: string } = PlanEvent>(run: (send: (e: E) => void) => Promise<void>, mode: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let done = false;
      const send = (e: E) => {
        if (e.type === "done") done = true;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          // The client went away; keep running so caches fill.
        }
      };
      try {
        await run(send);
      } catch (err) {
        // The plan isolates its own failures; this only guards the stream. Logged for Cloud Logging, never shown.
        console.error("plan stream failed", err);
      } finally {
        if (!done) send({ type: "done", qlooCalls: 0, ms: 0 } as unknown as E);
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Athena-Mode": mode } });
}
