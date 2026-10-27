import type { CrowdsResult } from "@/lib/journey/types";
import { MAX_EXTRA } from "@/lib/taste/graph";
import { metroById } from "@/lib/playbook/metros";
import { isChainName } from "@/lib/methods/names";
import type { AgentState, Decision } from "./tools";

// The Analyst's evidence rules (PRD §23.2 step 8b, 8i) for the tools it shares with step 2's agent: when to measure,
// when to probe and when to rank. Code's decider follows them when the model isn't there; the model reads the same
// rules as plain words in its instructions. Each returns why, so the trace says what the evidence was.

/** A crowd under this stability is soft: worth a probe (the graph's own reading, §9.27). */
export const SOFT = 0.6;
/** Win first and Win next this close on score are too close to call. */
export const CLOSE_CALL = 0.05;
/** A node the founder asks about is unclear below this certainty. */
const UNCLEAR = 0.6;
/** Probes per session before the Analyst stops on its own. */
export const PROBE_CAP = 2;
/** Seeding wider (§23.5 c): with fewer than three crowds, a probe holds this many entities, topped up with brands like yours. */
export const WIDER = 3;

/** The crowds that held as measured, leaving out the near-miss group (§23.5 c). */
export const heldCrowds = (r?: CrowdsResult) => (r?.crowds ?? []).filter((c) => !c.nearMiss).length;

/** build_taste_graph: measure when there are no crowds; seed from similar brands when the brand isn't in Qloo. */
export function graphWhen(s: AgentState): Decision | undefined {
  const t = s.team;
  if (!t || s.crowds || s.ran?.includes("build_taste_graph")) return undefined;
  const b = t.brand;
  const comparables = b.comparables.map((c) => c.name);
  const lookalikes = b.lookalikes.length ? b.lookalikes : comparables;
  if (!b.ownId && !lookalikes.length) return { skip: `${b.name} isn't in Qloo and no similar brands are named, so there's nothing to measure from yet`, need: "brands like yours, from the founder" };
  return {
    args: { brand_id: b.ownId, brand_name: b.name, comparables, lookalikes: lookalikes.slice(0, 5), traits: b.traits.slice(0, 5) },
    why: b.ownId ? `Measuring the taste around ${b.name}` : `${b.name} isn't in Qloo yet, so reading it through brands like it: ${lookalikes.slice(0, 3).join(", ")}`,
  };
}

/** The crowds' shape, to tell whether a probe changed them. */
export const crowdSignature = (r?: CrowdsResult) => (r?.crowds ?? []).map((c) => `${c.name}:${c.size}`).join("|");

/**
 * probe_entity, on evidence only (§23.2 step 8i): the entity the founder asked about when it's unclear; founder facts
 * (comparables, rivals) not on the map; fewer than three crowds (§23.5 c: seed wider once, with the brands on the map
 * most like yours, joining any other probe); a soft crowd; Win first and Win next too close to call. Never when the
 * crowds are stable and the ranking is clear; stops at the cap, at the graph's limit, or when the last probe changed nothing.
 */
export function probeWhen(s: AgentState): Decision | undefined {
  const t = s.team;
  const r = s.crowds;
  if (!t || !r?.crowds.length || s.ran?.includes("probe_entity")) return undefined;
  if (t.probe.ran >= PROBE_CAP) return { skip: `${t.probe.ran} probes this session already; the crowds stand as measured` };
  if (s.probes.length >= MAX_EXTRA) return { skip: "the graph holds all the probes it can" };
  if (t.probe.unchanged) return { skip: "the last probe changed nothing, so another wouldn't either" };
  const nodes = r.galaxy?.nodes ?? [];
  const onMap = (id: string) => nodes.some((n) => n.id === id && n.crowd >= 0) || s.probes.includes(id);
  const node = (id: string) => nodes.find((n) => n.id === id);

  // Fewer than three crowds held and the graph hasn't been seeded wider: brands on the map most like yours (not chains,
  // not the seed, not landmarks) join the probe, to see whether a third crowd appears (§23.5 c).
  const held = heldCrowds(r);
  const seeded = new Set([r.seed.brand?.id, ...r.seed.lookalikes.map((x) => x.id)]);
  const likeYours = held < 3 && !t.probe.wider
    ? nodes.filter((n) => n.domain === "brand" && n.crowd >= 0 && !n.landmark && !seeded.has(n.id) && !s.probes.includes(n.id) && !isChainName(n.name)).sort((a, b) => b.affinity - a.affinity)
    : [];
  const heldLine = `only ${held === 1 ? "one crowd" : `${held} crowds`} held`;
  const probe = (ids: string[], why: string): Decision => {
    const add = likeYours.filter((n) => !ids.includes(n.id)).slice(0, Math.max(0, Math.min(WIDER, MAX_EXTRA - s.probes.length) - ids.length));
    if (!add.length) return { args: { entity_ids: ids }, why };
    const names = add.map((n) => n.name).join(", ");
    return { args: { entity_ids: [...ids, ...add.map((n) => n.id)] }, why: ids.length ? `${why}; ${heldLine}, so ${names}, brands like yours, join the probe to see whether a third appears` : `${heldLine[0].toUpperCase()}${heldLine.slice(1)}; probing ${names}, brands on the map most like yours, to see whether a third appears` };
  };

  const asked = t.asked;
  if (asked?.id) {
    const n = node(asked.id);
    if (!n || n.crowd < 0 || n.certainty < UNCLEAR)
      return probe([asked.id], n ? `You asked about ${asked.name}, and where it sits is unclear; probing it settles that` : `You asked about ${asked.name}, which isn't on the map yet; probing it places it`);
  }
  const facts = [...t.brand.comparables, ...t.brand.competitors].filter((x) => x.id && !onMap(x.id)).slice(0, 2);
  if (facts.length) return probe(facts.map((x) => x.id), `You named ${facts.map((x) => x.name).join(" and ")}, which aren't on the map yet; probing places them`);
  if (likeYours.length) return probe([], "");

  const soft = r.crowds.map((c, i) => ({ c, i })).find(({ c }) => c.stability !== undefined && c.stability < SOFT);
  if (soft) {
    const top = nodes.filter((n) => n.crowd === soft.i && n.core && !n.landmark && !s.probes.includes(n.id)).sort((a, b) => b.affinity - a.affinity)[0];
    if (top) return { args: { entity_ids: [top.id] }, why: `${soft.c.name} is soft (it doesn't come back the same when the data is resampled); probing ${top.name}, its strongest member, firms it up` };
  }
  const fits = s.fits?.fits ?? [];
  const first = fits.find((f) => f.tier === "win_first");
  const next = fits.find((f) => f.tier === "win_next");
  if (first && next && Math.abs(first.score - next.score) < CLOSE_CALL) {
    const i = r.crowds.findIndex((c) => c.id === next.crowd);
    const top = nodes.filter((n) => n.crowd === i && !n.landmark && !s.probes.includes(n.id)).sort((a, b) => b.affinity - a.affinity)[0];
    if (top) return { args: { entity_ids: [top.id] }, why: `${first.name} and ${next.name} are too close to call; probing ${top.name} tests whether ${next.name} holds` };
  }
  if (asked) return { skip: `${asked.name} sits clearly in its crowd, so the answer comes from what's measured; a probe wouldn't change it` };
  return { skip: "no probe needed: the crowds are stable and the ranking is clear" };
}

/** rank_fits: when there are crowds and no ranking; where the brand already sells comes from the brief (always s1). */
export function rankWhen(s: AgentState): Decision | undefined {
  const t = s.team;
  // A probe that changes the crowds clears the ranking, so it can run twice: before and after.
  if (!t || !s.crowds?.crowds.length || s.fits || (s.ran ?? []).filter((x) => x === "rank_fits").length >= 2) return undefined;
  return {
    args: { already_sell: t.brand.soldIn.map((id) => ({ place: metroById(id).name, sources: ["s1"] })) },
    why: `Ranking the crowds as your most valuable fits${t.brand.soldIn.length ? ", leaving out where you already sell" : ""}`,
  };
}
