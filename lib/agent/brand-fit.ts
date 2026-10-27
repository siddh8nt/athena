import "server-only";
import { generate, parseJson } from "@/lib/llm/vertex";
import { execPlan, type ExecItem } from "@/lib/exec/plan";
import { CATEGORIES } from "@/lib/playbook/config";
import type { FitVerdict, Work } from "@/lib/team/types";
import type { SpecialistId } from "./specialists";
import type { TeamBrand } from "./plays";

// The brand-fit check (PRD §23.6 n): before Athena writes her plan, one batched Flash call reads the brand and every
// place, partner, creator, podcast and event the subagents found, and decides for each: keep, keep with a note for the
// founder, or leave out with one plain line why. A Qloo crowd match alone can put a tinned-fish brand on Tiffany's
// shelves or name a public figure in a scandal as a partner; this is the common-sense read a founder would give it.
// It's the model's judgment with the brand as context, never a word list: the same museum can suit one brand and not
// another. The founder's own words ("we're fine with adult venues") reach it as Brand Graph facts.

/** What gets checked: the items a founder would reach out to or turn up at. */
const CHECKED = new Set(["venue", "retailer", "partner", "creator", "podcast", "event"]);
/** Items per call, so each answer stays well inside the output budget; the calls run together. */
const CHUNK = 90;

export type FitBrand = Pick<TeamBrand, "name" | "product" | "category" | "tier"> & { traits?: string[]; channel?: string };

/** Every item on the subagents' pages the check reads, once each, as Execute Plan would list it. */
export function fitCandidates(works: Partial<Record<SpecialistId, Work>>): ExecItem[] {
  return execPlan({ goals: [], works, outcomes: [] }).items.filter((i) => CHECKED.has(i.kind) && !i.left);
}

/** One line per item for the prompt: what it is, where, and the subagent's reason it's on the page. */
function lineOf(it: ExecItem, i: number): string {
  const d = it.detail;
  const type = d?.facts.find((f) => /^(type|kind|category|what)$/i.test(f.label))?.value;
  const why = it.note ?? d?.lines?.[0];
  return [`[${i}] ${it.kind}: ${it.name}`, type, it.cities.slice(0, 2).join(", "), why ? `why listed: ${why}` : ""].filter(Boolean).join(" | ");
}

/**
 * The verdicts for the items not checked before (`seen`), merged over the earlier ones. A call that fails keeps its
 * items with no verdict, so they're checked again next time; nothing is ever left out by a failure.
 */
export async function brandFit(
  brand: FitBrand,
  facts: string[],
  works: Partial<Record<SpecialistId, Work>>,
  seen: Record<string, FitVerdict> = {},
  llm = true,
  gen: typeof generate = generate,
): Promise<Record<string, FitVerdict>> {
  const out: Record<string, FitVerdict> = {};
  const all = fitCandidates(works);
  for (const it of all) if (seen[it.id]) out[it.id] = seen[it.id];
  const fresh = all.filter((it) => !seen[it.id]);
  if (!llm || !fresh.length) return out;

  const about = [
    `Brand: ${brand.name}. Sells: ${brand.product}. Category: ${CATEGORIES[brand.category]?.name ?? "consumer goods"}; ${brand.tier} price tier.`,
    brand.channel ? `Sells through: ${brand.channel}.` : "",
    CATEGORIES[brand.category]?.channels.length
      ? `The team looks for these kinds of doors on purpose for this category, so a place of one of these kinds is a normal pitch, however casual or small: ${CATEGORIES[brand.category].channels.map((c) => c.replace(/_/g, " ")).join(", ")}.`
      : "",
    brand.traits?.length ? `Its taste: ${brand.traits.slice(0, 12).join(", ")}.` : "",
    facts.length ? `What its Brand Graph says, one line each (the founder's own words win over anything else):\n${facts.slice(0, 80).map((f) => `- ${f}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const chunks: ExecItem[][] = [];
  for (let i = 0; i < fresh.length; i += CHUNK) chunks.push(fresh.slice(i, i + CHUNK));
  await Promise.all(
    chunks.map(async (items) => {
      try {
        const res = await gen({
          model: "flash",
          json: true,
          thinking: "LOW",
          temperature: 0,
          maxOutputTokens: 4096,
          system:
            "You are Athena, a growth strategist, checking a plan before a brand's founder sees it. The list came from taste-data matches: a crowd that likes the brand also likes these places and names. " +
            "A match alone isn't a reason to pitch. Read each one as the founder would: does it make sense for this brand to pitch, stock with, partner with, or show up at? Reply with JSON only.",
          prompt:
            `${about}\n\nThe places, partners, creators, podcasts and events on the plan:\n${items.map(lineOf).join("\n")}\n\n` +
            "For each one, decide:\n" +
            "- out: a founder of this brand would be embarrassed or puzzled to see it, or it plainly can't work. For example: a public figure known for a scandal, misconduct or abuse allegations (for every person, recall what they're publicly known for, controversies included, before you decide); adults-only or sexual content for a brand that isn't adult; a shop that can't stock or sell this product at all (a jeweller or a toy shop for a food brand); a place whose principles exclude the product (a vegan restaurant for a meat or fish brand); a giant mass-market brand that would never partner with a small one.\n" +
            "- Never out just because a place is casual, small, a chain, or a different kind of food or drink shop than the obvious one: an independent cafe, coffee shop, bakery, deli or cheese shop is a normal door for a pantry brand. When in doubt about a place, keep it.\n" +
            "- note: kept, but there's one concrete thing the founder must know before reaching out that changes what they do (a retailer that needs volumes or packaging the brand may not have; a partner far bigger than the brand; an adults-only venue that still suits an adult brand). Never praise, never general advice like \"ensure\" or \"make sure\": most items need no note.\n" +
            "- keep: everything else. Leave keeps out of the answer.\n" +
            "Judge from the brand and its Brand Graph, never from a word in a name alone: the same place can suit one brand and not another. If the Brand Graph says the founder is fine with something, follow it. " +
            "Write each why and note as one plain sentence to the founder, with no ids and no jargon.\n" +
            'Return {"out":[{"i":number,"why":string}],"note":[{"i":number,"note":string}]}',
        });
        const raw = parseJson(res.text) as { out?: unknown; note?: unknown };
        const pick = (xs: unknown, key: "why" | "note") =>
          (Array.isArray(xs) ? xs : []).flatMap((x) => {
            const r = (x ?? {}) as Record<string, unknown>;
            const it = Number.isInteger(r.i) ? items[r.i as number] : undefined;
            const text = typeof r[key] === "string" ? (r[key] as string).trim().slice(0, 240) : "";
            return it && text ? [{ it, text }] : [];
          });
        for (const it of items) out[it.id] = { fit: "keep", name: it.name, kind: it.kind, agent: it.agent as SpecialistId };
        for (const { it, text } of pick(raw?.note, "note")) out[it.id] = { ...out[it.id], fit: "note", why: text };
        for (const { it, text } of pick(raw?.out, "why")) out[it.id] = { ...out[it.id], fit: "out", why: text };
      } catch (err) {
        console.error("brand-fit check failed", err);
      }
    }),
  );
  return out;
}

