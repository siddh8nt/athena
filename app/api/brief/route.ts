import { getQloo } from "@/lib/qloo";
import { LIMITS, clientIp } from "@/lib/limits";
import { llmConfigured } from "@/lib/llm/vertex";
import { UPLOAD_LIMITS, extractFile, type Extracted } from "@/lib/brief/extract";
import { lookUpBrand, understand, urlsIn } from "@/lib/brief/understand";
import { MAX_CALLS, applyGuesses, closeIfOutOfTurns, confirm, nextTurn, reject } from "@/lib/brief/conversation";
import { REQUIRED, emptyBrief, mergeBrief, type BrandBrief, type Conflict, type RequiredFact } from "@/lib/brief/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The brief canvas (§6.2.1, §9.22). Stateless: the client sends the brief back each turn, so any Cloud Run
// instance can answer. Files are read in memory and never stored (§14.5).

/** The client's copy of the brief, re-capped by merging it into an empty one. */
function readBrief(raw: string | null): BrandBrief {
  let b: Partial<BrandBrief> = {};
  try {
    b = raw ? (JSON.parse(raw) as Partial<BrandBrief>) : {};
  } catch {
    b = {};
  }
  const base = emptyBrief();
  const { brief } = mergeBrief(base, b);
  return { ...brief, qloo: b.qloo, turns: Math.max(0, Number(b.turns) || 0), calls: Math.max(0, Number(b.calls) || 0) };
}

const isFact = (f: unknown): f is RequiredFact => REQUIRED.includes(f as RequiredFact);

export async function POST(req: Request) {
  const form = await req.formData().catch(() => undefined);
  if (!form) return Response.json({ error: "Expected a form" }, { status: 400 });
  let brief = readBrief(form.get("brief") as string | null);
  const message = String(form.get("message") ?? "").slice(0, 8000);
  const reply = String(form.get("reply") ?? ""); // "yes" | "no" | "guess"
  const asking = isFact(form.get("asking")) ? (form.get("asking") as RequiredFact) : undefined;

  const cap = LIMITS.brief(clientIp(req));
  if (!cap.ok) return Response.json({ brief, turn: { text: cap.message, replies: [], ready: false }, files: [] });

  // One-tap replies need no LLM.
  if (asking && reply === "yes") brief = confirm(brief, asking);
  if (asking && reply === "no") brief = reject(brief, asking);
  if (asking && reply === "guess") brief = applyGuesses(brief, [asking]);

  // Files: ≤ 10, ≤ 15 MB each, ≤ 40 MB in total; type from the bytes.
  const uploads = form.getAll("files").filter((f): f is File => typeof f === "object" && "arrayBuffer" in f).slice(0, UPLOAD_LIMITS.files);
  const files: Extracted[] = [];
  let total = 0;
  for (const f of uploads) {
    if (f.size > UPLOAD_LIMITS.fileBytes || total + f.size > UPLOAD_LIMITS.totalBytes) {
      files.push({ name: f.name, kind: "unknown", text: "", parts: [], stockists: [], status: "Over 15 MB; a smaller export (PDF or CSV) works best" });
      continue;
    }
    total += f.size;
    try {
      files.push(extractFile(f.name.slice(0, 120), new Uint8Array(await f.arrayBuffer())));
    } catch {
      files.push({ name: f.name, kind: "unknown", text: "", parts: [], stockists: [], status: "Athena reads this best as a PDF or CSV export" });
    }
  }

  const conflicts: Conflict[] = [];
  const merge = (patch: Partial<BrandBrief>) => {
    const r = mergeBrief(brief, patch);
    brief = { ...r.brief, qloo: patch.qloo ?? brief.qloo };
    conflicts.push(...r.conflicts);
  };

  if (message.trim() || files.length) {
    brief.turns += 1;
    merge({ websites: urlsIn(message) });
    const canCall = llmConfigured() && brief.calls < MAX_CALLS;
    if (canCall) {
      brief.calls += 1;
      merge(await understand(brief, message, files, asking));
    } else {
      // Out of ingestion calls: keep what code can read, and treat an answer as the asked fact.
      merge({ stockists: files.flatMap((f) => f.stockists.map((s) => ({ value: s, source: { kind: "file" as const, ref: f.name } }))) });
      if (asking && message.trim() && asking !== "howBought") merge({ [asking]: { value: message.trim().slice(0, 160), source: { kind: "message" } } });
    }
  }

  // Infer first, then confirm (§6.2.1): once a name is known, ask Qloo.
  if (brief.name && brief.qloo?.looked !== brief.name.value) {
    const qloo = getQloo();
    const before = !brief.sells || !brief.howBought;
    const patch = await lookUpBrand(qloo, brief);
    if (before && patch.qloo?.match && llmConfigured() && qloo.mode === "live") brief.calls += 1;
    merge(patch);
  }

  // After the last follow-up, guess every gap so the founder can always start.
  brief = closeIfOutOfTurns(brief);

  return Response.json({
    brief,
    turn: nextTurn(brief, conflicts),
    files: files.map((f) => ({ name: f.name, kind: f.kind, status: f.status, stockists: f.stockists.length })),
  });
}
