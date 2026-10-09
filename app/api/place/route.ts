import { resolveTyped } from "@/lib/places/location";
import { LIMITS, clientIp } from "@/lib/limits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A typed location (§9.3): any US state, county, city, neighbourhood, zip code or informal region. Returns the place,
// or a question with options when the name fits several real places, or a question when it can't be placed.

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.slice(0, 120) : "";
  if (!LIMITS.rerun(clientIp(req)).ok) return Response.json({ status: "none", question: "Give me a moment, then try that place again." });
  try {
    return Response.json(await resolveTyped(text));
  } catch (err) {
    console.error("place failed", err);
    return Response.json({ status: "none", question: `Which city, county, state or zip code is “${text}”?` });
  }
}
