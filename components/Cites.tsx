import type { SourceRef } from "@/lib/fits/types";

// Shared by the fits and the strategies: the sources a sentence cites, and a calendar day as the founder reads it.

export const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The agent's sentences carry dates as YYYY-MM-DD so they're checked against their sources; shown as the founder reads them. */
export const readable = (text: string) =>
  text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (iso, y: string) => (Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? iso : `${day(iso)}${Number(y) === new Date().getUTCFullYear() ? "" : `, ${y}`}`));

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
