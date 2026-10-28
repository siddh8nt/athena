import { REPLACED, resolveLink } from "@/lib/workspace/links";
import { handleMcp } from "@/lib/workspace/mcp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The Athena MCP endpoint (PRD §23.6 b, c). A founder connects their own AI tool to this URL; the secret in the path
// (or a Bearer token) maps to their workspace and what the link may do. No OAuth: the link is the capability. An
// unknown or replaced secret answers a message with one line saying what happened and where the current link is
// (§23.6 c), as a JSON-RPC error the AI tool shows; it gives no hint about which workspaces exist. The MCP transport
// handles GET (stream), POST (messages) and DELETE (end); all three go through the same resolved handler.

/** The replaced-link answer: a JSON-RPC error on the request's own id, so the client shows the line, not a crash. */
async function replaced(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response(REPLACED, { status: 404 });
  const body = (await req.json().catch(() => undefined)) as { id?: unknown } | { id?: unknown }[] | undefined;
  const id = (Array.isArray(body) ? body[0]?.id : body?.id) ?? null;
  return Response.json({ jsonrpc: "2.0", id, error: { code: -32001, message: REPLACED } });
}

async function handle(req: Request, ctx: { params: Promise<{ secret: string }> }): Promise<Response> {
  const { secret } = await ctx.params;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const meta = (await resolveLink(secret)) ?? (bearer ? await resolveLink(bearer) : undefined);
  // A calendar feed's link (§23.6 g) sits in a calendar app, and a share link (§23.6 k) with the founder's team: each
  // opens its own page and nothing else.
  if (!meta || meta.scope === "cal" || meta.scope === "share") return replaced(req);
  return handleMcp(req, meta);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
