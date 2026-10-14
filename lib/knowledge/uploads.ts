import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";
import { countTokens } from "@/lib/llm/vertex";
import { getStore } from "@/lib/store";
import { extractDoc, forgetExtraction, type Extraction } from "./extract";
import { pdfPages, readFileDoc, type Doc } from "./read";

// The founder's files, kept (PRD §23.2 step 4d "Keep the originals", carried 3f "delete stored uploads"). Each
// browser has a workspace: a random id it keeps. A file is stored under its hash when it's added, counted for the
// meter, and read into facts straight away, so Start doesn't wait. Delete removes the original, its count and its
// facts. Locally the originals sit in .cache/uploads; on Cloud Run in a Cloud Storage bucket (ATHENA_UPLOAD_BUCKET).

export type Upload = {
  hash: string;
  name: string;
  bytes: number;
  kind: string;
  /** Gemini tokens the whole file takes, from countTokens (an estimate when it couldn't say). */
  tokens: number;
  /** Pages, slides or sheets, for the meter's "pages". */
  pages: number;
  status: string;
  at: number;
};

/** The knowledge base's limit [VERIFY: about 1M input tokens for one Gemini pass; third-party figure for 3.8 Flash, 14 Oct]. */
export const KB_TOKENS = 1_000_000;
/** Tokens per page for the meter's "pages": a PDF page is 560 on flash and pro (countTokens on 3- and 10-page PDFs, 14 Oct). */
export const TOKENS_PER_PAGE = 560;

const INDEX = "uploads-v1";
const WS = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const validWorkspace = (ws: unknown): ws is string => typeof ws === "string" && WS.test(ws);
const validHash = (h: string) => /^[0-9a-f]{64}$/.test(h);

// ---- Where originals live -----------------------------------------------------------------------------------

interface Blobs {
  put(key: string, b: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
  delete(key: string): Promise<void>;
}

class FileBlobs implements Blobs {
  constructor(private readonly root = path.join(process.cwd(), ".cache", "uploads")) {}
  private at = (key: string) => path.join(this.root, ...key.split("/"));
  async put(key: string, b: Uint8Array) {
    await mkdir(path.dirname(this.at(key)), { recursive: true });
    await writeFile(this.at(key), b);
  }
  async get(key: string) {
    return readFile(this.at(key)).then((b) => new Uint8Array(b)).catch(() => undefined);
  }
  async delete(key: string) {
    await rm(this.at(key), { force: true });
  }
}

/** Cloud Storage through its JSON API, with the service account's credentials. */
class GcsBlobs implements Blobs {
  private auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/devstorage.read_write"] });
  constructor(private readonly bucket: string) {}
  private async headers() {
    return { Authorization: `Bearer ${await this.auth.getAccessToken()}` };
  }
  async put(key: string, b: Uint8Array) {
    const res = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${this.bucket}/o?uploadType=media&name=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { ...(await this.headers()), "Content-Type": "application/octet-stream" },
      body: Buffer.from(b),
    });
    if (!res.ok) throw new Error(`storage ${res.status}`);
  }
  async get(key: string) {
    const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${this.bucket}/o/${encodeURIComponent(key)}?alt=media`, { headers: await this.headers() });
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : undefined;
  }
  async delete(key: string) {
    const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${this.bucket}/o/${encodeURIComponent(key)}`, { method: "DELETE", headers: await this.headers() });
    if (!res.ok && res.status !== 404) throw new Error(`storage ${res.status}`);
  }
}

let blobs: Blobs | undefined;
const getBlobs = () => (blobs ??= process.env.ATHENA_UPLOAD_BUCKET ? new GcsBlobs(process.env.ATHENA_UPLOAD_BUCKET) : new FileBlobs());

// ---- The workspace ------------------------------------------------------------------------------------------

export async function listUploads(ws: string): Promise<Upload[]> {
  return (await getStore().get<Upload[]>(INDEX, ws))?.value ?? [];
}

/** Changes to one workspace's list, one at a time, so two files added together both stay listed. */
const locks = new Map<string, Promise<unknown>>();
function edit<T>(ws: string, fn: () => Promise<T>): Promise<T> {
  const p = (locks.get(ws) ?? Promise.resolve()).catch(() => undefined).then(fn);
  locks.set(ws, p);
  return p;
}

/** Reads in flight, so Start waits for the read the upload began instead of starting another. */
const reading = new Map<string, Promise<Extraction>>();

/** Reads a stored file into facts, once: from the store, from a read already running, or now. */
export function readUpload(ws: string, doc: Doc, status?: (s: string) => void): Promise<Extraction> {
  const key = `${ws}:${doc.hash}`;
  const running = reading.get(key);
  if (running) return running;
  const p = extractDoc(doc, { scope: ws, status }).finally(() => reading.delete(key));
  reading.set(key, p);
  return p;
}

/** Tokens for one file: countTokens on what Gemini will be sent, or an estimate from its size. */
async function measure(doc: Doc, b: Uint8Array): Promise<{ tokens: number; pages: number }> {
  const pages = doc.fileKind === "pdf" ? pdfPages(b) : doc.fileKind === "pptx" ? (doc.text.match(/^\[slide \d+\]$/gm) ?? []).length : 0;
  const counted = await countTokens({ prompt: doc.text || undefined, files: doc.parts.map((p) => ({ mime: p.mime, base64: Buffer.from(p.data).toString("base64") })) });
  const tokens = counted ?? Math.round(doc.text.length / 4 + (doc.fileKind === "pdf" ? pages * TOKENS_PER_PAGE : doc.parts.length * 1_100));
  return { tokens, pages: pages || Math.max(1, Math.round(tokens / TOKENS_PER_PAGE)) };
}

/** Keeps a file: the original, its count, and a read into facts that carries on after the answer. */
export async function addUpload(ws: string, name: string, b: Uint8Array): Promise<Upload> {
  const doc = readFileDoc(name, b);
  const list = await listUploads(ws);
  const had = list.find((u) => u.hash === doc.hash);
  if (had) return had;
  await getBlobs().put(`${ws}/${doc.hash}`, b);
  const { tokens, pages } = await measure(doc, b);
  const up: Upload = { hash: doc.hash, name, bytes: b.byteLength, kind: doc.fileKind ?? "unknown", tokens, pages, status: doc.status, at: Date.now() };
  await edit(ws, async () => getStore().set(INDEX, ws, [...(await listUploads(ws)).filter((u) => u.hash !== up.hash), up]));
  if (doc.text || doc.parts.length) void readUpload(ws, doc).catch(() => undefined);
  return up;
}

/** The stored file as a document, under the name the founder gave it. */
export async function uploadDoc(ws: string, u: Upload): Promise<Doc | undefined> {
  const b = await getBlobs().get(`${ws}/${u.hash}`);
  return b ? { ...readFileDoc(u.name, b), ref: u.name } : undefined;
}

/** Deletes a file: the original, its facts, and its line in the workspace. Throws when the original couldn't go. */
export async function deleteUpload(ws: string, hash: string): Promise<Upload[]> {
  if (!validHash(hash)) return listUploads(ws);
  // A read still running would store its facts after the delete: let it finish first.
  await reading.get(`${ws}:${hash}`)?.catch(() => undefined);
  await getBlobs().delete(`${ws}/${hash}`);
  await forgetExtraction(ws, hash);
  return edit(ws, async () => {
    const list = (await listUploads(ws)).filter((u) => u.hash !== hash);
    await getStore().set(INDEX, ws, list);
    return list;
  });
}

/** The meter: "about 1,785 pages max; you've added about 320". */
export function meter(list: Upload[]) {
  const tokens = list.reduce((n, u) => n + u.tokens, 0);
  return { tokens, max: KB_TOKENS, pages: list.reduce((n, u) => n + u.pages, 0), maxPages: Math.floor(KB_TOKENS / TOKENS_PER_PAGE), over: tokens > KB_TOKENS };
}
