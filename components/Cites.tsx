import type { SourceRef } from "@/lib/fits/types";
import { sourceName, sourceWords } from "@/lib/sources";
import { SourceChip } from "./Refs";

// Shared by the fits, the strategies and every subagent's page: the sources a sentence cites, and a calendar day as the founder reads it.

export const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The agent's sentences carry dates as YYYY-MM-DD so they're checked against their sources; shown as the founder reads them. */
export const readable = (text: string) =>
  text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (iso, y: string) => (Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? iso : `${day(iso)}${Number(y) === new Date().getUTCFullYear() ? "" : `, ${y}`}`));

/** The sources a sentence cites, named as the founder reads them (§23.8 d): one chip per source, opening what it read. */
export function Cites({ ids, sources }: { ids: string[]; sources: Map<string, SourceRef> }) {
  const cited = ids.map((id) => sources.get(id)).filter((s): s is SourceRef => !!s);
  if (!cited.length) return null;
  // Two calls to the same source read as one chip: "Qloo · 20 calls", not two Qloo chips.
  const byName = new Map<string, SourceRef[]>();
  for (const s of cited) {
    const key = sourceName({ tool: s.tool, callIds: [] });
    byName.set(key, [...(byName.get(key) ?? []), s]);
  }
  return (
    <span className="cites">
      {[...byName.values()].map((group) => {
        const all = { tool: group[0].tool, callIds: [...new Set(group.flatMap((s) => s.callIds))], pages: group.flatMap((s) => s.pages ?? []).slice(0, 4) };
        return (
          <SourceChip
            key={group[0].id}
            label={sourceName(all)}
            card={{ id: `src:${group.map((s) => s.id).join(",")}`, kind: "source", title: sourceName(all), about: group.slice(0, 3).map((s) => ({ text: s.summary })), from: sourceWords(all), pages: all.pages }}
          />
        );
      })}
    </span>
  );
}
