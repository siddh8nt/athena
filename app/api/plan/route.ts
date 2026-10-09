import { runCustomPlan, type RunScope } from "@/lib/agent/plan";
import type { BrandInput } from "@/lib/agent/intake";
import { planStream, serverDeps } from "@/lib/agent/server-deps";
import { LIMITS, clientIp } from "@/lib/limits";
import type { Block, Motion, Tier } from "@/lib/playbook/config";
import { MAX_SIGNAL } from "@/lib/journey/weights";

/** A reaction weight (§9.23 step 7): 1 unless a sane positive number was sent. */
const weightOf = (w: unknown) => (typeof w === "number" && Number.isFinite(w) && w > 0 && w <= 10 ? w : 1);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n).trim() : undefined);
const list = (v: unknown, n: number) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : []).map((x) => clip(x, 120)).filter((x): x is string => !!x).slice(0, n);
const oneOf = <T extends string>(v: unknown, all: readonly T[]) => (all.includes(v as T) ? (v as T) : undefined);

const MOTIONS = ["venue", "retail", "city_launch", "partnership", "location_opening", "online"] as const;
const TIERS = ["mass", "mainstream", "premium", "luxury"] as const;
const SCOPE = ["card", "markets", "places", "partners", "message", "moments", "act"] as const;

/** Try your own brand (M10, §6.2): POST the brief's input; the plan streams back as server-sent events. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = clip(body.name, 120);
  if (!name) return Response.json({ error: "A brand name is required" }, { status: 400 });
  const rows = (Array.isArray(body.rows) ? body.rows : [])
    .slice(0, 200)
    .map((r) => r as Record<string, unknown>)
    .map((r) => ({ name: clip(r.name, 120) ?? "", address: clip(r.address, 200), city: clip(r.city, 60) }))
    .filter((r) => r.name);
  const a = (body.answers ?? {}) as Record<string, unknown>;
  const input: BrandInput = {
    name,
    websites: list(body.websites, 3),
    description: clip(body.description, 600),
    accountsText: clip(body.accountsText, 20_000),
    comparables: list(body.comparables, 5),
    competitors: list(body.competitors, 3),
    city: clip(body.city, 60),
    rows,
    motions: (Array.isArray(body.motions) ? body.motions : []).map((m) => oneOf(m, MOTIONS)).filter((m): m is Motion => !!m),
    tierHint: oneOf(body.tierHint, TIERS) as Tier | undefined,
    answers: {
      brandId: a.brandId === null ? null : clip(a.brandId, 80),
      comparables: Array.isArray(a.comparables) ? list(a.comparables, 5) : undefined,
      whereSold: clip(a.whereSold, 20_000),
      pinnedComparables: Array.isArray(a.pinnedComparables) ? list(a.pinnedComparables, 5) : undefined,
    },
  };
  const crowd = body.crowd as { name?: unknown; signal?: unknown; exclude?: unknown } | undefined;
  const signal = (Array.isArray(crowd?.signal) ? crowd!.signal : [])
    .map((s) => s as { id?: unknown; name?: unknown; weight?: unknown })
    .filter((s) => typeof s.id === "string" && typeof s.name === "string")
    .slice(0, MAX_SIGNAL)
    .map((s) => ({ id: (s.id as string).slice(0, 80), name: (s.name as string).slice(0, 120), weight: weightOf(s.weight) }));
  const exclude = Array.isArray(crowd?.exclude) ? list(crowd!.exclude, 30) : [];
  if (signal.length) input.crowd = { name: clip(crowd?.name, 80) ?? "Your crowd", signal, exclude };
  // A re-run after an inline answer sends only the blocks the answer changes (§6.2.2).
  const scope: RunScope = Array.isArray(body.scope) ? body.scope.map((s) => oneOf(s, SCOPE)).filter((s): s is Block | "card" => !!s) : undefined;
  const ip = clientIp(req);
  // A journey counts once, when its crowds are built (/api/crowds); its stops and its dashboard are re-runs.
  const cap = scope || input.crowd ? LIMITS.rerun(ip) : LIMITS.ownBrand(ip);
  if (!cap.ok) {
    // Past a cap: a friendly note in the Read tab, never an error (§14.5).
    return planStream(async (send) => {
      send({ type: "event", event: { t: 0, tool: "plan", why: "Live plans are paused for a moment", status: "needs_input", callIds: [], summary: cap.message } });
      send({ type: "done", qlooCalls: 0, ms: 0 });
    }, "live");
  }
  return planStream((send) => runCustomPlan(input, serverDeps(send), scope), "live");
}
