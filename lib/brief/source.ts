import type { Source } from "./types";

/**
 * Where a fact came from, in the founder's words ("from your website", "from deck.pdf, slide 4"). A message with ref
 * "you" is the founder's own edit on the Brand Graph. Pure, client-safe.
 */
export function sourceLabel(s: Source, confirmed?: boolean): string {
  const base =
    s.kind === "message" ? (s.ref === "you" ? "from you" : "from your message")
    : s.kind === "file" ? `from ${s.ref ?? "your file"}`
    : s.kind === "pasted" ? "from your AI summary"
    : s.kind === "website" ? "from your website"
    : s.kind === "web" ? `from the web${s.ref ? ` · ${s.ref}` : ""}`
    : s.kind === "qloo" ? "from Qloo"
    : s.kind === "inferred" ? "my read"
    : "Agent · guessed";
  const at = s.at && (s.kind === "file" || s.kind === "website" || s.kind === "pasted") ? `, ${s.at}` : "";
  return confirmed && s.kind !== "message" ? `${base}${at} · you confirmed` : `${base}${at}`;
}
