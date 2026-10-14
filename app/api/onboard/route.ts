import { getQloo } from "@/lib/qloo";
import { readEnv } from "@/lib/env";
import { llmConfigured } from "@/lib/llm/vertex";
import { LIMITS, clientIp } from "@/lib/limits";
import { planStream } from "@/lib/agent/server-deps";
import { runAgent, type AgentStreamEvent } from "@/lib/agent/loop";
import { ONBOARD_BUDGET, ONBOARD_SYSTEM, briefFinisher, knownGiven, onboardIntro, onboardTools, type OnboardInput } from "@/lib/agent/onboard";
import { buildKnowledge, type KnowledgeInput } from "@/lib/knowledge/build";
import { validWorkspace } from "@/lib/knowledge/uploads";
import { whereLabel } from "@/lib/knowledge/types";
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
  const settled = Object.fromEntries(
    Object.entries(typeof settledRaw === "object" && !Array.isArray(settledRaw) ? settledRaw : {})
      .filter(([k, v]) => k.length <= 80 && Number.isInteger(v))
      .slice(0, 50),
  ) as Record<string, number>;
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
    const kb = readKnowledgeInput(form, input);
    if (!input.websites.length && !input.files.length && !kb.hashes.length && !input.pasted && !input.brief && !input.steer) {
      send({ type: "event", event: { t: 0, tool: "plan", why: "Give Athena a website, a file or your AI summary to start", status: "needs_input", callIds: [], summary: "" } });
      return;
    }

    // The brief always carries a Qloo lookup: when the agent didn't settle one, code does it before sending.
    const withLookup = async (brief: BrandBrief) => {
      if (brief.name?.value && !brief.qloo?.match && brief.qloo?.looked !== brief.name.value) brief.qloo = (await lookUpBrand(qloo, brief).catch(() => brief.qloo)) ?? brief.qloo;
      return brief;
    };
    const relay = async (e: AgentStreamEvent) => {
      if (e.type === "brief") e = { ...e, brief: await withLookup(e.brief) };
      send(e);
    };
    // Events after the brief wait for its lookup, so "done" never overtakes it.
    let queue = Promise.resolve();
    const ordered = (e: AgentStreamEvent) => {
      queue = queue.then(() => relay(e));
    };

    // The fallback, and the run without a model: the one-pass reader the brief chat used.
    const fallback = async () => {
      const read = (input.known ?? []).flatMap((k) => k.facts.map((f) => `- ${f.text} [${f.where.map(whereLabel).join("; ")}]`));
      const said = [
        read.length ? `What I read from what you gave me:\n${read.join("\n").slice(0, 40_000)}` : "",
        input.websites.length ? `Website: ${input.websites.join(", ")}` : "",
        input.pasted ? `My AI assistant's summary of my business:\n${input.pasted}` : "",
        input.steer ?? "",
        ...(input.answers ?? []).map((a) => `${a.question} ${a.answer}`),
      ]
        .filter(Boolean)
        .join("\n\n");
      let brief = input.brief ?? emptyBrief();
      if (llmConfigured()) brief = mergeBrief(brief, (await agentTurn(brief, [], said, input.files)).patch).brief;
      const listed = [...input.files.map((f) => ({ ref: f.name, list: f.stockists })), ...(input.stockists ?? [])];
      brief = mergeBrief(brief, { stockists: listed.flatMap((f) => f.list.map((s) => ({ value: s, source: { kind: "file" as const, ref: f.ref } }))) }).brief;
      ordered({ type: "event", event: { t: 0, tool: "plan", why: "Read what you gave me", status: "ok", callIds: [], summary: brief.name?.value ?? "" } });
      ordered({ type: "brief", brief, assumptions: [], dropped: 0 });
    };

    if (qloo.mode !== "live" || !llmConfigured()) {
      await fallback();
      await queue;
      return;
    }
    // Everything given, read into facts and compared before the agent starts; the founder sees what was kept.
    if (kb.hashes.length || input.pasted || input.websites.length) {
      // If the reading itself breaks, the agent still reads the site and summary with its own tools.
      const k = await buildKnowledge(kb, (event) => ordered({ type: "event", event })).catch(() => undefined);
      if (k) {
        ordered({ type: "knowledge", knowledge: k.knowledge, settled: k.settled });
        input.known = k.sources;
        input.stockists = k.stockists;
        input.conflicts = k.knowledge.conflicts.map((c) => {
          const i = k.settled[c.id];
          return { about: c.about, value: c.options[i].value, facts: c.options[i].facts, chosen: kb.settled[c.id] === i, others: c.options.filter((_, j) => j !== i).map((o) => o.value) };
        });
      }
    }
    const founder = input.steer || input.answers?.length;
    await runAgent({
      goal: input.brief ? "Update the brief with what you told me" : `Understand ${input.name || "your brand"} and write its brief`,
      brand: { name: input.name || "the brand", websites: input.websites },
      system: ONBOARD_SYSTEM,
      intro: onboardIntro(input, ONBOARD_BUDGET, !!founder),
      finisher: briefFinisher(input),
      given: [...(founder ? [{ tool: "founder", summary: "What you told me", data: { steering: input.steer, answers: input.answers } }] : []), ...knownGiven(input)],
      budget: ONBOARD_BUDGET,
      tools: onboardTools(input),
      qloo,
      env: readEnv(),
      send: ordered,
      fallback,
    });
    await queue;
  }, qloo.mode);
});
