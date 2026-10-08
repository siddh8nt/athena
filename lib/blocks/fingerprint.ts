import { results } from "@/lib/qloo/client";
import { BRAND_FINGERPRINT_TYPES, VENUE_FINGERPRINT_TYPES, isAllowedTag, tagType } from "@/lib/methods/allowlist";
import { signalIds } from "@/lib/playbook/config";
import { withCalls } from "./run";
import type { BlockContext, TagChip } from "./types";

/** Taste fingerprint (§9.2): one tag call over the allow-listed types; top 8 shown as chips. */
export function fingerprint(ctx: BlockContext) {
  return withCalls(ctx, "read", async ({ pb, qloo, emit }) => {
    const venueSignal = pb.signal.accounts.length > 0;
    const allowed = venueSignal ? VENUE_FINGERPRINT_TYPES : BRAND_FINGERPRINT_TYPES;
    const res = await qloo.insights({
      "filter.type": "urn:tag",
      "signal.interests.entities": signalIds(pb.signal, pb.stage),
      "filter.tag.types": [...allowed],
      take: 40,
    });
    // Descriptive tags (ambience, setting, decor, style) lead; dishes and menu items fill in after (8 Oct:
    // 50 NYC accounts returned mostly dishes, which read poorly on the card).
    const DISH = /specialty_dish|menu_highlight|cuisine|culinary_style|beverage_offering/;
    const allowedTags = (results(res).tags ?? []).filter((t) => isAllowedTag(t, allowed));
    const chips: TagChip[] = [...allowedTags.filter((t) => !DISH.test(tagType(t))), ...allowedTags.filter((t) => DISH.test(tagType(t)))]
      .slice(0, 8)
      .map((t, i) => ({ id: t.id ?? t.tag_id ?? t.name, name: t.name.trim(), type: tagType(t), rank: i + 1, callId: res.call.id }));
    emit({
      tool: "fingerprint",
      why: venueSignal ? "Reading the taste your accounts share" : "Reading your brand's taste from Qloo",
      status: chips.length ? "ok" : "empty",
      callIds: [res.call.id],
      summary: chips.map((c) => c.name).join(", ") || "no tags",
    });
    return { data: chips, status: chips.length >= 4 ? "ok" : chips.length ? "thin" : "empty", thinReason: chips.length < 4 ? "few taste tags" : undefined };
  });
}
