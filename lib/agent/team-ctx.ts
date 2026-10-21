import "server-only";
import type { QlooClient } from "@/lib/qloo/client";
import type { BrandBrief } from "@/lib/brief/types";
import type { CategoryId } from "@/lib/playbook/config";
import type { RetailCategory } from "@/lib/stops/retailers";
import type { CrowdsResult } from "@/lib/journey/types";
import type { FitsResult } from "@/lib/fits/types";
import type { SeedInput } from "@/lib/taste/seed";
import type { TeamState } from "@/lib/team/types";
import type { LiveFact } from "@/lib/knowledge/types";
import { resolveBrand } from "@/lib/methods/resolve";
import { metroOf } from "./tools";
import { heldCrowds } from "./evidence";
import type { TeamCtx, TeamEnrich } from "./plays";

// The team's shared memory built from the Brand Graph the client sends (PRD §23.2 step 8b): the brand as the
// specialists read it, the measured crowds and ranking, and what earlier runs settled (the Navigator's city, the
// Scout's next crowd). Lookups that miss are left out quietly; the team works from what's known.

/** The playbook category each retail category starts from. */
const CATEGORY: Record<RetailCategory, CategoryId> = { food: "G1", beauty: "G3", home: "G4", fashion: "G5", general: "G1" };

export type CtxInput = {
  brief?: BrandBrief;
  seed: SeedInput;
  crowds?: CrowdsResult;
  fits?: FitsResult;
  probes: string[];
  team: TeamState;
  enrich: TeamEnrich;
  llm: boolean;
  qloo: QlooClient;
  answers?: { question: string; answer: string }[];
  notes?: LiveFact[];
};

/** A named brand in Qloo, by name; undefined when Qloo doesn't know it. */
async function inQloo(qloo: QlooClient, name: string): Promise<{ id: string; name: string } | undefined> {
  const r = await resolveBrand(qloo, name).catch(() => undefined);
  return r?.entity ? { id: r.entity.entity_id, name } : undefined;
}

export async function buildCtx(r: CtxInput): Promise<TeamCtx> {
  const b = r.brief;
  const name = b?.name?.value || r.seed.brand?.name || "Your brand";
  const lookalikeRefs = r.crowds?.seed.lookalikes ?? [];
  // Comparables already measured come from the seed; the rest, and the rivals, are looked up (3 each at most).
  const named = (b?.comparables ?? []).map((c) => c.value).slice(0, 3);
  const comparables = (
    await Promise.all(named.map(async (n) => lookalikeRefs.find((l) => l.name.toLowerCase() === n.toLowerCase()) ?? inQloo(r.qloo, n)))
  ).filter((x): x is { id: string; name: string } => !!x);
  const competitors = (await Promise.all((b?.competitors ?? []).slice(0, 3).map((c) => inQloo(r.qloo, c.value)))).filter((x): x is { id: string; name: string } => !!x);

  const stockistCities = [...new Set((b?.stockists ?? []).map((s) => s.value.city).filter((c): c is string => !!c))].slice(0, 20);
  const metros = await Promise.all(stockistCities.map((c) => metroOf(c).catch(() => undefined)));
  const soldIn = [...new Set([...metros.filter((m) => !!m).map((m) => m!.id), ...(b?.cities ?? []).map((c) => c.value.id)])];
  const home = b?.activeCity?.value && !/none/i.test(b.activeCity.value) ? await metroOf(b.activeCity.value).catch(() => undefined) : undefined;

  const works = r.team.works;
  const city = works.navigator?.shared?.city;
  const hoods = works.navigator?.results.filter((x) => x.kind === "neighbourhood").map((x) => x.name);
  const nextName = works.scout?.shared?.crowd;
  const crowdNamed = (n?: string) => (n ? r.crowds?.crowds.find((c) => c.name === n) : undefined);

  return {
    brand: {
      name,
      product: b?.sells?.value ?? name,
      category: CATEGORY[b?.retail ?? "general"],
      tier: b?.tierHint?.value ?? "premium",
      motions: b?.howBought?.value?.length ? b.howBought.value : ["venue"],
      ...(b?.channel?.value ? { channel: b.channel.value } : {}),
      ownId: b?.qloo?.match?.id ?? r.seed.brand?.id,
      comparables,
      competitors,
      stockists: (b?.stockists ?? []).map((s) => s.value.name),
      soldIn,
      ...(home ? { homeMetro: home.id } : {}),
      ...(b?.retail ? { retail: b.retail } : {}),
      lookalikes: r.seed.lookalikes.length ? r.seed.lookalikes : (b?.proxies ?? []),
      traits: r.seed.traits.length ? r.seed.traits : (b?.traits ?? []),
    },
    goals: r.team.goals.map((g) => g.id),
    enrich: r.enrich,
    llm: r.llm,
    seed: r.seed,
    crowds: r.crowds,
    fits: r.fits,
    probes: [...r.probes],
    ...(city ? { city } : {}),
    ...(hoods?.length ? { hoods } : {}),
    ...(crowdNamed(works.analyst?.shared?.crowd) ? { crowd: crowdNamed(works.analyst?.shared?.crowd) } : {}),
    ...(crowdNamed(nextName) ? { next: crowdNamed(nextName) } : {}),
    ...(r.answers?.length ? { answers: r.answers } : {}),
    ...(r.notes?.length ? { notes: r.notes } : {}),
    found: works.scout?.page ? { scout: works.scout.page } : {},
    outcomes: r.team.outcomes,
    // Probed and still under three crowds: the graph was seeded wider already (§23.5 c).
    probe: { ran: r.probes.length, wider: r.probes.length > 0 && heldCrowds(r.crowds) < 3 },
  };
}
