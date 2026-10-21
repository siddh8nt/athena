import { getQloo } from "@/lib/qloo";
import { readEnv } from "@/lib/env";
import { llmConfigured } from "@/lib/llm/vertex";
import { LIMITS, clientIp } from "@/lib/limits";
import { planStream } from "@/lib/agent/server-deps";
import { runAgent, type AgentStreamEvent } from "@/lib/agent/loop";
import { ONBOARD_BUDGET, ONBOARD_SYSTEM, briefFinisher, knownGiven, lookupGiven, onboardIntro, onboardTools, type OnboardInput } from "@/lib/agent/onboard";
import { Checklist } from "@/lib/agent/checklist";
import { sortInput } from "@/lib/agent/sort";
import { lookAround } from "@/lib/agent/look-around";
import { buildKnowledge, type KnowledgeInput } from "@/lib/knowledge/build";
import { listUploads, validWorkspace } from "@/lib/knowledge/uploads";
import { quickBrief } from "@/lib/brief/quick";
import type { AgentEvent } from "@/lib/blocks/types";
import { isResolution, keptOptions, whereLabel, type Settled, type Settlement } from "@/lib/knowledge/types";
import { agentTurn, lookUpBrand } from "@/lib/brief/agent";
import { readBrief, readFiles } from "@/lib/brief/form";
import { safeUrl } from "@/lib/agent/intake";
import { emptyBrief, mergeBrief, type BrandBrief } from "@/lib/brief/types";
import { dated } from "@/lib/time/now";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Onboarding (PRD §23.2 step 3): a website, files, or a summary from the founder's own AI assistant go in; the
// agent's steps stream back as server-sent events, then the brief, every fact with its source. Files arrive as kept
// uploads (by workspace and hash, §23.2 step 4): code reads every source into located facts and compares them, the
// founder sees what was kept, and the agent works from those facts. Steering, answers, strikes and settled conflicts
// re-run it with the brief so far.
//
// The one box (§23.2 step 7.2): what the founder typed or pasted (`said`) is sorted by the model, which also writes
// the plan for the checklist. Then the work runs at once (§23.4 item 5, methods 1–2): the full read, page by page; a
// first brief from the home and About pages; and, once the name is known, the Qloo lookup and a web search. The agent
// starts from all of it.

const clip = (v: FormDataEntryValue | null, n: number) => (typeof v === "string" ? v.slice(0, n).trim() : "");

const json = <T,>(v: FormDataEntryValue | null, n: number, fallback: T): T => {
  try {
    return (JSON.parse(clip(v, n) || "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
};

/** The kept files, strikes and settled conflicts the browser sends. */
function readKnowledgeInput(form: FormData, input: OnboardInput): KnowledgeInput {
  const ws = clip(form.get("ws"), 64);
  const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length <= 80).slice(0, n) : []);
  const settledRaw = json<Record<string, unknown>>(form.get("settled"), 8_000, {});
  // An option's index, or the founder's own answer as the model read it.
  const settlement = (v: unknown): Settlement | undefined => {
    if (Number.isInteger(v)) return v as number;
    if (!isResolution(v)) return undefined;
    const keep = v.keep.filter((i) => Number.isInteger(i)).slice(0, 10);
    return v.fact.trim() ? { keep, fact: v.fact.trim().slice(0, 400), said: typeof v.said === "string" ? v.said.slice(0, 400) : "" } : undefined;
  };
  const settled: Settled = Object.fromEntries(
    Object.entries(typeof settledRaw === "object" && !Array.isArray(settledRaw) ? settledRaw : {})
      .flatMap(([k, v]) => {
        const s = k.length <= 80 ? settlement(v) : undefined;
        return s === undefined ? [] : [[k, s] as const];
      })
      .slice(0, 50),
  );
  return {
    ws: validWorkspace(ws) ? ws : undefined,
    hashes: strs(json(form.get("hashes"), 4_000, []), 40).filter((h) => /^[0-9a-f]{64}$/.test(h)),
    websites: input.websites,
    pasted: input.pasted,
    struck: strs(json(form.get("struck"), 20_000, []), 500),
    settled,
  };
}

function readInput(form: FormData, files: OnboardInput["files"]): OnboardInput {
  const websites = clip(form.get("websites"), 600)
    .split(/[\s,]+/)
    .map((u) => safeUrl(u))
    .filter((u): u is string => !!u)
    .slice(0, 3);
  let answers: OnboardInput["answers"] = [];
  try {
    const raw = JSON.parse(clip(form.get("answers"), 4000) || "[]") as { question?: unknown; answer?: unknown }[];
    answers = (Array.isArray(raw) ? raw : [])
      .filter((a) => typeof a?.question === "string" && typeof a?.answer === "string")
      .map((a) => ({ question: (a.question as string).slice(0, 300), answer: (a.answer as string).slice(0, 300) }))
      .slice(0, 6);
  } catch {
    answers = [];
  }
  const brief = readBrief(form.get("brief") as string | null);
  return {
    name: clip(form.get("name"), 120) || brief.name?.value,
    websites,
    files,
    pasted: clip(form.get("pasted"), 30_000) || undefined,
    steer: clip(form.get("steer"), 1000) || undefined,
    answers,
    brief: brief.name || brief.sells ? brief : undefined,
  };
}

export const POST = dated(async function post(req: Request) {
  const form = await req.formData().catch(() => undefined);
  if (!form) return Response.json({ error: "Expected a form" }, { status: 400 });
  const cap = LIMITS.brief(clientIp(req));
  const qloo = getQloo();
  return planStream<AgentStreamEvent>(async (send) => {
    if (!cap.ok) {
      send({ type: "event", event: { t: 0, tool: "plan", why: "Onboarding is paused for a moment", status: "needs_input", callIds: [], summary: cap.message } });
      return;
    }
    const input = readInput(form, await readFiles(form));
    const said = clip(form.get("said"), 30_000);
    const kb = readKnowledgeInput(form, input);
    if (!said && !input.websites.length && !input.files.length && !kb.hashes.length && !input.pasted && !input.brief && !input.steer) {
      send({ type: "event", event: { t: 0, tool: "plan", why: "Give Athena a website, a file or your AI summary to start", status: "needs_input", callIds: [], summary: "" } });
      return;
    }

    // The brief always carries a Qloo lookup: when the agent didn't settle one, code does it before sending. The
    // first brief doesn't: the lookup is already running beside it.
    const withLookup = async (brief: BrandBrief) => {
      if (brief.name?.value && !brief.qloo?.match && brief.qloo?.looked !== brief.name.value) brief.qloo = (await lookUpBrand(qloo, brief).catch(() => brief.qloo)) ?? brief.qloo;
      return brief;
    };
    const relay = async (e: AgentStreamEvent) => {
      if (e.type === "brief" && !e.early) e = { ...e, brief: await withLookup(e.brief) };
      send(e);
    };
    // Events after the brief wait for its lookup, so "done" never overtakes it.
    let queue = Promise.resolve();
    const ordered = (e: AgentStreamEvent) => {
      queue = queue.then(() => relay(e));
    };
    // The checklist ticks itself off the run's own events, and is sent again whenever it changes.
    let plan: Checklist | undefined;
    const sendPlan = () => plan && ordered({ type: "checklist", items: plan.items() });
    const out = (e: AgentStreamEvent) => {
      ordered(e);
      if (!plan) return;
      if (e.type === "event" && (plan.track(e.event) || (e.event.tool === "update_plan" && e.event.status !== "running"))) sendPlan();
      if (e.type === "brief" && !e.early) {
        plan.finish(e.brief.name?.value ? `${e.brief.name.value}, every fact with its source` : undefined);
        sendPlan();
      }
    };
    const t0 = Date.now();
    const emit = (e: Omit<AgentEvent, "t">) => out({ type: "event", event: { ...e, t: Date.now() - t0 } });

    // The one box, read by the model: websites, a summary to read as a source, or the founder's own words (s1). Files
    // dropped on their own still get a plan, on the first run.
    if ((said || (!input.brief && (input.files.length || kb.hashes.length))) && llmConfigured()) {
      const why = "Reading what you gave me";
      emit({ tool: "sort", why, status: "running", callIds: [], summary: "" });
      const names = [...input.files.map((f) => f.name), ...(kb.ws ? (await listUploads(kb.ws).catch(() => [])).filter((u) => kb.hashes.includes(u.hash)).map((u) => u.name) : [])];
      const sorted = await sortInput({ said, files: names, websites: input.websites, brief: input.brief }).catch(() => undefined);
      const text = said ? (sorted?.text ?? "notes") : "none";
      input.websites = [...new Set([...input.websites, ...(sorted?.websites ?? [])])].slice(0, 3);
      // The founder's own words are their source; past the steering box's length, they're read as a document.
      if (text === "ai_summary" || (text === "notes" && said.length > 1000)) input.pasted = [input.pasted, said].filter(Boolean).join("\n\n").slice(0, 30_000);
      else if (text === "notes") input.steer = [input.steer, said].filter(Boolean).join("\n").slice(0, 1000);
      input.name ||= sorted?.name;
      kb.websites = input.websites;
      kb.pasted = input.pasted;
      out({ type: "sorted", websites: input.websites, pasted: input.pasted, steer: input.steer });
      const parts = [
        ...input.websites.map((w) => `your website ${w.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}`),
        names.length ? (names.length === 1 ? names[0] : `${names.length} files`) : "",
        text === "ai_summary" || said.length > 1000 ? "a written summary to read" : text === "notes" ? "your notes" : "",
      ].filter(Boolean);
      emit({ tool: "sort", why, status: "ok", callIds: [], summary: parts.join(", "), line: `Sorted what you gave me: ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] ?? "your note"}` });
      if (sorted?.plan.length) {
        plan = new Checklist(sorted.plan);
        sendPlan();
      }
    } else if (said) input.steer = [input.steer, said].filter(Boolean).join("\n").slice(0, 1000);

    // The fallback, and the run without a model: the one-pass reader the brief chat used.
    const fallback = async () => {
      const read = (input.known ?? []).flatMap((k) => k.facts.map((f) => `- ${f.text} [${f.where.map(whereLabel).join("; ")}]`));
      const told = [
        read.length ? `What I read from what you gave me:\n${read.join("\n").slice(0, 40_000)}` : "",
        input.websites.length ? `Website: ${input.websites.join(", ")}` : "",
        input.pasted ? `My AI assistant's summary of my business:\n${input.pasted}` : "",
        input.steer ?? "",
        ...(input.answers ?? []).map((a) => `${a.question} ${a.answer}`),
      ]
        .filter(Boolean)
        .join("\n\n");
      let brief = input.brief ?? emptyBrief();
      if (llmConfigured()) brief = mergeBrief(brief, (await agentTurn(brief, [], told, input.files)).patch).brief;
      const listed = [...input.files.map((f) => ({ ref: f.name, list: f.stockists })), ...(input.stockists ?? [])];
      brief = mergeBrief(brief, { stockists: listed.flatMap((f) => f.list.map((s) => ({ value: s, source: { kind: "file" as const, ref: f.ref } }))) }).brief;
      out({ type: "event", event: { t: 0, tool: "plan", why: "Read what you gave me", status: "ok", callIds: [], summary: brief.name?.value ?? "" } });
      out({ type: "brief", brief, assumptions: [], dropped: 0 });
    };

    if (qloo.mode !== "live" || !llmConfigured()) {
      await fallback();
      await queue;
      return;
    }
    const env = readEnv();
    const site = input.websites[0];
    // Everything given, read into facts and compared, page by page for a site; the founder sees what was kept.
    // If the reading itself breaks, the agent still reads the site and summary with its own tools.
    const reading = kb.hashes.length || input.pasted || input.websites.length ? buildKnowledge(kb, (event) => out({ type: "event", event })).catch(() => undefined) : Promise.resolve(undefined);
    // Answer first, finish later: a first brief from the home and About pages while the full read goes on.
    const quick = site && !input.brief
      ? (async () => {
          const why = "Writing a first brief from your home and About pages";
          const source = { label: site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), url: site };
          emit({ tool: "quick_brief", why, status: "running", callIds: [], summary: "", source });
          const q = await quickBrief(site).catch(() => undefined);
          if (q) out({ type: "brief", brief: q.brief, assumptions: [], dropped: 0, early: true });
          const b = q?.brief;
          const found = b ? [b.name && `Name: ${b.name.value}`, b.sells && `Sells: ${b.sells.value}`, b.channels && `Sold: ${b.channels.value}`, b.tierHint && `Tier: ${b.tierHint.value}`].filter((x): x is string => !!x) : [];
          emit({ tool: "quick_brief", why, status: b ? "ok" : "thin", callIds: [], summary: found.join("; "), source, found, line: b ? `Wrote a first brief: ${(b.sells?.value ?? b.name?.value ?? "").replace(/[.;:,\s]+$/, "")}; the full read keeps adding to it` : "The first pages say little on their own; the full read will fill in the brief" });
          return q;
        })()
      : Promise.resolve(undefined);
    // At the same time: the Qloo lookup and a web search, as soon as the name is known.
    const looking = (input.name ? Promise.resolve(input.name) : quick.then((q) => q?.brief.name?.value)).then((name) => (name ? lookAround(name, site, { qloo, env }, emit) : [])).catch(() => []);
    const [k, lookups] = await Promise.all([reading, looking, quick]);
    if (k) {
      out({ type: "knowledge", knowledge: k.knowledge, settled: k.settled });
      input.known = k.sources;
      input.stockists = k.stockists;
      input.conflicts = k.knowledge.conflicts.map((c) => {
        const s = k.settled[c.id];
        const keep = keptOptions(c, s);
        const others = c.options.filter((_, j) => !keep.includes(j)).map((o) => o.value);
        // The founder's own answer, as the model read it, is the value in use.
        if (isResolution(s)) return { about: c.about, value: s.fact, facts: keep.flatMap((j) => c.options[j].facts), chosen: true, answered: true, others };
        return { about: c.about, value: c.options[keep[0]].value, facts: c.options[keep[0]].facts, chosen: kb.settled[c.id] === keep[0], others };
      });
    }
    input.lookups = lookups;
    // Where the sources disagree, the founder chooses before the brief is written, so it's built on their answer.
    if (k?.knowledge.conflicts.some((c) => kb.settled[c.id] === undefined)) {
      await queue;
      return;
    }
    const founder = input.steer || input.answers?.length;
    await runAgent({
      goal: input.brief ? "Update the brief with what you told me" : `Understand ${input.name || "your brand"} and write its brief`,
      brand: { name: input.name || "the brand", websites: input.websites },
      system: ONBOARD_SYSTEM,
      intro: onboardIntro(input, ONBOARD_BUDGET, !!founder, plan),
      finisher: briefFinisher(input),
      given: [...(founder ? [{ tool: "founder", summary: "What you told me", data: { steering: input.steer, answers: input.answers } }] : []), ...knownGiven(input), ...lookupGiven(input)],
      budget: ONBOARD_BUDGET,
      tools: onboardTools(input, { plan }),
      // Onboarding may ask a little more than a specialist run: a brand with little online leaves more that only the founder
      // knows. A question pauses the run; the brief is written once the founder has answered.
      state: { maxAsks: 4, waits: true },
      qloo,
      env,
      send: out,
      fallback,
    });
    await queue;
  }, qloo.mode);
});
