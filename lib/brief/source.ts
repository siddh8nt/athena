import type { Source } from "./types";

/** A web source by its site's name; a link is cut to its host, and a search's own redirect link says nothing. */
function webRef(ref?: string): string {
  if (!ref || !/^https?:\/\//i.test(ref)) return ref ?? "";
  try {
    const host = new URL(ref).hostname.replace(/^www\./, "");
    return host.endsWith("vertexaisearch.cloud.google.com") ? "" : host;
  } catch {
    return "";
  }
}

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
    : s.kind === "web" ? `from the web${webRef(s.ref) ? ` · ${webRef(s.ref)}` : ""}`
    : s.kind === "qloo" ? "from Qloo"
    : s.kind === "inferred" ? "my read"
    : "Agent · guessed";
  const at = s.at && (s.kind === "file" || s.kind === "website" || s.kind === "pasted") ? `, ${s.at}` : "";
  return confirmed && s.kind !== "message" ? `${base}${at} · you confirmed` : `${base}${at}`;
}
