import { getQloo } from "@/lib/qloo";
import { dated } from "@/lib/time/now";
import { writeDraft, type DraftPartner } from "@/lib/agent/draft";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n).trim() : "");
const list = (v: unknown, n: number, m = 80) => (Array.isArray(v) ? v.map((x) => str(x, m)).filter(Boolean).slice(0, n) : []);

/**
 * A venue pitch (§9.8, §9.10): shared loves from one Qloo call (the venue's crowd scored over your partner
 * brands), then a Gemini draft whose every name is checked against this evidence. Nothing is ever sent.
 */
export const POST = dated(async function post(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const brand = str(b.brand, 120);
  const venue = b.venue as Record<string, unknown> | undefined;
  const venueName = str(venue?.name, 160);
  const partners: DraftPartner[] = (Array.isArray(b.partners) ? b.partners : []).slice(0, 50).flatMap((p) => {
    const x = p as Record<string, unknown>;
    return typeof x.id === "string" && typeof x.name === "string" ? [{ id: x.id, name: x.name.slice(0, 120), pForward: Number(x.pForward) || 0 }] : [];
  });
  if (!brand || !venueName) return Response.json({ error: "brand and venue are required" }, { status: 400 });
  const venueId = str(venue?.id, 64);
  const qloo = venueId && partners.length ? (() => { try { return getQloo(); } catch (err) { console.error("bridges failed", err); return undefined; } })() : undefined;
  return Response.json(
    await writeDraft({
      qloo,
      brand,
      product: str(b.product, 200),
      to: { kind: "venue", id: venueId, name: venueName, neighbourhood: str(venue?.neighbourhood, 80), tags: list(venue?.tags, 8), reasons: list(venue?.reasons, 4, 160) },
      partners,
    }),
  );
});
