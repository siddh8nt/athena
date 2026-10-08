import "server-only";
import { GoogleAuth } from "google-auth-library";

// Gemini on Vertex AI (Â§12.8). Global endpoint only: both models returned 404 in us-central1 (8 Oct).
// Auth: Application Default Credentials (gcloud locally, the service account on Cloud Run). No key stored.

export type GroundingSource = { title?: string; uri?: string };
export type GroundingSupport = { text: string; chunks: number[] };
export type LlmResult = { text: string; sources: GroundingSource[]; supports: GroundingSupport[]; queries: string[]; searchEntryPoint?: string; model: string; tokens?: number; ms: number };

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

export function llmConfig() {
  return {
    project: process.env.GOOGLE_CLOUD_PROJECT ?? "",
    location: process.env.GOOGLE_CLOUD_LOCATION ?? "global",
    flash: process.env.GEMINI_FLASH_MODEL ?? "gemini-3.8-flash",
    pro: process.env.GEMINI_PRO_MODEL ?? "gemini-3.1-pro-preview",
  };
}

export function llmConfigured(): boolean {
  return !!llmConfig().project;
}

// 429 handling (8 Oct, Google's 429 and Standard PayGo docs): on pay-as-you-go a 429 is temporary contention
// for shared capacity, often set off by sharp second-level bursts, not a used-up quota. Google's remedies: the
// global endpoint (already used), truncated exponential backoff, and smoothing traffic. So every Gemini call
// goes through one gate that caps calls in flight and spaces their starts, retries 429/5xx with jittered
// backoff inside the caller's time budget, and moves a Pro call to Flash (higher limits per tier) when Pro
// stays busy. Provisioned Throughput is the only hard guarantee and costs far more than the credit.

const MAX_IN_FLIGHT = { pro: 4, flash: 6 }; // Moments runs 4 festival lookups at once
const MIN_GAP_MS = 300;
const inFlight = { pro: 0, flash: 0 };
const waiting: { pro: (() => void)[]; flash: (() => void)[] } = { pro: [], flash: [] };
let lastStart = 0;

async function acquire(tier: "pro" | "flash"): Promise<() => void> {
  if (inFlight[tier] >= MAX_IN_FLIGHT[tier]) await new Promise<void>((r) => waiting[tier].push(r));
  inFlight[tier]++;
  const gap = lastStart + MIN_GAP_MS - Date.now();
  lastStart = Math.max(Date.now(), lastStart + MIN_GAP_MS);
  if (gap > 0) await new Promise((r) => setTimeout(r, gap));
  return () => {
    inFlight[tier]--;
    waiting[tier].shift()?.();
  };
}

const retryable = (status: number) => status === 429 || status >= 500;
/** 1 s, 2 s, 4 s, 8 s, capped at 16 s, each with up to 50% jitter. */
export const backoffMs = (attempt: number) => Math.min(16_000, 1000 * 2 ** attempt) * (1 + Math.random() * 0.5);

/**
 * Sends one Gemini request with the gate, backoff and Pro â†’ Flash fallback. Returns the last response
 * (which may still be a 429) once `deadline` leaves no room for another wait.
 */
async function send(tier: "pro" | "flash", makeUrl: (model: string) => string, body: string, deadline: number, signal?: AbortSignal): Promise<{ res: Response; model: string }> {
  const cfg = llmConfig();
  let current = tier;
  for (let attempt = 0; ; attempt++) {
    // After two busy answers from Pro, try Flash: it has higher limits and answers the same prompts.
    if (current === "pro" && attempt >= 2) current = "flash";
    const model = current === "pro" ? cfg.pro : cfg.flash;
    const release = await acquire(current);
    let res: Response;
    try {
      const token = await auth.getAccessToken();
      res = await fetch(makeUrl(model), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body,
        signal: signal ?? AbortSignal.timeout(Math.max(5_000, deadline - Date.now())),
      });
    } finally {
      release();
    }
    const wait = backoffMs(attempt);
    if (!retryable(res.status) || attempt >= 5 || Date.now() + wait + 5_000 > deadline) return { res, model };
    await res.body?.cancel().catch(() => undefined);
    await new Promise((r) => setTimeout(r, wait));
  }
}

export async function generate(opts: {
  model: "flash" | "pro";
  system?: string;
  prompt: string;
  /** Native files sent alongside the prompt (PDF, PNG/JPEG/WebP), base64-encoded (§9.22). */
  files?: { mime: string; base64: string }[];
  grounding?: boolean;
  /** Adds the URL context tool (a search tool, so it combines with googleSearch). */
  urlContext?: boolean;
  json?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
  /** Gemini 3 thinking tier. 8 Oct: 3.8 Flash supports LOW/MEDIUM/HIGH; 3.1 Pro preview LOW/MEDIUM/HIGH. */
  thinking?: "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";
  /** Total time for the call, retries included (default 90 s). */
  budgetMs?: number;
}): Promise<LlmResult> {
  const cfg = llmConfig();
  if (!cfg.project) throw new Error("GOOGLE_CLOUD_PROJECT is not set");
  const host = cfg.location === "global" ? "aiplatform.googleapis.com" : `${cfg.location}-aiplatform.googleapis.com`;
  const urlFor = (model: string) => `https://${host}/v1/projects/${cfg.project}/locations/${cfg.location}/publishers/google/models/${model}:generateContent`;
  const body = {
    ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
    contents: [{ role: "user", parts: [...(opts.files ?? []).map((f) => ({ inlineData: { mimeType: f.mime, data: f.base64 } })), { text: opts.prompt }] }],
    ...(opts.grounding || opts.urlContext ? { tools: [...(opts.grounding ? [{ googleSearch: {} }] : []), ...(opts.urlContext ? [{ urlContext: {} }] : [])] } : {}),
    generationConfig: {
      maxOutputTokens: opts.maxOutputTokens ?? 4096,
      temperature: opts.temperature ?? 0.4,
      ...(opts.thinking ? { thinkingConfig: { thinkingLevel: opts.thinking } } : {}),
      // Structured output and Search grounding aren't combined; grounded calls parse JSON from text.
      ...(opts.json && !opts.grounding && !opts.urlContext ? { responseMimeType: "application/json" } : {}),
    },
  };
  const started = Date.now();
  {
    const { res, model } = await send(opts.model, urlFor, JSON.stringify(body), started + (opts.budgetMs ?? 90_000));
    const data = (await res.json()) as {
      error?: { message: string };
      candidates?: {
        content?: { parts?: { text?: string; thought?: boolean }[] };
        groundingMetadata?: {
          groundingChunks?: { web?: GroundingSource }[];
          groundingSupports?: { segment?: { text?: string }; groundingChunkIndices?: number[] }[];
          webSearchQueries?: string[];
          searchEntryPoint?: { renderedContent?: string };
        };
      }[];
      usageMetadata?: { totalTokenCount?: number };
    };
    if (!res.ok || data.error) throw new Error(`Vertex ${res.status}: ${data.error?.message ?? "error"}`);
    const c = data.candidates?.[0];
    return {
      text: (c?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join(""),
      // Keep positions: groundingSupports refer to chunks by index.
      sources: (c?.groundingMetadata?.groundingChunks ?? []).map((g) => g.web ?? {}),
      supports: (c?.groundingMetadata?.groundingSupports ?? []).map((g) => ({ text: g.segment?.text ?? "", chunks: g.groundingChunkIndices ?? [] })),
      queries: c?.groundingMetadata?.webSearchQueries ?? [],
      searchEntryPoint: c?.groundingMetadata?.searchEntryPoint?.renderedContent,
      model,
      tokens: data.usageMetadata?.totalTokenCount,
      ms: Date.now() - started,
    };
  }
}

/** Pulls the first JSON object or array out of model text (grounded calls can't use JSON mode). */
export function parseJson<T>(text: string): T | undefined {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
  const raw = fenced ?? text;
  const start = raw.search(/[[{]/);
  if (start < 0) return undefined;
  const open = raw[start];
  const close = open === "{" ? "}" : "]";
  const end = raw.lastIndexOf(close);
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return undefined;
  }
}

/** Domain of a URL without "www.", or undefined. */
export function domainOf(u: string | undefined | null): string | undefined {
  if (!u) return undefined;
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
}

type StreamChunk = {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    groundingMetadata?: {
      groundingChunks?: { web?: GroundingSource }[];
      groundingSupports?: { segment?: { text?: string }; groundingChunkIndices?: number[] }[];
      webSearchQueries?: string[];
      searchEntryPoint?: { renderedContent?: string };
    };
    urlContextMetadata?: { urlMetadata?: { retrievedUrl?: string; urlRetrievalStatus?: string }[] };
    finishReason?: string;
  }[];
  usageMetadata?: { totalTokenCount?: number; thoughtsTokenCount?: number; candidatesTokenCount?: number };
  error?: { message: string };
};

/** The bold heading Gemini puts on each thought summary ("**Searching Event Dates**"). */
export function thoughtTitle(text: string): string | undefined {
  return /\*\*(.+?)\*\*/.exec(text)?.[1]?.trim();
}

/**
 * Streaming variant (`streamGenerateContent?alt=sse`) with thought summaries, so the UI can narrate
 * while a slow grounded call runs (8 Oct: a summary every ~5 s). Never throws: on error or after
 * `timeoutMs` it resolves with whatever arrived, and `complete: false`.
 */
export async function generateStream(
  opts: Parameters<typeof generate>[0] & { timeoutMs: number },
  onThought: (title: string) => void,
): Promise<LlmResult & { complete: boolean; retrievedUrls: string[]; finishReason?: string; usage?: string }> {
  const cfg = llmConfig();
  let model = opts.model === "pro" ? cfg.pro : cfg.flash;
  const empty = { text: "", sources: [], supports: [], queries: [], model, ms: 0, complete: false, retrievedUrls: [] };
  if (!cfg.project) return empty;
  const host = cfg.location === "global" ? "aiplatform.googleapis.com" : `${cfg.location}-aiplatform.googleapis.com`;
  const urlFor = (m: string) => `https://${host}/v1/projects/${cfg.project}/locations/${cfg.location}/publishers/google/models/${m}:streamGenerateContent?alt=sse`;
  const body = {
    ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    ...(opts.grounding || opts.urlContext ? { tools: [...(opts.grounding ? [{ googleSearch: {} }] : []), ...(opts.urlContext ? [{ urlContext: {} }] : [])] } : {}),
    generationConfig: {
      maxOutputTokens: opts.maxOutputTokens ?? 4096,
      temperature: opts.temperature ?? 0.4,
      thinkingConfig: { ...(opts.thinking ? { thinkingLevel: opts.thinking } : {}), includeThoughts: true },
    },
  };
  const started = Date.now();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), opts.timeoutMs);
  let text = "";
  // Grounding metadata can arrive spread over several chunks (sources in one, the search chip in another), so
  // it's merged, not replaced: support indices are shifted by the sources already collected.
  const sources: GroundingSource[] = [];
  const supports: GroundingSupport[] = [];
  const queries = new Set<string>();
  const retrieved = new Set<string>();
  let searchEntryPoint: string | undefined;
  let finishReason: string | undefined;
  let usage: string | undefined;
  let tokens: number | undefined;
  let complete = false;
  try {
    const sent = await send(opts.model, urlFor, JSON.stringify(body), started + opts.timeoutMs, abort.signal);
    const res = sent.res;
    model = sent.model;
    if (!res.ok || !res.body) return { ...empty, model, ms: Date.now() - started };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      // The last event may have no trailing newline, and it's the one that carries the answer's end, the
      // grounding sources and the finish reason (9 Oct: dropping it gave empty answers and no sources).
      buf += done ? `${decoder.decode()}\n` : decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        let chunk: StreamChunk;
        try {
          chunk = JSON.parse(line.slice(5)) as StreamChunk;
        } catch {
          continue;
        }
        const c = chunk.candidates?.[0];
        for (const p of c?.content?.parts ?? []) {
          if (p.thought) {
            const t = thoughtTitle(p.text ?? "");
            if (t) onThought(t);
          } else text += p.text ?? "";
        }
        const g = c?.groundingMetadata;
        if (g) {
          const offset = sources.length;
          sources.push(...(g.groundingChunks ?? []).map((x) => x.web ?? {}));
          supports.push(...(g.groundingSupports ?? []).map((x) => ({ text: x.segment?.text ?? "", chunks: (x.groundingChunkIndices ?? []).map((i) => i + offset) })));
          for (const q of g.webSearchQueries ?? []) queries.add(q);
          searchEntryPoint = g.searchEntryPoint?.renderedContent ?? searchEntryPoint;
        }
        for (const u of c?.urlContextMetadata?.urlMetadata ?? []) {
          if (u.retrievedUrl && /SUCCESS/.test(u.urlRetrievalStatus ?? "")) retrieved.add(u.retrievedUrl);
        }
        if (c?.finishReason) finishReason = c.finishReason;
        if (chunk.usageMetadata?.totalTokenCount) {
          tokens = chunk.usageMetadata.totalTokenCount;
          usage = `thinking ${chunk.usageMetadata.thoughtsTokenCount ?? 0}, answer ${chunk.usageMetadata.candidatesTokenCount ?? 0}`;
        }
      }
      if (done) break;
    }
    complete = true;
  } catch {
    // Timeout or network error: resolve with what arrived.
  } finally {
    clearTimeout(timer);
  }
  return {
    text,
    sources,
    supports,
    queries: [...queries],
    searchEntryPoint,
    model,
    tokens,
    ms: Date.now() - started,
    complete,
    retrievedUrls: [...retrieved],
    finishReason,
    usage,
  };
}
