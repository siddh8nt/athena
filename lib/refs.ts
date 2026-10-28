// Where every name comes from (PRD §23.8 c): the names the journey already holds (its crowds, what each subagent
// found, the brands, shops and rivals on the Brand Graph), each with what it is, where it came from and who found it.
// The linker finds them in any text by exact match, so no markup is asked of a model and none can leak; text that
// matches nothing stays plain. Pure and client-safe.

import type { CrowdCard } from "@/lib/journey/types";
import type { BrandBrief } from "@/lib/brief/types";
import type { TeamState } from "@/lib/team/types";
import type { SpecialistId } from "@/lib/agent/specialists";
import { briefSourceWords, sourceWords } from "./sources";

export type Ref = {
  id: string;
  /** What text may say: the name, and for a crowd its handle. */
  names: string[];
  title: string;
  /** In the founder's words: "crowd", "city", "shop", "podcast". */
  kind: string;
  /** What it is, a line or two. `read` lines are Athena's read, shown as such. */
  about: { text: string; read?: boolean }[];
  /** Where it came from, in plain words. */
  from: string;
  url?: string;
  /** The subagent that found it, so the card opens its page. */
  agent?: SpecialistId;
  /** Its WorkItem id, when it can be on Execute Plan. */
  item?: string;
};

const KIND_WORD: Record<string, string> = { venue: "shop", retailer: "retailer", metro: "city", tv_show: "TV show", event: "event" };
const kindWord = (k: string) => KIND_WORD[k] ?? k.replace(/_/g, " ");

/** The crowds, from the Analyst's measurement: named after, what they share as Athena's read, where it came from. */
function crowdRefs(crowds: CrowdCard[], calls: number): Ref[] {
  return crowds.map((c) => ({
    id: `crowd:${c.id}`,
    names: [c.name, ...(c.handle ? [c.handle, c.handle.replace(/^the /, "The ")] : [])],
    title: c.name,
    kind: "crowd",
    about: [
      ...(c.shared ? [{ text: c.shared, read: true }] : []),
      ...(c.after?.length ? [{ text: `Named after ${c.after.join(" and ")}, two things it loves` }] : []),
      { text: `Loves ${c.loves.slice(0, 5).map((l) => l.name).join(", ")}` },
    ],
    from: calls ? `Qloo's taste graph, ${calls} call${calls === 1 ? "" : "s"}` : "Qloo's taste graph",
    agent: "analyst",
  }));
}

/** What each subagent found: its results, each with the first source it cites. */
function workRefs(team: TeamState): Ref[] {
  return Object.values(team.works).flatMap((w) => {
    if (!w) return [];
    const byId = new Map((w.sources ?? []).map((s) => [s.id, s]));
    // A crowd the journey holds is already named above; on the share page, with no journey, its result names it.
    return (w.results ?? [])
      .map((r) => {
        const src = (r.sources ?? []).map((id) => byId.get(id)).find(Boolean);
        return {
          id: r.id,
          names: [r.name],
          title: r.name,
          kind: kindWord(r.kind),
          about: r.why ? [{ text: r.why.length > 180 ? `${r.why.slice(0, 177).trimEnd()}…` : r.why }] : [],
          from: src ? sourceWords(src) : w.qlooCalls ? `Qloo's taste graph, ${w.qlooCalls} calls` : "the team's own work",
          ...(src?.pages?.[0] ? { url: src.pages[0].url } : {}),
          agent: w.agent,
          item: r.id,
        };
      });
  });
}

/** The brands, shops and rivals on the Brand Graph, each with where the founder or Athena found it. */
function briefRefs(brief: BrandBrief | undefined): Ref[] {
  if (!brief) return [];
  const one = (name: string, kind: string, about: string, src: Parameters<typeof briefSourceWords>[0]): Ref => {
    const w = briefSourceWords(src);
    return { id: `brief:${kind}:${name}`, names: [name], title: name, kind, about: [{ text: about, read: src?.kind === "inferred" || src?.kind === "agent_guess" }], from: w.from, ...(w.url ? { url: w.url } : {}) };
  };
  return [
    ...brief.stockists.map((s) => one(s.value.name, "shop", `Already stocks your brand${s.value.city ? `, in ${s.value.city}` : ""}`, s.source)),
    ...brief.competitors.map((s) => one(s.value, "rival", "A brand yours competes with", s.source)),
    ...brief.comparables.map((s) => one(s.value, "brand", "A brand like yours", s.source)),
  ];
}

/** Every name the journey holds, first source wins: crowds, then what the subagents found, then the Brand Graph. */
export function refsFor(i: { crowds?: CrowdCard[]; calls?: number; team?: TeamState; brief?: BrandBrief }): Ref[] {
  const all = [...crowdRefs(i.crowds ?? [], i.calls ?? 0), ...(i.team ? workRefs(i.team) : []), ...briefRefs(i.brief)];
  const seen = new Set<string>();
  return all.filter((r) => {
    const fresh = r.names.filter((n) => !seen.has(n));
    for (const n of fresh) seen.add(n);
    r.names = fresh;
    return fresh.length > 0;
  });
}

export type Linker = { needles: { text: string; ref: Ref }[] };

/** Names shorter than this, or a single common word, aren't linked: too easy to match by accident. */
const MIN = 4;

export function linkerFor(refs: Ref[]): Linker {
  const needles = refs.flatMap((ref) => ref.names.filter((n) => n.trim().length >= MIN).map((text) => ({ text, ref })));
  needles.sort((a, b) => b.text.length - a.text.length);
  return { needles };
}

export type Segment = string | { text: string; ref: Ref };

const wordy = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/** A text split into plain runs and known names: exact, whole words, longest first, one link per name per block. */
export function segments(text: string, l: Linker): Segment[] {
  if (!text || !l.needles.length) return [text];
  const hits: { at: number; end: number; ref: Ref }[] = [];
  for (const n of l.needles) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(n.text, from);
      if (at < 0) break;
      from = at + 1;
      const end = at + n.text.length;
      if (wordy(text[at - 1]) || wordy(text[end])) continue;
      if (hits.some((h) => at < h.end && end > h.at)) continue;
      hits.push({ at, end, ref: n.ref });
    }
  }
  hits.sort((a, b) => a.at - b.at);
  const linked = new Set<string>();
  const out: Segment[] = [];
  let pos = 0;
  for (const h of hits) {
    if (linked.has(h.ref.id)) continue;
    linked.add(h.ref.id);
    if (h.at > pos) out.push(text.slice(pos, h.at));
    out.push({ text: text.slice(h.at, h.end), ref: h.ref });
    pos = h.end;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out.length ? out : [text];
}
