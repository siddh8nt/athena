import { getQloo } from "@/lib/qloo";
import { readEnv } from "@/lib/env";
import { llmConfigured } from "@/lib/llm/vertex";
import { LIMITS, clientIp } from "@/lib/limits";
import { planStream, teamEnrich } from "@/lib/agent/server-deps";
import { readFits, readSeed, strs } from "@/lib/agent/inputs";
import { buildCtx } from "@/lib/agent/team-ctx";
import { athenaAsk, customGoal, goalFacts, proposeFor, runTeam } from "@/lib/agent/team";
import { goalQuestion } from "@/lib/agent/goals";
import { readBrief } from "@/lib/brief/form";
import { cachedCrowds } from "@/lib/taste/engine";
import { MAX_EXTRA } from "@/lib/taste/graph";
import { readGoals, readTeam } from "@/lib/team/read";
import type { Goal, TeamEvent } from "@/lib/team/types";
import { dated } from "@/lib/time/now";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Athena and her six specialists (PRD §23.2 step 8). One route, five actions:
//   propose: Athena reads the Brand Graph and proposes 3–5 goals, as a question the founder picks from;
//   custom:  a goal the founder typed, split into the part the team can do and the part it can't;
//   run:     the picked goals become work for the specialists, 2–3 at once, streamed per specialist;
//   ask:     a small ask Athena answers herself, with every tool;
//   analyst: "Ask the Analyst about this" from the Galaxy, which may probe, and re-runs what a changed crowd touches.
// The client holds the team's state and sends it back each time (outcome marks included). Past the run limit, or
// without a model, the specialists decide by code's evidence rules: the same tools, never an error.

const ACTIONS = ["propose", "custom", "run", "ask", "analyst"] as const;
type Action = (typeof ACTIONS)[number];

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export const POST = dated(async function post(req: Request) {
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action: Action = (ACTIONS as readonly string[]).includes(raw.action as string) ? (raw.action as Action) : "propose";
  const seed = readSeed(raw.seed);
  const probes = strs(raw.probes, MAX_EXTRA).filter((p) => /^[\w:-]{1,80}$/.test(p));
  const brief = raw.brief ? readBrief(JSON.stringify(raw.brief)) : undefined;
  const fits = readFits(raw.fits);
  const team = readTeam(raw.team);
  const graphRev = typeof raw.graphRev === "number" && Number.isFinite(raw.graphRev) ? raw.graphRev : 0;
  const text = str(raw.text, 600);
  const asked = raw.asked && typeof raw.asked === "object" ? (raw.asked as Record<string, unknown>) : undefined;
  const answers = (Array.isArray(raw.answers) ? raw.answers : [])
    .map((a) => ({ question: str((a as Record<string, unknown>)?.question, 200), answer: str((a as Record<string, unknown>)?.answer, 200) }))
    .filter((a) => a.question && a.answer)
    .slice(0, 8);
  const qloo = getQloo();
  // Proposing and splitting goals are one small model call each; runs and asks count against the team's limit.
  const cap = action === "propose" || action === "custom" ? { ok: true } : LIMITS.team(clientIp(req));
  const llm = cap.ok && qloo.mode === "live" && llmConfigured();

  return planStream<TeamEvent>(async (send) => {
    const crowds = await cachedCrowds(seed, probes);
    const t = await buildCtx({ brief, seed, crowds: crowds ?? undefined, fits, probes, team, enrich: teamEnrich(), llm, qloo, answers });
    const env = readEnv();
    const started = Date.now();
    const finish = () => send({ type: "done", qlooCalls: 0, ms: Date.now() - started });

    if (action === "propose") {
      const goals = await proposeFor(t, goalFacts(t), llm);
      send({ type: "goals", goals });
      send({ type: "ask", agent: "athena", ask: { id: "goals", ...goalQuestion(goals) } });
      return finish();
    }
    if (action === "custom") {
      const r = await customGoal(text, t, llm);
      if ("goal" in r) send({ type: "custom", goal: r.goal });
      else send({ type: "ask", agent: "athena", ask: { id: "custom", ...r.question } });
      return finish();
    }
    if (action === "ask") {
      await athenaAsk({ question: text, team: t, qloo, env, send, llm });
      return finish();
    }

    let goals: Goal[] = readGoals(raw.goals);
    if (action === "analyst") {
      const name = str(asked?.name, 120);
      const id = str(asked?.id, 80);
      t.asked = name ? { ...(id && /^[\w:-]{1,80}$/.test(id) ? { id } : {}), name } : undefined;
      t.question = text || (name ? `What does ${name} tell us about the crowds?` : undefined);
      goals = [{ id: "ask", label: t.question ?? "A question for the Analyst", why: "You asked the Analyst", team: ["analyst"], conflicts: [] }];
    }
    const before = { crowds: t.crowds, fits: t.fits, probes: t.probes.join("|") };
    let calls = 0;
    await runTeam({ goals, team: t, state: team, graphRev, qloo, env, send: (e) => (e.type === "done" ? (calls = e.qlooCalls) : send(e)), llm });
    // What the Analyst measured is the journey's to keep: the crowds, the ranking and the probes.
    if (t.crowds !== before.crowds || t.fits !== before.fits || t.probes.join("|") !== before.probes) send({ type: "memory", crowds: t.crowds, fits: t.fits, probes: t.probes });
    send({ type: "done", qlooCalls: calls, ms: Date.now() - started });
  }, qloo.mode);
});
