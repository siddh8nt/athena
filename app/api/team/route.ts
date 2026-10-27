import { getQloo } from "@/lib/qloo";
import { readEnv } from "@/lib/env";
import { llmConfigured } from "@/lib/llm/vertex";
import { LIMITS, clientIp } from "@/lib/limits";
import { planStream, teamEnrich } from "@/lib/agent/server-deps";
import { readFits, readSeed, strs } from "@/lib/agent/inputs";
import { buildCtx } from "@/lib/agent/team-ctx";
import { readFacts } from "@/lib/agent/inputs";
import { athenaAsk, customGoal, goalFacts, planWorkflow, proposeFor, runTeam, runWorkflow } from "@/lib/agent/team";
import { interpret } from "@/lib/agent/interpret";
import { briefFacts, chunks, readPlanView, routeMessage } from "@/lib/agent/router";
import { addStep, dropStep } from "@/lib/agent/workflow";
import { isSpecialist, type AgentId } from "@/lib/agent/specialists";
import { goalQuestion } from "@/lib/agent/goals";
import { isMetroId, metroById } from "@/lib/playbook/metros";
import { readBrief } from "@/lib/brief/form";
import { cachedCrowds, latestCrowds, rememberCrowds } from "@/lib/taste/engine";
import { MAX_EXTRA } from "@/lib/taste/graph";
import { readGoals, readTeam } from "@/lib/team/read";
import type { Goal, TeamEvent } from "@/lib/team/types";
import { dated } from "@/lib/time/now";
import { readLookups, runExec } from "@/lib/exec/contacts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Athena and her six subagents (PRD §23.2 step 8). One route, seven actions:
//   propose: Athena reads the Brand Graph and proposes 3–5 goals, as a question the founder picks from;
//   custom:  a goal the founder typed, split into the part the team can do and the part it can't;
//   plan:    Athena plans the workflow for the picked goals (§23.2 step 8.5e) and runs it, asking what only the
//            founder knows just before the step that needs it; re-posted with the workflow, it resumes;
//   run:     the specialists behind the picked goals, 2–3 at once, streamed per specialist (handoffs, re-runs);
//   interpret: a typed answer read against its question (§23.2 step 8.5h): an option, a fact, a workflow change;
//   ask:     a small ask Athena answers herself, with every tool;
//   analyst: "Ask the Analyst about this" from the Galaxy, which may probe, and re-runs what a changed crowd touches;
//   exec:    the Executive's lookups (§23.5 q): contacts and drafts for the small groups the page sends, no Qloo.
// The client holds the team's state and sends it back each time (outcome marks included). Past the run limit, or
// without a model, the specialists decide by code's evidence rules: the same tools, never an error.

const ACTIONS = ["propose", "custom", "plan", "run", "ask", "analyst", "interpret", "chat", "exec"] as const;
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
    .slice(0, 16);
  // The derived notes the founder keeps (§23.2 step 8.2e): deleted ones never arrive.
  const notes = readFacts(raw.facts);
  const qloo = getQloo();
  // Proposing and splitting goals are one small model call each; runs and asks count against the team's limit.
  const cap = action === "propose" || action === "custom" || action === "interpret" ? { ok: true } : action === "exec" ? LIMITS.exec(clientIp(req)) : LIMITS.team(clientIp(req));
  const llm = cap.ok && qloo.mode === "live" && llmConfigured();

  // The Executive's lookups use no Qloo and no team context: the page sends what each lookup needs.
  if (action === "exec") {
    const groups = readLookups(raw.groups);
    const brand = { name: brief?.name?.value ?? seed.brand?.name ?? "your brand", sells: brief?.sells?.value };
    return planStream<TeamEvent>(async (send) => {
      const started = Date.now();
      await runExec(groups, brand, send, cap.ok && llmConfigured());
      send({ type: "done", qlooCalls: 0, ms: Date.now() - started });
    }, qloo.mode);
  }

  // A typed answer (§23.2 step 8.5h): no Qloo, no context to build; one small model call, checked by code.
  if (action === "interpret") {
    const q = raw.question && typeof raw.question === "object" ? (raw.question as Record<string, unknown>) : {};
    const options = (Array.isArray(q.options) ? q.options : []).map((o) => ({ label: str((o as Record<string, unknown>)?.label, 120) })).filter((o) => o.label).slice(0, 8);
    const out = await interpret({ text, question: { question: str(q.question, 300), options }, workflow: team.workflow }, llm);
    return Response.json(out);
  }

  // A typed message (§23.2 step 8.5n): one model call decides the move. A reply streams from what the team already
  // knows, with no Qloo; only "tools" builds the context and looks again.
  const routed =
    action === "chat"
      ? routeMessage(
          {
            message: text,
            history: (Array.isArray(raw.history) ? raw.history : [])
              .map((m) => ({ who: str((m as Record<string, unknown>)?.who, 10), text: str((m as Record<string, unknown>)?.text, 600) }))
              .filter((m) => m.text)
              .slice(-30),
            page: (raw.page === "dashboard" || raw.page === "athena" || isSpecialist(raw.page) ? raw.page : undefined) as AgentId | "dashboard" | undefined,
            brand: { name: brief?.name?.value ?? "the brand", sells: brief?.sells?.value, home: brief?.activeCity?.value },
            facts: briefFacts(brief, notes.map((n) => n.text)),
            answers: [...answers, ...(team.answered ?? [])],
            team,
            open: strs(raw.open, 6, 200),
            plan: readPlanView(raw.planView),
          },
          llm,
        )
      : undefined;

  return planStream<TeamEvent>(async (send) => {
    if (routed) {
      const started = Date.now();
      const route = await routed;
      const done = () => send({ type: "done", qlooCalls: 0, ms: Date.now() - started });
      if (route.do === "reply") {
        for (const c of chunks(route.reply)) send({ type: "delta", text: c });
        send({ type: "reply", text: route.reply });
        return done();
      }
      if (route.do === "clarify") {
        if (route.reply) send({ type: "reply", text: route.reply });
        send({ type: "ask", agent: "athena", ask: { id: "clarify", question: route.question, why: "So the team works on what you mean", options: route.options, multi: false, assumed: route.options[0].label, unranked: true } });
        return done();
      }
      if (route.do !== "tools") {
        send({ type: "route", route });
        return done();
      }
      if (route.reply) send({ type: "reply", text: route.reply });
    }
    // The crowds are found by the seed and probes the page sends; when those are older than the brand's newest crowds
    // (a measure that moved the seed), the newest are used and sent back, so a finished Analyst never measures again.
    const brand = brief?.name?.value ?? seed.brand?.name ?? "";
    const exact = await cachedCrowds(seed, probes);
    const latest = exact ? undefined : await latestCrowds(brand);
    const crowds = exact ?? latest?.crowds;
    const t = await buildCtx({ brief, seed: latest?.seed ?? seed, crowds: crowds ?? undefined, fits, probes: latest?.probes ?? probes, team, enrich: teamEnrich(), llm, qloo, answers, notes });
    if (latest) send({ type: "memory", crowds: latest.crowds, seed: latest.seed, probes: latest.probes });
    const keep = () => (t.crowds?.crowds.length && t.seed ? rememberCrowds(brand, t.seed, t.probes) : undefined);
    // Every subagent reads the whole Brand Graph before it asks the founder anything (founder, 21 Oct).
    t.facts = [...briefFacts(brief, []), ...notes.map((n) => n.text), ...(team.answered ?? []).map((a) => `${a.question} ${a.answer}`)];
    // A handoff (§23.2 step 8.3b) carries what it was started from: the crowd to aim at, the crowd to win next, the city.
    const focus = raw.focus && typeof raw.focus === "object" ? (raw.focus as Record<string, unknown>) : {};
    const crowdBy = (id: string) => (id ? t.crowds?.crowds.find((c) => c.id === id) : undefined);
    const aim = crowdBy(str(focus.crowd, 40));
    const next = crowdBy(str(focus.next, 40));
    const metro = str(focus.city, 40);
    if (aim) t.crowd = aim;
    if (next) t.next = t.focusNext = next;
    if (metro && isMetroId(metro)) t.city = { id: metro, name: metroById(metro).name };
    const env = readEnv();
    t.onGalaxy = (galaxy) => send({ type: "galaxy", galaxy });
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
    if (action === "ask" || action === "chat") {
      await athenaAsk({ question: text, team: t, qloo, env, send, llm });
      return finish();
    }

    let goals: Goal[] = readGoals(raw.goals);
    if (action === "plan") {
      // The same goals resume the workflow they started; new goals, or none yet, get a new plan.
      const same = team.workflow && team.workflow.goals.join("|") === goals.map((g) => g.id).join("|");
      let workflow = same && team.workflow ? team.workflow : await planWorkflow(goals, t, llm);
      // What a typed answer changed (§23.2 step 8.5h): a subagent skipped or added, a city to work on.
      const change = raw.change && typeof raw.change === "object" ? (raw.change as Record<string, unknown>) : {};
      const have = { fits: !!t.fits?.fits.length, home: !!t.brand.homeMetro };
      for (const id of (Array.isArray(change.skip) ? change.skip : []).filter(isSpecialist)) workflow = dropStep(workflow, id, have);
      for (const id of (Array.isArray(change.add) ? change.add : []).filter(isSpecialist)) workflow = addStep(workflow, id, goals, have);
      const disagreements = strs(raw.disagreements, 6, 200);
      const before = { crowds: t.crowds, fits: t.fits, probes: t.probes.join("|") };
      let calls = 0;
      await runWorkflow({ goals, team: t, state: team, graphRev, qloo, env, send: (e) => (e.type === "done" ? (calls = e.qlooCalls) : send(e)), llm, workflow, answered: [...answers, ...(team.answered ?? [])], disagreements, resynth: raw.resynth === true, planSig: typeof raw.planSig === "string" ? raw.planSig.slice(0, 40) : undefined });
      if (t.crowds !== before.crowds || t.fits !== before.fits || t.probes.join("|") !== before.probes) {
        const ranked = t.fits !== before.fits;
        send({ type: "memory", crowds: t.crowds, seed: t.seed, ...(ranked ? { fits: t.fits, ...(t.ranked ?? {}) } : {}), probes: t.probes });
      }
      await keep();
      send({ type: "done", qlooCalls: calls, ms: Date.now() - started });
      return;
    }
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
    if (t.crowds !== before.crowds || t.fits !== before.fits || t.probes.join("|") !== before.probes) {
      // Fits go back only when ranked again: the ones that came in were read without their scores.
      const ranked = t.fits !== before.fits;
      send({ type: "memory", crowds: t.crowds, seed: t.seed, ...(ranked ? { fits: t.fits, ...(t.ranked ?? {}) } : {}), probes: t.probes });
    }
    await keep();
    send({ type: "done", qlooCalls: calls, ms: Date.now() - started });
  }, qloo.mode);
});
