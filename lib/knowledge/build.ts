import "server-only";
import type { AgentEvent } from "@/lib/blocks/types";
import type { Stockist } from "@/lib/brief/types";
import { PASTED } from "@/lib/agent/context-prompt";
import { extractDoc, toFacts } from "./extract";
import { compareFacts } from "./merge";
import { pastedDoc } from "./read";
import { readSite, type PageRead } from "./site";
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

type Read = { facts: Fact[]; coverage: Coverage; stockists?: Stockist[]; pages?: number };

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

/** The first fact, as the transcript tells it after the colon, or what was found when there's none. */
const firstOf = (facts: Fact[], otherwise: string) => {
  const f = facts[0]?.text.replace(/\.$/, "");
  if (!f) return otherwise;
  const one = f.length > 90 ? `${f.slice(0, 88).trimEnd()}…` : f;
  return facts.length > 1 ? `${one}, and ${plural(facts.length - 1, "more fact")}` : one;
};

/** What the transcript calls a page: "the home page", "the About page" (its title, less the brand's name), else its path. */
export function pageLabel(url: string, title?: string): string {
  let path = "/";
  let host = "";
  try {
    const u = new URL(url);
    path = u.pathname.replace(/\/$/, "") || "/";
    host = u.hostname.toLowerCase().replace(/[^a-z0-9]/g, "");
  } catch {
    // Keep the root.
  }
  if (path === "/") return "the home page";
  // Titles read "About us | Fishwife" or "Tidepool Tins – Our story": the side that shares no word with the site's
  // address is the page's own.
  const parts = (title ?? "").split(/\s+[|–—·:-]\s+/).map((x) => x.trim()).filter(Boolean);
  const brandish = (x: string) => {
    const words = x.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return host.includes(words.join("")) || words.some((w) => w.length >= 4 && host.includes(w));
  };
  const own = parts.find((x) => !brandish(x));
  return own && own.length <= 40 ? `the ${own} page` : path;
}

/** A page's read as a transcript line under its site. */
function pageEvent(p: PageRead, under: string, t: number): AgentEvent {
  const label = p.products ? "the product catalogue" : pageLabel(p.url, p.title);
  const facts = p.facts ?? [];
  const what = p.products ? `${plural(p.products, "product")}, each with its price` : firstOf(facts, "nothing new past what the other pages say");
  return {
    t,
    tool: "read_page",
    why: p.products ? "Reading the product catalogue" : `Reading ${label}`,
    status: p.state,
    callIds: [],
    summary: p.state === "ok" ? plural(facts.length, "fact") : "",
    line: p.state === "ok" ? `Read ${label}: ${what}` : undefined,
    under,
    source: { label: whereLabel({ kind: "website", ref: p.url }), url: p.url },
    found: facts.slice(0, 5).map((f) => f.text),
  };
}

/** Which option of a conflict is in use: the founder's pick, else Athena's. */
export const inUse = (c: Conflict, settled: Record<string, number>) => {
  const p = settled[c.id];
  return Number.isInteger(p) && p >= 0 && p < c.options.length ? p : c.recommended;
};

export async function buildKnowledge(input: KnowledgeInput, emit: (e: AgentEvent) => void): Promise<Known> {
  const t0 = Date.now();
  /** A step shown running, then done with its summary and the sentence the transcript tells it in. */
  const step = async <T,>(tool: string, why: string, source: AgentEvent["source"], run: () => Promise<T>, done: (r: T) => { summary: string; line?: string; status?: AgentEvent["status"] }): Promise<T> => {
    emit({ t: Date.now() - t0, tool, why, status: "running", callIds: [], summary: "", source });
    const r = await run();
    const d = done(r);
    emit({ t: Date.now() - t0, tool, why, status: d.status ?? "ok", callIds: [], summary: d.summary, line: d.line, source });
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
        { label: u.name },
        async (): Promise<Read> => {
          const x = doc.text || doc.parts.length ? await readUpload(input.ws!, doc) : { facts: [], rounds: 0, added: 0, clean: true, ms: 0 };
          const facts = toFacts(doc, x);
          return { facts, coverage: { source: u.name, facts: facts.length, added: x.added, clean: x.clean }, stockists: doc.stockists };
        },
        (r) => ({
          summary: `${plural(r.facts.length, "fact")}${r.stockists?.length ? ` and ${plural(r.stockists.length, "stockist")}` : ""}, each with where it is; ${covered(r.coverage)}`,
          line: `Read ${u.name}: ${firstOf(r.facts, `${plural(r.facts.length, "fact")}${r.stockists?.length ? ` and ${plural(r.stockists.length, "stockist")}` : ""}`)}`,
        }),
      );
    }),
    ...(input.pasted
      ? [
          step(
            "read_summary",
            "Reading your AI summary",
            { label: PASTED },
            async (): Promise<Read> => {
              const doc = pastedDoc(PASTED, input.pasted!);
              const x = await extractDoc(doc, { scope: input.ws ?? "pasted" });
              const facts = toFacts(doc, x);
              return { facts, coverage: { source: PASTED, facts: facts.length, added: x.added, clean: x.clean } };
            },
            (r) => ({ summary: `${plural(r.facts.length, "fact")}, each with its line; ${covered(r.coverage)}`, line: `Read your AI summary: ${firstOf(r.facts, plural(r.facts.length, "fact"))}` }),
          ),
        ]
      : []),
    ...input.websites.slice(0, 2).map((w) => {
      const host = w.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
      const why = `Reading ${host}`;
      const source = { label: host, url: w };
      // The site's own progress, and each page as a line under it (§23.2 step 7.2d).
      const status = (summary: string) => emit({ t: Date.now() - t0, tool: "read_website", why, status: "running", callIds: [], summary, source });
      const page = (p: PageRead) => emit(pageEvent(p, why, Date.now() - t0));
      return step(
        "read_website",
        why,
        source,
        async (): Promise<Read> => {
          const s = await readSite(w, { status, page });
          return { facts: s.facts, coverage: s.coverage, pages: s.pages };
        },
        (r) => ({
          summary: `${plural(r.facts.length, "fact")}, each with its page; ${covered(r.coverage)}`,
          line: r.facts.length ? `Read ${host}: ${plural(r.facts.length, "fact")}${r.pages ? ` across ${plural(r.pages, "page")}` : ""}` : `Read ${host}: it shows little to a reader, so I'll lean on your other sources`,
          status: r.facts.length ? "ok" : "thin",
        }),
      ).catch(() => undefined);
    }),
  ];
  const done = (await Promise.all(reads)).filter((r): r is Read => !!r);
  const facts = done.flatMap((r) => r.facts);

  // Compared before any strike, so a struck fact never changes what merged or which ids the conflicts have.
  const compared =
    facts.length > 1
      ? await step(
          "compare",
          "Putting it all together",
          undefined,
          () => compareFacts(facts),
          (m) => ({
            summary: `${plural(m.facts.length, "fact")} after merging what said the same thing${m.conflicts.length ? `; ${plural(m.conflicts.length, "place")} where your sources disagree, for you to settle` : ""}`,
            line: `Put it all together: ${plural(m.facts.length, "fact")}${m.conflicts.length ? `, and ${plural(m.conflicts.length, "place")} where your sources disagree, for you to settle` : ", and your sources agree"}`,
          }),
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
