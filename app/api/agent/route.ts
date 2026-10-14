import { runCustomPlan } from "@/lib/agent/plan";
import type { BrandInput } from "@/lib/agent/intake";
import { planStream, serverDeps } from "@/lib/agent/server-deps";
import { runAgent, type AgentStreamEvent } from "@/lib/agent/loop";
import { getQloo } from "@/lib/qloo";
import { readEnv } from "@/lib/env";
import { llmConfigured } from "@/lib/llm/vertex";
import { LIMITS, clientIp } from "@/lib/limits";
import { dated } from "@/lib/time/now";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// One agent run (PRD §23.2 step 2): a goal and a budget for a brand; the agent's real steps stream back as
// server-sent events, then its sourced answer. When the agent stalls, the fixed pipeline's plan streams instead.

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n).trim() : undefined);
const list = (v: unknown, n: number) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : []).map((x) => clip(x, 120)).filter((x): x is string => !!x).slice(0, n);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export const POST = dated(async function post(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = clip(body.name, 120);
  if (!name) return Response.json({ error: "A brand name is required" }, { status: 400 });
  const brand: BrandInput = {
    name,
    websites: list(body.websites, 3),
    description: clip(body.description, 600),
    comparables: list(body.comparables, 5),
    competitors: list(body.competitors, 3),
    city: clip(body.city, 60),
  };
  const goal = clip(body.goal, 300) || `Decide who ${name} should win first, and how.`;
  const b = (body.budget ?? {}) as Record<string, unknown>;
  // The stall test (§23.2 step 2, done-when): local development only.
  const stallAt = process.env.NODE_ENV !== "production" ? num(body.stallAt) : undefined;

  const cap = LIMITS.ownBrand(clientIp(req));
  if (!cap.ok) {
    return planStream<AgentStreamEvent>(async (send) => {
      send({ type: "event", event: { t: 0, tool: "plan", why: "Live plans are paused for a moment", status: "needs_input", callIds: [], summary: cap.message } });
      send({ type: "done", qlooCalls: 0, ms: 0 });
    }, "live");
  }
  const qloo = getQloo();
  return planStream<AgentStreamEvent>(async (send) => {
    // Without a model (fixtures, or Vertex not configured) the fixed pipeline is the plan.
    if (qloo.mode !== "live" || !llmConfigured()) return runCustomPlan(brand, serverDeps(send));
    // After a stall the agent has already shown today's date, so the fixed pipeline doesn't show it again.
    const fallback = () => runCustomPlan(brand, serverDeps((e) => (e.type === "event" && e.event.tool === "today" ? undefined : send(e))));
    await runAgent({ goal, brand, budget: { qloo: num(b.qloo), ms: num(b.ms), turns: num(b.turns) }, qloo, env: readEnv(), send, fallback, stallAt });
  }, qloo.mode);
});
