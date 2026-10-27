import { placeZips } from "@/lib/sales/places";
import { dated } from "@/lib/time/now";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The places of an orders export's ZIPs (PRD §23.6 i): only the ZIPs reach the server, never an order. No calls out.

export const POST = dated(async function post(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const zips = (Array.isArray(b.zips) ? b.zips : []).filter((z): z is string => typeof z === "string" && /^\d{5}$/.test(z)).slice(0, 20_000);
  const metros = (Array.isArray(b.metros) ? b.metros : []).filter((m): m is string => typeof m === "string" && m.length <= 400).slice(0, 60);
  return Response.json({ places: zips.length ? await placeZips(zips, metros) : {} });
});
