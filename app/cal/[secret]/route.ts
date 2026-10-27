import { resolveLink } from "@/lib/workspace/links";
import { readSnapshot } from "@/lib/workspace/server";
import { DEMO_WS } from "@/lib/workspace/demo";
import { CAL_FILE, calendarFile, icsOf } from "@/lib/workspace/calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The calendar feed (PRD §23.6 g): `/cal/<secret>.ics`, subscribed to from Google, Apple or Outlook Calendar, which
// fetch it every few hours, so it follows the plan as the workspace changes. The secret is the founder's calendar
// link (scope "cal"), or the demo's fixed one for the Fishwife sample. A replaced or unknown link still answers with a
// valid, empty calendar whose name says so, so the founder's calendar app never shows an error.

const ICS = { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" };

export async function GET(req: Request, ctx: { params: Promise<{ secret: string }> }): Promise<Response> {
  const { secret } = await ctx.params;
  const meta = await resolveLink(secret.replace(/\.ics$/i, ""));
  const saved = meta ? ((await readSnapshot(meta.ws))?.saved as Parameters<typeof calendarFile>[0] | undefined) : undefined;
  if (!meta || !saved?.journey) {
    return new Response(icsOf([], { name: "Your brand", replaced: !meta }), { headers: ICS });
  }
  // Links back to rows open the founder's own Athena; the demo's rows live in no one's browser, so it has none.
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const base = meta.ws === DEMO_WS ? undefined : `${proto}://${host}`;
  const headers: Record<string, string> = { ...ICS };
  if (url.searchParams.has("download")) headers["Content-Disposition"] = `attachment; filename="${CAL_FILE}"`;
  return new Response(calendarFile(saved, { base }), { headers });
}
