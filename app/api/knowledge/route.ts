import { getQloo } from "@/lib/qloo";
import { llmConfigured } from "@/lib/llm/vertex";
import { LIMITS, clientIp } from "@/lib/limits";
import { dated } from "@/lib/time/now";
import { buildKnowledge } from "@/lib/knowledge/build";
import { listUploads, uploadDoc, validWorkspace } from "@/lib/knowledge/uploads";
import { liveFacts, type LiveFact } from "@/lib/knowledge/types";
import type { Stockist } from "@/lib/brief/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A file added after onboarding (PRD §23.2 step 4, step 7d): read through the same reader as onboarding, into
// located facts and the stockists it lists, which the client merges into the Brand Graph as one edit with Undo.
// Without the model (or past the hourly count), the stockists code can read from the file still come back.
// Never an error: every path answers, with what it could read.

type Out = { facts: LiveFact[]; stockists: { ref: string; list: Stockist[] }[]; read: string[] };

export const POST = dated(async function post(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { ws?: unknown; hashes?: unknown };
  const ws = validWorkspace(body.ws) ? body.ws : undefined;
  const hashes = (Array.isArray(body.hashes) ? body.hashes : []).filter((h): h is string => typeof h === "string" && /^[0-9a-f]{64}$/.test(h)).slice(0, 10);
  const none: Out = { facts: [], stockists: [], read: [] };
  if (!ws || !hashes.length) return Response.json(none);
  const files = (await listUploads(ws).catch(() => [])).filter((u) => hashes.includes(u.hash));
  const read = files.map((u) => u.name);
  // Code alone: the stockists a file lists (a CSV or a sheet), each with the file it came from.
  const listed = async (): Promise<Out> => {
    const docs = await Promise.all(files.map((u) => uploadDoc(ws, u).catch(() => undefined)));
    return { facts: [], stockists: docs.flatMap((d, i) => (d?.stockists.length ? [{ ref: files[i].name, list: d.stockists }] : [])), read };
  };
  try {
    if (getQloo().mode !== "live" || !llmConfigured() || !LIMITS.brief(clientIp(req)).ok) return Response.json(await listed());
    const k = await Promise.race([
      buildKnowledge({ ws, hashes: files.map((u) => u.hash), websites: [], struck: [], settled: {} }, () => undefined),
      new Promise<undefined>((r) => setTimeout(() => r(undefined), 120_000)),
    ]);
    if (!k) return Response.json(await listed());
    return Response.json({ facts: liveFacts(k.knowledge, k.settled), stockists: k.stockists, read } satisfies Out);
  } catch (err) {
    console.error("knowledge read failed", err);
    return Response.json(await listed().catch(() => ({ ...none, read })));
  }
});
