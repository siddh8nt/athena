import { readFileSync } from "node:fs";
import { it } from "vitest";
import { BENCH_BRANDS } from "@/lib/bench/truth";
import { emptyBrief, type BrandBrief } from "@/lib/brief/types";
import { allNodes } from "@/lib/graph/build";
import { PREVIEW_AT, applyEdit, emptyGraphState, previewLine, previewOf, type Op } from "@/lib/graph/edit";
import { READS, staleLine, type RunId } from "@/lib/graph/stale";
import type { GraphInput } from "@/lib/graph/types";

// Usage: GRAPH_BRAND="Your Brand" GRAPH_SELLS="what it sells" pnpm live tests/live/brand-graph.live.ts (§23.2 step 7's
// live check). Sends a few chat edits to /api/graph, applies what comes back as the journey would, and prints each
// edit's ops, questions, reply, note and the runs it holds; then one graph-side addition through the resolver.
// GRAPH_COMPARABLE names a brand to add (default: none, so no Qloo search). About 5 model calls and a few Qloo
// searches. Held-out Bench brands are refused before any call.
for (const l of readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
}

const brand = process.env.GRAPH_BRAND?.trim();
if (!brand) throw new Error('Set GRAPH_BRAND, e.g. GRAPH_BRAND="Your Brand" pnpm live tests/live/brand-graph.live.ts');
const comparable = process.env.GRAPH_COMPARABLE?.trim();

// Bench integrity: no held-out brand is run here, as the brand or the comparable.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const named = [brand, comparable].filter((v): v is string => !!v).map(norm);
const held = BENCH_BRANDS.filter((b) => !b.tuning && named.some((n) => n === norm(b.name) || n === norm(b.slug)));
if (held.length) throw new Error(`Held-out Bench brands are never run here: ${held.map((b) => b.name).join(", ")}`);

// Nothing secret reaches the log.
const secrets = Object.entries(process.env).filter(([k, v]) => /KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i.test(k) && v && v.length >= 8).map(([, v]) => v!);
const redact = (s: string) => secrets.reduce((x, v) => x.split(v).join("[redacted]"), s);
const log = (...xs: unknown[]) => console.log(redact(xs.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")));

const MESSAGES = [
  "We're more premium than that, and we mostly sell online.",
  ...(comparable ? [`Add ${comparable} as a brand like us.`] : []),
  "We also sell at a shop called Corner Larder.",
  "Which crowd should we win first?",
  "We want to grow in Austin, Denver, Chicago, Boston, Atlanta, Miami, Seattle, Phoenix and Nashville.",
];
const RAN = Object.keys(READS) as RunId[];

it("reads chat edits into the right changes, with questions where it's unsure", { timeout: 300_000 }, async () => {
  const route = await import("@/app/api/graph/route");
  const say = { value: brand, source: { kind: "message" as const } };
  let input: GraphInput = { brief: { ...emptyBrief(), name: say, ...(process.env.GRAPH_SELLS ? { sells: { ...say, value: process.env.GRAPH_SELLS } } : {}), tierHint: { value: "mainstream", source: { kind: "inferred" } } } as BrandBrief, facts: [] };
  let state = emptyGraphState();
  const post = async (body: object) => {
    const nodes = allNodes(input).nodes.map((n) => ({ id: n.id, type: n.type, label: n.label }));
    const res = await route.POST(new Request("http://localhost/api/graph", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "live-graph" }, body: JSON.stringify({ ...body, brief: input.brief, nodes }) }));
    return (await res.json()) as { ops: Op[]; questions: { question: string; options: { label: string }[] }[]; reply: string; calls: number };
  };
  const take = (ops: Op[]) => {
    const p = previewOf(input, state, ops);
    if (p.count > PREVIEW_AT) log(`  preview: ${previewLine(p)}`);
    const a = applyEdit(input, state, ops, { by: "chat", ran: RAN });
    if (!a) return log("  (no change)");
    input = { ...input, brief: a.brief, facts: a.facts };
    state = a.state;
    log(`  note: ${a.edit.note}`);
    log(`  changed: ${a.edit.changed.join(", ")}`);
    for (const [run, h] of Object.entries(a.state.held)) log(`  flag: ${staleLine(run as RunId, h!)}`);
  };
  for (const message of MESSAGES) {
    log(`\nfounder: ${message}`);
    const r = await post({ message, history: [] });
    log(`  athena: ${r.reply}`);
    log(`  ops: ${JSON.stringify(r.ops)}`);
    for (const q of r.questions) log(`  question: ${q.question} [${q.options.map((o) => o.label).join(" | ")}]`);
    log(`  qloo calls: ${r.calls}`);
    take(r.ops);
  }
  log("\ngraph: add a city by typing “portland”");
  const r = await post({ ops: [{ op: "add", type: "city", value: "portland" }] });
  log(`  ops: ${JSON.stringify(r.ops)}`);
  for (const q of r.questions) log(`  question: ${q.question} [${q.options.map((o) => o.label).join(" | ")}]`);
});
