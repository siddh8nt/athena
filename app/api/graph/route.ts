import { getQloo } from "@/lib/qloo";
import { llmConfigured } from "@/lib/llm/vertex";
import { LIMITS, clientIp } from "@/lib/limits";
import { dated } from "@/lib/time/now";
import { emptyBrief, type BrandBrief } from "@/lib/brief/types";
import { validOp, type Op } from "@/lib/graph/edit";
import { POINTER, interpret, resolveOps, type Interpreted } from "@/lib/graph/interpret";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Edits to the Brand Graph (PRD §13.12, §23.2 step 7c–d). Clicks on the graph send operations, and only their
// additions are resolved here (no model). A chat message is read by the model into operations; with no model, or
// past the hourly count, the reply points at the graph instead. The client applies what comes back, so every edit
// shows what changed and can be undone. Never an error: every path answers.

type Body = { message?: unknown; ops?: unknown; brief?: unknown; nodes?: unknown; history?: unknown };

export const POST = dated(async function post(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const brief = { ...emptyBrief(), ...(body.brief && typeof body.brief === "object" ? body.brief : {}) } as BrandBrief;
  const nodes = (Array.isArray(body.nodes) ? body.nodes : [])
    .filter((n): n is { id: string; type: string; label: string } => !!n && typeof n.id === "string" && typeof n.type === "string" && typeof n.label === "string")
    .slice(0, 300);
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((l): l is { who: string; text: string } => !!l && typeof l.who === "string" && typeof l.text === "string")
    .slice(-8);
  const qloo = getQloo();
  const none: Interpreted = { ops: [], questions: [], reply: "", calls: 0 };
  try {
    if (Array.isArray(body.ops)) {
      const ops = body.ops.map((o) => validOp(o, nodes)).filter((o): o is Op => !!o).slice(0, 40);
      return Response.json(await resolveOps(qloo, ops, brief));
    }
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return Response.json(none);
    if (!llmConfigured() || !LIMITS.graphEdit(clientIp(req)).ok) return Response.json({ ...none, reply: POINTER });
    const read = await interpret(message, { brief, nodes, history });
    if (!read) return Response.json({ ...none, reply: POINTER });
    const resolved = await resolveOps(qloo, read.ops, brief);
    return Response.json({ ...resolved, questions: [...read.questions, ...resolved.questions], reply: read.reply });
  } catch (err) {
    console.error("graph edit failed", err);
    return Response.json({ ...none, reply: POINTER });
  }
});
