import type { SourceRef } from "@/lib/fits/types";

// Shared by the fits and the strategies: the sources a sentence cites, and a calendar day as the founder reads it.

export const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The source ids a sentence cites, each named on hover. */
export function Cites({ ids, sources }: { ids: string[]; sources: Map<string, SourceRef> }) {
  const shown = ids.filter((id) => sources.has(id));
  if (!shown.length) return null;
  return (
    <span className="cites">
      {shown.map((id) => (
        <span key={id} className="cite" title={sources.get(id)!.summary}>
          {id}
        </span>
      ))}
    </span>
  );
}
