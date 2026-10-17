import { lineText, type Line } from "./transcript";

/**
 * What onboarding did, kept for the chat after it: what the founder gave, every step with what it read under it,
 * the sources, and the counts. The team chat opens with it, so moving on never hides the work.
 */
export type WorkRecord = {
  intake: { text: string; files: string[] };
  steps: { text: string; subs: string[] }[];
  sources: { label: string; url?: string }[];
  pages: number;
  facts: number;
  conflicts: number;
  secs: number;
};

export function buildRecord(lines: Line[], counts: { facts: number; conflicts: number }, secs: number): WorkRecord | undefined {
  const you = lines.filter((l) => l.ev.tool === "you");
  const first = you[0];
  const steps = lines
    .filter((l) => l !== first)
    .map((l) => ({ text: l.ev.tool === "you" ? `You added: ${l.ev.why || (l.ev.found ?? []).join(", ")}` : lineText(l.ev), subs: l.pages.map((p) => lineText(p.ev)) }))
    .filter((s) => s.text);
  if (!steps.length) return undefined;
  const seen = new Set<string>();
  const sources: WorkRecord["sources"] = [];
  for (const l of lines.flatMap((x) => [x, ...x.pages])) {
    const s = l.ev.source;
    const key = s && (s.url ?? s.label);
    if (!s || !key || seen.has(key)) continue;
    seen.add(key);
    sources.push(s.url ? { label: s.label, url: s.url } : { label: s.label });
  }
  return {
    intake: { text: first?.ev.why ?? "", files: you.flatMap((l) => l.ev.found ?? []) },
    steps,
    sources,
    pages: lines.reduce((n, l) => n + l.pages.filter((p) => p.ev.tool === "read_page").length, 0),
    facts: counts.facts,
    conflicts: counts.conflicts,
    secs: Math.max(1, Math.round(secs)),
  };
}

/** "1m 40s" / "48s". */
export const duration = (secs: number) => (secs >= 60 ? `${Math.floor(secs / 60)}m${secs % 60 ? ` ${secs % 60}s` : ""}` : `${secs}s`);

/** The record's one line: what it came to. */
export function recordLine(r: WorkRecord): string {
  const parts = [
    r.pages ? `${r.pages} page${r.pages === 1 ? "" : "s"} read` : "",
    r.intake.files.length ? `${r.intake.files.length} file${r.intake.files.length === 1 ? "" : "s"}` : "",
    r.facts ? `${r.facts} facts` : "",
    r.conflicts ? `${r.conflicts} disagreement${r.conflicts === 1 ? "" : "s"} settled` : "",
    duration(r.secs),
  ];
  return parts.filter(Boolean).join(" · ");
}
