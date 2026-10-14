import { timingSafeEqual } from "node:crypto";
import { warmDemoBrands } from "@/lib/agent/warm";
import { dated } from "@/lib/time/now";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

/** Daily warm-cache trigger (§14.9) for Cloud Scheduler. Requires the WARM_TOKEN secret in the X-Warm-Token header. */
export const POST = dated(async function post(req: Request) {
  const want = process.env.WARM_TOKEN ?? "";
  const got = req.headers.get("x-warm-token") ?? "";
  const ok = want.length >= 32 && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
  if (!ok) return new Response("Not found", { status: 404 });
  const summary = await warmDemoBrands();
  return Response.json({ ok: true, summary });
});
