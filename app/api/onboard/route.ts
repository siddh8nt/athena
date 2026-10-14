import { getQloo } from "@/lib/qloo";
import { readEnv } from "@/lib/env";
import { llmConfigured } from "@/lib/llm/vertex";
import { LIMITS, clientIp } from "@/lib/limits";
import { planStream } from "@/lib/agent/server-deps";
import { runAgent, type AgentStreamEvent } from "@/lib/agent/loop";
import { ONBOARD_BUDGET, ONBOARD_SYSTEM, briefFinisher, onboardIntro, onboardTools, type OnboardInput } from "@/lib/agent/onboard";
import { agentTurn, lookUpBrand } from "@/lib/brief/agent";
import { readBrief, readFiles } from "@/lib/brief/form";
import { safeUrl } from "@/lib/agent/intake";
import { emptyBrief, mergeBrief, type BrandBrief } from "@/lib/brief/types";
import { dated } from "@/lib/time/now";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Onboarding (PRD §23.2 step 3): a website, files, or a summary from the founder's own AI assistant go in; the
// agent's steps stream back as server-sent events, then the brief, every fact with its source. Files are read in
// memory and never stored. Steering and answers re-run it with the brief so far.

const clip = (v: FormDataEntryValue | null, n: number) => (typeof v === "string" ? v.slice(0, n).trim() : "");

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
    if (!input.websites.length && !input.files.length && !input.pasted && !input.brief && !input.steer) {
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
      const said = [
        input.websites.length ? `Website: ${input.websites.join(", ")}` : "",
        input.pasted ? `My AI assistant's summary of my business:\n${input.pasted}` : "",
        input.steer ?? "",
        ...(input.answers ?? []).map((a) => `${a.question} ${a.answer}`),
      ]
        .filter(Boolean)
        .join("\n\n");
      let brief = input.brief ?? emptyBrief();
      if (llmConfigured()) brief = mergeBrief(brief, (await agentTurn(brief, [], said, input.files)).patch).brief;
      else brief = mergeBrief(brief, { stockists: input.files.flatMap((f) => f.stockists.map((s) => ({ value: s, source: { kind: "file" as const, ref: f.name } }))) }).brief;
      ordered({ type: "event", event: { t: 0, tool: "plan", why: "Read what you gave me", status: "ok", callIds: [], summary: brief.name?.value ?? "" } });
      ordered({ type: "brief", brief, assumptions: [], dropped: 0 });
    };

    if (qloo.mode !== "live" || !llmConfigured()) {
      await fallback();
      await queue;
      return;
    }
    const founder = input.steer || input.answers?.length;
    await runAgent({
      goal: input.brief ? "Update the brief with what you told me" : `Understand ${input.name || "your brand"} and write its brief`,
      brand: { name: input.name || "the brand", websites: input.websites },
      system: ONBOARD_SYSTEM,
      intro: onboardIntro(input, ONBOARD_BUDGET, !!founder),
      finisher: briefFinisher(input),
      given: founder ? [{ tool: "founder", summary: "What you told me", data: { steering: input.steer, answers: input.answers } }] : [],
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
