import { runCustomPlan } from "@/lib/agent/plan";
import type { BrandInput } from "@/lib/agent/intake";
import { planStream, serverDeps } from "@/lib/agent/server-deps";
import { LIMITS, clientIp } from "@/lib/limits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n).trim() : undefined);
const list = (v: unknown, n: number) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : []).map((x) => clip(x, 120)).filter((x): x is string => !!x).slice(0, n);

/** Try your own brand (M10, §6.2): POST the intake; the plan streams back as server-sent events. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = clip(body.name, 120);
  if (!name) return Response.json({ error: "A brand name is required" }, { status: 400 });
  const input: BrandInput = {
    name,
    websites: list(body.websites, 3),
    description: clip(body.description, 300),
    accountsText: clip(body.accountsText, 20_000),
    comparables: list(body.comparables, 5),
    competitors: list(body.competitors, 3),
    city: clip(body.city, 60),
  };
  const cap = LIMITS.ownBrand(clientIp(req));
  if (!cap.ok) {
    // Past a cap: a friendly note in the Read tab, never an error (§14.5).
    return planStream(async (send) => {
      send({ type: "event", event: { t: 0, tool: "plan", why: "Live plans are paused for a moment", status: "needs_input", callIds: [], summary: cap.message } });
      send({ type: "done", qlooCalls: 0, ms: 0 });
    }, "live");
  }
  return planStream((send) => runCustomPlan(input, serverDeps(send)), "live");
}
