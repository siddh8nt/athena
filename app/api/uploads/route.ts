import { LIMITS, clientIp } from "@/lib/limits";
import { FILE_LIMITS } from "@/lib/knowledge/read";
import { sniff } from "@/lib/brief/extract";
import { addUpload, deleteUpload, listUploads, meter, validWorkspace } from "@/lib/knowledge/uploads";
import { dated } from "@/lib/time/now";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The founder's kept files (PRD §23.2 step 4): add one (it's stored under its hash, counted and read straight away),
// list them with the meter, and delete one with everything read from it.

const MAX_FILES = 40;

const workspace = (v: string | null | FormDataEntryValue) => (validWorkspace(v) ? v : undefined);

export const GET = dated(async function get(req: Request) {
  const ws = workspace(new URL(req.url).searchParams.get("ws"));
  if (!ws) return Response.json({ files: [], meter: meter([]) });
  const files = await listUploads(ws);
  return Response.json({ files, meter: meter(files) });
});

export const POST = dated(async function post(req: Request) {
  const form = await req.formData().catch(() => undefined);
  const ws = workspace(form?.get("ws") ?? null);
  const file = form?.get("file");
  if (!ws || !file || typeof file === "string") return Response.json({ error: "Expected a workspace and a file" }, { status: 400 });
  const list = await listUploads(ws);
  const note = (status: string) => Response.json({ file: { name: file.name, status, kept: false }, files: list, meter: meter(list) });
  if (file.size > FILE_LIMITS.bytes) return note(`Over ${Math.round(FILE_LIMITS.bytes / 1024 / 1024)} MB; a smaller export (PDF or CSV) works best`);
  if (list.length >= MAX_FILES) return note(`That's ${MAX_FILES} files; remove one to add another`);
  const cap = LIMITS.upload(clientIp(req));
  if (!cap.ok) return note(cap.message);
  const bytes = new Uint8Array(await file.arrayBuffer());
  // The page only sends files Athena reads; this holds for any other way in, by what the bytes are.
  if (sniff(bytes) === "unknown") return note("I read PDF, Word, Excel, PowerPoint, CSV, text and pictures (PNG, JPEG, WebP)");
  const up = await addUpload(ws, file.name.slice(0, 120), bytes);
  const files = await listUploads(ws);
  return Response.json({ file: { ...up, kept: true }, files, meter: meter(files) });
});

export const DELETE = dated(async function del(req: Request) {
  const q = new URL(req.url).searchParams;
  const ws = workspace(q.get("ws"));
  const hash = q.get("hash") ?? "";
  if (!ws) return Response.json({ error: "Expected a workspace" }, { status: 400 });
  try {
    const files = await deleteUpload(ws, hash);
    return Response.json({ deleted: hash, files, meter: meter(files) });
  } catch {
    // The founder asked for it gone: say so if it isn't, so they can try again.
    const files = await listUploads(ws);
    return Response.json({ deleted: null, files, meter: meter(files), retry: true }, { status: 503 });
  }
});
