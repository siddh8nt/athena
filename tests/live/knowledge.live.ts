import { it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

for (const l of readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
}

// Live check of step 4's done-when at the library level: `FIXTURES=<dir> SITE=<site> pnpm live tests/live/knowledge.live.ts`.
// The fixture files are the founder's (made up for the check) and stay outside the repo.
const DIR = process.env.FIXTURES ?? "";
const SITE = process.env.SITE ?? "";

it("reads files and a site into one sourced knowledge base", async () => {
  const { readFileDoc } = await import("@/lib/knowledge/read");
  const { extractDoc, toFacts } = await import("@/lib/knowledge/extract");
  const { readSite } = await import("@/lib/knowledge/site");
  const { compareFacts } = await import("@/lib/knowledge/merge");
  const { whereLabel } = await import("@/lib/knowledge/types");
  const { countTokens } = await import("@/lib/llm/vertex");
  const log = (s: string) => console.log(`  ${s}`);
  const files = DIR ? readdirSync(DIR).filter((f) => !f.startsWith("_")) : [];
  const docs = files.map((f) => readFileDoc(f, new Uint8Array(readFileSync(path.join(DIR, f)))));
  const reads = await Promise.all([
    ...docs.map(async (d) => {
      const tokens = await countTokens({ prompt: d.text || undefined, files: d.parts.map((p) => ({ mime: p.mime, base64: Buffer.from(p.data).toString("base64") })) });
      log(`${d.ref}: ${d.status}; ${d.text.length} chars, ${d.parts.length} parts (${d.parts.map((p) => p.label).join(", ")}); TOKENS ${tokens ?? "?"}`);
      const x = await extractDoc(d, { scope: "live-test", status: log });
      return { source: d.ref, facts: toFacts(d, x), added: x.added, clean: x.clean, rounds: x.rounds, ms: x.ms };
    }),
    ...(SITE ? [readSite(SITE, { status: log }).then((s) => ({ source: s.site, facts: s.facts, added: s.coverage.added, clean: s.coverage.clean, rounds: -1, ms: s.ms, via: s.via, pages: s.pages, products: s.products }))] : []),
  ]);
  for (const r of reads) log(`COVERAGE ${r.source}: ${r.facts.length} facts, ${r.added} added by coverage, clean=${r.clean}, rounds=${r.rounds}, ${r.ms} ms`);
  const all = reads.flatMap((r) => r.facts);
  const fileFacts = all.filter((f) => f.where[0].kind === "file");
  for (const f of fileFacts) log(`FACT ${f.id} [${f.topic}] ${f.text} @ ${f.where.map(whereLabel).join("; ")}`);
  const siteFacts = all.filter((f) => f.where[0].kind !== "file");
  for (const f of siteFacts.slice(0, 25)) log(`SITE ${f.id} [${f.topic}] ${f.text} @ ${f.where.map(whereLabel).join("; ")}`);
  const t0 = Date.now();
  const m = await compareFacts(all);
  log(`MERGE ${all.length} → ${m.facts.length} facts in ${Date.now() - t0} ms; ${m.conflicts.length} conflicts`);
  for (const f of m.facts.filter((f) => f.where.length > 1)) log(`MERGED ${f.text} @ ${f.where.map(whereLabel).join("; ")}`);
  for (const c of m.conflicts) log(`CONFLICT ${c.about}: ${c.options.map((o, i) => `${i === c.recommended ? "*" : ""}${o.value} (${o.facts.map((id) => m.facts.find((f) => f.id === id)?.where.map(whereLabel).join("/")).join(", ")})`).join(" vs ")} — ${c.why}`);
  const unsourced = m.facts.filter((f) => !f.where.length || !f.where.every((w) => w.ref));
  log(`UNSOURCED ${unsourced.length}`);
}, 400_000);
