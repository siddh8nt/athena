import "server-only";
import type { AgentEvent } from "@/lib/blocks/types";
import type { Stockist } from "@/lib/brief/types";
import { PASTED } from "@/lib/agent/context-prompt";
import { extractDoc, toFacts } from "./extract";
import { compareFacts } from "./merge";
import { pastedDoc } from "./read";
import { readSite } from "./site";
import { KB_TOKENS, listUploads, readUpload, uploadDoc } from "./uploads";
import { whereLabel, type Conflict, type Coverage, type Fact, type Knowledge } from "./types";

// Onboarding's reading (PRD §23.2 step 4): everything the founder gave (their kept files, the pasted summary, the
// website) read into located facts at once, then compared into one knowledge base. Code runs it, so nothing given
// goes unread; the agent then works from the facts. Each read is narrated as a step while it runs.

export type KnowledgeInput = {
  /** The browser's workspace and the kept files the founder chose, by hash. */
  ws?: string;
  hashes: string[];
  websites: string[];
  pasted?: string;
  /** Facts the founder struck, and the option they picked for each conflict. */
  struck: string[];
  settled: Record<string, number>;
};

/** One source as the agent sees it: its facts in use, each with its id and where it is. */
export type KnownSource = { kind: Fact["where"][number]["kind"]; ref: string; facts: Fact[] };

export type Known = { knowledge: Knowledge; sources: KnownSource[]; stockists: { ref: string; list: Stockist[] }[]; settled: Record<string, number> };

type Read = { facts: Fact[]; coverage: Coverage; stockists?: Stockist[] };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The coverage line, honest without a failure state: a last look that still found detail says so. */
const covered = (c: Coverage) => (c.clean ? (c.added ? `a second look added ${c.added}, then found nothing left out` : "a second look found nothing left out") : `a last look still turned up detail${c.added ? ` (${c.added} added)` : ""}; all of it is kept`);

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/** Which option of a conflict is in use: the founder's pick, else Athena's. */
export const inUse = (c: Conflict, settled: Record<string, number>) => {
  const p = settled[c.id];
  return Number.isInteger(p) && p >= 0 && p < c.options.length ? p : c.recommended;
};

export async function buildKnowledge(input: KnowledgeInput, emit: (e: AgentEvent) => void): Promise<Known> {
  const t0 = Date.now();
  /** A step shown running, then done with its summary. */
  const step = async <T,>(tool: string, why: string, run: () => Promise<T>, done: (r: T) => { summary: string; status?: AgentEvent["status"] }): Promise<T> => {
    emit({ t: Date.now() - t0, tool, why, status: "running", callIds: [], summary: "" });
    const r = await run();
    const d = done(r);
    emit({ t: Date.now() - t0, tool, why, status: d.status ?? "ok", callIds: [], summary: d.summary });
    return r;
  };

  // The founder's chosen files, up to the limit in the order they chose them.
  const all = input.ws ? await listUploads(input.ws) : [];
  let used = 0;
  const chosen = input.hashes
    .map((h) => all.find((u) => u.hash === h))
    .filter((u): u is NonNullable<typeof u> => !!u)
    .filter((u, i) => (used += u.tokens) <= KB_TOKENS || i === 0);

  const reads: Promise<Read | undefined>[] = [
    ...chosen.map(async (u) => {
      const doc = await uploadDoc(input.ws!, u);
      if (!doc || (!doc.text && !doc.parts.length && !doc.stockists.length)) return undefined;
      return step(
        "read_file",
        `Reading ${u.name}`,
        async (): Promise<Read> => {
          const x = doc.text || doc.parts.length ? await readUpload(input.ws!, doc) : { facts: [], rounds: 0, added: 0, clean: true, ms: 0 };
          const facts = toFacts(doc, x);
          return { facts, coverage: { source: u.name, facts: facts.length, added: x.added, clean: x.clean }, stockists: doc.stockists };
        },
        (r) => ({ summary: `${plural(r.facts.length, "fact")}${r.stockists?.length ? ` and ${plural(r.stockists.length, "stockist")}` : ""}, each with where it is; ${covered(r.coverage)}` }),
      );
    }),
    ...(input.pasted
      ? [
          step(
            "read_file",
            "Reading your AI summary",
            async (): Promise<Read> => {
              const doc = pastedDoc(PASTED, input.pasted!);
              const x = await extractDoc(doc, { scope: input.ws ?? "pasted" });
              const facts = toFacts(doc, x);
              return { facts, coverage: { source: PASTED, facts: facts.length, added: x.added, clean: x.clean } };
            },
            (r) => ({ summary: `${plural(r.facts.length, "fact")}, each with its line; ${covered(r.coverage)}` }),
          ),
        ]
      : []),
    ...input.websites.slice(0, 2).map((w) =>
      step(
        "read_website",
        `Reading ${w.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}`,
        async (): Promise<Read> => {
          const s = await readSite(w);
          return { facts: s.facts, coverage: s.coverage };
        },
        (r) => ({ summary: `${plural(r.facts.length, "fact")}, each with its page; ${covered(r.coverage)}`, status: r.facts.length ? "ok" : "thin" }),
      ).catch(() => undefined),
    ),
  ];
  const done = (await Promise.all(reads)).filter((r): r is Read => !!r);
  const facts = done.flatMap((r) => r.facts);

  // Compared before any strike, so a struck fact never changes what merged or which ids the conflicts have.
  const compared =
    facts.length > 1
      ? await step(
          "compare",
          "Putting it all together",
          () => compareFacts(facts),
          (m) => ({ summary: `${plural(m.facts.length, "fact")} after merging what said the same thing${m.conflicts.length ? `; ${plural(m.conflicts.length, "place")} where your sources disagree, for you to settle` : ""}` }),
        )
      : { facts, conflicts: [] };
  const struck = new Set(input.struck);
  const merged = {
    facts: compared.facts.map((f) => (struck.has(f.id) ? { ...f, struck: true } : f)),
    // A struck fact is no longer an option; a disagreement left with one side is settled.
    conflicts: compared.conflicts
      .map((c) => ({ ...c, options: c.options.map((o) => ({ ...o, facts: o.facts.filter((id) => !struck.has(id)) })) }))
      .filter((c) => c.options.filter((o) => o.facts.length).length > 1),
  };

  // The agent sees the facts in use: not struck, and for a disagreement only the option in use.
  const settled = Object.fromEntries(
    merged.conflicts.map((c) => {
      const i = inUse(c, input.settled);
      return [c.id, c.options[i].facts.length ? i : c.options.findIndex((o) => o.facts.length)];
    }),
  );
  const aside = new Set(merged.conflicts.flatMap((c) => c.options.filter((_, i) => i !== settled[c.id]).flatMap((o) => o.facts)));
  const live = merged.facts.filter((f) => !f.struck && !aside.has(f.id));
  const sources: KnownSource[] = [];
  for (const f of live) {
    const w = f.where[0];
    // A site's facts are one source, whichever page they're on.
    const ref = w.kind === "website" ? hostOf(w.ref) : w.ref;
    const s = sources.find((x) => x.kind === w.kind && x.ref === ref) ?? (sources.push({ kind: w.kind, ref, facts: [] }), sources.at(-1)!);
    s.facts.push(f);
  }
  return {
    knowledge: { facts: merged.facts, conflicts: merged.conflicts, coverage: done.map((r) => r.coverage) },
    sources,
    stockists: done.filter((r) => r.stockists?.length).map((r) => ({ ref: r.coverage.source, list: r.stockists! })),
    settled,
  };
}

/** A source's facts as the agent reads them: "id | fact | where". */
export const sourceData = (s: KnownSource) => ({ source: s.ref, facts: s.facts.map((f) => `${f.id} | ${f.text} | ${f.where.map(whereLabel).join("; ")}`) });
