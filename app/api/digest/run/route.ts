import { sendMondays } from "@/lib/workspace/digest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The Monday run (PRD §23.6 j): one Cloud Scheduler job POSTs here each Monday morning with
// `Authorization: Bearer $DIGEST_CRON_SECRET`. Without that secret set, the route doesn't exist.

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.DIGEST_CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const base = process.env.PUBLIC_URL || `${req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? url.host}`;
  return Response.json(await sendMondays(base));
}
