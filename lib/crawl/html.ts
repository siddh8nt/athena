// One HTML page into what Athena reads from it (PRD §23.2 step 4a): the visible text, the title and description,
// Open Graph tags, schema.org JSON-LD, and the page's links. Regexes over the markup, no DOM: pages are data only,
// and nothing on them runs.

export type ReadPage = {
  title?: string;
  description?: string;
  og: Record<string, string>;
  /** schema.org objects from JSON-LD, flattened out of @graph. */
  jsonld: Record<string, unknown>[];
  text: string;
  links: string[];
};

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", copy: "©", reg: "®", trade: "™", eacute: "é", bull: "•", middot: "·" };

export const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? "").trim() : undefined;
};

const BLOCK = /<\/?(p|div|section|article|header|footer|main|aside|nav|li|ul|ol|tr|td|th|table|h[1-6]|br|hr|dd|dt|dl|figure|figcaption|blockquote|pre|address|form|label|button|option)\b[^>]*>/gi;

function flatten(v: unknown, out: Record<string, unknown>[]) {
  if (Array.isArray(v)) v.forEach((x) => flatten(x, out));
  else if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o["@graph"])) flatten(o["@graph"], out);
    if (o["@type"]) out.push(o);
  }
}

export function readHtml(html: string, base: string): ReadPage {
  const head = html.slice(0, 200_000);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const og: Record<string, string> = {};
  let description: string | undefined;
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attr(m[0], "property") ?? attr(m[0], "name") ?? "").toLowerCase();
    const content = attr(m[0], "content");
    if (!content) continue;
    if (key.startsWith("og:") || key.startsWith("product:")) og[key] = content.slice(0, 500);
    else if (key === "description") description = content.slice(0, 500);
  }
  const jsonld: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      flatten(JSON.parse(m[1].trim()), jsonld);
    } catch {
      // Broken JSON-LD is skipped; the visible text still has the facts.
    }
  }
  const links = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(m[0], "href");
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    try {
      const u = new URL(href, base);
      u.hash = "";
      links.add(u.toString());
    } catch {
      // Not a URL.
    }
  }
  const text = decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|iframe|canvas)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<head\b[\s\S]*?<\/head>/i, " ")
      .replace(BLOCK, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n[ \n]*/g, "\n")
    .trim();
  return { title: title ? decodeEntities(title).replace(/\s+/g, " ").trim() : undefined, description, og, jsonld, text, links: [...links] };
}
