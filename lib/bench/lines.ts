import summary from "@/proof/bench/results/summary.json";

// The Taste Bench's quiet line under each stop that has a Bench task (§10.6, §13.2), read from the committed held-out
// results (prereg-v2), cold start. Every line carries Gemini's number, so a With / Without split never implies more
// than the Bench measured. Pure: safe in client components.

export type BenchTask = "t1" | "t2" | "t3";

type Row = { athena: number; other: number; n: number };
const rows = summary.comparisons as Record<string, Row | undefined>;

/** The other arm's score in one cold-start comparison, and Athena's (the same in every row of a task). */
function arm(task: BenchTask, metric: string, other: string): Row | undefined {
  return rows[`PRIMARY ${task} ${metric}: Athena − ${other} (cold)`] ?? rows[`${task} ${metric}: Athena − ${other} (cold)`];
}

const f = (x: number | undefined) => (x === undefined ? "—" : x.toFixed(2).replace(/^-/, "−"));

const TASKS: Record<BenchTask, { metric: string; label: string; what: (n: number) => string; naive: boolean }> = {
  t1: { metric: "rho", label: "ρ", what: (n) => `Where to launch, ranked against real stockist density for ${n} held-out brands`, naive: true },
  t2: { metric: "auc", label: "AUC", what: (n) => `Which retailer next, against where ${n} held-out brands are really stocked`, naive: true },
  t3: { metric: "auc", label: "AUC", what: (n) => `Which venues, against ${n} held-out brands' real stockists`, naive: false },
};

export type BenchLine = { text: string; athena: number; gemini: number; geminiSearch?: number; n: number };

/** The line for one task; undefined if the results don't hold it. */
export function benchLine(task: BenchTask): BenchLine | undefined {
  const t = TASKS[task];
  const llm = arm(task, t.metric, "LLM-only");
  const search = arm(task, t.metric, "LLM + Search");
  const pop = arm(task, t.metric, "popularity");
  const naive = t.naive ? arm(task, t.metric, "Qloo-naive") : undefined;
  if (!llm || !pop) return undefined;
  const parts = [`Athena ${t.label} ${f(llm.athena)}`, ...(naive ? [`one raw Qloo call ${f(naive.other)}`] : []), `popularity ${f(pop.other)}`, `Gemini alone ${f(llm.other)}${search ? ` (with Search ${f(search.other)})` : ""}`];
  return { text: `${t.what(llm.n)}, cold start: ${parts.join(" · ")}.`, athena: llm.athena, gemini: llm.other, geminiSearch: search?.other, n: llm.n };
}

export type BenchTable = { task: BenchTask; question: string; metric: string; n: number; athena: number; naive?: number; popularity?: number; gemini?: number; geminiSearch?: number }[];

/** Every arm, cold start, for the Method page's Bench table. */
export function benchTable(): BenchTable {
  return (Object.keys(TASKS) as BenchTask[]).flatMap((task) => {
    const t = TASKS[task];
    const llm = arm(task, t.metric, "LLM-only");
    if (!llm) return [];
    const question = { t1: "Where to launch (25 metros vs stockists per resident)", t2: "Which retailer next (vs where the brand is stocked)", t3: "Which venues (real stockists vs matched look-alikes)" }[task];
    return [{ task, question, metric: t.label, n: llm.n, athena: llm.athena, naive: arm(task, t.metric, "Qloo-naive")?.other, popularity: arm(task, t.metric, "popularity")?.other, gemini: llm.other, geminiSearch: arm(task, t.metric, "LLM + Search")?.other }];
  });
}

/** The registered primary comparisons (prereg-v2), with their paired differences and the pass rule's verdict. */
export function benchPrimaries(): { label: string; n: number; diff: number; lo: number; hi: number; pass: boolean }[] {
  return Object.entries(summary.comparisons as Record<string, { n: number; diff: number; lo: number; hi: number; pass: boolean }>)
    .filter(([k]) => k.startsWith("PRIMARY "))
    .map(([k, v]) => ({
      label: k
        .replace(/^PRIMARY /, "")
        .replace(/ \(cold\)$/, "")
        .replace(/^t1 rho:/, "Where to launch (ρ):")
        .replace(/^t2 auc:/, "Which retailer next (AUC):")
        .replace(/^t3 auc:/, "Which venues (AUC):")
        .replace("Qloo-naive", "one raw Qloo call"),
      ...v,
    }));
}
