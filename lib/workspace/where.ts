import type { BrandBrief } from "@/lib/brief/types";
import type { CrowdCard, Journey } from "@/lib/journey/types";
import type { SpecialistId } from "@/lib/agent/specialists";
import type { PageSource } from "@/lib/team/page";
import { emptyTeam } from "@/lib/team/types";
import { refsFor, type Ref } from "@/lib/refs";
import { pageSourceWords } from "@/lib/sources";

// Where it came from, for the files the founder takes away (PRD §23.8 e): the same words the in-app cards use, so
// athena-brand.md, athena-plan.xlsx and the share page agree. Built from the names the journey holds; pure.

export type Where = {
  /** A crowd's source. */
  crowd: (c: CrowdCard) => string | undefined;
  /** A result's source, by its id or its name, else the subagent's own read. */
  item: (it: { id?: string; name: string; agent?: string }) => { from: string; url?: string } | undefined;
  /** A subagent's own read, when no result says more: "Qloo's taste graph, 40 calls". */
  agent: (a: SpecialistId) => string | undefined;
  /** A page's own sources, in words. */
  page: (sources: PageSource[]) => string;
};

export function whereFor(saved: { brief?: BrandBrief; journey?: Journey }): Where {
  const team = saved.journey?.team ?? emptyTeam();
  const refs = refsFor({ crowds: saved.journey?.crowds?.crowds, calls: saved.journey?.crowds?.calls, team, brief: saved.brief });
  const byId = new Map<string, Ref>();
  const byName = new Map<string, Ref>();
  for (const r of refs) {
    byId.set(r.id, r);
    if (r.item) byId.set(r.item, r);
    for (const n of r.names) byName.set(n.toLowerCase(), r);
  }
  const agent = (a: SpecialistId) => {
    const n = team.works[a]?.qlooCalls;
    return n ? `Qloo's taste graph, ${n} call${n === 1 ? "" : "s"}` : undefined;
  };
  return {
    crowd: (c) => byId.get(`crowd:${c.id}`)?.from,
    item: (it) => {
      const r = (it.id && byId.get(it.id)) || byName.get(it.name.toLowerCase());
      if (r) return { from: r.from, ...(r.url ? { url: r.url } : {}) };
      const a = it.agent && agent(it.agent as SpecialistId);
      return a ? { from: a } : undefined;
    },
    agent,
    page: (sources) => [...new Set(sources.map((s) => pageSourceWords(s.label)))].join("; "),
  };
}
