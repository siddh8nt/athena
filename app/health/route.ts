import { readEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

// Liveness for the uptime monitor (PRD §14.1). Never reports the key itself.
export function GET() {
  const env = readEnv();
  return Response.json({
    ok: true,
    mode: env.fixtures ? "fixture" : "live",
    qlooKeyConfigured: Boolean(env.qlooApiKey),
  });
}
