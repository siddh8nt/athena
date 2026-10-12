import { getQloo } from "@/lib/qloo";
import { LIMITS, clientIp } from "@/lib/limits";
import { llmConfigured } from "@/lib/llm/vertex";
import { UPLOAD_LIMITS, extractFile, type Extracted } from "@/lib/brief/extract";
import { agentTurn, lookUpBrand, research, urlsIn, type AgentTurn, type ChatLine } from "@/lib/brief/agent";
import { GUESS, MAX_CALLS, MAX_RESEARCH, isRepeat, type Turn } from "@/lib/brief/conversation";
import { emptyBrief, mergeBrief, missingRequired, type BrandBrief } from "@/lib/brief/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The brief canvas (§6.2.1, §9.22). Stateless: the client sends the brief and the recent conversation back each
// turn, so any Cloud Run instance can answer. Files are read in memory and never stored (§14.5). The answer
// streams as server-sent events: short status lines while Athena researches, then the result.

export type BriefEvent =
  | { type: "status"; text: string }
  /** Athena's reply, streamed as it's written; the result's text replaces it when done. */
  | { type: "delta"; text: string }
  /** The pages research read, sent the moment research ends. */
  | { type: "sources"; sources: { title?: string; uri?: string }[] }
  /** The taste glimpse from Qloo, shown as a card in the chat. */
  | { type: "taste"; taste: NonNullable<BrandBrief["taste"]> }
  /** The brief so far, so the card fills in while research runs. */
  | { type: "brief"; brief: BrandBrief }
  /** more: research is still running, and a follow-up (or a quiet card update) will come. An empty text adds no message. */
  | { type: "result"; brief: BrandBrief; turn: Turn; files: { name: string; kind: string; status: string; stockists: number }[]; more?: boolean; followUp?: boolean };

/** The client's copy of the brief, re-capped by merging it into an empty one. */
function readBrief(raw: string | null): BrandBrief {
  let b: Partial<BrandBrief> = {};
  try {
    b = raw ? (JSON.parse(raw) as Partial<BrandBrief>) : {};
  } catch {
    b = {};
  }
  const { brief } = mergeBrief(emptyBrief(), b);
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
  const r = b.research;
  return {
    ...brief,
    qloo: b.qloo,
    proxies: Array.isArray(b.proxies) ? b.proxies.filter((x) => typeof x === "string").slice(0, 5) : undefined,
    retail: ["food", "beauty", "home", "fashion", "general"].includes(b.retail as string) ? b.retail : undefined,
    traits: Array.isArray(b.traits) ? b.traits.filter((x) => typeof x === "string").map((x) => x.slice(0, 40)).slice(0, 6) : undefined,
    channel: b.channel && ["online", "offline", "both"].includes(b.channel.value) ? b.channel : undefined,
    research: r && typeof r.for === "string" ? { for: str(r.for, 120), dossier: str(r.dossier, 6000), sources: (r.sources ?? []).slice(0, 8), queries: (r.queries ?? []).slice(0, 6) } : undefined,
    asked: (Array.isArray(b.asked) ? b.asked : []).map((a) => str(a, 300)).filter(Boolean).slice(-8),
    researched: Math.max(0, Number(b.researched) || 0),
    turns: Math.max(0, Number(b.turns) || 0),
    calls: Math.max(0, Number(b.calls) || 0),
  };
}

function readHistory(raw: string | null): ChatLine[] {
  try {
    const h = JSON.parse(raw ?? "[]") as ChatLine[];
    return (Array.isArray(h) ? h : [])
      .filter((l) => (l?.who === "athena" || l?.who === "you") && typeof l.text === "string")
      .slice(-12)
      .map((l) => ({ who: l.who, text: l.text.slice(0, 1200) }));
  } catch {
    return [];
  }
}

/** The last question in a reply, kept so Athena never asks it again. */
const questionIn = (reply: string) => reply.split(/(?<=[.!?])\s+/).filter((s) => s.trim().endsWith("?")).pop();

async function readFiles(form: FormData): Promise<Extracted[]> {
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
  return files;
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => undefined);
  if (!form) return Response.json({ error: "Expected a form" }, { status: 400 });
  const ip = clientIp(req);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: BriefEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          // The client went away.
        }
      };
      let brief = readBrief(form.get("brief") as string | null);
      try {
        brief = await run(form, brief, ip, send);
      } catch (err) {
        // Guards the stream only; the founder gets a way forward, never an error.
        console.error("brief turn failed", err);
        send({ type: "result", brief, turn: { text: "Give me that once more and I'll pick up from here.", replies: [], ready: missingRequired(brief).length === 0 }, files: [] });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}

async function run(form: FormData, start: BrandBrief, ip: string, send: (e: BriefEvent) => void): Promise<BrandBrief> {
  let brief = start;
  const history = readHistory(form.get("history") as string | null);
  const message = String(form.get("message") ?? "").slice(0, 8000).trim();

  const cap = LIMITS.brief(ip);
  if (!cap.ok) {
    send({ type: "result", brief, turn: { text: cap.message, replies: [], ready: false }, files: [] });
    return brief;
  }

  const files = await readFiles(form);
  if (files.length) send({ type: "status", text: `Reading ${files.length === 1 ? files[0].name : `${files.length} files`}` });
  const merge = (patch: Partial<BrandBrief>) => {
    brief = { ...mergeBrief(brief, patch).brief };
  };

  brief.turns += 1;
  merge({ websites: urlsIn(message) });
  const llm = llmConfigured();
  const canCall = () => llm && brief.calls < MAX_CALLS;
  const fileInfo = files.map((f) => ({ name: f.name, kind: f.kind, status: f.status, stockists: f.stockists.length }));

  /** Guardrails on one agent turn, then send it. The agent leads; code makes sure the founder can always start and is never asked twice. */
  let lastTurn: Turn = { text: "", replies: [], ready: false };
  const finish = (turn: AgentTurn | undefined, more: boolean, followUp: boolean) => {
    let text = turn?.reply;
    const question = text ? questionIn(text) : undefined;
    // "Ready" only counts when the agent isn't also asking something.
    if (question && isRepeat(question, brief.asked ?? [])) {
      // A rephrased repeat: never ask twice, and never fill the gap with a guess. Research and files carry on.
      text = "No need to answer that again: I'll work from what I've found, and you can add it any time.";
    } else if (question) {
      brief.asked = [...(brief.asked ?? []), question].slice(-8);
    }
    const ready = missingRequired(brief).length === 0;
    // A follow-up with nothing new to say only updates the card.
    if (!text && !followUp) text = ready ? "I have what I need to start your plan." : "Tell me a little about what you sell and where people buy it.";
    const asking = !!(text && questionIn(text));
    lastTurn = { text: text ?? "", replies: ready && !asking ? [] : [...(turn?.suggestions ?? []), ...(ready ? [] : [GUESS])].slice(0, 4), ready };
    send({ type: "result", brief, turn: lastTurn, files: fileInfo, more, followUp });
    return text;
  };

  // Pass 1, fast: understand the message and answer from what Athena already knows.
  send({ type: "status", text: brief.name ? "Thinking it through" : "Reading what you sent" });
  let first: AgentTurn | undefined;
  if (canCall()) {
    brief.calls += 1;
    first = await agentTurn(brief, history, message, files, { onReply: (text) => send({ type: "delta", text }) });
    merge(first.patch);
  } else {
    merge({ stockists: files.flatMap((f) => f.stockists.map((s) => ({ value: s, source: { kind: "file" as const, ref: f.name } }))) });
  }
  const name = brief.name?.value?.trim();
  const researchNext = !!name && brief.research?.for !== name && (brief.researched ?? 0) < MAX_RESEARCH && llm && brief.calls + 2 <= MAX_CALLS;
  const lookupNext = !!name && brief.qloo?.looked !== name;
  // A city the model merely assumed doesn't count: the founder picks it at the Where stop (§6.2.1).
  if (brief.activeCity && ["inferred", "agent_guess"].includes(brief.activeCity.source.kind)) brief.activeCity = undefined;
  const said = finish(first, researchNext || lookupNext, false);

  // Find the brand in Qloo (a second or so): it seeds the taste graph (§9.23 step 1). What the crowd loves is shown
  // at the Crowd stop, never guessed in the chat.
  if (lookupNext) {
    send({ type: "status", text: `Finding ${name} in Qloo` });
    brief.qloo = await lookUpBrand(getQloo(), brief).catch(() => brief.qloo);
    send({ type: "brief", brief });
  }
  if (!researchNext) {
    if (lookupNext) send({ type: "result", brief, turn: { ...lastTurn, text: "", ready: missingRequired(brief).length === 0 }, files: fileInfo, followUp: true });
    return brief;
  }

  // Pass 2, while the founder reads: Qloo and the web, then a follow-up only if research changes something.
  send({ type: "status", text: `Researching ${name} on the web` });
  brief.researched = (brief.researched ?? 0) + 1;
  brief.calls += 1;
  let last = "";
  const found = await research(brief, (t) => {
    if (t !== last) send({ type: "status", text: (last = t) });
  });
  brief.research = found ?? { for: name!, dossier: "", sources: [], queries: [] };
  if (found?.sources.length) send({ type: "sources", sources: found.sources });
  send({ type: "status", text: found?.sources.length ? `Read ${found.sources.length} pages; checking what changes` : "Checking what changes" });
  brief.calls += 1;
  const second = await agentTurn(brief, [...history, { who: "you", text: message }, ...(said ? [{ who: "athena" as const, text: said }] : [])], "", [], { followUp: true });
  merge(second.patch);
  finish(second.reply ? second : { ...second, suggestions: first?.suggestions ?? [], ready: false }, false, true);
  return brief;
}
