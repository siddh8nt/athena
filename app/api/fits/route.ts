import { getQloo } from "@/lib/qloo";
import { readEnv } from "@/lib/env";
import { llmConfigured } from "@/lib/llm/vertex";
import { LIMITS, clientIp } from "@/lib/limits";
import { planStream } from "@/lib/agent/server-deps";
import { runAgent, type AgentStreamEvent } from "@/lib/agent/loop";
import { FITS_BUDGET, FITS_SYSTEM, defaultCalendar, fitsFinisher, fitsGiven, fitsIntro, fitsTools, type FitsInput } from "@/lib/agent/fits";
import { readFacts, readSeed, strs } from "@/lib/agent/inputs";
import { metroOf } from "@/lib/agent/tools";
import { readBrief } from "@/lib/brief/form";
import { cachedCrowds } from "@/lib/taste/engine";
import { MAX_EXTRA } from "@/lib/taste/graph";
import { gatherEvidence } from "@/lib/fits/gather";
import { rankFits } from "@/lib/fits/score";
import { dated, timeContext } from "@/lib/time/now";
import type { Metro } from "@/lib/playbook/metros";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Most valuable fits (PRD §23.2 step 5): the crowds the journey measured, the brief and the founder's live facts go
// in; the agent's steps stream back, then the ranking, the calendar and sourced reasons. When the agent stalls or
// there is no model, code ranks with default weights and leaves out the brief's stockist cities, so the founder
// always gets a ranking.

export const POST = dated(async function post(req: Request) {
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const seed = readSeed(raw.seed);
  const probes = strs(raw.probes, MAX_EXTRA).filter((p) => /^[\w:-]{1,80}$/.test(p));
  const brief = raw.brief ? readBrief(JSON.stringify(raw.brief)) : undefined;
  const facts = readFacts(raw.facts);
  const cap = LIMITS.fits(clientIp(req));
  const qloo = getQloo();

  return planStream<AgentStreamEvent>(async (send) => {
    const crowds = await cachedCrowds(seed, probes);
    if (!crowds?.crowds.length) {
      send({ type: "event", event: { t: 0, tool: "plan", why: "The crowds are still being measured", status: "needs_input", callIds: [], summary: "" } });
      return;
    }
    const input: FitsInput = { brief: brief?.name || brief?.sells ? brief : undefined, facts, seed, crowds };

    // Code's ranking: default weights, the brief's stockist cities left out of reach, the crowds' own moments.
    const fallback = async () => {
      const cities = [...new Set((input.brief?.stockists ?? []).map((s) => s.value.city).filter((c): c is string => !!c))].slice(0, 25);
      const metros = (await Promise.all(cities.map((c) => metroOf(c).catch(() => undefined)))).filter((m): m is Metro => !!m);
      const exclude = metros.filter((m, i) => metros.findIndex((x) => x.id === m.id) === i);
      const g = await gatherEvidence({ qloo, crowds, exclude, ticketmasterKey: readEnv().ticketmasterKey, status: (text) => send({ type: "event", event: { t: 0, tool: "plan", why: text, status: "ok", callIds: [], summary: "" } }) });
      const fits = rankFits(g.evidence, { date: timeContext().date, excluded: exclude.map((m) => ({ metro: m.name, sources: ["s1"] })) });
      const top = fits.fits[0];
      send({
        type: "fits",
        fits,
        calendar: defaultCalendar(g),
        crowds,
        geography: g.geography,
        answer: { headline: top ? `Win ${top.name} first` : "", reasons: fits.fits.map((f) => ({ crowd: f.crowd, text: f.reasons.join(" "), sources: [] })), assumptions: exclude.length ? [] : ["No stockist cities in the brief, so every crowd's reach counts as new."] },
        sources: [],
      });
    };

    if (!cap.ok || qloo.mode !== "live" || !llmConfigured()) return fallback();
    // Anything that breaks before the agent's own fallback takes over still ends in code's ranking.
    let ranked = false;
    const relay = (e: AgentStreamEvent) => {
      if (e.type === "fits") ranked = true;
      send(e);
    };
    try {
      await runAgent({
        goal: `Rank ${input.brief?.name?.value ?? "your brand"}'s most valuable fits`,
        brand: { name: input.brief?.name?.value ?? seed.brand?.name ?? "the brand", websites: [] },
        system: FITS_SYSTEM,
        intro: fitsIntro(input, FITS_BUDGET),
        finisher: fitsFinisher,
        given: fitsGiven(input),
        budget: FITS_BUDGET,
        state: { seed, crowds, probes },
        tools: fitsTools(),
        qloo,
        env: readEnv(),
        send: relay,
        fallback,
      });
    } catch (err) {
      console.error("fits agent failed", err);
    }
    if (!ranked) await fallback();
  }, qloo.mode);
});
