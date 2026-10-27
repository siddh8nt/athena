import { mintLink, revokeLink, type Scope } from "@/lib/workspace/links";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mint and revoke connect links (PRD §23.6 c, d). The Athena MCP panel calls POST to get a link to
// paste into the founder's own AI tool, and again to get a new one (which replaces the old). DELETE revokes. Scope
// "cal" is the calendar feed's own link (§23.6 g), a path under /cal. The
// workspace id is the browser's own random UUID; the link's secret is returned once and never stored in the clear.

const wsId = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : "");
const scopeOf = (v: unknown): Scope => (v === "read" || v === "cal" ? v : "full");

export async function POST(req: Request): Promise<Response> {
  const b = (await req.json().catch(() => ({}))) as { ws?: unknown; scope?: unknown; label?: unknown };
  const ws = wsId(b.ws);
  if (!ws) return Response.json({ ok: false });
  const scope = scopeOf(b.scope);
  const label = typeof b.label === "string" ? b.label.slice(0, 80) : undefined;
  const minted = await mintLink(ws, scope, label);
  if (!minted) return Response.json({ ok: false });
  // A path, not an absolute URL: the client prepends its own origin, so this works on localhost and on Cloud Run alike.
  return Response.json({ ok: true, scope, path: scope === "cal" ? `/cal/${minted.secret}.ics` : `/mcp/${minted.secret}` });
}

export async function DELETE(req: Request): Promise<Response> {
  const ws = wsId(new URL(req.url).searchParams.get("ws"));
  const scope = scopeOf(new URL(req.url).searchParams.get("scope"));
  if (!ws) return Response.json({ ok: false });
  await revokeLink(ws, scope);
  return Response.json({ ok: true });
}
