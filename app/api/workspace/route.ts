import { readExternal, readSnapshot, saveSnapshot, type Snapshot } from "@/lib/workspace/server";
import type { External } from "@/lib/workspace/merge";
import { reserved } from "@/lib/workspace/demo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The saved workspace (PRD §23.6 a). GET returns the external changes the app folds in (and the last mirror,
// for anything that wants it); POST mirrors the browser's working copy to the server. Best-effort on both sides:
// a slow or failed call shows nothing and the next change retries, so the app behaves exactly as it does today.

const ws = (v: string | null) => (v && /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : "");

export async function GET(req: Request): Promise<Response> {
  const id = ws(new URL(req.url).searchParams.get("ws"));
  if (!id || reserved(id)) return Response.json({ external: {} satisfies External, snapshot: null }); // the demo reads only through MCP
  const [external, snapshot] = await Promise.all([readExternal(id), readSnapshot(id)]);
  return Response.json({ external, snapshot: snapshot ?? null } satisfies { external: External; snapshot: Snapshot | null });
}

export async function POST(req: Request): Promise<Response> {
  const b = (await req.json().catch(() => ({}))) as { ws?: unknown; saved?: unknown };
  const id = ws(typeof b.ws === "string" ? b.ws : null);
  if (!id || b.saved == null || reserved(id)) return Response.json({ ok: false }); // the demo is seeded, never saved over
  await saveSnapshot(id, b.saved);
  return Response.json({ ok: true });
}
