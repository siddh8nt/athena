import { mailReady } from "@/lib/mail";
import { readSub, saveSub, sendDemo } from "@/lib/workspace/digest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The Monday email's controls (PRD §23.6 j). GET says whether Athena can send at all (the panel hides the email
// controls when it can't) and the founder's current setting; POST saves "Email me this every Monday", or, with
// `demo`, sends the judges the Fishwife sample once.

const wsId = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : "");

export async function GET(req: Request): Promise<Response> {
  const ws = wsId(new URL(req.url).searchParams.get("ws"));
  const sub = ws ? await readSub(ws) : undefined;
  return Response.json({ ready: mailReady(), ...(sub ? { email: sub.email, on: sub.on } : {}) });
}

export async function POST(req: Request): Promise<Response> {
  const b = (await req.json().catch(() => ({}))) as { ws?: unknown; email?: unknown; on?: unknown; demo?: unknown };
  if (b.demo) return Response.json({ result: await sendDemo(typeof b.email === "string" ? b.email : "") });
  const ws = wsId(b.ws);
  return Response.json({ ok: !!ws && (await saveSub(ws, typeof b.email === "string" ? b.email.trim() : "", b.on === true)) });
}
