import type { QlooClient } from "@/lib/qloo/client";
import { ALLOWED_AUDIENCE_TYPES } from "./allowlist";

// Qloo audiences (§9.17): shared by Message and the Online stop.

/** Audience id → type, from the four allow-listed types only (cached forever by the client). */
export async function allowedAudienceIndex(qloo: QlooClient): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  await Promise.all(
    ALLOWED_AUDIENCE_TYPES.map(async (type) => {
      const res = await qloo.get("/v2/audiences", { "filter.audience.types": type, take: 50 });
      const r = res.body?.results;
      const list = Array.isArray(r) ? r : (r?.audiences ?? []);
      for (const a of list) index.set(a.entity_id, type);
    }),
  );
  return index;
}
