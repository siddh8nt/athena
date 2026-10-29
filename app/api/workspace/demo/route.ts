import { DEMO_SECRET, demoReady, readDemo } from "@/lib/workspace/demo";
import { BRAND_FILE, brandFile } from "@/lib/workspace/brand-file";
import { PLAN_FILE, XLSX_TYPE, planWorkbook } from "@/lib/workspace/plan-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The judges' demo link (PRD §23.6 e). /plan asks once whether the precomputed Fishwife workspace is seeded, and
// shows its "Connect" line only if it is, so the line never leads to a link that answers with an empty plan.
// `?file=1` is the sample's brand context file (§23.6 f), and `?file=plan` its plan spreadsheet, for the panel's
// As a file section on the demo. Both are built once per read of the sample and kept with it, so a click saves at once.

const built = new WeakMap<object, { md?: string; sheet?: Uint8Array }>();

export async function GET(req: Request): Promise<Response> {
  const file = new URL(req.url).searchParams.get("file");
  if (file) {
    const saved = (await readDemo())?.saved as Parameters<typeof brandFile>[0] | undefined;
    if (!saved?.journey) return Response.json({ ok: false });
    const kept = built.get(saved) ?? {};
    built.set(saved, kept);
    if (file === "plan") return new Response(Buffer.from((kept.sheet ??= planWorkbook(saved))), { headers: { "Content-Type": XLSX_TYPE, "Content-Disposition": `attachment; filename="${PLAN_FILE}"` } });
    return new Response((kept.md ??= brandFile(saved)), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${BRAND_FILE}"` } });
  }
  if (!(await demoReady())) return Response.json({ ok: false });
  return Response.json({ ok: true, path: `/mcp/${DEMO_SECRET}` });
}
