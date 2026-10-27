import { DEMO_SECRET, demoReady } from "@/lib/workspace/demo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The judges' demo link (PRD §23.6 e). /plan asks once whether the precomputed Fishwife workspace is seeded, and
// shows its "Connect" line only if it is, so the line never leads to a link that answers with an empty plan.

export async function GET(): Promise<Response> {
  if (!(await demoReady())) return Response.json({ ok: false });
  return Response.json({ ok: true, path: `/mcp/${DEMO_SECRET}` });
}
