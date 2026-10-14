import { getQloo } from "@/lib/qloo";
import { readEnv } from "@/lib/env";
import { llmConfigured } from "@/lib/llm/vertex";
import { LIMITS, clientIp } from "@/lib/limits";
import { planStream } from "@/lib/agent/server-deps";
import { runAgent, type AgentStreamEvent } from "@/lib/agent/loop";
import { readCalendar, readFacts, readFits, readReach, readSeed, strs } from "@/lib/agent/inputs";
import { STRATEGY_BUDGET, STRATEGY_SYSTEM, codeStrategy, strategyBase, strategyFinisher, strategyGiven, strategyIntro, strategyTools, type StrategyInput } from "@/lib/agent/strategy";
import { metroOf } from "@/lib/agent/tools";
import { readBrief } from "@/lib/brief/form";
import { cachedCrowds } from "@/lib/taste/engine";
import { MAX_EXTRA } from "@/lib/taste/graph";
import { topFits } from "@/lib/strategy/build";
import { gatherPicks } from "@/lib/strategy/picks";
import { dated, timeContext } from "@/lib/time/now";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A strategy for every most valuable fit (PRD §23.2 step 6): the fits run's ranking and calendar, the crowds, the
// brief and the founder's live facts go in; each top crowd's retailers and creators are gathered, the agent reads the
// founder's context into plan_strategy, and the strategies stream back with sourced sentences. With no model, past
// the run limit, or when the agent stalls, code builds them from the brief's stockists alone, so the founder always
// gets a strategy for every top fit.

export const POST = dated(async function post(req: Request) {
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const seed = readSeed(raw.seed);
  const probes = strs(raw.probes, MAX_EXTRA).filter((p) => /^[\w:-]{1,80}$/.test(p));
  const brief = raw.brief ? readBrief(JSON.stringify(raw.brief)) : undefined;
  const facts = readFacts(raw.facts);
  const fits = readFits(raw.fits);
  const date = timeContext().date;
  const calendar = readCalendar(raw.calendar, date);
  const reach = readReach(raw.reach);
  const cap = LIMITS.strategy(clientIp(req));
  const qloo = getQloo();

  return planStream<AgentStreamEvent>(async (send) => {
    const narrate = (why: string, status: "running" | "ok", summary = "") => send({ type: "event", event: { t: 0, tool: "picks", why, status, callIds: [], summary } });
    const crowds = await cachedCrowds(seed, probes);
    if (!crowds?.crowds.length || !fits) {
      send({ type: "event", event: { t: 0, tool: "plan", why: "The most valuable fits are still being ranked", status: "needs_input", callIds: [], summary: "" } });
      return;
    }
    const b = brief?.name || brief?.sells ? brief : undefined;
    const product = b?.sells?.value ?? b?.name?.value ?? "your product";
    const top = new Set(topFits(fits).map((f) => f.crowd));

    // Each top crowd's retailers and creators, within a hard time limit. Past the run limit they're skipped, and
    // the strategies lean on each crowd's metros and venues.
    let picks: StrategyInput["picks"] = {};
    if (cap.ok) {
      narrate("Finding each crowd's retailers, creators and podcasts", "running");
      picks = await gatherPicks(qloo, crowds.crowds.filter((c) => top.has(c.id)), product, { category: b?.retail });
      narrate("Finding each crowd's retailers, creators and podcasts", "ok", `${Object.values(picks).filter((p) => p.retailers.length || p.creators.length).length} of ${top.size} crowds with picks`);
    }

    const input: StrategyInput = { brief: b, facts, date, product, fits, calendar, crowds: crowds.crowds, reach, picks };
    const { given, src } = strategyGiven(input);
    const base = strategyBase(input, src);

    // Code's strategies: the brief's stockists as the only context, cited to the brief.
    const fallback = async () => {
      const stockists = await Promise.all(
        (b?.stockists ?? []).slice(0, 60).map(async (s) => {
          const m = s.value.city ? await metroOf(s.value.city).catch(() => undefined) : undefined;
          return { name: s.value.name, ...(m ? { metro: m.name } : {}) };
        }),
      );
      send({ ...codeStrategy(base, stockists, src.brief), sources: given.map((g, i) => ({ id: `s${i + 1}`, tool: g.tool, summary: g.summary, callIds: [] })) });
    };

    if (!cap.ok || qloo.mode !== "live" || !llmConfigured()) return fallback();
    // Anything that breaks before the agent's own fallback takes over still ends in code's strategies.
    let planned = false;
    const relay = (e: AgentStreamEvent) => {
      if (e.type === "strategy") planned = true;
      send(e);
    };
    try {
      await runAgent({
        goal: `Plan a strategy for each of ${b?.name?.value ?? "your brand"}'s most valuable fits`,
        brand: { name: b?.name?.value ?? seed.brand?.name ?? "the brand", websites: [] },
        system: STRATEGY_SYSTEM,
        intro: strategyIntro(input, STRATEGY_BUDGET),
        finisher: strategyFinisher,
        given,
        budget: STRATEGY_BUDGET,
        state: { seed, crowds, probes, strategyBase: base },
        tools: strategyTools(),
        qloo,
        env: readEnv(),
        send: relay,
        fallback,
      });
    } catch (err) {
      console.error("strategy agent failed", err);
    }
    if (!planned) await fallback();
  }, qloo.mode);
});
