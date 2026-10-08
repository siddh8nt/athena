import { runDemoPlan } from "@/lib/agent/plan";
import { demoBySlug } from "@/lib/playbook/demo";
import { planStream, serverDeps } from "@/lib/agent/server-deps";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Streams a demo brand's plan as server-sent events (§14.1): rail lines, the Read card, then blocks. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brand = demoBySlug(slug);
  if (!brand) return Response.json({ error: "unknown brand" }, { status: 404 });
  let mode = "fixture";
  return planStream(async (send) => {
    const deps = serverDeps(send);
    mode = deps.qloo.mode;
    await runDemoPlan(brand, deps);
  }, mode);
}
